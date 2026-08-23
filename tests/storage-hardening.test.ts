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
