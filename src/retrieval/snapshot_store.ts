/**
 * retrieval/snapshot_store — persistent, content-addressed corpus-snapshot
 * freezer (b8 backlog #4: "快照冻结机制 — 同 snapshot 复用").
 *
 * WHY: a corpus snapshot is the reproducibility anchor of a run (corpus.ts),
 * but it lived only inside run state — every new run re-grounded, and live
 * retrieval drifts (fanout queries differ, caches expire, sources update).
 * The store persists successful LIVE corpora under `.far/snapshots/` keyed by
 * snapshotId, so a later run can pin the EXACT evidence set (N≥5 homogeneity,
 * A/B orchestration ablations, day-over-day comparability) via
 * `far research start --reuse-snapshot <id>` (explicit opt-in, R9).
 *
 * Integrity: load VERIFY-or-throw. The whole trust chain is recomputed from
 * the stored JSON fields — per-document documentId (sha256 of source|pid) and
 * normalizedHash (canonical-JSON content projection), then the corpus
 * snapshotId (sorted ids) and rootHash (sorted [id, h]). Any tamper with any
 * covered field breaks the chain and the load rejects. Cannot prove: envelope
 * fields outside the content projection (retrievedAt / retrievalQuery /
 * rawHash / retrievedFrom) are NOT hash-covered by design (fetch-metadata is
 * not content, corpus.ts boundary) — a tampered envelope is out of scope here
 * and stays visible through snapshot_integrity.ts comparability checks.
 *
 * Storage layout: one JSON file per snapshot at `<dir>/<snapshotId>.json`,
 * content-addressed → identical corpora dedupe to the same path (idempotent
 * save, no growth from repeated identical grounds).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../evidence_log/hasher.ts';
import type { CorpusSnapshot } from './corpus.ts';
import { computeDocumentId, normalizedDocumentHash, rawSha256Hex } from './hash.ts';
import type { RetrievedDocument } from './types.ts';

/** Default on-disk location (gitignored runtime artifact area, hygiene policy). */
export const DEFAULT_SNAPSHOT_DIR = '.far/snapshots';

/**
 * Resolve the store dir: `FAR_SNAPSHOT_STORE_DIR` when set, else the default.
 * Call-time env read (tests point processes at their own store; mirrors the
 * run-store convention).
 */
export function resolveSnapshotStoreDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.FAR_SNAPSHOT_STORE_DIR;
  return override !== undefined && override !== '' ? override : DEFAULT_SNAPSHOT_DIR;
}

/** Integrity verdict: `ok: false` carries a machine-readable reason. */
export type SnapshotIntegrity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** File path for a snapshot id inside a store directory. */
export function snapshotStorePath(
  snapshotId: string,
  dir: string = DEFAULT_SNAPSHOT_DIR,
): string {
  return join(dir, `${snapshotId}.json`);
}

/**
 * Recompute the full trust chain of a snapshot and compare against its
 * self-declared ids/hashes. Pure — no I/O, no clock. Mirrors the exact
 * algorithms of corpus.ts createCorpusSnapshot / hash.ts (same sort, same
 * join, same canonical projection); any drift between the two modules is a
 * defect this verifier turns into a load-time rejection.
 */
export function verifyCorpusSnapshot(snapshot: CorpusSnapshot): SnapshotIntegrity {
  const docs = snapshot.documents;
  if (!Array.isArray(docs)) return { ok: false, reason: 'documents is not an array' };
  if (snapshot.documentCount !== docs.length) {
    return {
      ok: false,
      reason: `documentCount ${snapshot.documentCount} != documents.length ${docs.length}`,
    };
  }
  const seen = new Set<string>();
  for (const [i, d] of docs.entries()) {
    // Identity: documentId must be the deterministic hash of (source, pid).
    const expectedId = computeDocumentId(d.sourceType, d.persistentIdentifier);
    if (d.documentId !== expectedId) {
      return {
        ok: false,
        reason: `documents[${i}].documentId does not match sha256(sourceType|persistentIdentifier)`,
      };
    }
    if (seen.has(d.documentId)) {
      return { ok: false, reason: `duplicate documentId ${d.documentId} (frozen set must be deduped)` };
    }
    seen.add(d.documentId);
    // Content: normalizedHash must be the canonical-JSON content projection.
    const expectedHash = normalizedDocumentHash({
      sourceType: d.sourceType,
      persistentIdentifier: d.persistentIdentifier,
      doi: d.doi,
      title: d.title,
      authors: d.authors,
      publicationDate: d.publicationDate,
      abstract: d.abstract,
      canonicalUrl: d.canonicalUrl,
      licenseMetadata: d.licenseMetadata,
    });
    if (d.normalizedHash !== expectedHash) {
      return {
        ok: false,
        reason: `documents[${i}].normalizedHash does not match the recomputed content projection`,
      };
    }
  }
  // Set identity + content identity: same sort/join as createCorpusSnapshot.
  const sorted = [...docs].sort((a, b) => (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0));
  const expectedSnapshotId = rawSha256Hex(sorted.map((d) => d.documentId).join('\n'));
  if (snapshot.snapshotId !== expectedSnapshotId) {
    return { ok: false, reason: 'snapshotId does not match sha256(sorted documentIds)' };
  }
  const expectedRootHash = rawSha256Hex(
    canonicalJson(sorted.map((d) => ({ id: d.documentId, h: d.normalizedHash }))),
  );
  if (snapshot.rootHash !== expectedRootHash) {
    return { ok: false, reason: 'rootHash does not match sha256(canonical sorted [id, h])' };
  }
  return { ok: true };
}

/** Persist a snapshot (idempotent: content-addressed path, skip when present). */
export function saveCorpusSnapshotStore(
  snapshot: CorpusSnapshot,
  dir: string = DEFAULT_SNAPSHOT_DIR,
): { readonly file: string; readonly bytes: number; readonly alreadyExisted: boolean } {
  const file = snapshotStorePath(snapshot.snapshotId, dir);
  if (existsSync(file)) {
    const bytes = readFileSync(file, 'utf8').length;
    return { file, bytes, alreadyExisted: true };
  }
  const body = JSON.stringify(snapshot, null, 2);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, body, 'utf8');
  return { file, bytes: body.length, alreadyExisted: false };
}

/**
 * Load and VERIFY a frozen snapshot. Fail-closed: missing file, invalid JSON,
 * wrong shape, or any trust-chain mismatch → throw (never return a corpus the
 * verifier has not recomputed).
 */
export function loadCorpusSnapshotStore(
  snapshotId: string,
  dir: string = DEFAULT_SNAPSHOT_DIR,
): { readonly snapshot: CorpusSnapshot; readonly file: string } {
  if (!/^[0-9a-f]{64}$/.test(snapshotId)) {
    throw new Error(
      `snapshot store: id must be 64-char lowercase hex sha256 (got '${snapshotId.slice(0, 24)}…')`,
    );
  }
  const file = snapshotStorePath(snapshotId, dir);
  if (!existsSync(file)) {
    const available = listCorpusSnapshotStore(dir);
    const hint =
      available.length > 0
        ? `available: ${available.map((a) => a.snapshotId.slice(0, 12)).join(', ')}`
        : 'store is empty (run a LIVE grounding first — snapshots are frozen from successful runs)';
    throw new Error(`snapshot store: no snapshot ${snapshotId.slice(0, 12)}… in ${dir} (${hint})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`snapshot store: ${file} is not valid JSON (${(err as Error).message})`, { cause: err });
  }
  const snapshot = parsed as CorpusSnapshot;
  const verdict = verifyCorpusSnapshot(snapshot);
  if (!verdict.ok) {
    throw new Error(
      `snapshot store: ${file} FAILED integrity verification — ${verdict.reason} ` +
        `(the file was modified or corrupted; refusing to ground on unverified evidence)`,
    );
  }
  return { snapshot, file };
}

/** Inventory of frozen snapshots (sorted newest createdAt first). */
export interface SnapshotStoreEntry {
  readonly snapshotId: string;
  readonly documentCount: number;
  readonly createdAt: string;
  readonly sourceQueries: readonly string[];
  readonly file: string;
}

/** List frozen snapshots in a store directory (empty when none/missing dir). */
export function listCorpusSnapshotStore(dir: string = DEFAULT_SNAPSHOT_DIR): readonly SnapshotStoreEntry[] {
  if (!existsSync(dir)) return [];
  const entries: SnapshotStoreEntry[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')) as CorpusSnapshot;
      entries.push({
        snapshotId: parsed.snapshotId,
        documentCount: parsed.documentCount,
        createdAt: parsed.createdAt,
        sourceQueries: parsed.sourceQueries ?? [],
        file: join(dir, name),
      });
    } catch {
      // An unreadable/corrupt file stays LISTABLE-absent: listing must never
      // crash on one bad file; loading it is what rejects (fail-closed there).
    }
  }
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return entries;
}

/** Convenience re-export for callers building snapshots to freeze. */
export type { RetrievedDocument };
