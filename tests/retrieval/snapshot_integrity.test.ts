/**
 * tests/retrieval/snapshot_integrity.test.ts — persisted-corpus integrity +
 * snapshot-to-snapshot increment protocol (2.md §10 后 R10 clause, T1).
 *
 * Layered tamper detection under test:
 *   - SET drift      → recomputed snapshotId vs stored (SNAPSHOT_ID_MISMATCH)
 *   - CONTENT drift  → recomputed rootHash vs stored (ROOT_HASH_MISMATCH)
 *   - COUNT drift    → documents.length vs stored documentCount (DOCUMENT_COUNT_MISMATCH)
 *   - FIELD drift    → per-document normalizedHash vs recomputed from the
 *                      document's own fields (DOCUMENT_CONTENT_MISMATCH) — catches
 *                      the case the aggregate rootHash is blind to (field edited,
 *                      stored hash left stale)
 *   - duplicate ids  → DUPLICATE_DOCUMENT_ID (well-formed snapshots never carry them)
 *
 * Round-trip test doubles as the equivalence proof: this module's local mirror
 * of the hash computation must agree with corpus.ts createCorpusSnapshot on a
 * fresh snapshot (stored hashes were minted by createCorpusSnapshot itself).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCorpusSnapshot, type CorpusSnapshot } from '../../src/retrieval/corpus.ts';
import { computeDocumentId, normalizedDocumentHash } from '../../src/retrieval/hash.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';
import {
  verifyCorpusSnapshot,
  snapshotIncrement,
  verifyRunCorpusSnapshot,
  readRunCorpus,
  RunCorpusReadError,
} from '../../src/retrieval/snapshot_integrity.ts';
import { runSnapshotVerify, renderSnapshotVerifyHuman } from '../../src/cli/commands/snapshot_verify.ts';

/** Synthetic document whose normalizedHash is minted by the REAL
 *  normalizedDocumentHash (mirrors tests/retrieval/corpus_citation.test.ts). */
function synthDoc(id: string, title: string, abstract: string): RetrievedDocument {
  const normalizedHash = normalizedDocumentHash({
    sourceType: 'openalex',
    persistentIdentifier: id,
    doi: null,
    title,
    authors: ['Synthetic Author'],
    publicationDate: '2020-01-01',
    abstract,
    canonicalUrl: `https://openalex.org/${id}`,
    licenseMetadata: null,
  });
  return {
    documentId: computeDocumentId('openalex', id),
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: id,
    doi: null,
    canonicalUrl: `https://openalex.org/${id}`,
    title,
    authors: ['Synthetic Author'],
    publicationDate: '2020-01-01',
    retrievedAt: '2026-08-12T00:00:00.000Z',
    retrievalQuery: 'synth',
    retrievalMethod: 'openalex-rest',
    rawHash: 'r'.repeat(64),
    normalizedHash,
    parserVersion: 'openalex-atom-v1',
    abstract,
    licenseMetadata: null,
  };
}

const DOC_A = synthDoc('W-synth-a', 'Doc A original title', 'Abstract A.');
const DOC_B = synthDoc('W-synth-b', 'Doc B original title', 'Abstract B.');
const DOC_C = synthDoc('W-synth-c', 'Doc C original title', 'Abstract C.');
const DOC_D = synthDoc('W-synth-d', 'Doc D original title', 'Abstract D.');

function snapOf(docs: readonly RetrievedDocument[]): CorpusSnapshot {
  return createCorpusSnapshot(docs, ['synth-query'], '2026-08-15T00:00:00.000Z');
}

/** Replace one document (by documentId) inside a snapshot's frozen list. */
function withDocument(
  snapshot: CorpusSnapshot,
  documentId: string,
  mutate: (d: RetrievedDocument) => RetrievedDocument,
): CorpusSnapshot {
  return {
    ...snapshot,
    documents: snapshot.documents.map((d) => (d.documentId === documentId ? mutate(d) : d)),
  };
}

let scratchDir = '';
before(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'far-snapshot-integrity-'));
});
after(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// verifyCorpusSnapshot — round-trip + tamper axes
// ---------------------------------------------------------------------------
describe('verifyCorpusSnapshot — round-trip + tamper detection', () => {
  it('round-trip: a fresh snapshot verifies ok AND recomputed hashes equal stored (mirror ≡ createCorpusSnapshot)', () => {
    const snap = snapOf([DOC_A, DOC_B, DOC_C]);
    const r = verifyCorpusSnapshot(snap);
    assert.equal(r.ok, true, `mismatches: ${r.mismatches.join('; ')}`);
    // The stored hashes were minted by corpus.ts createCorpusSnapshot; equality
    // proves this module's recomputation is a faithful mirror of that algorithm.
    assert.equal(r.recomputedSnapshotId, snap.snapshotId);
    assert.equal(r.recomputedRootHash, snap.rootHash);
    assert.deepEqual(r.mismatches, []);
  });

  it('round-trip is order-independent for the stored documents array', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const shuffled: CorpusSnapshot = { ...snap, documents: [DOC_B, DOC_A] };
    const r = verifyCorpusSnapshot(shuffled);
    assert.equal(r.ok, true, 'internal sort makes verification order-independent');
    assert.equal(r.recomputedSnapshotId, snap.snapshotId);
  });

  it('tampered stored snapshotId → SNAPSHOT_ID_MISMATCH (ok:false, recomputed still the honest value)', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const tampered: CorpusSnapshot = { ...snap, snapshotId: 'f'.repeat(64) };
    const r = verifyCorpusSnapshot(tampered);
    assert.equal(r.ok, false);
    assert.equal(r.mismatches.length, 1);
    const only = r.mismatches[0];
    assert.ok(only !== undefined);
    assert.ok(only.startsWith('SNAPSHOT_ID_MISMATCH'), only);
    assert.ok(only.includes('f'.repeat(64)), 'mismatch names the stored (bogus) value');
    assert.equal(r.recomputedSnapshotId, snap.snapshotId, 'recomputed stays the honest hash');
  });

  it('tampered stored rootHash → ROOT_HASH_MISMATCH', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const tampered: CorpusSnapshot = { ...snap, rootHash: '0'.repeat(64) };
    const r = verifyCorpusSnapshot(tampered);
    assert.equal(r.ok, false);
    assert.ok(r.mismatches.some((m) => m.startsWith('ROOT_HASH_MISMATCH')), r.mismatches.join('; '));
    assert.equal(r.recomputedRootHash, snap.rootHash);
  });

  it('documentCount drift (a document deleted from the persisted list) → DOCUMENT_COUNT_MISMATCH', () => {
    const snap = snapOf([DOC_A, DOC_B, DOC_C]);
    const dropped: CorpusSnapshot = {
      ...snap,
      documents: snap.documents.filter((d) => d.documentId !== DOC_B.documentId),
    };
    const r = verifyCorpusSnapshot(dropped);
    assert.equal(r.ok, false);
    assert.ok(
      r.mismatches.some((m) => m.startsWith('DOCUMENT_COUNT_MISMATCH') && m.includes('stored=3') && m.includes('actual=2')),
      r.mismatches.join('; '),
    );
    // Deleting a document also changes the SET → snapshotId mismatch must co-fire.
    assert.ok(r.mismatches.some((m) => m.startsWith('SNAPSHOT_ID_MISMATCH')));
  });

  it('field tamper with stale hash (title edited, normalizedHash untouched) → DOCUMENT_CONTENT_MISMATCH and NOT rootHash mismatch', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const tampered = withDocument(snap, DOC_A.documentId, (d) => ({ ...d, title: 'TAMPERED TITLE' }));
    const r = verifyCorpusSnapshot(tampered);
    assert.equal(r.ok, false);
    const docMismatch = r.mismatches.find((m) => m.startsWith('DOCUMENT_CONTENT_MISMATCH'));
    assert.ok(docMismatch !== undefined, `expected DOCUMENT_CONTENT_MISMATCH, got: ${r.mismatches.join('; ')}`);
    assert.ok(docMismatch.includes(DOC_A.documentId), 'mismatch names the drifted documentId');
    // The aggregate rootHash is computed over the STORED normalizedHash fields,
    // so a field edit with stale hash is invisible to it — the per-document
    // recomputation layer is what catches it (complementary detection).
    assert.ok(!r.mismatches.some((m) => m.startsWith('ROOT_HASH_MISMATCH')));
  });

  it('consistent tamper (title AND normalizedHash re-minted) → ROOT_HASH_MISMATCH fires, per-document layer stays quiet', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const tampered = withDocument(snap, DOC_A.documentId, (d) => ({
      ...d,
      title: 'REWRITTEN TITLE',
      normalizedHash: normalizedDocumentHash({
        sourceType: d.sourceType,
        persistentIdentifier: d.persistentIdentifier,
        doi: d.doi,
        title: 'REWRITTEN TITLE',
        authors: [...d.authors],
        publicationDate: d.publicationDate,
        abstract: d.abstract,
        canonicalUrl: d.canonicalUrl,
        licenseMetadata: d.licenseMetadata,
      }),
    }));
    const r = verifyCorpusSnapshot(tampered);
    assert.equal(r.ok, false);
    assert.ok(r.mismatches.some((m) => m.startsWith('ROOT_HASH_MISMATCH')), r.mismatches.join('; '));
    assert.ok(!r.mismatches.some((m) => m.startsWith('DOCUMENT_CONTENT_MISMATCH')));
  });

  it('duplicate documentId injected into the persisted list → DUPLICATE_DOCUMENT_ID (+ set-hash mismatch)', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const duplicated: CorpusSnapshot = { ...snap, documents: [...snap.documents, DOC_A] };
    const r = verifyCorpusSnapshot(duplicated);
    assert.equal(r.ok, false);
    assert.ok(
      r.mismatches.some((m) => m.startsWith('DUPLICATE_DOCUMENT_ID') && m.includes(DOC_A.documentId)),
      r.mismatches.join('; '),
    );
    assert.ok(r.mismatches.some((m) => m.startsWith('SNAPSHOT_ID_MISMATCH')));
    assert.ok(r.mismatches.some((m) => m.startsWith('DOCUMENT_COUNT_MISMATCH')));
  });

  it('determinism: double-run verification results are deep-equal (no time/random/order leakage)', () => {
    const snap = snapOf([DOC_A, DOC_B, DOC_C]);
    const tampered = withDocument(snap, DOC_B.documentId, (d) => ({ ...d, abstract: 'swapped' }));
    assert.deepEqual(verifyCorpusSnapshot(tampered), verifyCorpusSnapshot(tampered));
    assert.deepEqual(verifyCorpusSnapshot(snap), verifyCorpusSnapshot(snap));
  });
});

// ---------------------------------------------------------------------------
// snapshotIncrement — set arithmetic + comparability statements
// ---------------------------------------------------------------------------
describe('snapshotIncrement — added/retired sets + comparability statement', () => {
  it('identical snapshots → empty delta, sameRootHash, direct-comparability statement', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const inc = snapshotIncrement(snap, snap);
    assert.deepEqual(inc.addedIds, []);
    assert.deepEqual(inc.retiredIds, []);
    assert.equal(inc.unchangedCount, 2);
    assert.equal(inc.sameRootHash, true);
    assert.equal(inc.comparabilityStatement, 'identical evidence base — metrics directly comparable');
  });

  it('partial overlap → exact added/retired sets + shared-base statement', () => {
    const from = snapOf([DOC_A, DOC_B, DOC_C]);
    const to = snapOf([DOC_B, DOC_C, DOC_D]);
    const inc = snapshotIncrement(from, to);
    assert.deepEqual(inc.addedIds, [DOC_D.documentId]);
    assert.deepEqual(inc.retiredIds, [DOC_A.documentId]);
    assert.equal(inc.unchangedCount, 2);
    assert.equal(inc.sameRootHash, false);
    assert.equal(
      inc.comparabilityStatement,
      'shared base of 2 documents; cross-run comparisons must note the corpus delta (added 1, retired 1)',
    );
  });

  it('boundary: overlap exactly 50% of the larger set still counts as shared-base (>=, not >)', () => {
    const from = snapOf([DOC_A, DOC_B]);
    const to = snapOf([DOC_B, DOC_C]);
    const inc = snapshotIncrement(from, to);
    assert.equal(inc.unchangedCount, 1);
    assert.ok(inc.comparabilityStatement.startsWith('shared base of 1 documents'), inc.comparabilityStatement);
  });

  it('disjoint sets (overlap < 50% of larger) → NOT like-for-like statement', () => {
    const from = snapOf([DOC_A, DOC_B, DOC_C, synthDoc('W-synth-e', 'Doc E', 'Abstract E.')]);
    const to = snapOf([DOC_D, synthDoc('W-synth-f', 'Doc F', 'Abstract F.'), synthDoc('W-synth-g', 'Doc G', 'Abstract G.'), synthDoc('W-synth-h', 'Doc H', 'Abstract H.')]);
    const inc = snapshotIncrement(from, to);
    assert.equal(inc.unchangedCount, 0);
    assert.equal(inc.addedIds.length, 4);
    assert.equal(inc.retiredIds.length, 4);
    assert.equal(inc.comparabilityStatement, 'substantially different evidence bases — cross-run metric comparison is NOT like-for-like');
  });

  it('same set, changed content (refetch with updated metadata) → middle branch with added 0 / retired 0', () => {
    const refreshedA = synthDoc('W-synth-a', 'Doc A UPDATED title', 'Abstract A updated.');
    const from = snapOf([DOC_A, DOC_B]);
    const to = snapOf([refreshedA, DOC_B]);
    const inc = snapshotIncrement(from, to);
    assert.deepEqual(inc.addedIds, []);
    assert.deepEqual(inc.retiredIds, []);
    assert.equal(inc.unchangedCount, 2);
    assert.equal(inc.sameRootHash, false);
    assert.equal(
      inc.comparabilityStatement,
      'shared base of 2 documents; cross-run comparisons must note the corpus delta (added 0, retired 0)',
    );
  });

  it('determinism: double-run increment results are deep-equal; added/retired sorted by documentId', () => {
    const from = snapOf([DOC_A, DOC_B, DOC_C]);
    const to = snapOf([DOC_C, DOC_D]);
    const a = snapshotIncrement(from, to);
    const b = snapshotIncrement(from, to);
    assert.deepEqual(a, b);
    assert.deepEqual(a.addedIds, [...a.addedIds].sort());
    assert.deepEqual(a.retiredIds, [...a.retiredIds].sort());
  });
});

// ---------------------------------------------------------------------------
// verifyRunCorpusSnapshot / readRunCorpus — run-file helpers (fail-closed)
// ---------------------------------------------------------------------------
describe('verifyRunCorpusSnapshot / readRunCorpus — run-file helpers', () => {
  it('reads a real-shaped run JSON and verifies its corpus (ok + runId)', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const runPath = join(scratchDir, 'run-ok.json');
    writeFileSync(runPath, JSON.stringify({ runId: '01TESTRUN0000000000000000', question: 'q', corpus: snap }));
    const out = verifyRunCorpusSnapshot(runPath);
    assert.equal(out.runId, '01TESTRUN0000000000000000');
    assert.equal(out.verification.ok, true);
    assert.equal(out.verification.recomputedRootHash, snap.rootHash);
  });

  it('unreadable file → typed RunCorpusReadError RUN_FILE_UNREADABLE with cause attached', () => {
    const missing = join(scratchDir, 'does-not-exist.json');
    assert.throws(
      () => verifyRunCorpusSnapshot(missing),
      (err: unknown) => {
        assert.ok(err instanceof RunCorpusReadError);
        assert.equal(err.code, 'RUN_FILE_UNREADABLE');
        assert.ok(err.cause !== undefined, 'fail-closed: original error attached as cause');
        return true;
      },
    );
  });

  it('corrupt JSON → typed RunCorpusReadError RUN_JSON_INVALID with the SyntaxError as cause', () => {
    const corrupt = join(scratchDir, 'run-corrupt.json');
    writeFileSync(corrupt, '{ "runId": "x", "corpus": { not json');
    assert.throws(
      () => verifyRunCorpusSnapshot(corrupt),
      (err: unknown) => {
        assert.ok(err instanceof RunCorpusReadError);
        assert.equal(err.code, 'RUN_JSON_INVALID');
        assert.ok(err.cause instanceof SyntaxError);
        return true;
      },
    );
  });

  it('missing .corpus → RUN_CORPUS_MISSING; malformed corpus (documents not an array) → RUN_CORPUS_MALFORMED', () => {
    const noCorpus = join(scratchDir, 'run-no-corpus.json');
    writeFileSync(noCorpus, JSON.stringify({ runId: 'r1', question: 'q' }));
    assert.throws(() => verifyRunCorpusSnapshot(noCorpus), (err: unknown) => {
      assert.ok(err instanceof RunCorpusReadError);
      assert.equal((err as RunCorpusReadError).code, 'RUN_CORPUS_MISSING');
      return true;
    });

    const badCorpus = join(scratchDir, 'run-bad-corpus.json');
    writeFileSync(badCorpus, JSON.stringify({ runId: 'r2', corpus: { snapshotId: 'a', rootHash: 'b', documentCount: 3, documents: 'nope' } }));
    assert.throws(() => readRunCorpus(badCorpus), (err: unknown) => {
      assert.ok(err instanceof RunCorpusReadError);
      assert.equal((err as RunCorpusReadError).code, 'RUN_CORPUS_MALFORMED');
      return true;
    });
  });

  it('tampered persisted run corpus → verification flags the mismatch (end-to-end tamper path)', () => {
    const snap = snapOf([DOC_A, DOC_B]);
    const tampered: CorpusSnapshot = withDocument(snap, DOC_B.documentId, (d) => ({ ...d, title: 'LATE EDIT' }));
    const runPath = join(scratchDir, 'run-tampered.json');
    writeFileSync(runPath, JSON.stringify({ runId: '01TAMPEREDRUN0000000000000', corpus: tampered }));
    const out = verifyRunCorpusSnapshot(runPath);
    assert.equal(out.verification.ok, false);
    assert.ok(
      out.verification.mismatches.some(
        (m) => m.startsWith('DOCUMENT_CONTENT_MISMATCH') && m.includes(DOC_B.documentId),
      ),
      out.verification.mismatches.join('; '),
    );
  });
});

// ---------------------------------------------------------------------------
// CLI wrapper — runSnapshotVerify
// ---------------------------------------------------------------------------
describe('runSnapshotVerify — CLI wrapper (exit codes + modes)', () => {
  const okRunPath = join(scratchDir, 'cli-ok.json');
  const badRunPath = join(scratchDir, 'cli-bad.json');

  before(() => {
    const snap = snapOf([DOC_A, DOC_B]);
    writeFileSync(okRunPath, JSON.stringify({ runId: '01CLIOKRUN000000000000000', corpus: snap }));
    writeFileSync(
      badRunPath,
      JSON.stringify({ runId: '01CLIBADRUN000000000000000', corpus: { ...snap, snapshotId: 'f'.repeat(64) } }),
    );
  });

  it('all runs ok → exitCode 0, per-run ok:true', () => {
    const outcome = runSnapshotVerify({ runPaths: [okRunPath] });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.mode, 'verify');
    assert.equal(outcome.results.length, 1);
    const [okRun] = outcome.results;
    assert.ok(okRun !== undefined);
    assert.equal(okRun.ok, true);
    assert.equal(okRun.runId, '01CLIOKRUN000000000000000');
    assert.deepEqual(okRun.mismatches, []);
  });

  it('any mismatch or unreadable run → exitCode 1 (fail-closed batch: one bad file never yields 0)', () => {
    const outcome = runSnapshotVerify({ runPaths: [okRunPath, badRunPath, join(scratchDir, 'ghost.json')] });
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.results.length, 3);
    const [okRun, badRun, ghostRun] = outcome.results;
    assert.ok(okRun !== undefined && badRun !== undefined && ghostRun !== undefined);
    assert.equal(okRun.ok, true, 'the clean run still verifies ok inside a failing batch');
    assert.equal(badRun.ok, false);
    assert.ok(badRun.mismatches.some((m) => m.startsWith('SNAPSHOT_ID_MISMATCH')));
    assert.equal(ghostRun.ok, false);
    assert.ok(typeof ghostRun.error === 'string', 'unreadable run carries a typed error entry');
    assert.ok((ghostRun.error ?? '').startsWith('RUN_FILE_UNREADABLE'), ghostRun.error ?? '');
  });

  it("runPaths '-' reads paths from the (injectable) stdin provider", () => {
    const outcome = runSnapshotVerify({
      runPaths: '-',
      stdin: () => `${okRunPath}\n\n${badRunPath}\n`,
    });
    assert.equal(outcome.results.length, 2, 'blank lines skipped');
    assert.equal(outcome.exitCode, 1);
  });

  it("usage errors → exitCode 2 (no paths; '-' with empty stdin)", () => {
    assert.equal(runSnapshotVerify({ runPaths: [] }).exitCode, 2);
    assert.equal(
      runSnapshotVerify({ runPaths: '-', stdin: () => '' }).exitCode,
      2,
      "'-' with empty stdin is a usage error",
    );
  });

  it('increment mode: reads both runs, reports added/retired exactly, exitCode 0', () => {
    const fromSnap = snapOf([DOC_A, DOC_B, DOC_C]);
    const toSnap = snapOf([DOC_B, DOC_C, DOC_D]);
    const fromPath = join(scratchDir, 'cli-inc-from.json');
    const toPath = join(scratchDir, 'cli-inc-to.json');
    writeFileSync(fromPath, JSON.stringify({ runId: '01INCFROMRUN00000000000000', corpus: fromSnap }));
    writeFileSync(toPath, JSON.stringify({ runId: '01INCTORUN0000000000000000', corpus: toSnap }));
    const outcome = runSnapshotVerify({ runPaths: [], increment: [fromPath, toPath] });
    assert.equal(outcome.mode, 'increment');
    assert.equal(outcome.exitCode, 0);
    const inc = outcome.increment;
    assert.ok(inc !== null, 'increment mode carries the increment report');
    assert.deepEqual(inc.addedIds, [DOC_D.documentId]);
    assert.deepEqual(inc.retiredIds, [DOC_A.documentId]);
    assert.ok(inc.comparabilityStatement.startsWith('shared base of 2 documents'));
  });

  it('human render names each run, its verdict, and each mismatch line', () => {
    const outcome = runSnapshotVerify({ runPaths: [okRunPath, badRunPath] });
    const text = renderSnapshotVerifyHuman(outcome);
    assert.ok(text.includes(okRunPath));
    assert.ok(text.includes(badRunPath));
    assert.ok(text.includes('OK'));
    assert.ok(text.includes('SNAPSHOT_ID_MISMATCH'), text);
    // deterministic render: same outcome → same text
    assert.equal(text, renderSnapshotVerifyHuman(outcome));
  });
});
