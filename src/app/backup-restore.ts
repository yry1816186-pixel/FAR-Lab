import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';

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

const BackupManifest = z.object({
  createdAt: z.string().datetime({ offset: true }),
  files: z.array(z.object({
    name: z.enum(WORKSPACE_DBS),
    bytes: z.number().int().positive().safe(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    userVersion: z.number().int().nonnegative().safe(),
  })).min(1).max(WORKSPACE_DBS.length),
}).superRefine((manifest, ctx) => {
  const names = new Set(manifest.files.map((file) => file.name));
  if (!names.has('far.db')) ctx.addIssue({ code: 'custom', message: 'far.db is required' });
  if (names.size !== manifest.files.length) ctx.addIssue({ code: 'custom', message: 'duplicate database member' });
});

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
  const parsed = BackupManifest.safeParse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  if (!parsed.success) throw new Error(`invalid backup manifest: ${parsed.error.message}`);
  const manifest = parsed.data;

  // 1. Verify every member BEFORE touching the live workspace: hash vs manifest,
  //    then sqlite integrity_check via read-only connections (openDb would run
  //    forward migrations on the backup — forbidden here).
  const verified: string[] = [];
  for (const f of manifest.files) {
    const p = path.join(backupDir, f.name);
    if (!fs.existsSync(p)) throw new Error(`backup set member missing: ${f.name}`);
    if (!fs.lstatSync(p).isFile()) throw new Error(`backup set member is not a regular file: ${f.name}`);
    if (sha256File(p) !== f.sha256) throw new Error(`backup set member hash mismatch (corrupted backup?): ${f.name}`);
    if (fs.statSync(p).size !== f.bytes) throw new Error(`backup set member size mismatch: ${f.name}`);
    const integrity = integrityOf(p);
    if (integrity !== 'ok') throw new Error(`backup set member failed integrity_check (${integrity}): ${f.name}`);
    if (userVersionOf(p) !== f.userVersion) throw new Error(`backup set member user_version mismatch: ${f.name}`);
    verified.push(f.name);
  }

  // 2. Hot-workspace guard: a -wal sibling next to a live db means a writer may
  //    be active. Restoring under a live writer corrupts the new state silently.
  fs.mkdirSync(dataDir, { recursive: true });
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  for (const name of WORKSPACE_DBS) {
    const live = path.join(dataDir, name);
    if (fs.existsSync(live + '-wal') || fs.existsSync(live + '-journal')) {
      throw new Error(`${name} has a live -wal (a server/worker may be running) — stop it before restore`);
    }
    if (!fs.existsSync(live)) continue;
    if (!fs.lstatSync(live).isFile()) throw new Error(`live ${name} is not a regular file`);
    if (opts.replace !== true) {
      throw new Error(`live ${name} exists — pass --replace to move it aside as ${name}.pre-restore-${stamp} first`);
    }
    if (fs.existsSync(`${live}.pre-restore-${stamp}`)) {
      throw new Error(`restore rollback destination already exists: ${name}.pre-restore-${stamp}`);
    }
  }

  // 3. Stage the whole set before touching live state. Same-filesystem renames
  //    install complete files; an I/O failure never leaves a partially copied DB.
  const staging = fs.mkdtempSync(path.join(dataDir, '.restore-'));
  const movedAside: RestoreReport['movedAside'] = [];
  const restored: WorkspaceDbName[] = [];
  try {
    for (const f of manifest.files) {
      const staged = path.join(staging, f.name);
      fs.copyFileSync(path.join(backupDir, f.name), staged, fs.constants.COPYFILE_EXCL);
      if (sha256File(staged) !== f.sha256) throw new Error(`backup set changed during restore: ${f.name}`);
    }
    // An optional database absent from the backup must not survive from a newer
    // workspace: it may reference runs that do not exist in the restored far.db.
    for (const name of WORKSPACE_DBS) {
      const live = path.join(dataDir, name);
      if (fs.existsSync(live)) {
        const aside = `${live}.pre-restore-${stamp}`;
        fs.renameSync(live, aside);
        movedAside.push({ from: live, to: aside });
      }
    }
    for (const f of manifest.files) {
      fs.renameSync(path.join(staging, f.name), path.join(dataDir, f.name));
      restored.push(f.name);
    }
  } catch (e) {
    // Roll back installed files as well as moved originals. Keeping an installed
    // first member after a later failure creates a mixed, silently damaged set.
    const rollbackErrors: unknown[] = [];
    for (const name of [...restored].reverse()) {
      try { fs.unlinkSync(path.join(dataDir, name)); } catch (error) { rollbackErrors.push(error); }
    }
    for (const m of [...movedAside].reverse()) {
      if (fs.existsSync(m.from)) {
        // Another writer recreated the original: renaming the backup back would
        // destroy it. Preserve both and report — never silently drop data.
        rollbackErrors.push(new Error(`cannot roll back ${m.from}; original preserved at ${m.to}`, { cause: e }));
        continue;
      }
      try {
        fs.renameSync(m.to, m.from);
      } catch (error) {
        rollbackErrors.push(error instanceof Error ? error : new Error(String(error), { cause: e }));
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([e, ...rollbackErrors], 'restore failed and rollback is incomplete; preserved originals require recovery', { cause: e });
    }
    throw e;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { restored, movedAside, verified };
};
