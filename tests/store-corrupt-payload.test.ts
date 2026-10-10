import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import type { Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

/**
 * LOG-003: one corrupt / partially-written events row (disk corruption, crash
 * mid-write, manual edit) must not take down EVERY reader of that run —
 * GET /runs/:id, the CLI run view and watchdog adoption all parse the spine.
 * A corrupt row surfaces as a countable synthetic note instead of a throw.
 */

let tmp: string;
let db: Db;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-corrupt-'));
  db = openDb(path.join(tmp, 'far.db'));
});

afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const seedRun = (store: Store): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  return store.createRun(q).id;
};

/** Seq is a GLOBAL autoincrement across runs — never hardcode it in tests. */
const seqOfNote = (store: Store, runId: string, reason: string): number => {
  const seq = store.listEvents(runId).find((e) => (e.detail as { reason?: string }).reason === reason)?.seq;
  if (seq === undefined) throw new Error(`note '${reason}' not found in ${runId}`);
  return seq;
};

const seqOfRunCreated = (store: Store, runId: string): number => {
  const seq = store.listEvents(runId).find((e) => e.type === 'run_created')?.seq;
  if (seq === undefined) throw new Error(`run_created not found in ${runId}`);
  return seq;
};

/** Corrupt a row's payload out-of-band. The append-only trigger enforces app
 *  writes; real-world corruption by definition happens beneath it. */
const corruptPayload = (runId: string, seq: number, garbage: string): void => {
  db.exec('DROP TRIGGER trg_events_immutable_update');
  try {
    db.prepare('UPDATE events SET payload=? WHERE run_id=? AND seq=?').run(garbage, runId, seq);
  } finally {
    db.exec(`CREATE TRIGGER trg_events_immutable_update
      BEFORE UPDATE ON events
      WHEN NOT (OLD.prev_hash IS NULL AND NEW.prev_hash IS NOT NULL
                AND OLD.run_id = NEW.run_id AND OLD.at = NEW.at
                AND OLD.type = NEW.type AND OLD.payload = NEW.payload)
      BEGIN
        SELECT RAISE(ABORT, 'events are append-only (audit spine)');
      END`);
  }
};

describe('corrupt event payload tolerance (LOG-003)', () => {
  it('listEvents returns a synthetic note for a corrupt row instead of throwing', () => {
    const store = new Store(db);
    const runId = seedRun(store);
    store.appendEvent(runId, { type: 'note', detail: { reason: 'healthy-before' } });
    corruptPayload(runId, seqOfNote(store, runId, 'healthy-before'), '{"partial": ');

    const events = store.listEvents(runId); // must not throw
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('run_created');
    const synthetic = events[1];
    expect(synthetic?.type).toBe('note');
    expect((synthetic?.detail as { reason?: string }).reason).toBe('corrupt_event_payload_skipped');
  });

  it('listEventsAfter tolerates corrupt rows the same way', () => {
    const store = new Store(db);
    const runId = seedRun(store);
    store.appendEvent(runId, { type: 'note', detail: { reason: 'a' } });
    store.appendEvent(runId, { type: 'note', detail: { reason: 'b' } });
    const seqB = seqOfNote(store, runId, 'b');
    corruptPayload(runId, seqB, 'not json at all');

    const events = store.listEventsAfter(runId, seqOfNote(store, runId, 'a')); // must not throw
    expect(events).toHaveLength(1);
    const synthetic = events.find((e) => e.seq === seqB);
    expect(synthetic?.type).toBe('note');
    expect((synthetic?.detail as { reason?: string }).reason).toBe('corrupt_event_payload_skipped');
  });

  it('queryEvents (tag plane) tolerates corrupt rows: skipped marker event, healthy rows intact', () => {
    const store = new Store(db);
    const runId = seedRun(store);
    corruptPayload(runId, seqOfRunCreated(store, runId), '{"type": "run_created", '); // malformed JSON mid-key

    const events = store.queryEvents({ tags: ['kind:run_created'], runId }); // must not throw
    expect(events.length).toBeGreaterThanOrEqual(1);
    // The synthetic note carries the seq — the hole stays countable in-band
    // (one corrupt row = exactly one corrupt_event_payload_skipped event).
    expect(events.filter((e) => e.type === 'note'
      && (e.detail as { reason?: string }).reason === 'corrupt_event_payload_skipped')).toHaveLength(1);
  });

  it('schema-invalid but parseable payloads are treated as corrupt too', () => {
    const store = new Store(db);
    const runId = seedRun(store);
    corruptPayload(runId, seqOfRunCreated(store, runId), '{"something": "json but not an event"}');

    const events = store.listEvents(runId); // must not throw
    const synthetic = events.find((e) => e.type === 'note');
    expect((synthetic?.detail as { reason?: string }).reason).toBe('corrupt_event_payload_skipped');
  });

  it('two corrupt rows produce exactly two synthetic notes (countable)', () => {
    const store = new Store(db);
    const runId = seedRun(store);
    store.appendEvent(runId, { type: 'note', detail: { reason: 'x' } });
    store.appendEvent(runId, { type: 'note', detail: { reason: 'y' } });
    corruptPayload(runId, seqOfNote(store, runId, 'x'), '{');
    corruptPayload(runId, seqOfNote(store, runId, 'y'), '}');

    const marked = store.listEvents(runId).filter((e) => (e.detail as { reason?: string }).reason === 'corrupt_event_payload_skipped');
    expect(marked).toHaveLength(2);
  });
});
