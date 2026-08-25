import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResearchQuestion, SourceDocument, newId } from '../src/domain/index.js';
import type { SourceFamily } from '../src/domain/source.js';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import { runCounterSearch, CounterSearchError, COUNTER_SEARCH_MAX_ADD } from '../src/server/counter-search.js';
import { truthProfileFromReceipts } from '../src/app/truth-profile.js';
import type { ProvenanceReceipt } from '../src/domain/index.js';

// *** TEST-ONLY *** counter-search capability (§5.2): one researcher-directed
// counter-evidence search growing the run corpus. Fake adapters (no network);
// real SQLite store + artifact store; receipts/corpus versioning verified.

let tmp: string;
let db: Db;
let store: Store;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-csearch-'));
  db = openDb(path.join(tmp, 'state.db'));
  store = new Store(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const at = (i: number) => new Date(1_700_000_000_000 + i * 1000).toISOString();

const mkRun = (status = 'completed'): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'does X cause Y?', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: at(0),
  });
  store.putObject('question', q);
  const run = store.createRun(q, {});
  if (status !== 'created') {
    run.status = status as typeof run.status;
    store.updateRun(run);
  }
  return run.id;
};

const record = (doi: string, title: string): RawSourceRecord => ({
  identifiers: [{ kind: 'doi', value: doi }],
  title,
  authors: ['A. Author'],
  contentDepth: 'abstract',
  accessState: 'open',
  abstractText: `findings about ${title}`,
  normalized: { doi, title },
});

const fakeAdapter = (family: SourceFamily, result: RawRetrievalResult | Error): SourceAdapter => ({
  family,
  search: async () => {
    if (result instanceof Error) throw result;
    return result;
  },
  resolve: async () => ({ found: false, httpStatus: 404 }),
});

const okResult = (family: SourceFamily, records: RawSourceRecord[], httpStatus = 200): RawRetrievalResult => ({
  family, query: 'q', httpStatus, records, latencyMs: 5,
});

const artifacts = (): ReturnType<typeof openArtifactStore> => openArtifactStore(path.join(tmp, 'artifacts'));

describe('runCounterSearch — corpus growth with truth receipts', () => {
  it('adds deduped documents, versions the corpus, records live retrieval receipts and an event', async () => {
    const runId = mkRun();
    const sourceFor = (family: SourceFamily): SourceAdapter =>
      family === 'openalex' ? fakeAdapter(family, okResult(family, [record('10.1/counter-a', 'Counter study A'), record('10.1/counter-b', 'Counter study B')]))
      : family === 'crossref' ? fakeAdapter(family, okResult(family, [record('10.1/counter-c', 'Replication failure C')]))
      : fakeAdapter(family, new Error('europepmc temporarily unreachable'));

    const out = await runCounterSearch({ store, artifacts: artifacts() }, runId, { query: 'failures to replicate X effect' }, sourceFor);

    expect(out.added).toHaveLength(3);
    expect(out.duplicatesSkipped).toBe(0);
    expect(out.familyFailures).toEqual([{ family: 'europepmc', reason: 'europepmc temporarily unreachable' }]);
    // 2 successes + 1 failed family (failed external contact also receipts, P2-4)
    expect(out.receiptsRecorded).toBe(3);

    // corpus versioning: latest snapshot grew, carries the counter queries + prior fusion untouched
    const corpora = store.listObjects('corpus_snapshot', runId);
    expect(corpora).toHaveLength(1);
    const corpus = corpora[0]!;
    expect(corpus.documentIds).toEqual(out.added.map((a) => a.id));
    const counterQueries = corpus.queries.filter((q) => q.purpose === 'counter_evidence');
    expect(counterQueries.map((q) => q.family).sort()).toEqual(['crossref', 'openalex']);
    expect(corpus.familyFailures).toEqual([{ family: 'europepmc', reason: 'europepmc temporarily unreachable' }]);

    // documents persisted as unverified sources with real content hashes
    const docs = store.listObjects('source_document', runId) as SourceDocument[];
    expect(docs).toHaveLength(3);
    for (const d of docs) expect(d.verification).toBeUndefined();

    // receipts are live retrieval receipts (incl. the failed family) -> truth live
    const receipts = store.listObjects('receipt', runId) as ProvenanceReceipt[];
    expect(receipts.filter((r) => r.kind === 'source_retrieval')).toHaveLength(3);
    expect(truthProfileFromReceipts(runId, receipts).klass).toBe('live');

    // event discloses the growth + the unverified boundary
    const note = store.listEvents(runId).find((e) => (e.detail as { reason?: string })?.reason === 'counter_search_added');
    expect(note?.detail).toMatchObject({ added: 3, unverified: expect.stringContaining('verify_sources') });
  });

  it('skips documents already in the corpus (identifier dedup) and caps additions', async () => {
    const runId = mkRun();
    // pre-existing corpus document with the same DOI as one search result
    store.putObject('source_document', SourceDocument.parse({
      id: newId('src'), runId, family: 'openalex',
      identifiers: [{ kind: 'doi', value: '10.1/dupe' }],
      title: 'Already present', authors: [],
      contentDepth: 'metadata_only', accessState: 'unknown',
      contentHash: 'a'.repeat(64), retrievedAt: at(1), parseStatus: 'ok',
    }));
    const many = Array.from({ length: 20 }, (_, i) => record(`10.1/new-${i}`, `New study ${i}`));
    const sourceFor = (family: SourceFamily): SourceAdapter =>
      family === 'openalex'
        ? fakeAdapter(family, okResult(family, [record('10.1/dupe', 'Same paper again'), ...many]))
        : fakeAdapter(family, new Error('offline'));

    const out = await runCounterSearch({ store, artifacts: artifacts() }, runId, { query: 'more counter evidence' }, sourceFor);
    expect(out.duplicatesSkipped).toBe(1);
    expect(out.added).toHaveLength(COUNTER_SEARCH_MAX_ADD);
    expect(out.added.every((a) => a.id !== undefined)).toBe(true);
  });

  it('refuses while a live executor holds the run lease (409), 404s unknown runs, and 409s not-yet-started runs', async () => {
    const runId = mkRun();
    store.acquireLease(runId, 'executor-1', new Date(Date.now() + 60_000).toISOString());
    await expect(runCounterSearch({ store, artifacts: artifacts() }, runId, { query: 'anything' }))
      .rejects.toMatchObject({ status: 409, code: 'run_active' });

    const ghost = `run_${'0'.repeat(26)}`;
    await expect(runCounterSearch({ store, artifacts: artifacts() }, ghost, { query: 'anything' }))
      .rejects.toMatchObject({ status: 404, code: 'not_found' });

    // audit P1-2: a created run has no discovery corpus yet — a counter snapshot
    // would silently replace discovery retrieval; refused with the honest reason
    const fresh = mkRun('created');
    await expect(runCounterSearch({ store, artifacts: artifacts() }, fresh, { query: 'anything' }))
      .rejects.toMatchObject({ status: 409, code: 'not_started' });
    expect(store.listObjects('corpus_snapshot', fresh)).toHaveLength(0);
  });

  it('records a receipt even for failed family searches (audit P2-4: external contact stays visible)', async () => {
    const runId = mkRun();
    const sourceFor = (family: SourceFamily): SourceAdapter =>
      family === 'openalex'
        ? fakeAdapter(family, okResult(family, [record('10.1/only-a', 'Only winner')]))
        : fakeAdapter(family, new Error('family down'));
    const out = await runCounterSearch({ store, artifacts: artifacts() }, runId, { query: 'anything targeted' }, sourceFor);
    expect(out.added).toHaveLength(1);
    expect(out.familyFailures).toHaveLength(2);
    // one success + two failures = three live-contact receipts
    expect(out.receiptsRecorded).toBe(3);
    const retrievalReceipts = store.listObjects('receipt', runId) as ProvenanceReceipt[];
    const failed = retrievalReceipts.filter((r) => r.sourceRetrieval?.httpStatus === 0);
    expect(failed).toHaveLength(2);
    for (const f of failed) expect(f.redactionNote).toContain('failed before a response');
    // truth plane sees the external contacts
    expect(truthProfileFromReceipts(runId, retrievalReceipts).retrieval.live).toBe(3);
  });

  it('rejects malformed bodies (query length contract)', async () => {
    const runId = mkRun();
    await expect(runCounterSearch({ store, artifacts: artifacts() }, runId, { query: 'ab' }))
      .rejects.toBeInstanceOf(CounterSearchError);
    await expect(runCounterSearch({ store, artifacts: artifacts() }, runId, {}))
      .rejects.toMatchObject({ code: 'invalid_counter_search' });
  });
});
