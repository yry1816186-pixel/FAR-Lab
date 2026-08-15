/**
 * retrieval/snapshot_integrity — persisted-corpus integrity + increment protocol
 * (2.md §10 后 R10 clause, T1: 战役间增量更新显式协议).
 *
 * Two capabilities, both deterministic (no clocks, no randomness, no
 * locale-dependent ordering):
 *
 * 1. verifyCorpusSnapshot — tamper-detect a PERSISTED CorpusSnapshot by
 *    recomputing its two content-addressed hashes from the stored documents
 *    and comparing against the stored values. Layered detection:
 *      - SNAPSHOT_ID_MISMATCH   stored snapshotId ≠ sha256(sorted documentIds)
 *      - ROOT_HASH_MISMATCH     stored rootHash ≠ sha256(canonical-JSON of
 *                               sorted [{id, h: normalizedHash}])
 *      - DOCUMENT_COUNT_MISMATCH stored documentCount ≠ documents.length
 *      - DUPLICATE_DOCUMENT_ID  a well-formed snapshot never carries one
 *                               (createCorpusSnapshot dedupes) — presence = corruption
 *      - DOCUMENT_CONTENT_MISMATCH per-document: the stored normalizedHash
 *                               disagrees with normalizedDocumentHash() recomputed
 *                               from that document's own fields. This is the layer
 *                               the aggregate rootHash is BLIND to: rootHash covers
 *                               the stored hash fields, so a field edit with a stale
 *                               hash leaves rootHash intact. Conversely a coherent
 *                               re-mint (field + hash both rewritten) passes the
 *                               per-document layer but trips ROOT_HASH_MISMATCH.
 *                               The two layers are complementary by construction.
 *
 * 2. snapshotIncrement — pure set arithmetic between two snapshots
 *    (addedIds / retiredIds / unchangedCount) plus a deterministic
 *    cross-campaign comparability statement, so metric deltas between runs are
 *    always read against an explicit corpus delta (never silently like-for-like).
 *
 * Hash recomputation is a LOCAL MIRROR of corpus.ts createCorpusSnapshot
 * (snapshotId = rawSha256Hex(sorted documentIds joined '\n');
 *  rootHash = rawSha256Hex(canonicalJson(sorted [{id, h}]))  — field name is `h`).
 * corpus.ts is read-only for this module's authors; the round-trip test pins the
 * equivalence: a fresh createCorpusSnapshot snapshot must verify ok, which holds
 * only while the mirror stays byte-faithful to the original computation.
 *
 * CANNOT-PROVE BOUNDARY (what this module does NOT establish):
 *   - Recomputation proves INTERNAL CONSISTENCY of the persisted snapshot
 *     (stored hashes match stored documents). It cannot prove the snapshot
 *     faithfully reflects what the source API returned at fetch time — that
 *     anchor is retrieval-time provenance (rawHash / cache envelopes / registry
 *     anchors), not post-hoc recomputation.
 *   - A coherent rewrite (documents + snapshotId + rootHash + documentCount all
 *     re-minted consistently) verifies ok; detecting it requires EXTERNAL
 *     anchoring (git history, registry anchor ledger) — out of scope here.
 *   - It says nothing about whether documents are factually correct, nor about
 *     un-bound documents outside the snapshot.
 */
import { readFileSync } from 'node:fs';

import { canonicalJson } from '../evidence_log/hasher.ts';
import { CorpusSnapshotZod } from '../research/schemas.ts';
import { normalizedDocumentHash, rawSha256Hex } from './hash.ts';
import type { CorpusSnapshot } from './corpus.ts';
import type { RetrievedDocument } from './types.ts';

// ---------------------------------------------------------------------------
// Hash recomputation (local mirror of corpus.ts — see module doc)
// ---------------------------------------------------------------------------

/** Deterministic documentId comparator (UTF-16 code-unit order, mirrors corpus.ts compareHex). */
function compareByDocumentId(a: RetrievedDocument, b: RetrievedDocument): number {
  return a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0;
}

/** Deterministic plain-string comparator (code-unit order; safe for hex ids). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Recompute snapshotId: sha256 of the sorted documentIds joined with '\n'. */
export function computeSnapshotIdFromDocuments(documents: readonly RetrievedDocument[]): string {
  const sorted = [...documents].sort(compareByDocumentId);
  return rawSha256Hex(sorted.map((d) => d.documentId).join('\n'));
}

/** Recompute rootHash: sha256 of canonical-JSON [{id, h: normalizedHash}] sorted by id. */
export function computeRootHashFromDocuments(documents: readonly RetrievedDocument[]): string {
  const sorted = [...documents].sort(compareByDocumentId);
  return rawSha256Hex(
    canonicalJson(sorted.map((d) => ({ id: d.documentId, h: d.normalizedHash }))),
  );
}

// ---------------------------------------------------------------------------
// verifyCorpusSnapshot
// ---------------------------------------------------------------------------

/** Result of recomputing-and-comparing a persisted snapshot's integrity anchors. */
export interface SnapshotVerification {
  /** true iff every stored anchor matches its recomputation (mismatches empty). */
  readonly ok: boolean;
  readonly recomputedSnapshotId: string;
  readonly recomputedRootHash: string;
  /** Typed mismatch strings, deterministic order (see module doc for the taxonomy). */
  readonly mismatches: readonly string[];
}

/**
 * Verify a persisted CorpusSnapshot has not drifted: recompute snapshotId /
 * rootHash from `snapshot.documents` and compare against the stored values,
 * plus documentCount, duplicate-id, and per-document content-hash checks.
 * Pure — no file IO, no clock, deterministic output ordering.
 */
export function verifyCorpusSnapshot(snapshot: CorpusSnapshot): SnapshotVerification {
  const sorted = [...snapshot.documents].sort(compareByDocumentId);
  const recomputedSnapshotId = computeSnapshotIdFromDocuments(snapshot.documents);
  const recomputedRootHash = computeRootHashFromDocuments(snapshot.documents);
  const mismatches: string[] = [];

  if (recomputedSnapshotId !== snapshot.snapshotId) {
    mismatches.push(`SNAPSHOT_ID_MISMATCH: stored=${snapshot.snapshotId} recomputed=${recomputedSnapshotId}`);
  }
  if (recomputedRootHash !== snapshot.rootHash) {
    mismatches.push(`ROOT_HASH_MISMATCH: stored=${snapshot.rootHash} recomputed=${recomputedRootHash}`);
  }
  if (snapshot.documents.length !== snapshot.documentCount) {
    mismatches.push(`DOCUMENT_COUNT_MISMATCH: stored=${snapshot.documentCount} actual=${snapshot.documents.length}`);
  }

  // Duplicate ids: sorted order makes a single prev-scan sufficient (O(n), stable).
  let previousId: string | undefined;
  for (const d of sorted) {
    if (d.documentId === previousId) {
      mismatches.push(`DUPLICATE_DOCUMENT_ID: ${d.documentId}`);
    }
    previousId = d.documentId;
  }

  // Per-document content drift: stored normalizedHash vs recomputed from the
  // document's own (non-volatile) fields. Catches field edits with stale hashes,
  // which the aggregate rootHash cannot see.
  for (const d of sorted) {
    const recomputed = normalizedDocumentHash({
      sourceType: d.sourceType,
      persistentIdentifier: d.persistentIdentifier,
      doi: d.doi,
      title: d.title,
      authors: [...d.authors],
      publicationDate: d.publicationDate,
      abstract: d.abstract,
      canonicalUrl: d.canonicalUrl,
      licenseMetadata: d.licenseMetadata,
    });
    if (recomputed !== d.normalizedHash) {
      mismatches.push(`DOCUMENT_CONTENT_MISMATCH: documentId=${d.documentId} stored=${d.normalizedHash} recomputed=${recomputed}`);
    }
  }

  return { ok: mismatches.length === 0, recomputedSnapshotId, recomputedRootHash, mismatches };
}

// ---------------------------------------------------------------------------
// snapshotIncrement
// ---------------------------------------------------------------------------

/** Snapshot-to-snapshot delta + cross-campaign comparability statement. */
export interface SnapshotIncrement {
  /** documentIds present in `to` but not in `from` (sorted, stable). */
  readonly addedIds: readonly string[];
  /** documentIds present in `from` but not in `to` (sorted, stable). */
  readonly retiredIds: readonly string[];
  /** |from ∩ to| by documentId. */
  readonly unchangedCount: number;
  /** Stored rootHash equality (content identity, not just set identity). */
  readonly sameRootHash: boolean;
  /** Deterministic branch: direct comparability / shared-base delta / not like-for-like. */
  readonly comparabilityStatement: string;
}

/**
 * Pure set arithmetic between two snapshots for the 战役间增量更新显式协议:
 * exactly which documents entered and left the evidence base, and an explicit
 * statement of whether cross-run metric comparison is like-for-like.
 *
 * Branch policy (deterministic, evaluated in this order):
 *   - sameRootHash                          → "identical evidence base — …"
 *   - overlap ≥ 50% of the larger id set    → "shared base of N documents; …"
 *   - overlap < 50% of the larger id set    → "substantially different evidence bases — …"
 *
 * Note: sameRootHash is taken from the STORED hash fields; whether those stored
 * fields are themselves trustworthy is verifyCorpusSnapshot's job (separation
 * of concerns — increment reports set deltas, verification reports drift).
 */
export function snapshotIncrement(from: CorpusSnapshot, to: CorpusSnapshot): SnapshotIncrement {
  const fromIds = new Set(from.documents.map((d) => d.documentId));
  const toIds = new Set(to.documents.map((d) => d.documentId));

  const addedIds = [...toIds].filter((id) => !fromIds.has(id)).sort(compareStrings);
  const retiredIds = [...fromIds].filter((id) => !toIds.has(id)).sort(compareStrings);
  let unchangedCount = 0;
  for (const id of fromIds) {
    if (toIds.has(id)) unchangedCount += 1;
  }

  const sameRootHash = from.rootHash === to.rootHash;
  const largerSet = Math.max(fromIds.size, toIds.size);
  const overlapAtLeastHalf = largerSet === 0 || unchangedCount >= largerSet / 2;

  let comparabilityStatement: string;
  if (sameRootHash) {
    comparabilityStatement = 'identical evidence base — metrics directly comparable';
  } else if (overlapAtLeastHalf) {
    comparabilityStatement = `shared base of ${unchangedCount} documents; cross-run comparisons must note the corpus delta (added ${addedIds.length}, retired ${retiredIds.length})`;
  } else {
    comparabilityStatement = 'substantially different evidence bases — cross-run metric comparison is NOT like-for-like';
  }

  return { addedIds, retiredIds, unchangedCount, sameRootHash, comparabilityStatement };
}

// ---------------------------------------------------------------------------
// Run-file helpers (fail-closed, typed errors, cause-attached)
// ---------------------------------------------------------------------------

/** Typed failure codes for loading a persisted research run's corpus. */
export type RunCorpusReadErrorCode =
  | 'RUN_FILE_UNREADABLE'
  | 'RUN_JSON_INVALID'
  | 'RUN_CORPUS_MISSING'
  | 'RUN_CORPUS_MALFORMED';

/** Fail-closed typed error carrying the original failure as `cause`. */
export class RunCorpusReadError extends Error {
  readonly code: RunCorpusReadErrorCode;
  constructor(code: RunCorpusReadErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'RunCorpusReadError';
    this.code = code;
  }
}

/** A loaded run envelope: just enough for corpus verification (runId + corpus). */
export interface LoadedRunCorpus {
  readonly runId: string;
  readonly corpus: CorpusSnapshot;
}

/**
 * Read a research-run JSON file and extract its corpus snapshot.
 * Structural failures throw typed RunCorpusReadError (fail-closed, cause
 * attached); corpus shape is validated by the canonical zod SSOT
 * (research/schemas.ts CorpusSnapshotZod — same boundary validation the
 * research CLI/API use, including additive-field tolerance for old runs).
 * Semantic drift (tampered hashes) is NOT thrown here — it is reported by
 * verifyRunCorpusSnapshot as mismatches, so a readable-but-tampered file still
 * yields a diagnostic verification result instead of an exception.
 */
export function readRunCorpus(runJsonPath: string): LoadedRunCorpus {
  let raw: string;
  try {
    raw = readFileSync(runJsonPath, 'utf8');
  } catch (error) {
    throw new RunCorpusReadError(
      'RUN_FILE_UNREADABLE',
      `cannot read run file ${runJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new RunCorpusReadError(
      'RUN_JSON_INVALID',
      `run file ${runJsonPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RunCorpusReadError('RUN_JSON_INVALID', `run file ${runJsonPath} is not a JSON object`, {
      cause: undefined,
    });
  }
  const record = parsed as Record<string, unknown>;

  if (record['corpus'] === undefined) {
    throw new RunCorpusReadError('RUN_CORPUS_MISSING', `run file ${runJsonPath} has no .corpus field`);
  }
  if (typeof record['runId'] !== 'string' || record['runId'] === '') {
    throw new RunCorpusReadError('RUN_CORPUS_MALFORMED', `run file ${runJsonPath} lacks a non-empty string runId`);
  }

  const corpus = CorpusSnapshotZod.safeParse(record['corpus']);
  if (!corpus.success) {
    const first = corpus.error.issues[0];
    const where = first === undefined ? 'unknown location' : `${first.path.join('.') || '<root>'}: ${first.message}`;
    throw new RunCorpusReadError(
      'RUN_CORPUS_MALFORMED',
      `run file ${runJsonPath} .corpus fails schema validation at ${where}`,
      { cause: corpus.error },
    );
  }

  return { runId: record['runId'], corpus: corpus.data };
}

/** Verification of one persisted run's corpus, keyed by runId. */
export interface RunCorpusVerification {
  readonly runId: string;
  readonly verification: SnapshotVerification;
}

/** Read + verify a research run's persisted corpus snapshot in one step. */
export function verifyRunCorpusSnapshot(runJsonPath: string): RunCorpusVerification {
  const { runId, corpus } = readRunCorpus(runJsonPath);
  return { runId, verification: verifyCorpusSnapshot(corpus) };
}
