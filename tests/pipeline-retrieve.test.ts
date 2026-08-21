import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ProvenanceReceipt,
  ResearchQuestion,
  ResearchRun,
  SourceDocument,
  newId,
} from '../src/domain/index.js';
import type { SourceFamily, SourceIdentifier } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import type { StageContext } from '../src/pipeline/types.js';
import { scopeStage } from '../src/pipeline/stages/scope.js';
import { retrieveStage } from '../src/pipeline/stages/retrieve.js';
import { verifyStage } from '../src/pipeline/stages/verify.js';
import { snapshotHash } from '../src/sources/snapshot.js';
import { SourceAdapterError } from '../src/sources/error.js';
import { canonicalJson } from '../src/shared/crypto.js';

/**
 * TEST FIXTURES ONLY — the model provider is the TEST-ONLY scripted stub and all
 * source adapters are in-memory fakes. Zero network access in this file.
 */

const QUESTION_TEXT =
  'Does intermittent fasting improve insulin sensitivity in adults compared with continuous calorie restriction?';

const makeQuestion = (): ResearchQuestion =>
  ResearchQuestion.parse({
    id: newId('q'),
    text: QUESTION_TEXT,
    background: '',
    goalType: 'exploratory',
    scope: {
      domain: 'nutrition science',
      phenomena: ['insulin sensitivity under dietary restriction'],
      inScope: ['human adult studies'],
      outOfScope: [],
    },
    constraints: {
      assumptions: [],
      dataConstraints: [],
      resourceConstraints: [],
      ethicalConstraints: [],
      methodologicalConstraints: [],
    },
    createdAt: new Date().toISOString(),
  });

/** Synthetic RawSourceRecord — NOT real API data; normalized is a minimal stable payload. */
const fakeRecord = (title: string, doi: string, extra: Partial<RawSourceRecord> = {}): RawSourceRecord => ({
  identifiers: [{ kind: 'doi', value: doi }],
  title,
  publicationYear: 2026,
  authors: ['Alice Fixture'],
  contentDepth: 'abstract',
  accessState: 'open',
  abstractText: `Fixture abstract for ${title}.`,
  normalized: { DOI: doi, title, fixture: true },
  ...extra,
});

/** In-memory scripted SourceAdapter; records every call for request-shape assertions. */
const fakeAdapter = (
  family: SourceFamily,
  impl: {
    search?: (query: string, opts?: { limit?: number }) => Promise<RawSourceRecord[]>;
    failSearch?: (query: string) => Error;
    resolve?: (identifier: SourceIdentifier) => Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }>;
  },
): SourceAdapter & { calls: { searches: { query: string; limit: number | undefined }[]; resolves: string[] } } => {
  const calls = { searches: [] as { query: string; limit: number | undefined }[], resolves: [] as string[] };
  return {
    family,
    calls,
    async search(query, opts) {
      calls.searches.push({ query, limit: opts?.limit });
      if (impl.failSearch) throw impl.failSearch(query);
      const records = impl.search ? await impl.search(query, opts) : [];
      return { family, query, httpStatus: 200, records, latencyMs: 1 };
    },
    async resolve(identifier) {
      calls.resolves.push(identifier.value);
      if (!impl.resolve) throw new Error(`TEST FIXTURE: unexpected resolve on ${family}`);
      return impl.resolve(identifier);
    },
  };
};

const byQuery = (map: Record<string, RawSourceRecord[]>) => async (query: string): Promise<RawSourceRecord[]> =>
  map[query] ?? [];

const makeDoc = (
  runId: string,
  init: { identifiers: SourceIdentifier[]; title: string; family?: SourceFamily },
): SourceDocument =>
  SourceDocument.parse({
    id: newId('src'),
    runId,
    family: init.family ?? 'openalex',
    identifiers: init.identifiers,
    title: init.title,
    authors: [],
    contentDepth: 'abstract',
    accessState: 'open',
    contentHash: 'ab'.repeat(32),
    retrievedAt: new Date().toISOString(),
    parseStatus: 'ok',
  });

const defined = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`TEST expected defined value: ${what}`);
  return v;
};

const openDbs: Db[] = [];
const tempDirs: string[] = [];

/**
 * Run fixture mirroring Store.createRun's transactional insert MINUS appendEvent:
 * Store.appendEvent currently parses RunEvent with seq: 0, which RunEvent's own
 * schema (.int().positive) rejects — a pre-existing store.ts bug outside this
 * task's write boundary. The stages under test read/write objects and the run
 * row only, never the events table, so this fixture stays on the real paths.
 */
const createRunFixture = (store: Store, db: Db, question: ResearchQuestion): ResearchRun => {
  const now = new Date().toISOString();
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: question.id,
    status: 'created',
    currentStage: 'scope',
    stages: STAGE_ALL.map((stage) => ({ stage, state: 'pending' })),
    createdAt: now,
    updatedAt: now,
    tags: [],
  });
  store.putObject('question', question);
  db.prepare(
    'INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(run.id, run.questionId, run.status, run.currentStage, JSON.stringify(run), now, now);
  return run;
};

const makeEnv = (steps: StubStep[], adapters: Partial<Record<SourceFamily, SourceAdapter>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'farlab-pipeline-test-'));
  tempDirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  openDbs.push(db);
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const question = makeQuestion();
  const run = createRunFixture(store, db, question);
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider: createTestStubProvider(steps),
    sourceFor: (family) => {
      const adapter = adapters[family];
      if (!adapter) throw new Error(`TEST FIXTURE: no fake adapter registered for ${family}`);
      return adapter;
    },
    recordReceipt: (partial) => {
      const receipt = ProvenanceReceipt.parse({
        ...partial,
        id: newId('rcp'),
        runId: run.id,
        at: partial.at ?? new Date().toISOString(),
      });
      store.putObject('receipt', receipt);
    },
    cancelled: () => false,
    log: () => {},
  };
  return { ctx, store, artifacts, run };
};

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------ scope stage ------------------------------ */

describe('scope stage', () => {
  const refinement = {
    domain: 'human nutrition and metabolic physiology',
    phenomena: [
      'insulin sensitivity under intermittent fasting',
      'insulin sensitivity under continuous calorie restriction',
    ],
    inScope: ['randomized trials in adults', 'direct insulin sensitivity measures'],
    outOfScope: ['animal models', 'pediatric populations'],
    goalType: 'explanatory',
    constraints: {
      assumptions: ['self-reported diet adherence is reasonably accurate'],
      dataConstraints: [],
      resourceConstraints: [],
      ethicalConstraints: [],
      methodologicalConstraints: ['prefer studies of at least 8 weeks duration'],
    },
  };

  it('refines the question via one structured call and persists the full updated question', async () => {
    const env = makeEnv([{ rawOutput: JSON.stringify(refinement) }], {});
    const out = await scopeStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const q = env.store.getObject('question', env.run.questionId);
    expect(defined(q, 'question').scope.domain).toBe('human nutrition and metabolic physiology');
    expect(q?.scope.phenomena).toHaveLength(2);
    expect(q?.scope.inScope).toEqual(refinement.inScope);
    expect(q?.scope.outOfScope).toEqual(refinement.outOfScope);
    expect(q?.goalType).toBe('explanatory');
    expect(q?.constraints.assumptions).toEqual(['self-reported diet adherence is reasonably accurate']);
    expect(q?.constraints.methodologicalConstraints).toEqual(['prefer studies of at least 8 weeks duration']);
    // 原意保留：用户原文与 id 不被改写
    expect(q?.text).toBe(QUESTION_TEXT);
    expect(q?.id).toBe(env.run.questionId);
    // 恰好一次 model_call，且 receipt 已持久化
    const modelReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'model_call');
    expect(modelReceipts).toHaveLength(1);
    expect(modelReceipts[0]?.stage).toBe('scope');
  });

  it('fails visibly when the provider fails — never a silent empty scope', async () => {
    const env = makeEnv([{ fail: { kind: 'provider_error', message: 'fixture provider outage' } }], {});
    await expect(scopeStage.execute(env.ctx)).rejects.toThrow(/model call failed \(provider_error\)/);
    const q = env.store.getObject('question', env.run.questionId);
    expect(q?.scope.domain).toBe('nutrition science'); // 原样未动
    expect(q?.scope.inScope).toEqual(['human adult studies']);
  });

  it('is always applicable', async () => {
    const env = makeEnv([], {});
    await expect(scopeStage.applicable(env.ctx)).resolves.toBe(true);
  });
});

/* ---------------------------- retrieve stage ----------------------------- */

const PLAN = {
  discovery: [
    'intermittent fasting insulin sensitivity randomized trial',
    'calorie restriction glucose metabolism adults',
  ],
  supporting: ['intermittent fasting insulin sensitivity meta-analysis'],
  counter: ['intermittent fasting insulin sensitivity failed replication'],
};

describe('retrieve stage', () => {
  it('runs the forced counter-evidence search, records one receipt per real search, and skips idempotently', async () => {
    const counterRec = fakeRecord('Fixture Counter Evidence', '10.1000/fake.counter');
    const fullTextRec = fakeRecord('Fixture FullText Work', '10.1000/fake.fulltext', {
      contentDepth: 'full_text',
    });
    const openalex = fakeAdapter('openalex', {
      search: byQuery({
        [PLAN.counter[0] as string]: [counterRec, fullTextRec],
        [PLAN.discovery[0] as string]: [fakeRecord('Fixture Discovery A', '10.1000/fake.a')],
        [PLAN.supporting[0] as string]: [fakeRecord('Fixture Supporting C', '10.1000/fake.c')],
      }),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv });

    expect(await retrieveStage.applicable(env.ctx)).toBe(true);
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    // corpus snapshot: purposes include counter_evidence; no family failures
    const corpora = env.store.listObjects('corpus_snapshot', env.run.id);
    expect(corpora).toHaveLength(1);
    const corpus = defined(corpora[0], 'corpus');
    expect(corpus.queries.map((q) => q.purpose)).toEqual(
      expect.arrayContaining(['counter_evidence', 'discovery', 'supporting']),
    );
    expect(corpus.familyFailures).toEqual([]);
    expect(corpus.documentIds).toHaveLength(4);

    // documents persisted; contentHash discipline + artifact archiving
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(4);
    const counterDoc = defined(
      docs.find((d) => d.identifiers.some((i) => i.value === '10.1000/fake.counter')),
      'counter doc',
    );
    expect(counterDoc.contentHash).toBe(snapshotHash('openalex', counterRec));
    expect(counterDoc.abstractText).toBe(counterRec.abstractText);
    expect(counterDoc.fullTextRef).toBeUndefined(); // depth=abstract -> no fullTextRef
    const fullTextDoc = defined(
      docs.find((d) => d.identifiers.some((i) => i.value === '10.1000/fake.fulltext')),
      'fulltext doc',
    );
    expect(defined(fullTextDoc.fullTextRef, 'fullTextRef').startsWith('sha256:')).toBe(true);
    // normalized payload archived content-addressed, canonical-JSON basis == snapshotHash
    expect(await env.artifacts.get(`sha256:${counterDoc.contentHash}`)).toBe(
      canonicalJson(counterRec.normalized),
    );

    // every executed search saw limit=4
    for (const s of openalex.calls.searches) expect(s.limit).toBe(4);
    for (const s of arxiv.calls.searches) expect(s.limit).toBe(4);

    // receipts: exactly 1 model_call + 5 source_retrieval (oa/oa/arxiv x discovery+supporting + counter)
    const receipts = env.store.listObjects('receipt', env.run.id);
    expect(receipts.filter((r) => r.kind === 'model_call')).toHaveLength(1);
    const retrieval = receipts.filter((r) => r.kind === 'source_retrieval');
    expect(retrieval).toHaveLength(5);
    for (const r of retrieval) {
      expect(r.executionMode).toBe('live');
      expect(r.stage).toBe('retrieve');
      expect(defined(r.sourceRetrieval, 'retrieval facts').httpStatus).toBe(200);
    }
    const counterReceipt = defined(
      retrieval.find((r) => r.sourceRetrieval?.query === PLAN.counter[0]),
      'counter receipt',
    );
    expect(counterReceipt.sourceRetrieval?.family).toBe('openalex');
    expect(counterReceipt.sourceRetrieval?.resultCount).toBe(2);
    expect(counterReceipt.sourceRetrieval?.contentHashes).toHaveLength(2);

    // idempotent skip once a corpus exists
    expect(await retrieveStage.applicable(env.ctx)).toBe(false);
  });

  it('deduplicates records sharing a DOI across queries/families (first occurrence wins)', async () => {
    const sharedDoi = '10.1000/fake.shared';
    const oaRec = fakeRecord('Fixture Shared via OpenAlex', sharedDoi);
    const arxivRec: RawSourceRecord = {
      ...fakeRecord('Fixture Same Work via arXiv', sharedDoi),
      identifiers: [
        { kind: 'arxiv', value: '2601.00001' },
        { kind: 'doi', value: sharedDoi },
      ],
    };
    const openalex = fakeAdapter('openalex', {
      search: async (q) =>
        q === PLAN.discovery[0] ? [oaRec, fakeRecord('Fixture Only OpenAlex', '10.1000/fake.oa-only')] : [],
    });
    const arxiv = fakeAdapter('arxiv', {
      search: async (q) => (q === PLAN.discovery[0] ? [arxivRec] : []),
    });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(2); // shared DOI stored once + the oa-only record
    const sharedDocs = docs.filter((d) => d.identifiers.some((i) => i.kind === 'doi' && i.value === sharedDoi));
    expect(sharedDocs).toHaveLength(1);
    // 首见优先：openalex（先执行）版本胜出
    expect(sharedDocs[0]?.title).toBe('Fixture Shared via OpenAlex');
    expect(out.summary).toContain('1 duplicate record(s) dropped');
  });

  it('records familyFailures and continues when one family fails (single-source failure)', async () => {
    const openalex = fakeAdapter('openalex', {
      search: async () => [fakeRecord('Fixture OK Record', '10.1000/fake.ok')],
    });
    const arxiv = fakeAdapter('arxiv', {
      failSearch: (q) =>
        new SourceAdapterError({
          family: 'arxiv',
          query: q,
          httpStatus: 504,
          kind: 'http_status',
          message: 'fixture arxiv gateway timeout',
        }),
    });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.familyFailures).toHaveLength(1);
    expect(corpus.familyFailures[0]?.family).toBe('arxiv');
    expect(corpus.familyFailures[0]?.reason).toContain('fixture arxiv gateway timeout');
    expect(corpus.documentIds.length).toBeGreaterThan(0); // openalex 结果未被连坐

    const failedReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'source_retrieval' && r.sourceRetrieval?.family === 'arxiv');
    expect(failedReceipts).toHaveLength(2); // discovery + supporting 都真实尝试过 arxiv
    for (const r of failedReceipts) {
      expect(r.sourceRetrieval?.httpStatus).toBe(504);
      expect(r.sourceRetrieval?.resultCount).toBe(0);
    }
  });

  it('fails the stage when every source family fails — no fake empty success', async () => {
    const failAll = (family: SourceFamily) =>
      fakeAdapter(family, {
        failSearch: () =>
          new SourceAdapterError({
            family,
            query: 'fixture',
            httpStatus: 0,
            kind: 'network',
            message: 'fixture total outage',
          }),
      });
    const env = makeEnv(
      [{ rawOutput: JSON.stringify(PLAN) }],
      { openalex: failAll('openalex'), arxiv: failAll('arxiv') },
    );

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/all 5 source searches failed/);
    expect(env.store.listObjects('corpus_snapshot', env.run.id)).toHaveLength(0);
    expect(env.store.listObjects('source_document', env.run.id)).toHaveLength(0);
    expect(await retrieveStage.applicable(env.ctx)).toBe(true); // 可重试
  });

  it('fails when the plan contains zero counter queries (counter-evidence discipline, R-05)', async () => {
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const env = makeEnv(
      [{ rawOutput: JSON.stringify({ ...PLAN, counter: [] }) }],
      { openalex, arxiv },
    );

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/model call failed \(invalid_output\)/);
    expect(openalex.calls.searches).toHaveLength(0); // 零反证查询 -> 不允许任何静默检索
    expect(arxiv.calls.searches).toHaveLength(0);
    expect(env.store.listObjects('corpus_snapshot', env.run.id)).toHaveLength(0);
  });

  it('fails when counter queries carry no counter-evidence vocabulary', async () => {
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const env = makeEnv(
      [{ rawOutput: JSON.stringify({ ...PLAN, counter: ['intermittent fasting benefits review'] }) }],
      { openalex, arxiv },
    );

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/R-05/);
    expect(openalex.calls.searches).toHaveLength(0);
  });

  it('caps the corpus at 12 documents and notes the truncation in the summary', async () => {
    const slug = (q: string) => q.replace(/\W+/g, '');
    const fourUnique = (prefix: string) =>
      Array.from({ length: 4 }, (_, i) => fakeRecord(`Fixture ${prefix} ${i}`, `10.1000/fake.${prefix}.${i}`));
    const openalex = fakeAdapter('openalex', { search: async (q) => fourUnique(slug(q)) });
    const arxiv = fakeAdapter('arxiv', { search: async (q) => fourUnique(`a${slug(q)}`) });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(12);
    expect(out.summary).toContain('truncated at cap 12');
    // counter 查询先执行（R-05 不被截断挤掉）：其 4 条记录都在
    const counterIds = docs.filter((d) =>
      d.identifiers.some((i) => i.value.startsWith('10.1000/fake.intermittentfastinginsulinsensitivityfailedreplication.')),
    );
    expect(counterIds).toHaveLength(4);
  });

  it('honors the cancellation checkpoint before any work', async () => {
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], {});
    env.ctx.cancelled = () => true;
    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/cancelled/);
  });
});

/* ---------------------------- verify stage ------------------------------- */

describe('verify stage', () => {
  const crossrefResolve = (title: string) => async (identifier: SourceIdentifier) => ({
    found: true,
    httpStatus: 200,
    record: fakeRecord(title, identifier.value),
  });

  it('resolves a DOI via crossref and writes titleMatch=true for a similar title', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: crossrefResolve('fixture study of base editing in human cells a review'),
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.verify1' }],
      title: 'Fixture Study of Base Editing in Human Cells',
    });
    env.store.putObject('source_document', doc);

    expect(await verifyStage.applicable(env.ctx)).toBe(true);
    const out = await verifyStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const updated = env.store.getObject('source_document', doc.id);
    expect(defined(updated?.verification, 'verification')).toMatchObject({
      method: 'crossref_doi',
      resolved: true,
      titleMatch: true,
    });
    const receipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'source_retrieval');
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.stage).toBe('verify_sources');
    expect(receipts[0]?.sourceRetrieval?.httpStatus).toBe(200);
    expect(receipts[0]?.sourceRetrieval?.resultCount).toBe(1);
  });

  it('records titleMatch=false when the resolved title is dissimilar (threshold behavior)', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: crossrefResolve('quantum dot synthesis pathway in semiconductor nanowires'),
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.verify2' }],
      title: 'Fixture Study of Base Editing in Human Cells',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = env.store.getObject('source_document', doc.id)?.verification;
    expect(verification?.resolved).toBe(true);
    expect(verification?.titleMatch).toBe(false);
  });

  it('marks a DOI resolve 404 as resolved=false (honest unresolved, not a silent pass)', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: async () => ({ found: false, httpStatus: 404 }),
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.9999/does-not-exist' }],
      title: 'Fixture Unresolvable Work',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = env.store.getObject('source_document', doc.id)?.verification;
    expect(verification).toMatchObject({ method: 'crossref_doi', resolved: false });
    expect(verification?.titleMatch).toBeUndefined();
    expect(verification?.detail).toContain('404');
    const receipt = env.store
      .listObjects('receipt', env.run.id)
      .find((r) => r.kind === 'source_retrieval');
    expect(receipt?.sourceRetrieval?.httpStatus).toBe(404);
    expect(receipt?.sourceRetrieval?.resultCount).toBe(0);
  });

  it('marks documents without a persistent identifier as url/unresolved without any resolve call', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: async () => {
        throw new Error('TEST FIXTURE: resolve must not be called');
      },
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'url', value: 'https://example.org/fixture-only-url' }],
      title: 'Fixture URL Only Work',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = env.store.getObject('source_document', doc.id)?.verification;
    expect(verification).toEqual({
      method: 'url',
      resolved: false,
      detail: 'no persistent identifier',
      checkedAt: expect.any(String) as string,
    });
    expect(crossref.calls.resolves).toHaveLength(0);
  });

  it('resolves an arXiv id via the arxiv adapter with method arxiv_id', async () => {
    const arxiv = fakeAdapter('arxiv', {
      resolve: async (identifier) => ({
        found: true,
        httpStatus: 200,
        record: fakeRecord('Fixture arXiv Preprint Title', `10.1000/fake.${identifier.value}`),
      }),
    });
    const env = makeEnv([], { arxiv });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'arxiv', value: '2601.12345' }],
      title: 'Fixture arXiv Preprint Title',
      family: 'arxiv',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = env.store.getObject('source_document', doc.id)?.verification;
    expect(verification).toMatchObject({ method: 'arxiv_id', resolved: true, titleMatch: true });
    expect(arxiv.calls.resolves).toEqual(['2601.12345']);
  });

  it('leaves documents unverified (retriable) when resolve errors, with an honest summary', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: () => {
        throw new SourceAdapterError({
          family: 'crossref',
          query: 'doi:10.1000/fake.flaky',
          httpStatus: 0,
          kind: 'network',
          message: 'fixture network down',
        });
      },
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.flaky' }],
      title: 'Fixture Flaky Resolve',
    });
    env.store.putObject('source_document', doc);

    const out = await verifyStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    expect(out.summary).toContain('1 resolve error(s) left unverified');
    // 不伪造 verification：文档保持未验证，可在下次运行重试
    expect(env.store.getObject('source_document', doc.id)?.verification).toBeUndefined();
    expect(await verifyStage.applicable(env.ctx)).toBe(true);
    const receipt = env.store.listObjects('receipt', env.run.id).find((r) => r.kind === 'source_retrieval');
    expect(receipt?.sourceRetrieval?.httpStatus).toBe(0);
  });

  it('is not applicable once every document is verified (and when there are none)', async () => {
    const env = makeEnv([], {});
    expect(await verifyStage.applicable(env.ctx)).toBe(false); // no documents at all
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'url', value: 'https://example.org/x' }],
      title: 'Fixture NoId',
    });
    env.store.putObject('source_document', doc);
    await verifyStage.execute(env.ctx);
    expect(await verifyStage.applicable(env.ctx)).toBe(false); // all verified
  });
});

/* ------------------------- retrieve -> verify chain ----------------------- */

describe('retrieve -> verify chain', () => {
  it('builds a corpus, then verifies every document in it (in-memory fakes, no network)', async () => {
    const rec = fakeRecord('Fixture Chain Study', '10.1000/fake.chain');
    const openalex = fakeAdapter('openalex', { search: async () => [rec] });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { resolve: crossrefEcho });
    function crossrefEcho(identifier: SourceIdentifier) {
      return { found: true, httpStatus: 200, record: fakeRecord('Fixture Chain Study', identifier.value) };
    }
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref });

    const rOut = await retrieveStage.execute(env.ctx);
    expect(rOut.kind).toBe('done');
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(1); // 同一 DOI 跨三次查询只存一份
    const doc = defined(docs[0], 'chained doc');
    expect(doc.contentHash).toBe(snapshotHash('openalex', rec));

    expect(await verifyStage.applicable(env.ctx)).toBe(true);
    const vOut = await verifyStage.execute(env.ctx);
    expect(vOut.kind).toBe('done');
    const verified = env.store.getObject('source_document', doc.id)?.verification;
    expect(verified?.resolved).toBe(true);
    expect(verified?.titleMatch).toBe(true);
    expect(await verifyStage.applicable(env.ctx)).toBe(false);
  });
});
