import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-3 T5: audit-spine tamper evidence. Append-only enforced by DB triggers;
// per-run hash chain detects any historical edit. Offline/deterministic.

const mkStore = (): { dir: string; dbPath: string; store: Store } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-audit-'));
  const dbPath = path.join(dir, 'far.db');
  return { dir, dbPath, store: new Store(openDb(dbPath)) };
};

const mkRun = (store: Store): string => {
  const q = ResearchQuestion.parse({ id: newId('q'), text: 'chain test?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
  return store.createRun(q).id;
};

describe('RU-3 T5 audit chain', () => {
  it('chains appended events and verifies clean', () => {
    const { store } = mkStore();
    const runId = mkRun(store);
    store.appendEvent(runId, { type: 'stage_started', stage: 'retrieve' });
    store.appendEvent(runId, { type: 'stage_done', stage: 'retrieve' });
    const v = store.verifyEventChain(runId);
    expect(v.ok).toBe(true);
    expect(v.length).toBeGreaterThanOrEqual(3); // run_created + 2
  });

  it('database triggers abort UPDATE/DELETE on events (append-only enforced by the engine)', () => {
    const { store } = mkStore();
    const runId = mkRun(store);
    const seq = store.listEvents(runId)[0]!.seq;
    expect(() => store['db'].prepare('UPDATE events SET payload=? WHERE seq=?').run('{"forged":true}', seq)).toThrow(/append-only/);
    expect(() => store['db'].prepare('DELETE FROM events WHERE seq=?').run(seq)).toThrow(/append-only/);
    expect(store.verifyEventChain(runId).ok).toBe(true);
  });

  it('write-once backfill: legacy unchained events get chained on reopen and verify clean', () => {
    const { dbPath } = mkStore();
    // simulate pre-v7 rows: raw INSERT without prev_hash (INSERT is not blocked)
    const raw = openDb(dbPath);
    raw.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)')
      .run('run_legacy0000000000000000000', '2026-08-01T00:00:00.000Z', 'note', JSON.stringify({ runId: 'run_legacy0000000000000000000', at: '2026-08-01T00:00:00.000Z', type: 'note', detail: {} }));
    raw.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)')
      .run('run_legacy0000000000000000000', '2026-08-01T00:00:01.000Z', 'note', JSON.stringify({ runId: 'run_legacy0000000000000000000', at: '2026-08-01T00:00:01.000Z', type: 'note', detail: { x: 1 } }));
    raw.close();
    const store = new Store(openDb(dbPath)); // backfill chains legacy rows
    const v = store.verifyEventChain('run_legacy0000000000000000000');
    expect(v.ok).toBe(true);
    expect(v.length).toBe(2);
    // once chained, even the write-once backfill path is closed
    expect(() => store['db'].prepare('UPDATE events SET prev_hash=? WHERE run_id=?').run('f'.repeat(64), 'run_legacy0000000000000000000')).toThrow(/append-only/);
  });

  it('detects a forged row bypassing triggers (e.g. sqlite CLI edit) via chain mismatch', () => {
    const { dbPath, store } = mkStore();
    const runId = mkRun(store);
    store.appendEvent(runId, { type: 'note', detail: { real: true } });
    store['db'].close();
    // bypass triggers the way an external editor would: drop trigger, edit, recreate
    const raw = openDb(dbPath);
    raw.exec('DROP TRIGGER trg_events_immutable_update');
    const seq = raw.prepare('SELECT seq FROM events WHERE run_id=? ORDER BY seq DESC LIMIT 1').get(runId)!;
    raw.prepare('UPDATE events SET payload=? WHERE seq=?').run(JSON.stringify({ type: 'note', detail: { forged: true } }), Number(seq.seq));
    raw.exec('CREATE TRIGGER trg_events_immutable_update BEFORE UPDATE ON events WHEN NOT (OLD.prev_hash IS NULL AND NEW.prev_hash IS NOT NULL AND OLD.run_id = NEW.run_id AND OLD.at = NEW.at AND OLD.type = NEW.type AND OLD.payload = NEW.payload) BEGIN SELECT RAISE(ABORT, \'events are append-only (audit spine)\'); END');
    raw.close();
    const reopened = new Store(openDb(dbPath));
    const v = reopened.verifyEventChain(runId);
    expect(v.ok).toBe(false);
    expect(v.firstBrokenSeq).toBe(Number(seq.seq));
  });
});
