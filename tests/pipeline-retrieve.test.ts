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
import { retrieveStage, selectFinal, fusedOrder, rrfScore, type PoolEntry } from '../src/pipeline/stages/retrieve.js';
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
  init: {
    identifiers: SourceIdentifier[];
    title: string;
    family?: SourceFamily;
    authors?: string[];
    publicationYear?: number;
    venue?: string;
  },
): SourceDocument =>
  SourceDocument.parse({
    id: newId('src'),
    runId,
    family: init.family ?? 'openalex',
    identifiers: init.identifiers,
    title: init.title,
    authors: init.authors ?? [],
    ...(init.publicationYear !== undefined ? { publicationYear: init.publicationYear } : {}),
    ...(init.venue !== undefined ? { venue: init.venue } : {}),
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
  const problemModelDraft = {
    objectives: [
      { statement: 'Determine how intermittent fasting changes insulin sensitivity in adults' },
    ],
    variables: [
      { name: 'fasting glucose', role: 'dependent', unit: 'mg/dL', valueType: 'numeric' },
      { name: 'fasting regimen', role: 'independent', valueType: 'categorical' },
    ],
    formalization: {
      problemClass: 'none_stated',
      governingRelations: [],
      boundaryConditions: [],
      wellPosednessNotes: [],
    },
    dataInventory: [
      { name: 'retrieved literature', kind: 'retrieved_literature', accessState: 'available' },
    ],
    statisticalPremises: { assumptions: [], causalClaims: [] },
    metrics: [],
    stopConditions: ['the comparison is decided once by the preregistered rule'],
    unknowns: [{ statement: 'adherence measurement error distribution', blocking: false }],
    methodSelections: [
      {
        forObjective: 1,
        candidates: [
          {
            family: 'retrieval_synthesis',
            assessment: 'selected',
            rationale: 'the objective is evidential synthesis across retrieved trials',
            validationPlan: 'claim verbatim binding plus counter-evidence search coverage',
          },
          {
            family: 'machine_learning',
            assessment: 'rejected_inappropriate',
            rationale: 'no tabular dataset with the required labels is available',
          },
        ],
      },
    ],
  };
  it('refines the question and forms the problem model + method selection (two structured calls)', async () => {
    const env = makeEnv([
      { rawOutput: JSON.stringify(refinement) },
      { rawOutput: JSON.stringify(problemModelDraft) },
    ], {});
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
    // AOSSA: problem model + method selection 铸成并持久化（确定性 id）
    const models = env.store.listObjects('problem_model', env.run.id);
    expect(models).toHaveLength(1);
    const pm = defined(models[0], 'problem model');
    expect(pm.objectives.map((o) => o.id)).toEqual(['obj1']);
    expect(pm.formalization.problemClass).toBe('none_stated');
    expect(pm.provenance.formedBy).toBe('model_proposed');
    const selections = env.store.listObjects('method_selection', env.run.id);
    expect(selections).toHaveLength(1);
    const sel = defined(selections[0], 'method selection');
    expect(sel.forObjectiveId).toBe('obj1');
    expect(sel.candidates.filter((cd) => cd.assessment === 'selected').map((cd) => cd.family))
      .toEqual(['retrieval_synthesis']);
    const notes = env.store.listEvents(env.run.id).filter((e) => e.type === 'note');
    expect(notes.filter((e) => (e.detail as Record<string, unknown>).subject === 'problem_model_formed')).toHaveLength(1);
    expect(notes.filter((e) => (e.detail as Record<string, unknown>).subject === 'method_selection_formed')).toHaveLength(1);
    // 恰好两次 model_call（refinement + formation），receipt 已持久化
    const modelReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'model_call');
    expect(modelReceipts).toHaveLength(2);
    for (const rec of modelReceipts) expect(rec.stage).toBe('scope');
  });
  it('refuses test-stamped output on a product run — no template problem model as science', async () => {
    const env = makeEnv([
      { rawOutput: JSON.stringify(refinement) },
      { rawOutput: JSON.stringify(problemModelDraft) },
    ], {});
    (env.ctx as { productRun?: boolean }).productRun = true;
    const out = await scopeStage.execute(env.ctx);
    // refinement 是 test 模式 → 第一条拒绝路径先触发（skipped，未存任何内容）
    expect(out.kind).toBe('skipped');
    expect(JSON.stringify(out)).toContain('test double');
    expect(env.store.listObjects('problem_model', env.run.id)).toHaveLength(0);
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
  // W5/S1: the schema now requires exactly 2 counter queries (two distinct angles)
  counter: [
    'intermittent fasting insulin sensitivity failed replication',
    'intermittent fasting insulin sensitivity negative result',
  ],
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
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

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

    // every executed search saw limit=6 (D-015: deeper per-query pool for RRF fusion)
    for (const s of openalex.calls.searches) expect(s.limit).toBe(6);
    for (const s of arxiv.calls.searches) expect(s.limit).toBe(6);

    // receipts: exactly 1 model_call (no rerank — pool 4 <= cap) + source_retrieval:
    // 12 planned searches (counter x3 [openalex, europepmc, crossref] + discovery
    // 2x3 + supporting 1x3) PLUS W6/F2 recovery variants — every empty arXiv search
    // retries k4 then k2 (3 empty arXiv searches x 2 variants each = 6 extra
    // receipted attempts, all still empty here).
    const receipts = env.store.listObjects('receipt', env.run.id);
    expect(receipts.filter((r) => r.kind === 'model_call')).toHaveLength(1);
    const retrieval = receipts.filter((r) => r.kind === 'source_retrieval');
    expect(retrieval).toHaveLength(18);
    for (const r of retrieval) {
      expect(r.executionMode).toBe('live');
      expect(r.stage).toBe('retrieve');
      expect(defined(r.sourceRetrieval, 'source retrieval facts').httpStatus).toBe(200);
    }
    const counterReceipt = defined(
      retrieval.find((r) => r.sourceRetrieval?.query === PLAN.counter[0]),
      'counter receipt',
    );
    expect(counterReceipt.sourceRetrieval?.family).toBe('openalex');
    expect(counterReceipt.sourceRetrieval?.resultCount).toBe(2);
    expect(counterReceipt.sourceRetrieval?.contentHashes).toHaveLength(2);
    // W5/S1: the SECOND planned counter query is executed too, never dropped.
    // W6/F1: it now routes to crossref (arXiv measured 82.3% zero on counter queries,
    // crossref 0% zero / mean 6.0 on the same historical population).
    const counterReceipt2 = defined(
      retrieval.find((r) => r.sourceRetrieval?.query === PLAN.counter[1]),
      'second counter receipt',
    );
    expect(counterReceipt2.sourceRetrieval?.family).toBe('crossref');
    // W-A: the third counter list (europepmc) really executed on counter[0]
    const counterReceiptEpmc = retrieval.find(
      (r) => r.sourceRetrieval?.query === PLAN.counter[0] && r.sourceRetrieval?.family === 'europepmc',
    );
    expect(defined(counterReceiptEpmc, 'europepmc counter receipt').sourceRetrieval?.resultCount).toBe(0);
    // W6/F2: the arXiv zero-result cascade fired and each variant attempt is receipted
    const variantReceipts = retrieval.filter(
      (r) => r.sourceRetrieval?.family === 'arxiv' && !PLAN.discovery.concat(PLAN.supporting).includes(r.sourceRetrieval?.query ?? ''),
    );
    expect(variantReceipts).toHaveLength(6); // 3 empty searches x (k4 + k2)
    const disc0Terms = (PLAN.discovery[0] as string).split(/\s+/);
    expect(
      variantReceipts.some((r) => r.sourceRetrieval?.query === disc0Terms.slice(0, 4).join(' ')),
    ).toBe(true);
    expect(
      variantReceipts.some((r) => r.sourceRetrieval?.query === disc0Terms.slice(0, 2).join(' ')),
    ).toBe(true);
    // both counter searches run before any discovery/supporting search (R-05 ordering)
    const indexOfQuery = (text: string) =>
      retrieval.findIndex((r) => r.sourceRetrieval?.query === text);
    expect(indexOfQuery(PLAN.counter[0] as string)).toBeLessThan(indexOfQuery(PLAN.discovery[0] as string));
    expect(indexOfQuery(PLAN.counter[1] as string)).toBeLessThan(indexOfQuery(PLAN.discovery[0] as string));

    // idempotent skip once a corpus exists
    expect(await retrieveStage.applicable(env.ctx)).toBe(false);
  });

  it('W-A: openalex family failure fails over to europepmc — queries still searched, recovery visible', async () => {
    const openalex = fakeAdapter('openalex', {
      failSearch: (q) =>
        new SourceAdapterError({
          family: 'openalex',
          query: q,
          httpStatus: 429,
          kind: 'http_status',
          message: 'fixture daily budget exhausted',
        }),
    });
    const failoverDoc = fakeRecord('Fixture Failover Recovery', '10.1000/fake.failover');
    const europepmc = fakeAdapter('europepmc', {
      search: async (q) => (q === PLAN.counter[0] ? [failoverDoc] : []),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    // openalex had 4 targets (counter[0] + discovery x2 + supporting x1): each got
    // exactly ONE bounded europepmc retry, plus europepmc's own planned counter list.
    expect(europepmc.calls.searches).toHaveLength(5);
    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.familyFailures.map((f) => f.family)).toEqual(['openalex']);
    expect(corpus.fusion?.failoverSearches).toBe(4);
    expect(out.summary).toContain('4 openalex->europepmc failover search(es)');
    // the failover-recovered document entered the corpus with europepmc provenance
    const docs = env.store.listObjects('source_document', env.run.id);
    const rec = defined(
      docs.find((d) => d.identifiers.some((i) => i.value === '10.1000/fake.failover')),
      'failover doc',
    );
    expect(rec.family).toBe('europepmc');
    // executedQueries records the ACTUAL family used for every failover rerun
    expect(corpus.queries.filter((q) => q.family === 'europepmc')).toHaveLength(5);
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
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(2); // shared DOI stored once + the oa-only record
    const sharedDocs = docs.filter((d) => d.identifiers.some((i) => i.kind === 'doi' && i.value === sharedDoi));
    expect(sharedDocs).toHaveLength(1);
    // 首见优先：openalex（先执行）版本胜出
    expect(sharedDocs[0]?.title).toBe('Fixture Shared via OpenAlex');
    expect(out.summary).toContain('1 duplicate record(s) merged');
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
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

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
    expect(failedReceipts).toHaveLength(3); // W6/F1: counter[1] moved to crossref; arXiv still attempts BOTH discovery + supporting
    for (const r of failedReceipts) {
      expect(r.sourceRetrieval?.httpStatus).toBe(504);
      expect(r.sourceRetrieval?.resultCount).toBe(0);
    }
  });

  it('W6/F2: recovers arXiv zero-results via the k4 variant and stops the cascade at the first hit', async () => {
    const disc0 = PLAN.discovery[0] as string;
    const k4 = disc0.split(/\s+/).slice(0, 4).join(' ');
    const k2 = disc0.split(/\s+/).slice(0, 2).join(' ');
    const recovered = fakeRecord('Fixture arXiv k4 Recovery', '10.1000/fake.arxiv-k4');
    const arxivCalls: string[] = [];
    const arxiv = fakeAdapter('arxiv', {
      search: async (q) => {
        arxivCalls.push(q);
        return q === k4 ? [recovered] : [];
      },
    });
    const openalex = fakeAdapter('openalex', {
      search: async (q) => (q === PLAN.counter[0] ? [fakeRecord('Fixture Counter', '10.1000/fake.counter')] : []),
    });
    const crossref = fakeAdapter('crossref', {
      search: async (q) => (q === PLAN.counter[1] ? [fakeRecord('Fixture Counter X', '10.1000/fake.counterx')] : []),
    });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    // discovery[0] on arXiv: full -> zero, k4 -> hit, k2 NEVER fired (cascade stops at first hit)
    expect(arxivCalls).toContain(disc0);
    expect(arxivCalls).toContain(k4);
    expect(arxivCalls).not.toContain(k2);
    // other empty arXiv searches (discovery[1], supporting[0]) cascade fully: full + k4 + k2
    expect(arxivCalls.filter((q) => q === disc0).length).toBe(1);

    // the recovered document really entered the corpus
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs.some((d) => d.identifiers.some((i) => i.value === '10.1000/fake.arxiv-k4'))).toBe(true);

    // variant searches are visible: fusion note + summary + per-variant receipts.
    // Count: disc0 -> k4 HIT (stop) = 1; disc1 -> k4 zero, k2 zero = 2; supp ->
    // k4 ("intermittent fasting insulin sensitivity" — SAME string as disc0's k4,
    // which this fixture answers with a hit) = 1. Total 4, not 5.
    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.fusion?.variantSearches).toBe(4);
    expect(out.summary).toContain('arXiv recovery variant search(es)');
    const variantReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'source_retrieval' && r.sourceRetrieval?.family === 'arxiv')
      .filter((r) => {
        const q = r.sourceRetrieval?.query ?? '';
        return ![PLAN.discovery[0], PLAN.discovery[1], PLAN.supporting[0]].includes(q);
      });
    expect(variantReceipts).toHaveLength(4);
  });

  it('W6/F2 audit P3-1: a failed variant attempt is receipted and the cascade continues to k2', async () => {
    const disc0 = PLAN.discovery[0] as string;
    const k4 = disc0.split(/\s+/).slice(0, 4).join(' ');
    const k2 = disc0.split(/\s+/).slice(0, 2).join(' ');
    const recovered = fakeRecord('Fixture arXiv k2 after k4 error', '10.1000/fake.arxiv-k2b');
    const arxiv = fakeAdapter('arxiv', {
      search: async (q) => {
        if (q === k4) {
          throw new SourceAdapterError({
            family: 'arxiv', query: q, kind: 'http_status', httpStatus: 429,
            message: 'fixture transient rate limit',
          });
        }
        return q === k2 ? [recovered] : [];
      },
    });
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    // k2 recovery really ran and its document entered the corpus despite the k4 error
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs.some((d) => d.identifiers.some((i) => i.value === '10.1000/fake.arxiv-k2b'))).toBe(true);
    // the FAILED k4 attempt carries its own receipt with the real httpStatus
    const k4Receipt = env.store
      .listObjects('receipt', env.run.id)
      .find((r) => r.sourceRetrieval?.query === k4);
    expect(defined(k4Receipt, 'k4 failure receipt').sourceRetrieval?.httpStatus).toBe(429);
    expect(k4Receipt?.redactionNote).toContain('arxiv recovery variant');
    // variant attempts are countable and distinguishable from planned searches
    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.fusion?.variantSearches).toBeGreaterThanOrEqual(2);
  });

  it('W6/F2: falls through to the k2 variant when k4 also returns nothing', async () => {
    const supp = PLAN.supporting[0] as string;
    const k2 = supp.split(/\s+/).slice(0, 2).join(' ');
    const bottomRecovered = fakeRecord('Fixture arXiv k2 Recovery', '10.1000/fake.arxiv-k2');
    const arxiv = fakeAdapter('arxiv', {
      search: async (q) => (q === k2 ? [bottomRecovered] : []),
    });
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs.some((d) => d.identifiers.some((i) => i.value === '10.1000/fake.arxiv-k2'))).toBe(true);
    // the k2 receipt proves the full cascade ran for this query
    const k2Receipt = env.store
      .listObjects('receipt', env.run.id)
      .find((r) => r.sourceRetrieval?.query === k2);
    expect(defined(k2Receipt, 'k2 receipt').sourceRetrieval?.resultCount).toBe(1);
  });

  it('W6/F2: arxivRecoveryVariants only yields strictly-shorter distinct queries (pure)', async () => {
    const { arxivRecoveryVariants } = await import('../src/pipeline/stages/retrieve.js');
    // 6 terms: k4 and k2 both differ from full and each other
    expect(arxivRecoveryVariants('a b c d e f')).toEqual(['a b c d', 'a b']);
    // 4 terms: k4 === full -> skipped, k2 kept
    expect(arxivRecoveryVariants('a b c d')).toEqual(['a b']);
    // 2 terms: no strictly-shorter variant exists
    expect(arxivRecoveryVariants('a b')).toEqual([]);
    // 3 terms: k4 === full (slice clamps) -> only k2
    expect(arxivRecoveryVariants('a b c')).toEqual(['a b']);
  });

  it('W6/F4: rerankWindowPlan yields bottom-up overlapping windows, head last (RankGPT)', async () => {
    const { rerankWindowPlan } = await import('../src/pipeline/stages/retrieve.js');
    // n <= w: single full window (RankGPT's w>n silent-skip bug impossible here)
    expect(rerankWindowPlan(12, 24, 12)).toEqual([[0, 12]]);
    expect(rerankWindowPlan(24, 24, 12)).toEqual([[0, 24]]);
    // n=30, w=24, s=12: bottom window [6,30) first, head window [0,24) last
    expect(rerankWindowPlan(30, 24, 12)).toEqual([
      [6, 30],
      [0, 24],
    ]);
    // n=48: three windows, bottoms-up, 12-overlap chaining
    expect(rerankWindowPlan(48, 24, 12)).toEqual([
      [24, 48],
      [12, 36],
      [0, 24],
    ]);
  });

  it('W6/F4 audit P2-4: applyWindowedRerank output is a permutation; mid-window failure propagates', async () => {
    const { applyWindowedRerank } = await import('../src/pipeline/stages/retrieve.js');
    const entry = (i: number): PoolEntry => ({
      key: `k${i}`,
      record: fakeRecord(`Fixture ${i}`, `10.1000/fake.w${i}`),
      family: 'openalex',
      firstSeen: 0,
      purposes: new Set(['discovery'] as const),
      ranks: [{ target: 0, rank: i }],
    });
    const working = Array.from({ length: 47 }, (_, i) => entry(i));
    const windows = [
      [23, 47],
      [11, 35],
      [0, 24],
    ] as const;
    const reverse = (slice: readonly PoolEntry[]) => [...slice].reverse();

    const out = await applyWindowedRerank(working, windows, reverse);
    // permutation invariant: every input key exactly once — exact multiset equality
    expect(out).toHaveLength(47);
    expect(out.map((e) => e.key).sort()).toEqual(
      Array.from({ length: 47 }, (_, i) => `k${i}`).sort(),
    );
    expect(new Set(out.map((e) => e.key)).size).toBe(47);
    // input is not mutated (callers fall back to it on failure)
    expect(working.map((e) => e.key)).toEqual(Array.from({ length: 47 }, (_, i) => `k${i}`));

    // failure in window 2 (after window 1 spliced) propagates — no half-spliced return
    let calls = 0;
    await expect(
      applyWindowedRerank(working, windows, async (slice) => {
        calls += 1;
        if (calls === 2) throw new Error('fixture window-2 outage');
        return reverse(slice);
      }),
    ).rejects.toThrow('fixture window-2 outage');
    expect(calls).toBe(2);

    // a wrong-length permutation is rejected, not silently truncated
    await expect(
      applyWindowedRerank(working, [[0, 24]] as const, async (slice) => slice.slice(0, 20)),
    ).rejects.toThrow(/returned 20 of 24/);
  });

  it('W6/F4 audit P1-1: cancellation during the window loop aborts the stage, never completes it', async () => {
    const manyDocs = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => fakeRecord(`Fixture ${prefix} ${i}`, `10.1000/fake.${prefix}.${i}`));
    const openalex = fakeAdapter('openalex', {
      search: async (q) => (q === PLAN.counter[0] ? manyDocs('ctr', 8) : manyDocs(q.replace(/\W+/g, ''), 6)),
    });
    const crossref = fakeAdapter('crossref', {
      search: async (q) => (q === PLAN.counter[1] ? manyDocs('ctrx', 6) : manyDocs(`x${q.replace(/\W+/g, '')}`, 3)),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => manyDocs('ax', 2) });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const permute = (n: number) => ({
      ranked: Array.from({ length: n }, (_, i) => ({
        index: i,
        relevance: 'high' as const,
        reason: 'fixture identity rerank reason',
      })),
    });
    const env = makeEnv(
      [
        { rawOutput: JSON.stringify(PLAN) },
        { rawOutput: JSON.stringify(permute(24)) },
        { rawOutput: JSON.stringify(permute(24)) },
        { rawOutput: JSON.stringify(permute(24)) },
      ],
      { openalex, arxiv, crossref, europepmc },
    );
    // Drive cancellation off REAL observable state: once the plan call AND the
    // first window call have been receipted (2 model_call receipts), the next
    // window checkpoint must abort the stage — never degrade to rerankFailure.
    const modelCallReceipts = () =>
      env.store.listObjects('receipt', env.run.id).filter((r) => r.kind === 'model_call');
    env.ctx.cancelled = () => modelCallReceipts().length >= 2;

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow('cancelled by user');
    // no corpus snapshot persisted post-cancel; no fake failure receipt for the
    // already-successful searches (P2-2)
    expect(env.store.listObjects('corpus_snapshot', env.run.id)).toHaveLength(0);
    const failReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'source_retrieval' && (r.sourceRetrieval?.httpStatus ?? 200) === 0);
    expect(failReceipts).toHaveLength(0);
  });

  it('W6/F4: pools above one rerank window execute multiple window calls and record rerankWindows', async () => {
    // Pool 47 unique docs -> candidates = top 48 -> window plan over 47:
    // [23,47), [11,35), [0,24) = 3 windows (bottom-up, head last).
    const manyDocs = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => fakeRecord(`Fixture ${prefix} ${i}`, `10.1000/fake.${prefix}.${i}`));
    const openalex = fakeAdapter('openalex', {
      search: async (q) => (q === PLAN.counter[0] ? manyDocs('ctr', 8) : manyDocs(q.replace(/\W+/g, ''), 6)),
    });
    const crossref = fakeAdapter('crossref', {
      search: async (q) => (q === PLAN.counter[1] ? manyDocs('ctrx', 6) : manyDocs(`x${q.replace(/\W+/g, '')}`, 3)),
    });
    const arxiv = fakeAdapter('arxiv', { search: async (q) => manyDocs(`a${q.replace(/\W+/g, '')}`, 2) });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    // pool: 8 + 6*3(openalex others) + 6 + 3*2(crossref others) + 2*3(arxiv) = 47
    const permute = (n: number) => ({
      ranked: Array.from({ length: n }, (_, i) => ({
        index: n - 1 - i, // strict reversal — maximal permutation distance from identity
        relevance: 'high' as const,
        reason: 'fixture reversal rerank reason',
      })),
    });
    const env = makeEnv(
      [
        { rawOutput: JSON.stringify(PLAN) },
        { rawOutput: JSON.stringify(permute(24)) },
        { rawOutput: JSON.stringify(permute(24)) },
        { rawOutput: JSON.stringify(permute(24)) },
      ],
      { openalex, arxiv, crossref, europepmc },
    );

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.fusion?.rerankApplied).toBe(true);
    expect(corpus.fusion?.rerankWindows).toBe(3);
    expect(corpus.fusion?.poolSize).toBe(47);
    // plan call + 3 window calls = 4 model calls
    const modelReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'model_call');
    expect(modelReceipts).toHaveLength(4);
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs.length).toBeLessThanOrEqual(12);
    expect(out.summary).toContain('truncated at cap 12');
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
      {
        openalex: failAll('openalex'),
        arxiv: failAll('arxiv'),
        crossref: failAll('crossref'),
        europepmc: failAll('europepmc'),
      },
    );

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/all 12 source searches failed/);
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

  it('rejects a single-counter-query plan (W5/S1: one counter query is structural decoration, not a search)', async () => {
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const env = makeEnv(
      [{ rawOutput: JSON.stringify({ ...PLAN, counter: [PLAN.counter[0]] }) }],
      { openalex, arxiv },
    );

    // min(2) schema: a 1-counter plan is invalid output — the second counter query
    // must be planned AND executed, never silently dropped as before W5.
    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/model call failed \(invalid_output\)/);
    expect(openalex.calls.searches).toHaveLength(0);
    expect(arxiv.calls.searches).toHaveLength(0);
    expect(env.store.listObjects('corpus_snapshot', env.run.id)).toHaveLength(0);
  });

  it('fails when counter queries carry no counter-evidence vocabulary', async () => {
    const openalex = fakeAdapter('openalex', { search: async () => [] });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    // two queries (schema-valid count) but NEITHER carries counter-evidence vocabulary
    const env = makeEnv(
      [
        {
          rawOutput: JSON.stringify({
            ...PLAN,
            counter: ['intermittent fasting benefits review', 'intermittent fasting advantages meta-analysis'],
          }),
        },
      ],
      { openalex, arxiv },
    );

    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(/R-05/);
    expect(openalex.calls.searches).toHaveLength(0);
  });

  it('caps the corpus at 12 via rerank+quota, records the fusion, and keeps counter seats (D-015)', async () => {
    // Deterministic pool: 2 counter searches x 6 docs + 9 other searches x 1 doc = 21 unique.
    // W6/F1: counter[1] now routes to crossref (was arxiv).
    const slug = (q: string) => q.replace(/\W+/g, '');
    const counterDocs = (prefix: string) =>
      Array.from({ length: 6 }, (_, i) => fakeRecord(`Fixture ${prefix} ${i}`, `10.1000/fake.${prefix}.${i}`));
    const oneDoc = (prefix: string) => (q: string) => [
      fakeRecord(`Fixture ${prefix}${slug(q)}`, `10.1000/fake.${prefix}${slug(q)}`),
    ];
    const openalex = fakeAdapter('openalex', {
      search: async (q) => (q === PLAN.counter[0] ? counterDocs(slug(q)) : oneDoc('')(q)),
    });
    const arxiv = fakeAdapter('arxiv', { search: async (q) => oneDoc('a')(q) });
    const crossref = fakeAdapter('crossref', {
      search: async (q) => (q === PLAN.counter[1] ? counterDocs(`a${slug(q)}`) : oneDoc('x')(q)),
    });
    // W-A: europepmc contributes a THIRD counter list (counter[0], abstract-bearing
    // family) — 6 more counter docs into the pool.
    const europepmc = fakeAdapter('europepmc', {
      search: async (q) => (q === PLAN.counter[0] ? counterDocs(`e${slug(q)}`) : []),
    });
    // Rerank script: identity permutation per window. Pool 27 > one window (24)
    // -> rerankWindowPlan yields 2 windows, each a 24-entry slice.
    const identityRerank = {
      ranked: Array.from({ length: 24 }, (_, i) => ({
        index: i,
        relevance: i < 12 ? ('high' as const) : ('medium' as const),
        reason: 'fixture identity rerank reason',
      })),
    };
    const env = makeEnv(
      [
        { rawOutput: JSON.stringify(PLAN) },
        { rawOutput: JSON.stringify(identityRerank) },
        { rawOutput: JSON.stringify(identityRerank) },
      ],
      { openalex, arxiv, crossref, europepmc },
    );

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(12);
    expect(out.summary).toContain('truncated at cap 12');

    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.fusion).toMatchObject({
      algorithm: 'rrf-k60+llm-listwise-rerank-v1',
      poolSize: 27,
      rerankApplied: true,
    });
    // counter-evidence quota floor honored under cap pressure
    expect(defined(corpus.fusion, 'fusion').counterSeatsKept).toBeGreaterThanOrEqual(4);
    // both planned counter queries still contribute documents to the final corpus
    const docsFromCounter1 = docs.filter((d) =>
      d.identifiers.some((i) => i.value.startsWith('10.1000/fake.intermittentfastinginsulinsensitivityfailedreplication.')),
    );
    const docsFromCounter2 = docs.filter((d) =>
      d.identifiers.some((i) => i.value.startsWith('10.1000/fake.aintermittentfastinginsulinsensitivitynegativeresult.')),
    );
    expect(docsFromCounter1.length).toBeGreaterThanOrEqual(1);
    expect(docsFromCounter2.length).toBeGreaterThanOrEqual(1);
    // rerank happened as real model calls with their own receipts (plan + 2 windows)
    const modelReceipts = env.store
      .listObjects('receipt', env.run.id)
      .filter((r) => r.kind === 'model_call');
    expect(modelReceipts).toHaveLength(3);
  });

  it('falls back VISIBLE to the RRF order when the listwise rerank fails (no silent success theater)', async () => {
    const slug = (q: string) => q.replace(/\W+/g, '');
    const fourUnique = (prefix: string) =>
      Array.from({ length: 4 }, (_, i) => fakeRecord(`Fixture ${prefix} ${i}`, `10.1000/fake.${prefix}.${i}`));
    const openalex = fakeAdapter('openalex', { search: async (q) => fourUnique(slug(q)) });
    const arxiv = fakeAdapter('arxiv', { search: async (q) => fourUnique(`a${slug(q)}`) });
    const europepmc = fakeAdapter('europepmc', { search: async () => [] });
    const env = makeEnv(
      [
        { rawOutput: JSON.stringify(PLAN) },
        { fail: { kind: 'provider_error', message: 'fixture rerank outage' } },
      ],
      { openalex, arxiv, europepmc },
    );

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    expect(env.store.listObjects('source_document', env.run.id)).toHaveLength(12);
    expect(out.summary).toContain('listwise rerank FAILED');
    const corpus = defined(env.store.listObjects('corpus_snapshot', env.run.id)[0], 'corpus');
    expect(corpus.fusion).toMatchObject({ rerankApplied: false });
    expect(corpus.fusion?.rerankFailure).toContain('fixture rerank outage');
  });

  it('selectFinal enforces the counter quota floor deterministically (pure function)', async () => {
    const entry = (key: string, target: number, rank: number, counter: boolean): PoolEntry => ({
      key,
      record: fakeRecord(`Fixture ${key}`, `10.1000/fake.${key}`),
      family: 'openalex',
      firstSeen: target,
      purposes: new Set(counter ? (['counter_evidence'] as const) : (['discovery'] as const)),
      ranks: [{ target, rank }],
    });
    // 15 non-counter entries (targets 2.., rank 0) + 3 counter entries seen LAST (rank 2)
    const pool: PoolEntry[] = [];
    for (let i = 0; i < 15; i++) pool.push(entry(`n${i}`, 2 + i, 0, false));
    pool.push(entry('c0', 0, 2, true));
    pool.push(entry('c1', 0, 3, true));
    pool.push(entry('c2', 1, 2, true));
    const ordered = fusedOrder(pool);
    // non-counter rank-0 docs (1/61) outrank counter rank-2/3 docs in RRF — greedy alone would evict all counter docs
    expect(ordered.slice(0, 12).every((e) => !e.purposes.has('counter_evidence'))).toBe(true);
    const selected = selectFinal(ordered, 12, 4);
    expect(selected).toHaveLength(12);
    const counterSeats = selected.filter((e) => e.purposes.has('counter_evidence')).length;
    expect(counterSeats).toBe(3); // floor = min(4, available 3)
    // swapped-in counter docs displace the TAIL of the greedy selection
    expect(selected.some((e) => e.key === 'n14')).toBe(false);
    expect(selected.some((e) => e.key === 'c0')).toBe(true);
    // RRF math spot-check: rank0 -> 1/(60+0+1)
    expect(rrfScore(pool[0]!)).toBeCloseTo(1 / 61, 12);
    // pool <= cap: no selection pressure, order preserved
    const small = selectFinal(ordered.slice(0, 5), 12, 4);
    expect(small).toHaveLength(5);
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
    // W6/F3: risk graded (authors empty -> unknown signal) but NOT suspected —
    // venue/year both consistent, identifier stays authoritative.
    expect(verification?.wrongPaperSuspect).toBeUndefined();
    expect(verification?.detail).toContain('wrong-paper signals');
  });

  it('W6/F3: flags wrongPaperSuspect on disjoint authors + year gap + venue mismatch (refchecker rules)', async () => {
    // fixture-resolved record carries DIFFERENT authors/year/venue than the doc
    const crossref = fakeAdapter('crossref', {
      resolve: async (identifier) => ({
        found: true,
        httpStatus: 200,
        record: {
          ...fakeRecord('quantum dot synthesis pathway in semiconductor nanowires', identifier.value),
          authors: ['Zoe Gamma', 'Yan Delta'],
          publicationYear: 2024,
          venue: 'Nature Fixture Methods',
        },
      }),
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.verify-wp' }],
      title: 'Fixture Study of Base Editing in Human Cells',
      authors: ['Alice Alpha', 'Bob Beta'],
      publicationYear: 2018,
      venue: 'Journal of Fixture Editing',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = defined(
      env.store.getObject('source_document', doc.id)?.verification,
      'verification',
    );
    // identifier stays authoritative (refchecker: never reject anchored matches)
    expect(verification.resolved).toBe(true);
    expect(verification.titleMatch).toBe(false);
    expect(verification.wrongPaperSuspect).toBe(true);
    expect(verification.detail).toContain('0/2 shared surnames');
    expect(verification.detail).toContain('year gap 6');
    expect(verification.detail).toContain('venue mismatch');
  });

  it('W6/F3: title mismatch with shared authors stays unsuspicious (metadata variant, not wrong paper)', async () => {
    const crossref = fakeAdapter('crossref', {
      resolve: async (identifier) => ({
        found: true,
        httpStatus: 200,
        record: {
          ...fakeRecord('slightly different rendered title of the same work', identifier.value),
          authors: ['A. Alpha', 'Carl Beta'],
          publicationYear: 2018,
        },
      }),
    });
    const env = makeEnv([], { crossref });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.verify-wp2' }],
      title: 'Fixture Study of Base Editing in Human Cells',
      authors: ['Alice Alpha', 'Bob Beta'],
      publicationYear: 2018,
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = defined(
      env.store.getObject('source_document', doc.id)?.verification,
      'verification',
    );
    expect(verification.resolved).toBe(true);
    expect(verification.titleMatch).toBe(false);
    expect(verification.wrongPaperSuspect).toBeUndefined(); // 2 shared surnames -> not a suspect
    expect(verification.detail).toContain('2/2 shared surnames');
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

  it('W-A: resolves a PMID/PMCID-anchored doc via europepmc with method europepmc_id', async () => {
    const europepmc = fakeAdapter('europepmc', {
      resolve: async (identifier) => ({
        found: true,
        httpStatus: 200,
        record: fakeRecord('Fixture EPMC Primary Record', `10.1000/fake.${identifier.value}`),
      }),
    });
    const env = makeEnv([], { europepmc });
    const doc = makeDoc(env.run.id, {
      identifiers: [{ kind: 'pubmed', value: 'PMC11032673' }],
      title: 'Fixture EPMC Primary Record',
      family: 'europepmc',
    });
    env.store.putObject('source_document', doc);

    await verifyStage.execute(env.ctx);
    const verification = env.store.getObject('source_document', doc.id)?.verification;
    expect(verification).toMatchObject({ method: 'europepmc_id', resolved: true, titleMatch: true });
    expect(europepmc.calls.resolves).toEqual(['PMC11032673']);
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
    const crossref = fakeAdapter('crossref', { search: async () => [], resolve: crossrefEcho });
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

/* ---------------- cross-source fuzzy dedup (gap-hunt R8) ------------------ */

describe('retrieve stage: cross-source fuzzy dedup', () => {
  const LONG_TITLE = 'Longitudinal Effects of Intermittent Fasting on Insulin Sensitivity Markers';

  it('merges the same work surfaced under different id systems by normalized title+year', async () => {
    const openalex = fakeAdapter('openalex', {
      search: byQuery({
        [PLAN.discovery[0] as string]: [
          fakeRecord(LONG_TITLE, '10.1000/fuzzy.a', { identifiers: [{ kind: 'doi', value: '10.1000/fuzzy.a' }] }),
        ],
      }),
    });
    // Same work from a different family: no DOI, native id only, different casing/punctuation.
    const europepmc = fakeAdapter('europepmc', {
      search: byQuery({
        [PLAN.counter[0] as string]: [
          fakeRecord('Longitudinal effects of Intermittent fasting on insulin-sensitivity markers', 'PMC777001', {
            identifiers: [{ kind: 'pubmed', value: 'PMC777001' }],
            publicationYear: 2026,
          }),
        ],
      }),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');

    const docs = env.store.listObjects('source_document', env.run.id);
    expect(docs).toHaveLength(1); // the duplicate merged into ONE document
    expect(defined(docs[0], 'fuzzy-merged doc').identifiers.some((i) => i.value === '10.1000/fuzzy.a' || i.value === 'PMC777001')).toBe(true); // first-seen record wins; the other merged in
  });

  it('never fuzzy-merges short titles (they collide across genuinely different works)', async () => {
    const openalex = fakeAdapter('openalex', {
      search: byQuery({ [PLAN.discovery[0] as string]: [fakeRecord('Insulin Study A', '10.1000/short.a')] }),
    });
    const europepmc = fakeAdapter('europepmc', {
      search: byQuery({
        [PLAN.counter[0] as string]: [
          fakeRecord('Insulin Study A', 'PMC888002', { identifiers: [{ kind: 'pubmed', value: 'PMC888002' }] }),
        ],
      }),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });

    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    // Short title below the floor -> both survive as distinct documents (no false merge).
    expect(env.store.listObjects('source_document', env.run.id)).toHaveLength(2);
  });
});

describe('RU-10 zh fuzzy-key fix', () => {
  it('CJK titles keep their characters (non-empty key) and match across punctuation variants', async () => {
    const { normalizeTitle } = await import('../src/pipeline/stages/retrieve.js');
    const a = normalizeTitle('维生素D与抑郁症：一项随机对照试验');
    const b = normalizeTitle('维生素D与抑郁症:一项随机对照试验');
    expect(a.length).toBeGreaterThan(5); // pre-fix this was EMPTY
    expect(a).toBe(b); // punctuation-insensitive merge works for zh
    const en = normalizeTitle('Vitamin D and Depression: A Trial');
    expect(en).toBe('vitamin d and depression a trial'); // latin behavior unchanged
  });
});


describe('RU-10 GO2 minhash second-chance merge', () => {
  // The REAL near-dup class (W5 probe: republished/versioned abstracts) is near-verbatim
  // with minor publication edits — not paraphrase. Paraphrases are genuinely different
  // documents and must NOT merge at a high-precision threshold.
  const LONG_ABSTRACT_A = 'Preoperative nutritional status is associated with postoperative outcomes after gastrointestinal surgery. This multicenter prospective cohort examines serum albumin and the prognostic nutritional index as predictors of complication rates in patients undergoing elective resection across twelve centers, with primary endpoint graded complications within thirty days of surgery.';
  const LONG_ABSTRACT_A_VARIANT = 'Preoperative nutritional status is associated with postoperative outcomes after gastrointestinal surgery. This multicenter prospective cohort examines serum albumin and the prognostic nutritional index as predictors of complication rates in patients undergoing elective resection across 12 centers, with the primary endpoint of graded complications within 30 days of surgery.';

  it('near-duplicate abstracts with different titles/ids merge via minhash (identifier + fuzzy gates miss)', async () => {
    const openalex = fakeAdapter('openalex', {
      search: byQuery({ [PLAN.discovery[0] as string]: [
        fakeRecord('Nutrition and surgical outcomes: cohort analysis', '10.1000/mh.a', { abstractText: LONG_ABSTRACT_A }),
      ] }),
    });
    const europepmc = fakeAdapter('europepmc', {
      search: byQuery({ [PLAN.counter[0] as string]: [
        fakeRecord('Nutritional status predicts complications after GI resection', '10.1000/mh.b', { abstractText: LONG_ABSTRACT_A_VARIANT, identifiers: [{ kind: 'pubmed', value: 'PMC999001' }] }),
      ] }),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    expect(env.store.listObjects('source_document', env.run.id)).toHaveLength(1); // minhash merged
  });

  it('CJK paraphrase-titled near-duplicates merge (zh path through character-bigram shingles)', async () => {
    const zhA = '血清白蛋白水平与胃肠道手术后并发症相关性的前瞻性队列研究，纳入多中心择期切除术患者，分析预后营养指数对术后并发症发生率的影响。';
    const zhB = '血清白蛋白水平与胃肠道手术后并发症相关性的前瞻性队列研究，纳入多中心的择期切除术患者，分析预后营养指数对术后并发症发生率的影响（补充注册号：CHiCTR-001）。';
    const openalex = fakeAdapter('openalex', {
      search: byQuery({ [PLAN.discovery[0] as string]: [fakeRecord('营养状况与手术结局的队列分析', '10.1000/zh.a', { abstractText: zhA })] }),
    });
    const europepmc = fakeAdapter('europepmc', {
      search: byQuery({ [PLAN.counter[0] as string]: [fakeRecord('营养状况与手术结果：一项队列研究', '10.1000/zh.b', { abstractText: zhB, identifiers: [{ kind: 'pubmed', value: 'PMC999002' }] })] }),
    });
    const arxiv = fakeAdapter('arxiv', { search: async () => [] });
    const crossref = fakeAdapter('crossref', { search: async () => [] });
    const env = makeEnv([{ rawOutput: JSON.stringify(PLAN) }], { openalex, arxiv, crossref, europepmc });
    const out = await retrieveStage.execute(env.ctx);
    expect(out.kind).toBe('done');
    expect(env.store.listObjects('source_document', env.run.id)).toHaveLength(1);
  });
});


