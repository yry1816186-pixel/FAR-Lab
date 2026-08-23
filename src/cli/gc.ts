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
  apply: boolean;
}

const HASH_RE = /[0-9a-f]{64}/;

const listBlobFiles = (root: string): string[] => {
  const out: string[] = [];
  let shards: fs.Dirent[];
  try {
    shards = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out; // no artifact store yet — nothing to sweep
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
      if (e.isFile() && HASH_RE.test(e.name)) out.push(e.name);
    }
  }
  return out;
};

const shardPath = (root: string, hash: string): string => path.join(root, hash.slice(0, 2), hash);

export function runGc(app: App, opts: { apply: boolean } = { apply: false }): GcReport {
  const root = path.join(app.dataDir, 'artifacts');
  const blobs = listBlobFiles(root);

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
    apply: opts.apply,
  };
}
