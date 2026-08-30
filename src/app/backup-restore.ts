import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Three-database backup/restore (FINAL_ACCEPTANCE FA-DAT-02, endgame audit
 * 2026-08-30: backup was strong, restore was documentation).
 *
 * The workspace state is THREE sqlite files, each with its own single owner:
 *   far.db            — scientific authority (runs/events/objects/memory/lineage/receipts)
 *   far-scheduler.db  — experiment job queue (operational, recreatable)
 *   source-cache.db   — retrieval response cache (QoS, safe to lose)
 *
 * Backup = one `VACUUM INTO` per file from a SEPARATE connection (sees all
 * committed WAL state — the plain-file-copy trap is structurally avoided) into
 * a timestamped set directory plus a MANIFEST.json with per-file sha256 and
 * each database's user_version. Restore = verify every member (integrity_check
 * + manifest hash) via READ-ONLY connections (never openDb — that would run
 * forward migrations on the backup), move the live trio aside as
 * `<name>.pre-restore-<stamp>` (the rollback path), then copy the set in.
 */

export const WORKSPACE_DBS = ['far.db', 'far-scheduler.db', 'source-cache.db'] as const;
export type WorkspaceDbName = (typeof WORKSPACE_DBS)[number];

export interface BackupSetManifest {
  createdAt: string;
  files: Array<{ name: WorkspaceDbName; bytes: number; sha256: string; userVersion: number }>;
}

const sha256File = (p: string): string =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const userVersionOf = (dbPath: string): number => {
  const raw = new DatabaseSync(dbPath, { readOnly: true, timeout: 10_000 });
  try {
    const row = raw.prepare('PRAGMA user_version').get() as Record<string, unknown> | undefined;
    return Number(row?.user_version ?? 0);
  } finally {
    raw.close();
  }
};

const integrityOf = (dbPath: string): string => {
  const raw = new DatabaseSync(dbPath, { readOnly: true, timeout: 10_000 });
  try {
    const row = raw.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    return String(row?.integrity_check ?? row?.['integrity_check'] ?? 'unknown');
  } finally {
    raw.close();
  }
};

const vacuumInto = (src: string, dest: string): void => {
  const raw = new DatabaseSync(src, { timeout: 10_000 });
  try {
    raw.prepare('VACUUM INTO ?').run(dest);
  } finally {
    raw.close();
  }
};

export interface BackupAllResult {
  dir: string;
  manifest: BackupSetManifest;
}

export const backupWorkspace = (dataDir: string, destDir: string, now: () => string = () => new Date().toISOString()): BackupAllResult => {
  if (fs.existsSync(destDir)) throw new Error(`backup set destination exists, refusing to overwrite: ${destDir}`);
  fs.mkdirSync(destDir, { recursive: true });
  const files: BackupSetManifest['files'] = [];
  for (const name of WORKSPACE_DBS) {
    const src = path.join(dataDir, name);
    if (!fs.existsSync(src)) continue; // absent members are honestly omitted (fresh workspaces)
    const dest = path.join(destDir, name);
    vacuumInto(src, dest);
    files.push({ name, bytes: fs.statSync(dest).size, sha256: sha256File(dest), userVersion: userVersionOf(dest) });
  }
  if (!files.some((f) => f.name === 'far.db')) {
    throw new Error(`no far.db under ${dataDir} — refusing an empty "backup" that would verify as success`);
  }
  const manifest: BackupSetManifest = { createdAt: now(), files };
  fs.writeFileSync(path.join(destDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { dir: destDir, manifest };
};

export interface RestoreReport {
  restored: WorkspaceDbName[];
  movedAside: Array<{ from: string; to: string }>;
  verified: string[];
}

export const restoreWorkspace = (
  backupDir: string,
  dataDir: string,
  opts: { replace?: boolean; now?: () => Date } = {},
): RestoreReport => {
  const now = opts.now ?? (() => new Date());
  const manifestPath = path.join(backupDir, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`not a backup set (MANIFEST.json missing): ${backupDir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupSetManifest;

  // 1. Verify every member BEFORE touching the live workspace: hash vs manifest,
  //    then sqlite integrity_check via read-only connections (openDb would run
  //    forward migrations on the backup — forbidden here).
  const verified: string[] = [];
  for (const f of manifest.files) {
    const p = path.join(backupDir, f.name);
    if (!fs.existsSync(p)) throw new Error(`backup set member missing: ${f.name}`);
    if (sha256File(p) !== f.sha256) throw new Error(`backup set member hash mismatch (corrupted backup?): ${f.name}`);
    const integrity = integrityOf(p);
    if (integrity !== 'ok') throw new Error(`backup set member failed integrity_check (${integrity}): ${f.name}`);
    verified.push(f.name);
  }

  // 2. Hot-workspace guard: a -wal sibling next to a live db means a writer may
  //    be active. Restoring under a live writer corrupts the new state silently.
  fs.mkdirSync(dataDir, { recursive: true });
  for (const f of manifest.files) {
    const name = f.name;
    const live = path.join(dataDir, name);
    if (!fs.existsSync(live)) continue;
    if (fs.existsSync(live + '-wal')) {
      throw new Error(`${name} has a live -wal (a server/worker may be running) — stop it before restore`);
    }
  }

  // 3. Move the live trio aside (rollback path), then copy the verified set in.
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const movedAside: RestoreReport['movedAside'] = [];
  const restored: WorkspaceDbName[] = [];
  try {
    for (const f of manifest.files) {
      const live = path.join(dataDir, f.name);
      if (fs.existsSync(live)) {
        if (opts.replace !== true) {
          throw new Error(`live ${f.name} exists — pass --replace to move it aside as ${f.name}.pre-restore-${stamp} first`);
        }
        const aside = `${live}.pre-restore-${stamp}`;
        fs.renameSync(live, aside);
        movedAside.push({ from: live, to: aside });
      }
      fs.copyFileSync(path.join(backupDir, f.name), live);
      restored.push(f.name);
    }
  } catch (e) {
    // Best-effort rollback of an aborted restore: put back what we already moved.
    for (const m of [...movedAside].reverse()) {
      if (!fs.existsSync(m.from)) fs.renameSync(m.to, m.from);
    }
    throw e;
  }
  return { restored, movedAside, verified };
};
