import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProvenanceReceipt, ResearchQuestion, ResearchRun, newId } from '../src/domain/index.js';
import type { SourceFamily } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store, STAGE_ALL } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { openResponseCacheStore } from '../src/sources/response-cache.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { CitationChaseAdapter, RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import type { StageContext } from '../src/pipeline/types.js';
import { retrieveStage } from '../src/pipeline/stages/retrieve.js';

/**
 * CACHE-EXCLUSIVE EXACT REPLAY (RU-R frontier candidate 3) + chase caching
 * (its prerequisite). All offline, zero network, zero LLM judgment:
 *
 *  1. read-through recording run over a real sqlite response cache,
 *  2. replay run whose EVERY adapter throws on contact — the corpus must
 *     reproduce byte-identically (content hashes, pool size, executed queries,
 *     chase outcome) from cache alone, every retrieval receipted cache=replay,
 *  3. chase-only caching: a read-through rerun with a throwing citations
 *     adapter still reproduces the chase additions (cache hits, zero calls),
 *  4. empty-cache replay refuses explicitly (no partial silent replay),
 *  5. chase entries missing from an otherwise-complete cache degrade VISIBLY
 *     (fusion.citationChase.failure + failed receipt), never silently.
 *
 * The LLM query plan is the TEST-ONLY scripted stub returning the identical
 * plan in every run — the replay claim proven here covers the SOURCE layer;
 * model-dependent stages are explicitly out of scope (documented in the lane
 * report).
 */

const QUESTION_TEXT = 'Does intermittent fasting improve insulin sensitivity in adults?';

const PLAN = {
  discovery: ['intermittent fasting insulin sensitivity', 'time restricted eating glucose'],
  supporting: ['intermittent fasting insulin sensitivity trial'],
  counter: [
    'intermittent fasting insulin sensitivity failed replication',
    'intermittent fasting insulin sensitivity limitations',
  ],
};

const mkRec = (
  title: string,
  ids: Array<{ kind: 'doi' | 'openalex'; value: string }>,
  year = 2022,
): RawSourceRecord => {
  const slug = ids[0]!.value.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const body: string[] = [];
  for (let i = 0; i < 30; i += 1) body.push(`${words[i % words.length]}-${slug}-${i}`);
  return {
    identifiers: ids.map((i) => ({ kind: i.kind, value: i.value })),
    title,
    publicationYear: year,
    authors: ['Replay Fixture'],
    contentDepth: 'abstract',
    accessState: 'open',
    abstractText: `Synthetic fixture abstract: ${body.join(' ')}.`,
    normalized: { title, fixture: true },
  };
};

const D1 = mkRec('Intermittent fasting improves insulin sensitivity randomized trial', [
  { kind: 'doi', value: '10.1/d1' },
  { kind: 'openalex', value: 'W111' },
]);
const D2 = mkRec('Intermittent fasting insulin sensitivity null finding replication failure', [
  { kind: 'doi', value: '10.1/d2' },
  { kind: 'openalex', value: 'W222' },
]);
const D3 = mkRec('Time restricted eating glucose metabolism cohort', [
  { kind: 'doi', value: '10.1/d3' },
  { kind: 'openalex', value: 'W333' },
]);
const R5 = mkRec('Foundational method paper for fasting trials design', [
  { kind: 'doi', value: '10.1/r5' },
  { kind: 'openalex', value: 'W900' },
], 1998);
const C6 = mkRec('Follow up critique of fasting insulin sensitivity claims', [
  { kind: 'doi', value: '10.1/c6' },
  { kind: 'openalex', value: 'W444' },
], 2024);
const R7 = mkRec('Minimal model methodology original paper', [
  { kind: 'doi', value: '10.1/r7' },
  { kind: 'openalex', value: 'W950' },
], 1979);

/** Counting adapters: every openalex query returns the three keyword docs; other families return zero. */
const countingAdapters = (counters: { search: number; chase: number }) => {
  const openalex: SourceAdapter = {
    family: 'openalex',
    async search() {
      counters.search += 1;
      return { family: 'openalex', query: '', httpStatus: 200, records: [D1, D2, D3], latencyMs: 1 };
    },
    async resolve() {
      return { found: false, httpStatus: 404 };
    },
    citations: {
      async referencedWorkIds(workRef) {
        counters.chase += 1;
        if (workRef === 'W111') return ['W900'];
        if (workRef === 'W900') return ['W950'];
        return [];
      },
      async citingWorks(workRef) {
        counters.chase += 1;
        return workRef === 'W111' ? [C6] : [];
      },
      async worksByIds(ids) {
        counters.chase += 1;
        if (ids.includes('W900')) return [R5];
        if (ids.includes('W950')) return [R7];
        return [];
      },
    } satisfies CitationChaseAdapter,
  };
  const empty = (family: SourceFamily): SourceAdapter => ({
    family,
    async search() {
      counters.search += 1;
      return { family, query: '', httpStatus: 200, records: [], latencyMs: 1 };
    },
    async resolve() {
      return { found: false, httpStatus: 404 };
    },
  });
  return {
    openalex,
    arxiv: empty('arxiv'),
    crossref: empty('crossref'),
    europepmc: empty('europepmc'),
  };
};

/** Forbidden adapters: any contact is a test failure (network must never be reached). */
const forbiddenAdapters = (counters: { search: number; chase: number }, opts: { citations?: boolean } = {}) => {
  const boom = (what: string): never => {
    counters.search += 1;
    throw new Error(`NETWORK FORBIDDEN IN REPLAY: ${what} was called`);
  };
  const openalex: SourceAdapter = {
    family: 'openalex',
    async search() {
      return boom('openalex.search');
    },
    async resolve() {
      return boom('openalex.resolve');
    },
    ...(opts.citations === false
      ? {}
      : {
          citations: {
            async referencedWorkIds() {
              counters.chase += 1;
              throw new Error('NETWORK FORBIDDEN IN REPLAY: referencedWorkIds was called');
            },
            async citingWorks() {
              counters.chase += 1;
              throw new Error('NETWORK FORBIDDEN IN REPLAY: citingWorks was called');
            },
            async worksByIds() {
              counters.chase += 1;
              throw new Error('NETWORK FORBIDDEN IN REPLAY: worksByIds was called');
            },
          } satisfies CitationChaseAdapter,
        }),
  };
  const empty = (family: SourceFamily): SourceAdapter => ({
    family,
    async search() {
      return boom(`${family}.search`);
    },
    async resolve() {
      return boom(`${family}.resolve`);
    },
  });
  return { openalex, arxiv: empty('arxiv'), crossref: empty('crossref'), europepmc: empty('europepmc') };
};

/* ------------------------------ env assembly ------------------------------ */

const openDbs: Db[] = [];
const tempDirs: string[] = [];

const makeEnv = (
  adapters: Partial<Record<SourceFamily, SourceAdapter>>,
  responseCache?: StageContext['responseCache'],
) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'farlab-replay-'));
  tempDirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  openDbs.push(db);
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: QUESTION_TEXT,
    background: '',
    goalType: 'exploratory',
    scope: { domain: 'nutrition', phenomena: ['insulin sensitivity'], inScope: [], outOfScope: [] },
    constraints: {
      assumptions: [], dataConstraints: [], resourceConstraints: [], ethicalConstraints: [],
      methodologicalConstraints: [],
    },
    createdAt: new Date().toISOString(),
  });
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
  const steps: StubStep[] = [{ forPurpose: 'query-planning', rawOutput: JSON.stringify(PLAN) }];
  const ctx: StageContext = {
    run,
    store,
    artifacts,
    provider: createTestStubProvider(steps),
    sourceFor: (family) => {
      const adapter = adapters[family];
      if (!adapter) throw new Error(`TEST FIXTURE: no adapter registered for ${family}`);
      return adapter;
    },
    ...(responseCache !== undefined ? { responseCache } : {}),
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
  return { ctx, store, run };
};

const corpusOf = (store: Store, runId: string) => {
  const corpus = store.listObjects('corpus_snapshot', runId)[0];
  if (!corpus) throw new Error('no corpus snapshot persisted');
  return corpus;
};

const corpusFingerprint = (store: Store, runId: string) => {
  const corpus = corpusOf(store, runId);
  const docs = corpus.documentIds.map((id) => store.getObject('source_document', id));
  return {
    poolSize: corpus.fusion?.poolSize,
    docHashes: docs.map((d) => d?.contentHash),
    docTitles: docs.map((d) => d?.title),
    queryTexts: corpus.queries.map((q) => `${q.purpose}:${q.text}`),
    chase: corpus.fusion?.citationChase,
    diversity: corpus.fusion?.diversity,
  };
};

const retrievalReceipts = (store: Store, runId: string) =>
  store.listObjects('receipt', runId).filter((r) => r.kind === 'source_retrieval');

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('cache-exclusive exact replay + chase caching (offline, real stage code)', () => {
  it('records via read-through, then replays byte-identically with zero adapter contact', async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'farlab-replay-cache-'));
    tempDirs.push(cacheDir);
    const cacheDb = openDb(path.join(cacheDir, 'cache.db'));
    openDbs.push(cacheDb);

    // --- run 1: read-through recording (adapters serve, everything is cached) ---
    const rec1 = { search: 0, chase: 0 };
    const env1 = makeEnv(countingAdapters(rec1), openResponseCacheStore(cacheDb));
    const out1 = await retrieveStage.execute(env1.ctx);
    expect(out1.kind).toBe('done');
    const fp1 = corpusFingerprint(env1.store, env1.run.id);
    expect(fp1.poolSize).toBe(6); // D1 D2 D3 + chase R5 C6 + hop-2 R7
    expect(fp1.chase).toMatchObject({ seeds: 3, backward: 2, forward: 1, added: 3 });
    expect(rec1.search).toBeGreaterThan(0);
    expect(rec1.chase).toBeGreaterThan(0);

    // --- run 2: cache-exclusive replay — every adapter throws on contact ---
    const rec2 = { search: 0, chase: 0 };
    const env2 = makeEnv(forbiddenAdapters(rec2), openResponseCacheStore(cacheDb, 'replay'));
    const out2 = await retrieveStage.execute(env2.ctx);
    expect(out2.kind).toBe('done');
    const fp2 = corpusFingerprint(env2.store, env2.run.id);
    expect(fp2.docHashes).toEqual(fp1.docHashes);
    expect(fp2.docTitles).toEqual(fp1.docTitles);
    expect(fp2.poolSize).toBe(fp1.poolSize);
    expect(fp2.queryTexts).toEqual(fp1.queryTexts);
    expect(fp2.chase).toEqual(fp1.chase);
    expect(fp2.diversity).toEqual(fp1.diversity);
    // zero network contact
    expect(rec2.search).toBe(0);
    expect(rec2.chase).toBe(0);
    // every retrieval receipt proves its cache=replay provenance
    const receipts = retrievalReceipts(env2.store, env2.run.id);
    expect(receipts.length).toBeGreaterThan(0);
    for (const r of receipts) {
      expect(r.sourceRetrieval?.cache, `receipt without cache=replay: ${r.sourceRetrieval?.query}`).toBe('replay');
    }
    // chase receipts included in the replay provenance
    expect(receipts.some((r) => r.sourceRetrieval?.query.startsWith('refs:'))).toBe(true);
    expect(receipts.some((r) => r.sourceRetrieval?.query.startsWith('refs2:'))).toBe(true);

    // --- run 3: read-through rerun — chase served from cache, searches hit ---
    const rec3 = { search: 0, chase: 0 };
    const env3 = makeEnv(forbiddenAdapters(rec3), openResponseCacheStore(cacheDb));
    const out3 = await retrieveStage.execute(env3.ctx);
    expect(out3.kind).toBe('done');
    const fp3 = corpusFingerprint(env3.store, env3.run.id);
    expect(fp3.docHashes).toEqual(fp1.docHashes);
    expect(fp3.chase).toEqual(fp1.chase);
    expect(rec3.search).toBe(0);
    expect(rec3.chase).toBe(0);
    expect(retrievalReceipts(env3.store, env3.run.id).every((r) => r.sourceRetrieval?.cache === 'hit')).toBe(true);
  });

  it('empty-cache replay refuses explicitly — no partial silent replay', async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'farlab-replay-miss-'));
    tempDirs.push(cacheDir);
    const cacheDb = openDb(path.join(cacheDir, 'cache.db'));
    openDbs.push(cacheDb);

    const rec = { search: 0, chase: 0 };
    const env = makeEnv(forbiddenAdapters(rec), openResponseCacheStore(cacheDb, 'replay'));
    await expect(retrieveStage.execute(env.ctx)).rejects.toThrow(
      /missing from the response cache.*exact replay refused/s,
    );
    // the failed attempts are receipted (attempts are provenance facts)
    const failed = retrievalReceipts(env.store, env.run.id);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.sourceRetrieval?.resultCount === 0)).toBe(true);
    expect(env.store.listObjects('corpus_snapshot', env.run.id)).toHaveLength(0);
  });

  it('chase entries missing from an otherwise-complete cache degrade visibly, never silently', async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'farlab-replay-chase-miss-'));
    tempDirs.push(cacheDir);
    const cacheDb = openDb(path.join(cacheDir, 'cache.db'));
    openDbs.push(cacheDb);

    // Recording run WITHOUT a chase-capable adapter: planned searches get
    // cached, no chase entries exist (the pre-chase-caching-era run shape).
    const rec = { search: 0, chase: 0 };
    const adapters = countingAdapters(rec);
    const noChaseOpenalex: SourceAdapter = { ...adapters.openalex };
    delete (noChaseOpenalex as { citations?: CitationChaseAdapter }).citations;
    const env1 = makeEnv({ ...adapters, openalex: noChaseOpenalex }, openResponseCacheStore(cacheDb));
    const out1 = await retrieveStage.execute(env1.ctx);
    expect(out1.kind).toBe('done');
    expect(corpusFingerprint(env1.store, env1.run.id).chase).toBeUndefined();

    // Replay run WITH a (forbidden) chase adapter: planned corpus replays, the
    // chase misses and is recorded as a VISIBLE failure, corpus still completes.
    const rec2 = { search: 0, chase: 0 };
    const env2 = makeEnv(forbiddenAdapters(rec2), openResponseCacheStore(cacheDb, 'replay'));
    const out2 = await retrieveStage.execute(env2.ctx);
    expect(out2.kind).toBe('done');
    const fp2 = corpusFingerprint(env2.store, env2.run.id);
    expect(fp2.poolSize).toBe(3); // keyword docs only — chase additions honestly absent
    expect(fp2.chase?.failure).toMatch(/replay cache miss/);
    const chaseFailReceipts = retrievalReceipts(env2.store, env2.run.id).filter((r) =>
      r.sourceRetrieval?.query.startsWith('refs:'),
    );
    expect(chaseFailReceipts.length).toBeGreaterThan(0);
    expect(rec2.chase).toBe(0);
  });
});
