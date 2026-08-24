import fs from 'node:fs';
import path from 'node:path';
import type { App } from '../app/composition.js';

/**
 * `far gc` (gap R7): sweep content-addressed artifact blobs that no stored
 * object references anymore (e.g. after run deletion). Reference truth = every
 * `sha256:<64-hex>` occurrence in the objects and runs tables — the one ref
 * vocabulary the product writes. Deterministic and idempotent; --dry-run (the
 * default) only reports.
 */

export interface GcReport {
  /** Blobs present under the artifact store. */
  totalBlobs: number;
  /** Blobs referenced by at least one stored object/run row. */
  referenced: number;
  /** Unreferenced blobs (the deletion candidates). */
  unreferenced: string[];
  /** Bytes the candidates occupy. */
  unreferencedBytes: number;
  /** Only set with --apply: blobs actually removed. */
  removed: string[];
  /** Orphaned put-temps (`.hash.tmp-*`): crash residue from the atomic put path,
   *  never valid data — reported always, removed only with --apply. */
  orphanTemps: string[];
  apply: boolean;
}

// Anchored: an UNanchored /[0-9a-f]{64}/ also matched inside put-temp names
// (".<hash>.tmp-…" contains the same 64 hex chars), corrupting the blob count and
// hiding temps from the orphan branch below.
const HASH_RE = /^[0-9a-f]{64}$/;
const TEMP_RE = /^\.[0-9a-f]{64}\.tmp-/;

const listBlobFiles = (root: string): { blobs: string[]; orphanTemps: string[] } => {
  const blobs: string[] = [];
  const orphanTemps: string[] = [];
  let shards: fs.Dirent[];
  try {
    shards = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { blobs, orphanTemps }; // no artifact store yet — nothing to sweep
  }
  for (const shard of shards) {
    if (!shard.isDirectory()) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, shard.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (HASH_RE.test(e.name)) blobs.push(e.name);
      else if (TEMP_RE.test(e.name)) orphanTemps.push(path.join(shard.name, e.name));
    }
  }
  return { blobs, orphanTemps };
};

const shardPath = (root: string, hash: string): string => path.join(root, hash.slice(0, 2), hash);

export function runGc(app: App, opts: { apply: boolean } = { apply: false }): GcReport {
  const root = path.join(app.dataDir, 'artifacts');
  const { blobs, orphanTemps } = listBlobFiles(root);

  // Reference truth: objects + runs rows are the only places refs are persisted.
  const refs = app.store.referencedArtifactHashes();
  const unreferenced = blobs.filter((h) => !refs.has(h));
  let unreferencedBytes = 0;
  for (const h of unreferenced) {
    try {
      unreferencedBytes += fs.statSync(shardPath(root, h)).size;
    } catch { /* vanished mid-scan: not a candidate anymore */ }
  }

  const removed: string[] = [];
  if (opts.apply) {
    for (const h of unreferenced) {
      try {
        fs.unlinkSync(shardPath(root, h));
        removed.push(h);
      } catch { /* already gone — idempotent */ }
    }
    // Orphaned put-temps are crash residue, never valid data (a landed blob's name
    // is exactly 64 hex chars; temps carry the `.hash.tmp-` prefix by construction).
    // Safe to sweep unconditionally under --apply — a LIVE concurrent put's temp is
    // unlinked before its rename by the same process, and unlinking it here at worst
    // fails that put loudly (ENONENT at rename), never corrupts a landed blob.
    for (const t of orphanTemps) {
      try {
        fs.unlinkSync(path.join(root, t));
      } catch { /* already gone — idempotent */ }
    }
    // Drop now-empty shard dirs so the store stays tidy.
    const shardDirs = new Set(unreferenced.map((h) => h.slice(0, 2)));
    for (const shard of shardDirs) {
      try {
        fs.rmdirSync(path.join(root, shard)); // fails loudly on non-empty: keep it
      } catch { /* non-empty or gone */ }
    }
  }

  return {
    totalBlobs: blobs.length,
    referenced: blobs.length - unreferenced.length,
    unreferenced,
    unreferencedBytes,
    removed,
    orphanTemps,
    apply: opts.apply,
  };
}
