import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { backupWorkspace, restoreWorkspace } from '../src/app/backup-restore.js';

/**
 * FA-DAT-02 restore drill (endgame audit: backup was strong, restore was
 * documentation). Real paths only: real sqlite files, real VACUUM INTO, real
 * byte-level corruption, real move-aside rollback semantics.
 */

let dataDir: string;
let backupDir: string;
let db: Db | null = null;
const T0 = '2026-08-30T00:00:00.000Z';

const seedRun = (): string => {
  if (db === null) throw new Error('test bug: db not open');
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'restore drill: does the workspace survive a corrupted far.db?',
    background: '', goalType: 'explanatory',
    scope: { domain: 'reliability', phenomena: ['backup/restore'] }, constraints: {}, createdAt: T0,
  });
  const run = store.createRun(question);
  return run.id;
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-restore-'));
  backupDir = path.join(os.tmpdir(), `farlab-restore-bk-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  db = openDb(path.join(dataDir, 'far.db'));
});

afterEach(() => {
  // Tests close/reopen the handle mid-drill; only close what is still open.
  try { db?.close(); } catch { /* already closed by the drill */ }
  db = null;
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe('workspace backup/restore (FA-DAT-02)', () => {
  it('backup set carries far.db with manifest hash + user_version; restore round-trips a corrupted live db', () => {
    const runId = seedRun();
    db.close();

    const { manifest } = backupWorkspace(dataDir, backupDir);
    const farMember = manifest.files.find((f) => f.name === 'far.db');
    expect(farMember).toBeDefined();
    expect(farMember!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(farMember!.userVersion).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(backupDir, 'MANIFEST.json'))).toBe(true);

    // Corrupt the live far.db mid-file (the disaster restore exists for).
    const live = path.join(dataDir, 'far.db');
    const fd = fs.openSync(live, 'r+');
    try {
      const buf = Buffer.from('X');
      fs.writeSync(fd, buf, 0, 1, Math.floor(fs.statSync(live).size / 2));
    } finally {
      fs.closeSync(fd);
    }

    const report = restoreWorkspace(backupDir, dataDir, { replace: true });
    expect(report.restored).toContain('far.db');
    expect(report.movedAside.length).toBe(1); // the corrupted live file was moved aside, not deleted
    expect(fs.existsSync(report.movedAside[0]!.to)).toBe(true);

    db = openDb(live); // reopens cleanly after restore
    const store = new Store(db);
    const runs = store.listRuns();
    expect(runs.some((r) => r.id === runId)).toBe(true);
  });

  it('refuses to restore over an existing live db without --replace (no silent destruction)', () => {
    seedRun();
    db.close();
    backupWorkspace(dataDir, backupDir);
    expect(() => restoreWorkspace(backupDir, dataDir, {})).toThrow(/--replace/);
    expect(fs.existsSync(path.join(dataDir, 'far.db'))).toBe(true); // untouched
  });

  it('refuses a hash-tampered backup set BEFORE touching the live workspace', () => {
    seedRun();
    db.close();
    backupWorkspace(dataDir, backupDir);
    const member = path.join(backupDir, 'far.db');
    const fd = fs.openSync(member, 'r+');
    try {
      fs.writeSync(fd, Buffer.from('Z'), 0, 1, Math.floor(fs.statSync(member).size / 2));
    } finally {
      fs.closeSync(fd);
    }
    expect(() => restoreWorkspace(backupDir, dataDir, { replace: true })).toThrow(/hash mismatch/);
  });

  it('refuses when a live -wal indicates a possibly-running writer', () => {
    seedRun();
    db.close();
    backupWorkspace(dataDir, backupDir);
    // Simulate a hot writer: a -wal sibling next to the live db.
    fs.writeFileSync(path.join(dataDir, 'far.db-wal'), Buffer.alloc(64));
    try {
      expect(() => restoreWorkspace(backupDir, dataDir, { replace: true })).toThrow(/-wal/);
    } finally {
      fs.rmSync(path.join(dataDir, 'far.db-wal'), { force: true });
    }
  });

  it('refuses an empty "backup" (no far.db) so absence can never verify as success', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-empty-'));
    try {
      expect(() => backupWorkspace(emptyDir, backupDir)).toThrow(/no far\.db/);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
