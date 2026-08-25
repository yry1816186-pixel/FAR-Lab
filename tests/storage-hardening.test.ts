import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-7 STORAGE hardening: backup/restore (VACUUM INTO), backwards-clock
// detection, poison-job dead-letter queue. All offline/deterministic.

const mkStore = (): { dir: string; store: Store } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-storage-'));
  return { dir, store: new Store(openDb(path.join(dir, 'far.db'))) };
};

const mkRun = (store: Store): string => {
  const q = ResearchQuestion.parse({ id: newId('q'), text: 'storage?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
  return store.createRun(q).id;
};

describe('RU-7.1 backup/restore (VACUUM INTO)', () => {
  it('produces a consistent, openable copy: integrity ok, counts match, event chain verifies, WAL-copy trap avoided', () => {
    const { dir, store } = mkStore();
    const runId = mkRun(store);
    store.appendEvent(runId, { type: 'stage_started', stage: 'retrieve' });
    store.appendEvent(runId, { type: 'note', detail: { k: 1 } });
    const dest = path.join(dir, 'backup.db');
    store.backupTo(dest);

    // the backup is a standalone consistent snapshot (not a WAL-half copy)
    const restored = new Store(openDb(dest));
    const v = restored.verifyEventChain(runId);
    expect(v.ok).toBe(true);
    expect(v.length).toBe(store.listEvents(runId).length);
    expect(restored.listRuns(10).length).toBe(store.listRuns(10).length);
    expect(restored['db'].prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
    restored['db'].close();

    // idempotence guard: refuse to overwrite an existing destination
    expect(() => store.backupTo(dest)).toThrow(/exists/);
    store['db'].close();
  });
});

describe('RU-7.3 backwards-clock detection', () => {
  it('records an honest observation when an event timestamp regresses below the last persisted write time', () => {
    const { store } = mkStore();
    const runId = mkRun(store);
    // mkRun's run_created stamps the REAL wall clock into the workspace write-floor
    // meta; the synthetic timestamps below are fixed. Without this reset the test
    // only passes when the real clock is before 12:00Z (silent time-of-day flake,
    // found 2026-08-24 — afternoon runs made the FIRST synthetic write look like a
    // clock regression). The unit under test is the regression NOTE, not the floor
    // seeding, so seed it deterministically from the first synthetic write.
    store.deleteMeta('storage:last_write_at');
    // normal write establishes the floor
    store.appendEvent(runId, { type: 'note', detail: { i: 1 } }, '2026-08-24T12:00:00.000Z');
    // clock jumps BACK (suspend/resume shape): now < floor
    store.appendEvent(runId, { type: 'note', detail: { i: 2 } }, '2026-08-24T11:00:00.000Z');
    const events = store.listEvents(runId);
    const jump = events.find((e) => (e.detail as { kind?: string } | undefined)?.kind === 'clock_backwards_jump');
    expect(jump).toBeDefined();
    expect((jump!.detail as { regressedSeconds?: number }).regressedSeconds).toBe(3600);
    // a subsequent normal write does not re-fire the note
    store.appendEvent(runId, { type: 'note', detail: { i: 3 } }, '2026-08-24T12:30:00.000Z');
    const jumps = store.listEvents(runId).filter((e) => (e.detail as { kind?: string } | undefined)?.kind === 'clock_backwards_jump');
    expect(jumps).toHaveLength(1);
    store['db'].close();
  });
});

describe('RU-7.1 backup CLI verb (far backup)', () => {
  it('end-to-end via main(): writes a restorable snapshot under backup/, refuses overwrite', async () => {
    const { execFileSync } = await import('node:child_process');
    const path = await import('node:path');
    const fsMod = await import('node:fs');
    const { dir, store } = mkStore();
    mkRun(store);
    store.appendEvent(store.listRuns(1)[0]!.id, { type: 'note', detail: { i: 1 } });
    store['db'].close();
    const out = execFileSync(process.execPath, ['dist/cli/main.js', 'backup'], {
      env: { ...process.env, FARLAB_DATA_DIR: dir },
      encoding: 'utf8',
    });
    expect(out).toContain('backup written');
    const backupDir = path.join(dir, 'backup');
    const files = fsMod.readdirSync(backupDir);
    expect(files).toHaveLength(1);
    const snap = new (await import('../src/persistence/store.js')).Store(
      (await import('../src/persistence/db.js')).openDb(path.join(backupDir, files[0]!)));
    expect(snap.listRuns(10)).toHaveLength(1);
    expect(snap['db'].prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
    snap['db'].close();
    // second backup to the SAME explicit path must refuse
    const dest = path.join(dir, 'explicit.db');
    const proc = await import('node:child_process');
    const first = proc.spawnSync(process.execPath, ['dist/cli/main.js', 'backup', dest], { env: { ...process.env, FARLAB_DATA_DIR: dir }, encoding: 'utf8' });
    expect(first.status).toBe(0);
    const second = proc.spawnSync(process.execPath, ['dist/cli/main.js', 'backup', dest], { env: { ...process.env, FARLAB_DATA_DIR: dir }, encoding: 'utf8' });
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('refusing to overwrite');
  });
});
