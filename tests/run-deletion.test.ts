import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { attachRunToConversation, createConversation, listConversations } from '../src/server/conversations.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { HypothesisCandidate, ResearchQuestion } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { App } from '../src/app/composition.js';

/**
 * Researcher lifecycle (gap R1): DELETE /api/v1/runs/:id — run deletion with a
 * fully cascading store layer (objects incl. FTS mirror rows, events, both
 * checkpoint tables), conversation reference detachment, and honest 404/409
 * semantics. Everything runs on a real SQLite store; no live route touched.
 */

let app: App;
let api: ApiServer;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-run-delete-'));
  app = await createApp({ dataDir, providerOverride: createTestStubProvider([]) });
  api = createApiServer(app, { port: 0, automations: { enabled: false } });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const ts = (i: number): string => new Date(Date.now() - 100_000 + i * 1000).toISOString();

const seedRun = (text: string): { runId: string; questionId: string } => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text,
    background: 'seed background for deletion tests',
    goalType: 'explanatory',
    scope: { domain: 'testing', phenomena: ['cascade deletion'] },
    constraints: {},
    createdAt: ts(1),
  });
  const run = app.store.createRun(q);
  return { runId: run.id, questionId: q.id };
};

const seedHypothesis = (runId: string, statement: string): string => {
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'),
    runId,
    version: 0,
    statement,
    mechanism: 'seeded mechanism for deletion tests',
    derivation: { strategy: 'mechanism_driven', rationale: 'seed', inputClaimIds: [] },
    assumptions: [],
    predictions: ['deletion removes this row'],
    supportingClaimIds: [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_now',
    clusterKey: 'deletion',
    createdAt: ts(2),
  });
  app.store.putObject('hypothesis', hyp);
  return hyp.id;
};

const del = async (runId: string): Promise<Response> =>
  fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });

describe('run deletion: store cascade + FTS mirror', () => {
  it('deletes objects, events and checkpoints owned by the run — and NOTHING else', () => {
    const a = seedRun('run A question about deletion cascade isolation');
    const b = seedRun('run B question that must survive untouched');
    seedHypothesis(a.runId, 'hypothesis owned by run A (zebrafisch marker)');
    const bHyp = seedHypothesis(b.runId, 'hypothesis owned by run B (narwhal marker)');
    app.store.putStepOutput(a.runId, 'retrieve', '', 'q1', { marker: 'a' });

    // Both are searchable before deletion (FTS mirror alive).
    const before = app.store.searchText('zebrafisch', { questions: 5, hypotheses: 5, claims: 5 });
    expect(before.hypotheses.length).toBe(1);

    const counts = app.store.deleteRunCascade(a.runId);
    expect(counts).not.toBeNull();
    expect(counts!.objects).toBeGreaterThanOrEqual(1); // hypothesis (+ any others seeded by createRun)
    expect(counts!.events).toBeGreaterThanOrEqual(1); // run_created at minimum
    expect(counts!.checkpoints).toBeGreaterThanOrEqual(1); // the step output above
    expect(counts!.searchRows).toBe(1); // exactly run A's hypothesis mirror row

    // Run A is gone everywhere; run B is fully intact.
    expect(app.store.getRun(a.runId)).toBeNull();
    expect(app.store.listObjects('hypothesis', a.runId)).toHaveLength(0);
    expect(app.store.listEvents(a.runId)).toHaveLength(0);
    expect(app.store.getRun(b.runId)).not.toBeNull();
    expect(app.store.getObject('hypothesis', bHyp)).not.toBeNull();

    // The FTS mirror no longer surfaces the deleted hypothesis.
    const after = app.store.searchText('zebrafisch', { questions: 5, hypotheses: 5, claims: 5 });
    expect(after.hypotheses).toHaveLength(0);
    const survivor = app.store.searchText('narwhal', { questions: 5, hypotheses: 5, claims: 5 });
    expect(survivor.hypotheses).toHaveLength(1);
  });

  it('returns null for an unknown run id (idempotent, no throw)', () => {
    expect(app.store.deleteRunCascade('run_doesnotexist0000000000')).toBeNull();
  });

  it('deleteObject also drops the FTS mirror row (no ghost search hits)', () => {
    const r = seedRun('mirror consistency probe run');
    const hypId = seedHypothesis(r.runId, 'ghostbuster marker for mirror consistency');
    expect(app.store.searchText('ghostbuster', { questions: 0, hypotheses: 5, claims: 0 }).hypotheses).toHaveLength(1);
    expect(app.store.deleteObject('hypothesis', hypId)).toBe(true);
    expect(app.store.searchText('ghostbuster', { questions: 0, hypotheses: 5, claims: 0 }).hypotheses).toHaveLength(0);
  });
});

describe('run deletion: HTTP contract', () => {
  it('404 for an unknown run', async () => {
    const res = await del('run_doesnotexist0000000000');
    expect(res.status).toBe(404);
    const body = await res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('not_found');
  });

  it('409 run_active while the run is running; delete works after it settles', async () => {
    const r = seedRun('active run refuses deletion until settled');
    const run = app.store.getRun(r.runId)!;
    run.status = 'running';
    app.store.updateRun(run);

    const refused = await del(r.runId);
    expect(refused.status).toBe(409);
    const body = await refused.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('run_active');
    expect(app.store.getRun(r.runId)).not.toBeNull();

    run.status = 'failed';
    run.lastError = 'settled for test';
    app.store.updateRun(run);
    const ok = await del(r.runId);
    expect(ok.status).toBe(200);
    const deleted = await ok.json() as { ok?: boolean; deleted?: { events: number } };
    expect(deleted.ok).toBe(true);
    expect(deleted!.deleted!.events).toBeGreaterThanOrEqual(1);
    expect(app.store.getRun(r.runId)).toBeNull();
    // Second delete of the same id is an honest 404, not a silent re-ok.
    expect((await del(r.runId)).status).toBe(404);
  });

  it('detaches the run id from conversations that referenced it (conversations survive)', async () => {
    const r = seedRun('referenced by a conversation that must survive');
    const conv = createConversation(app, { title: 'deletion reference test' });
    attachRunToConversation(app, conv.id, r.runId);
    expect(listConversations(app).find((c) => c.id === conv.id)?.runIds).toContain(r.runId);

    const res = await del(r.runId);
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted?: { conversationsUpdated?: number } };
    expect(body!.deleted!.conversationsUpdated).toBe(1);

    const after = listConversations(app).find((c) => c.id === conv.id);
    expect(after).toBeDefined();
    expect(after!.runIds).not.toContain(r.runId);
  });
});
