/**
 * tests/retrieval/grounding.test.ts — counter-evidence + grounding orchestration.
 *
 * counter_evidence: pure deterministic unit tests.
 * grounding: end-to-end orchestration via a REPLAY adapter built from the
 * recorded OpenAlex fixture (hermetic — no network). Verifies supporting +
 * counter-evidence docs merge into one immutable corpus, the resolver binds
 * citations, and the acquisition provenance (perQueryCounts, fetchMode,
 * counter-evidence strategies) is honestly reported.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  generateCounterEvidenceQueries,
  groundResearchQuestion,
  createReplayAdapter,
  parseOpenAlexResults,
} from '../../src/retrieval/index.ts';
import { createCorpusSnapshot } from '../../src/retrieval/corpus.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BODY = readFileSync(join(__dirname, '..', 'fixtures', 'retrieval', 'openalex_osc_query.json'), 'utf8');
const FIXTURE_DOCS = parseOpenAlexResults(FIXTURE_BODY, 'estimating reproducibility psychological science', '2026-08-12T00:00:00.000Z', 3);

// ---------------------------------------------------------------------------
// counter_evidence — deterministic adversarial query generation
// ---------------------------------------------------------------------------

describe('counter_evidence — deterministic adversarial query generation', () => {
  it('generates one query per adversarial strategy (5 strategies)', () => {
    const qs = generateCounterEvidenceQueries('does dark energy exist');
    assert.equal(qs.length, 5);
    const strategies = new Set(qs.map((q) => q.strategy));
    assert.deepEqual([...strategies].sort(), ['alternative', 'criticism', 'failure', 'non_replication', 'null_result']);
  });

  it('each query preserves the primary terms + appends the adversarial qualifier', () => {
    const qs = generateCounterEvidenceQueries('dark energy');
    for (const q of qs) {
      assert.ok(q.text.startsWith('dark energy '), `primary terms preserved: ${q.text}`);
      assert.ok(q.text.length > 'dark energy '.length, 'qualifier appended');
    }
  });

  it('is deterministic — same input yields identical queries (same order)', () => {
    const a = generateCounterEvidenceQueries('replication crisis');
    const b = generateCounterEvidenceQueries('replication crisis');
    assert.deepEqual(a, b);
  });

  it('returns [] for empty input (honest — no adversarial framing of nothing)', () => {
    assert.equal(generateCounterEvidenceQueries('').length, 0);
    assert.equal(generateCounterEvidenceQueries('   ').length, 0);
  });

  it('normalizes whitespace in the primary query', () => {
    const qs = generateCounterEvidenceQueries('dark   energy\tphysics');
    assert.ok(qs[0]!.text.startsWith('dark energy physics '));
  });
});

// ---------------------------------------------------------------------------
// grounding — end-to-end orchestration (replay adapter, hermetic)
// ---------------------------------------------------------------------------

describe('grounding — research-question acquisition orchestration', () => {
  // Replay adapter: serves the recorded OpenAlex fixture docs for any query
  // (proves merge/dedupe/corpus/resolver logic without network).
  const replayAdapter = createReplayAdapter('openalex', 'OpenAlex', FIXTURE_DOCS);

  it('grounds a question into an immutable corpus with supporting + counter-evidence docs', async () => {
    const g = await groundResearchQuestion({
      question: 'estimating reproducibility psychological science',
      adapter: replayAdapter,
      maxPerQuery: 3,
    });
    // 1 supporting query + 5 counter-evidence queries, each returning ≤3 docs,
    // deduped into the corpus (3 unique docs, since replay serves the same set).
    assert.equal(g.fetchMode, 'replay', 'injected adapter → replay mode');
    assert.equal(g.supportingQuery, 'estimating reproducibility psychological science');
    assert.equal(g.counterEvidenceQueries.length, 5, '5 counter-evidence queries issued');
    assert.equal(g.perQueryCounts.length, 6, '1 supporting + 5 counter-evidence');
    assert.ok(g.corpus.documentCount > 0);
    assert.ok(g.corpus.documentCount <= 3, 'deduped to the unique fixture docs');
  });

  it('the resolver binds citations to the grounded corpus', async () => {
    const g = await groundResearchQuestion({
      question: 'replication crisis',
      adapter: replayAdapter,
      maxPerQuery: 2,
    });
    const firstDoc = g.corpus.documents[0];
    if (!firstDoc) assert.fail('corpus must have a document');
    const validation = g.resolver.validate([firstDoc.documentId, 'llm-invented-id']);
    assert.equal(validation.bound.length, 1, 'the real corpus doc is bound');
    assert.equal(validation.unbound.length, 1, 'the invented id is unbound');
    assert.equal(validation.allBound, false);
    assert.equal(validation.snapshotId, g.corpus.snapshotId);
  });

  it('includeCounterEvidence=false skips adversarial queries', async () => {
    const g = await groundResearchQuestion({
      question: 'dark energy',
      adapter: replayAdapter,
      maxPerQuery: 2,
      includeCounterEvidence: false,
    });
    assert.equal(g.counterEvidenceQueries.length, 0);
    assert.equal(g.perQueryCounts.length, 1, 'only the supporting query');
  });

  it('fail-closed: a retrieval error propagates (no silent partial corpus)', async () => {
    const failingAdapter = {
      source: 'openalex' as const,
      sourceName: 'OpenAlex',
      async retrieve() { throw new Error('network down'); },
    };
    await assert.rejects(
      () => groundResearchQuestion({ question: 'x', adapter: failingAdapter }),
      /network down/,
    );
  });

  it('the corpus snapshotId + rootHash are stable for the same acquired set', async () => {
    const opts = { question: 'replication', adapter: replayAdapter, maxPerQuery: 3 } as const;
    const a = await groundResearchQuestion(opts);
    const b = await groundResearchQuestion(opts);
    assert.equal(a.corpus.snapshotId, b.corpus.snapshotId);
    assert.equal(a.corpus.rootHash, b.corpus.rootHash);
  });
});

describe('grounding — frozen-corpus replay (explicit opt-in, R9)', () => {
  // A legitimately-frozen snapshot built through the SSOT (same shape a live
  // run auto-freezes into .far/snapshots/ and --reuse-snapshot loads back).
  const frozen = createCorpusSnapshot(FIXTURE_DOCS, ['original live query'], '2026-08-16T00:00:00.000Z');

  it('replays the frozen corpus verbatim with ZERO retrieval I/O', async () => {
    // A poisoning adapter: if the frozen path touches retrieval at all, this
    // throws and the test fails — proving the pin makes no network/adaptor call.
    const poison = {
      source: 'openalex' as const,
      sourceName: 'OpenAlex',
      async retrieve(): Promise<never> { throw new Error('frozen path must not retrieve'); },
    };
    const g = await groundResearchQuestion({
      question: 'any question against the frozen corpus',
      adapter: poison,
      frozenCorpus: frozen,
    });
    assert.equal(g.fetchMode, 'frozen');
    assert.deepEqual(g.frozenFrom, { snapshotId: frozen.snapshotId });
    assert.equal(g.corpus.snapshotId, frozen.snapshotId, 'EXACT pinned corpus (N>=5 homogeneity)');
    assert.equal(g.corpus.rootHash, frozen.rootHash);
    assert.deepEqual(g.corpus.documents, frozen.documents);
    assert.deepEqual(g.perQueryCounts, [], 'no queries issued');
    assert.deepEqual(g.sourcesUsed, [], 'no sources used');
    assert.equal(g.counterEvidenceQueries.length, 0);
    // The resolver still binds against the pinned set (downstream stages work).
    const first = frozen.documents[0];
    if (!first) assert.fail('fixture must have docs');
    const bound = g.resolver.validate([first.documentId]).bound;
    assert.equal(bound.length, 1);
    assert.equal(bound[0]!.documentId, first.documentId);
  });

  it('rejects a tampered frozen corpus at the use site (defense in depth)', async () => {
    const tampered = {
      ...frozen,
      documents: frozen.documents.map((d) => ({ ...d, title: `${d.title} TAMPERED` })),
    };
    await assert.rejects(
      () => groundResearchQuestion({ question: 'q', frozenCorpus: tampered }),
      /frozen corpus failed integrity verification/,
    );
  });

  it('rejects an empty frozen corpus (refusing to ground on nothing)', async () => {
    const empty = createCorpusSnapshot([], ['q'], '2026-08-16T00:00:00.000Z');
    await assert.rejects(
      () => groundResearchQuestion({ question: 'q', frozenCorpus: empty }),
      /frozen corpus is empty/,
    );
  });
});
