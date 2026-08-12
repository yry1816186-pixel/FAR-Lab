/**
 * tests/retrieval/corpus_citation.test.ts — CorpusSnapshot + CitationResolver.
 *
 * The thesis-critical foundation (K1 Phase 3): proves citations are unfabricatable
 * (a cited documentId must resolve in the corpus) and the corpus is immutable +
 * tamper-evident (any content change alters rootHash). Tests build documents from
 * the recorded real OpenAlex fixture (real provenance) + a synthetic document for
 * tamper/determinism edge cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseOpenAlexResults,
  createCorpusSnapshot,
  corpusContains,
  corpusGet,
  CitationResolver,
  citationValidationVerdictHint,
  computeDocumentId,
  normalizedDocumentHash,
  type RetrievedDocument,
} from '../../src/retrieval/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BODY = readFileSync(join(__dirname, '..', 'fixtures', 'retrieval', 'openalex_osc_query.json'), 'utf8');
const REAL_DOCS = parseOpenAlexResults(FIXTURE_BODY, 'estimating reproducibility psychological science', '2026-08-12T00:00:00.000Z', 3);

/** Build a synthetic document whose normalizedHash is computed by the REAL
 *  normalizedDocumentHash (so content changes — incl. abstract — propagate to
 *  the hash, mirroring production tamper-detection). */
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

// ---------------------------------------------------------------------------
// CorpusSnapshot
// ---------------------------------------------------------------------------

describe('CorpusSnapshot — immutability + content-addressing', () => {
  it('creates a snapshot with deterministic snapshotId + rootHash', () => {
    const a = createCorpusSnapshot(REAL_DOCS, ['q1'], '2026-08-12T00:00:00.000Z');
    const b = createCorpusSnapshot(REAL_DOCS, ['q1'], '2099-12-31T00:00:00.000Z');
    // createdAt differs but is NOT part of the hashes → same snapshotId + rootHash.
    assert.equal(a.snapshotId, b.snapshotId, 'snapshotId is content-addressed, not time-addressed');
    assert.equal(a.rootHash, b.rootHash);
    assert.equal(a.documentCount, REAL_DOCS.length);
  });

  it('snapshotId is order-independent (the SET identity is stable)', () => {
    const reversed = [...REAL_DOCS].reverse();
    const a = createCorpusSnapshot(REAL_DOCS, ['q']);
    const b = createCorpusSnapshot(reversed, ['q']);
    assert.equal(a.snapshotId, b.snapshotId, 'same set, different input order → same snapshotId');
    assert.equal(a.rootHash, b.rootHash, 'same set, different order → same rootHash (internal sort)');
  });

  it('deduplicates documents by documentId', () => {
    const doubled = [...REAL_DOCS, ...REAL_DOCS];
    const snap = createCorpusSnapshot(doubled, ['q']);
    assert.equal(snap.documentCount, REAL_DOCS.length, 'duplicates collapsed');
  });

  it('rootHash is TAMPER-EVIDENT — changing any document content changes rootHash', () => {
    const docs = [synthDoc('aaa', 'Title A', 'abstract A'), synthDoc('bbb', 'Title B', 'abstract B')];
    const original = createCorpusSnapshot(docs, ['q']);
    const tampered = createCorpusSnapshot(
      [synthDoc('aaa', 'Title A', 'abstract A TAMPERED'), synthDoc('bbb', 'Title B', 'abstract B')],
      ['q'],
    );
    // Same set of ids → same snapshotId. But content changed → different rootHash.
    assert.equal(original.snapshotId, tampered.snapshotId, 'ids unchanged → snapshotId stable');
    assert.notEqual(original.rootHash, tampered.rootHash, 'content changed → rootHash MUST differ (tamper detected)');
  });

  it('a different document SET yields a different snapshotId', () => {
    const s1 = createCorpusSnapshot([synthDoc('aaa', 'T', 'a')], ['q']);
    const s2 = createCorpusSnapshot([synthDoc('bbb', 'T', 'a')], ['q']);
    assert.notEqual(s1.snapshotId, s2.snapshotId);
  });

  it('corpusContains / corpusGet look up by documentId', () => {
    const snap = createCorpusSnapshot(REAL_DOCS, ['q']);
    const first = REAL_DOCS[0];
    if (!first) assert.fail('fixture needs a doc');
    assert.ok(corpusContains(snap, first.documentId));
    assert.equal(corpusContains(snap, 'nonexistent-id'), false);
    assert.equal(corpusGet(snap, first.documentId)?.documentId, first.documentId);
    assert.equal(corpusGet(snap, 'nonexistent-id'), null);
  });
});

// ---------------------------------------------------------------------------
// CitationResolver — the unfabricatable-citations check
// ---------------------------------------------------------------------------

describe('CitationResolver — deterministic citation binding', () => {
  const snapshot = createCorpusSnapshot(REAL_DOCS, ['q']);
  const resolver = new CitationResolver(snapshot);
  const first = REAL_DOCS[0];
  const second = REAL_DOCS[1];
  if (!first || !second) throw new Error('fixture needs >=2 docs');

  it('resolves a bound documentId to its real document', () => {
    const doc = resolver.resolve(first.documentId);
    assert.ok(doc);
    assert.equal(doc!.documentId, first.documentId);
    assert.equal(doc!.doi, first.doi);
  });

  it('returns null for a documentId not in the corpus', () => {
    assert.equal(resolver.resolve('fabricated-id-not-in-corpus'), null);
  });

  it('validate marks corpus citations BOUND and invented citations UNBOUND', () => {
    const validation = resolver.validate([
      first.documentId,            // bound
      'invented-by-llm-001',       // unbound
      second.documentId,           // bound
      'invented-by-llm-002',       // unbound
    ]);
    assert.equal(validation.bound.length, 2);
    assert.equal(validation.unbound.length, 2);
    assert.equal(validation.unbound[0], 'invented-by-llm-001');
    assert.equal(validation.allBound, false);
    assert.equal(validation.snapshotId, snapshot.snapshotId);
  });

  it('validate is deterministic + de-duplicates repeated cited ids', () => {
    const v1 = resolver.validate([first.documentId, first.documentId, second.documentId]);
    assert.equal(v1.bound.length, 2, 'duplicate cited id counted once');
    const v2 = resolver.validate([first.documentId, first.documentId, second.documentId]);
    assert.deepEqual(v1, v2, 'deterministic');
  });

  it('a fully-bound citation set reports allBound=true', () => {
    const validation = resolver.validate([first.documentId, second.documentId]);
    assert.ok(validation.allBound);
    assert.equal(validation.unbound.length, 0);
  });

  it('verdict hint: unbound citations force INCONCLUSIVE (NOT REFUTED — not-in-corpus != fabricated)', () => {
    const unboundValidation = resolver.validate([first.documentId, 'invented-xyz']);
    const hint = citationValidationVerdictHint(unboundValidation);
    assert.equal(hint.forcedMinimumVerdict, 'INCONCLUSIVE');
    assert.equal(hint.reasonCode, 'CITATION_UNBOUND');

    const boundValidation = resolver.validate([first.documentId, second.documentId]);
    const noHint = citationValidationVerdictHint(boundValidation);
    assert.equal(noHint.forcedMinimumVerdict, 'NONE');
    assert.equal(noHint.reasonCode, null);
  });

  it('documentId is the trust anchor — an LLM must cite a real (source, pid) to resolve', () => {
    // documentId = hash(source, persistentIdentifier) — stable paper identity.
    // To cite a paper that resolves, the LLM must reference a real corpus paper's
    // (source, pid); an invented id or a non-corpus paper does not resolve.
    const correctId = computeDocumentId(first.sourceType, first.persistentIdentifier);
    assert.equal(correctId, first.documentId);
    // Any other id (mutated last char) does not resolve.
    const mutated = correctId.replace(/.$/, correctId.endsWith('0') ? '1' : '0');
    assert.equal(resolver.resolve(mutated), null);
  });
});
