/**
 * snapshot_store tests — the corpus-freezer trust chain (b8 backlog #4).
 *
 * The store's ONE job is: what you freeze is EXACTLY what you later reuse, or
 * the load rejects. Every tamper family below must fail verification at load
 * time (fail-closed), and the happy path must roundtrip bit-for-bit on the
 * covered fields. Envelope fields (retrievedAt/retrievalQuery/rawHash) are
 * outside the content projection by design (see module header) — asserted as
 * the documented boundary, not silently ignored.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, after } from 'node:test';
import { createCorpusSnapshot, type CorpusSnapshot } from '../../src/retrieval/corpus.ts';
import { computeDocumentId, normalizedDocumentHash } from '../../src/retrieval/hash.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';
import {
  listCorpusSnapshotStore,
  loadCorpusSnapshotStore,
  saveCorpusSnapshotStore,
  verifyCorpusSnapshot,
} from '../../src/retrieval/snapshot_store.ts';

/** Build a well-formed retrieved document (ids/hashes internally consistent). */
function doc(n: number, title: string): RetrievedDocument {
  const pid = `W${1000 + n}`;
  const fields = {
    sourceType: 'openalex' as const,
    persistentIdentifier: pid,
    doi: `10.1000/fake.${n}`,
    title,
    authors: [`Author ${n}`],
    publicationDate: `2020-0${(n % 9) + 1}-15`,
    abstract: `Abstract for ${title}`,
    canonicalUrl: `https://openalex.org/${pid}`,
    licenseMetadata: 'cc-by',
  };
  return {
    ...fields,
    documentId: computeDocumentId('openalex', pid),
    normalizedHash: normalizedDocumentHash(fields),
    sourceName: 'OpenAlex',
    retrievedAt: '2026-08-16T00:00:00.000Z',
    retrievalQuery: 'test query',
    retrievalMethod: 'openalex-rest',
    parserVersion: 'retrieval-parser-test',
    rawHash: `raw-${pid}`,
  } as RetrievedDocument;
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'far-snapshot-store-'));
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

describe('snapshot_store — verify (pure trust chain)', () => {
  it('accepts a createCorpusSnapshot-built snapshot (SSOT consistency)', () => {
    const snap = createCorpusSnapshot([doc(1, 'Dark energy constraints'), doc(2, 'Hot Jupiter radii')], ['q1']);
    assert.deepEqual(verifyCorpusSnapshot(snap), { ok: true });
  });

  it('rejects a tampered title (content chain: title → normalizedHash → rootHash)', () => {
    const snap = createCorpusSnapshot([doc(1, 'Original title')], ['q']);
    const tampered: CorpusSnapshot = {
      ...snap,
      documents: [{ ...snap.documents[0]!, title: 'TAMPERED TITLE' }],
    };
    const verdict = verifyCorpusSnapshot(tampered);
    assert.equal(verdict.ok, false, 'tampered title must fail');
    assert.match(!verdict.ok ? verdict.reason : '', /normalizedHash/);
  });

  it('rejects a swapped documentId (identity: sha256(source|pid))', () => {
    const snap = createCorpusSnapshot([doc(1, 'A'), doc(2, 'B')], ['q']);
    const docs = [...snap.documents];
    const a = { ...docs[0]!, documentId: docs[1]!.documentId };
    const tampered: CorpusSnapshot = { ...snap, documents: [a, docs[1]!] };
    assert.equal(verifyCorpusSnapshot(tampered).ok, false);
  });

  it('rejects a forged normalizedHash that does not match the content projection', () => {
    const snap = createCorpusSnapshot([doc(1, 'A')], ['q']);
    const tampered: CorpusSnapshot = {
      ...snap,
      documents: [{ ...snap.documents[0]!, normalizedHash: 'f'.repeat(64) }],
    };
    assert.equal(verifyCorpusSnapshot(tampered).ok, false);
  });

  it('rejects documentCount drift (declaration vs reality)', () => {
    const snap = createCorpusSnapshot([doc(1, 'A'), doc(2, 'B')], ['q']);
    const tampered: CorpusSnapshot = { ...snap, documentCount: 3 };
    const verdict = verifyCorpusSnapshot(tampered);
    assert.equal(verdict.ok, false);
    assert.match(!verdict.ok ? verdict.reason : '', /documentCount/);
  });

  it('rejects a duplicate documentId (frozen set must be deduped)', () => {
    const snap = createCorpusSnapshot([doc(1, 'A')], ['q']);
    const tampered: CorpusSnapshot = {
      ...snap,
      documentCount: 2, // keep the count honest so the DEDUP invariant is what fires
      documents: [snap.documents[0]!, { ...snap.documents[0]! }],
    };
    const verdict = verifyCorpusSnapshot(tampered);
    assert.equal(verdict.ok, false);
    assert.match(!verdict.ok ? verdict.reason : '', /duplicate/);
  });

  it('rejects a forged snapshotId / rootHash over an otherwise-valid doc set', () => {
    const snap = createCorpusSnapshot([doc(1, 'A')], ['q']);
    assert.equal(verifyCorpusSnapshot({ ...snap, snapshotId: 'a'.repeat(64) }).ok, false);
    assert.equal(verifyCorpusSnapshot({ ...snap, rootHash: 'b'.repeat(64) }).ok, false);
  });
});

describe('snapshot_store — save/load roundtrip', () => {
  it('roundtrips a frozen snapshot bit-for-bit on all covered fields', () => {
    const dir = join(tmpRoot, 'rt');
    const snap = createCorpusSnapshot(
      [doc(1, 'Dark energy'), doc(2, 'WIMPs'), doc(3, 'Hot Jupiters')],
      ['q1', 'counter:q1'],
      '2026-08-16T12:00:00.000Z',
    );
    const saved = saveCorpusSnapshotStore(snap, dir);
    assert.equal(saved.alreadyExisted, false);
    const { snapshot: loaded } = loadCorpusSnapshotStore(snap.snapshotId, dir);
    assert.equal(loaded.snapshotId, snap.snapshotId);
    assert.equal(loaded.rootHash, snap.rootHash);
    assert.equal(loaded.documentCount, snap.documentCount);
    assert.equal(loaded.createdAt, snap.createdAt);
    assert.deepEqual(loaded.sourceQueries, snap.sourceQueries);
    assert.deepEqual(loaded.documents, snap.documents);
  });

  it('save is idempotent (content-addressed path; second save is a no-op)', () => {
    const dir = join(tmpRoot, 'idem');
    const snap = createCorpusSnapshot([doc(5, 'Idem')], ['q']);
    const first = saveCorpusSnapshotStore(snap, dir);
    const second = saveCorpusSnapshotStore(snap, dir);
    assert.equal(second.alreadyExisted, true);
    assert.equal(second.file, first.file);
  });

  it('load FAILS CLOSED on a disk-tampered file (title edited after freeze)', () => {
    const dir = join(tmpRoot, 'tamper');
    const snap = createCorpusSnapshot([doc(9, 'Frozen title')], ['q']);
    saveCorpusSnapshotStore(snap, dir);
    const file = join(dir, `${snap.snapshotId}.json`);
    // JSON is inherently mutable — cast through the parsed shape to edit.
    const body = JSON.parse(readFileSync(file, 'utf8')) as { documents: Array<Record<string, unknown>> };
    body.documents[0]!.title = 'tampered after freeze';
    writeFileSync(file, JSON.stringify(body, null, 2), 'utf8');
    assert.throws(() => loadCorpusSnapshotStore(snap.snapshotId, dir), /FAILED integrity verification/);
  });

  it('load rejects a missing snapshot with the available-inventory hint', () => {
    const dir = join(tmpRoot, 'missing');
    saveCorpusSnapshotStore(createCorpusSnapshot([doc(3, 'Present')], ['q']), dir);
    assert.throws(
      () => loadCorpusSnapshotStore('c'.repeat(64), dir),
      /no snapshot cccccccccccc… .*available:/,
    );
  });

  it('load rejects a malformed id shape before touching the disk', () => {
    assert.throws(() => loadCorpusSnapshotStore('not-hex', join(tmpRoot, 'shape')), /64-char lowercase hex/);
  });

  it('load rejects invalid JSON with the parse error preserved (cause discipline)', () => {
    const dir = join(tmpRoot, 'badjson');
    const id = 'd'.repeat(64);
    saveCorpusSnapshotStore(createCorpusSnapshot([doc(4, 'x')], ['q']), dir).file;
    writeFileSync(join(dir, `${id}.json`), '{not json', 'utf8');
    assert.throws(() => loadCorpusSnapshotStore(id, dir), /not valid JSON/);
  });

  it('list inventories frozen snapshots newest-first and survives a corrupt file', () => {
    const dir = join(tmpRoot, 'list');
    saveCorpusSnapshotStore(
      createCorpusSnapshot([doc(1, 'older')], ['q'], '2026-08-01T00:00:00.000Z'), dir,
    );
    saveCorpusSnapshotStore(
      createCorpusSnapshot([doc(2, 'newer')], ['q'], '2026-08-16T00:00:00.000Z'), dir,
    );
    writeFileSync(join(dir, `${'e'.repeat(64)}.json`), 'garbage', 'utf8');
    const entries = listCorpusSnapshotStore(dir);
    assert.equal(entries.length, 2, 'corrupt file must not crash listing');
    assert.equal(entries[0]!.createdAt >= entries[1]!.createdAt, true, 'newest first');
    assert.ok(entries.every((e) => /^[0-9a-f]{64}$/.test(e.snapshotId)));
  });

  it('documented boundary: envelope fields (retrievedAt) are NOT content-covered', () => {
    const snap = createCorpusSnapshot([doc(7, 'Envelope test')], ['q']);
    const edited: CorpusSnapshot = {
      ...snap,
      documents: [{ ...snap.documents[0]!, retrievedAt: '1999-01-01T00:00:00.000Z' }],
    };
    assert.deepEqual(verifyCorpusSnapshot(edited), { ok: true });
    // This is the corpus.ts design boundary (fetch metadata ≠ content); the
    // store inherits it. snapshot_integrity.ts comparability checks cover it.
  });
});
