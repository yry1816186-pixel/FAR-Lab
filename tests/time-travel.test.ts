import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

// RU-12 GO-2 — state-at-seq time-travel projection. Offline/deterministic.

const mkStore = (): Store => new Store(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-tt-')), 'far.db')));

const mkRun = (store: Store): string => {
  const q = ResearchQuestion.parse({ id: newId('q'), text: 'time travel?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });
  return store.createRun(q).id;
};

describe('stateAtSeq (time travel)', () => {
  it('projects monotonically: seq0 empty, mid-seq sees only earlier events, latest sees all', () => {
    const store = mkStore();
    const runId = mkRun(store);
    store.appendEvent(runId, { type: 'stage_started', stage: 'retrieve' });
    store.appendEvent(runId, { type: 'stage_done', stage: 'retrieve' });
    store.appendEvent(runId, { type: 'stage_started', stage: 'plan' });
    const all = store.listEvents(runId);

    const at0 = store.stateAtSeq(runId, 0);
    expect(at0.events).toHaveLength(0);
    expect(at0.stage).toBeNull();

    const atRetrieveDone = store.stateAtSeq(runId, all[2]!.seq);
    expect(atRetrieveDone.events.map((e) => e.type)).toEqual(['run_created', 'stage_started', 'stage_done']);
    expect(atRetrieveDone.stage).toBe('retrieve');

    const atLatest = store.stateAtSeq(runId, all[all.length - 1]!.seq);
    expect(atLatest.events).toHaveLength(all.length);
    expect(atLatest.stage).toBe('plan');
    expect(atLatest.questionId).toBeTypeOf('string');
  });

  it('object kinds listing: spine-itemized kinds use spine ids; others fall back to the current projection', () => {
    const store = mkStore();
    const runId = mkRun(store);
    const hypId = newId('hyp');
    store.appendEvent(runId, { type: 'note', detail: { kind: 'hypothesis', id: hypId } });
    const at = store.stateAtSeq(runId, store.listEvents(runId).slice(-1)[0]!.seq);
    expect(at.objectIdsByKind.hypothesis).toEqual([hypId]);
  });

  it('API surface contract: GET /runs/:id/state-at/:seq (400 bad seq, 404 unknown run)', async () => {
    const { createApiServer } = await import('../src/server/api.js');
    const { createApp } = await import('../src/app/composition.js');
    const { createTestStubProvider } = await import('../src/providers/test-stub.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-tt-api-'));
    const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
    const api = createApiServer(app, { port: 0, staticRoot: path.join(dir, 'no-dist') });
    const port = await api.start();
    const base = `http://127.0.0.1:${port}`;
    const create = await fetch(`${base}/api/v1/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'state at seq?' }),
    });
    const runId = ((await create.json()) as { runId: string }).runId;
    const ok = await fetch(`${base}/api/v1/runs/${runId}/state-at/1`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { seq: number; eventCount: number; lastEvents: unknown[] };
    expect(body.seq).toBe(1);
    expect(Array.isArray(body.lastEvents)).toBe(true);
    const bad = await fetch(`${base}/api/v1/runs/${runId}/state-at/abc`);
    expect(bad.status).toBe(400);
    const ghost = await fetch(`${base}/api/v1/runs/run_${'0'.repeat(26)}/state-at/1`);
    expect(ghost.status).toBe(404);
    await api.stop();
    app.close();
  });
});
