/**
 * retrieval/corpus — immutable, content-addressed CorpusSnapshot (K1 Phase 3).
 *
 * A CorpusSnapshot freezes the SET of retrieved documents that grounded a
 * hypothesis at the moment it was generated. This is the reproducibility anchor
 * for citation binding (directive §11): a hypothesis H1 produced against
 * Corpus-V1 cites documents by documentId; a third party (or a later Corpus-V2
 * run) can ask "exactly which evidence set did H1 see?" and get a deterministic,
 * tamper-evident answer — the snapshotId + rootHash + the document list.
 *
 * Two distinct hashes (different purposes):
 *   - snapshotId: identity of the SET (sorted documentIds). Stable across
 *     refetches of the same documents — "which corpus is this?"
 *   - rootHash: identity of the CONTENT (sorted [id, normalizedHash] pairs).
 *     Tamper-evident — any change to any document's content changes rootHash.
 *
 * Immutability: CorpusSnapshot.documents is readonly. Once created, a snapshot
 * is never mutated; a changed corpus = a NEW snapshot (different snapshotId /
 * rootHash). This is what lets old results know what they saw (§11).
 *
 * V1 hashing: aggregate canonical-JSON hash over the sorted set. Per-leaf
 * merkle inclusion proofs are a future enhancement (the aggregate hash already
 * makes any tamper detectable at the whole-corpus level).
 */
import { canonicalJson } from '../evidence_log/hasher.ts';
import { rawSha256Hex } from './hash.ts';
import type { RetrievedDocument } from './types.ts';

/** An immutable, content-addressed snapshot of a retrieved-document set. */
export interface CorpusSnapshot {
  /** sha256 of the sorted documentIds — the SET identity (stable across refetch). */
  readonly snapshotId: string;
  /** sha256 of canonical-JSON [{id, normalizedHash}] sorted — tamper-evident CONTENT identity. */
  readonly rootHash: string;
  /** Number of documents in the corpus. */
  readonly documentCount: number;
  /** ISO timestamp the snapshot was created. */
  readonly createdAt: string;
  /** The retrieval queries that produced this corpus (provenance of the set itself). */
  readonly sourceQueries: readonly string[];
  /** The frozen document set. Readonly — never mutated after creation. */
  readonly documents: readonly RetrievedDocument[];
}

/**
 * Build an immutable CorpusSnapshot from a retrieved-document set.
 *
 * Deduplicates by documentId (a document retrieved via two queries appears
 * once). Deterministic: same documents (by id + content) → same snapshotId +
 * rootHash, regardless of input order or duplicate count. createdAt is the only
 * non-deterministic field (and it is NOT part of either hash — snapshots are
 * content-addressed, not time-addressed).
 */
export function createCorpusSnapshot(
  documents: readonly RetrievedDocument[],
  sourceQueries: readonly string[],
  createdAt: string = new Date().toISOString(),
): CorpusSnapshot {
  // Deduplicate by documentId, preserving first occurrence order.
  const seen = new Set<string>();
  const unique: RetrievedDocument[] = [];
  for (const d of documents) {
    if (!seen.has(d.documentId)) {
      seen.add(d.documentId);
      unique.push(d);
    }
  }
  // Deterministic ordering for both hashes (sort by documentId).
  const sorted = [...unique].sort((a, b) => compareHex(a.documentId, b.documentId));

  // snapshotId: identity of the SET (sorted documentIds only).
  const snapshotId = rawSha256Hex(sorted.map((d) => d.documentId).join('\n'));
  // rootHash: identity of the CONTENT (sorted [id, normalizedHash] pairs).
  const rootHash = rawSha256Hex(
    canonicalJson(sorted.map((d) => ({ id: d.documentId, h: d.normalizedHash }))),
  );

  return {
    snapshotId,
    rootHash,
    documentCount: sorted.length,
    createdAt,
    sourceQueries: [...sourceQueries],
    documents: sorted,
  };
}

/** Does the snapshot contain a document with this documentId? */
export function corpusContains(snapshot: CorpusSnapshot, documentId: string): boolean {
  return snapshot.documents.some((d) => d.documentId === documentId);
}

/** Look up a document by documentId within the snapshot (null if absent). */
export function corpusGet(snapshot: CorpusSnapshot, documentId: string): RetrievedDocument | null {
  return snapshot.documents.find((d) => d.documentId === documentId) ?? null;
}

/** Deterministic comparison of hex strings (for stable sort order). */
function compareHex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
