import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openScheduler, drainOutbox } from '../src/experiment/scheduler.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-7.4 cross-store outbox: far.db domain write + outbox row in ONE transaction;
// scheduler drain idempotent by intent id. The dual-write window (experiment_run
// persisted, scheduler.enqueue never reached after a crash) closes.

const mk = (): { dir: string; store: Store; scheduler: ReturnType<typeof openScheduler> } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-outbox-'));
  return { dir, store: new Store(openDb(path.join(dir, 'far.db'))), scheduler: openScheduler(path.join(dir, 'far-scheduler.db')) };
};

const mkRun = (store: Store): string => {
  const q = ResearchQuestion.parse({ id: newId('q'), text: 'outbox?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
  return store.createRun(q).id;
};

const queuedRun = (runId: string, xrunId: string): Record<string, unknown> => ({
  id: xrunId, runId, specId: newId('xsp'), specHash: 'a'.repeat(64),
  status: 'queued', attempts: 0, executor: 'local', cancelRequested: false,
  resultIds: [], statReportIds: [], createdAt: '2026-08-24T00:00:00.000Z',
});

describe('RU-7.4 outbox atomicity', () => {
  it('putObjectEventedOutboxed lands the object, the event and the outbox row in ONE transaction', () => {
    const { store } = mk();
    const runId = mkRun(store);
    const xrun = 'xrun_outboxatomictest00000000a';
    store.putObjectEventedOutboxed(
      'experiment_run', queuedRun(runId, xrun) as never,
      { type: 'experiment_queued', detail: { specId: 'xsp_x' } },
      { intentId: xrun, kind: 'experiment_job', payload: { experimentRunId: xrun, runId, specId: 'xsp_x' } },
    );
    expect(store.getObject('experiment_run', xrun)).not.toBeNull();
    expect(store.listEvents(runId).some((e) => e.type === 'experiment_queued')).toBe(true);
    expect(store.pendingOutbox().map((o) => o.intentId)).toEqual([xrun]);
  });

  it('a failure inside the transaction leaves NO outbox row (no orphaned intent)', () => {
    const { store } = mk();
    const runId = mkRun(store);
    expect(() => store.putObjectEventedOutboxed(
      'experiment_run', queuedRun(runId, 'xrun_willfail000000000000a') as never,
      { type: 'nonsense_event_type' as never, detail: {} }, // event validation fails
      { intentId: 'xrun_willfail000000000000a', kind: 'experiment_job', payload: {} },
    )).toThrow();
    expect(store.pendingOutbox()).toHaveLength(0);
  });

  it('same intent id re-recorded is a no-op (idempotent at the outbox layer)', () => {
    const { store } = mk();
    store.recordOutbox('intent_dup', 'experiment_job', { a: 1 });
    store.recordOutbox('intent_dup', 'experiment_job', { a: 2 });
    const pending = store.pendingOutbox();
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0]!.payload)).toEqual({ a: 1 }); // first write wins
  });
});

describe('RU-7.4 drain (idempotent by intent id)', () => {
  it('drains pending intents into the scheduler exactly once across repeated drains', () => {
    const { store, scheduler } = mk();
    store.recordOutbox('intent_a', 'experiment_job', { experimentRunId: 'xrun_a', runId: 'run_a', specId: 'xsp_a', priority: 0, device: 'local' });
    store.recordOutbox('intent_b', 'experiment_job', { experimentRunId: 'xrun_b', runId: 'run_b', specId: 'xsp_b', priority: 0, device: 'local' });

    const first = drainOutbox(store, scheduler);
    expect(first.drained).toBe(2);
    expect(scheduler.list()).toHaveLength(2);

    // crash-recovery shape: drain again after "losing" the completion — no duplicates
    const second = drainOutbox(store, scheduler);
    expect(second.drained).toBe(0);
    expect(scheduler.list()).toHaveLength(2);
    expect(store.pendingOutbox()).toHaveLength(0);

    // the intent id IS the job id: traceable end to end
    expect(scheduler.get('intent_a')).not.toBeNull();
    scheduler.close();
  });

  it('enqueue with an explicit intentId is idempotent at the scheduler layer too', () => {
    const { scheduler } = mk();
    const j1 = scheduler.enqueue({ intentId: 'intent_c', experimentRunId: 'xrun_c', runId: 'run_c', specId: 'xsp_c' });
    const j2 = scheduler.enqueue({ intentId: 'intent_c', experimentRunId: 'xrun_c', runId: 'run_c', specId: 'xsp_c' });
    expect(j1.jobId).toBe('intent_c');
    expect(j2.jobId).toBe('intent_c'); // same job returned, not a duplicate
    expect(scheduler.list()).toHaveLength(1);
    scheduler.close();
  });
});
