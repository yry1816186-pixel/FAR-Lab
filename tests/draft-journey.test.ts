import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';

/**
 * HX §8.2 pre-launch journey contract: draft:true persists a run WITHOUT
 * starting it; POST /runs/:id/scope-proposal executes ONLY the scope stage
 * (receipt-backed, real orchestrator) and parks the run at 'paused' so the
 * researcher sees/edits the refined scope BEFORE launch; PATCH
 * /runs/:id/question edits the question pre-launch (409 after launch — the
 * causal revision chain owns post-launch corrections); POST /runs/:id/resume
 * launches the remainder. Guards: scope-proposal 409s on launched runs,
 * 502-with-reason when scope fails, PATCH validation.
 */

// Test-only response shape (mirrors tests/api.test.ts): the HTTP layer's JSON
// is heterogeneous by design; narrowing happens at each assertion.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;
const postJson = (url: string, body: unknown, method = 'POST'): Promise<{ status: number; body: Json }> =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }));
/* eslint-enable @typescript-eslint/no-explicit-any */

const SCOPE_JSON = JSON.stringify({
  domain: 'exercise physiology',
  phenomena: ['insulin sensitivity adaptation', 'skeletal muscle glucose uptake'],
  inScope: ['older adults >= 65', 'resistance interventions'],
  outOfScope: ['pharmacological interventions', 'type 1 diabetes'],
  goalType: 'interventional',
  constraints: {
    assumptions: [],
    dataConstraints: ['human trials only'],
    resourceConstraints: [],
    ethicalConstraints: [],
    methodologicalConstraints: [],
  },
});
const PROBLEM_MODEL_JSON = JSON.stringify({
  objectives: [{ statement: 'Quantify insulin-sensitivity adaptation to resistance training in older adults' }],
  variables: [
    { name: 'insulin sensitivity', role: 'dependent', unit: 'mg/(mL·min)', valueType: 'numeric' },
    { name: 'resistance training dose', role: 'independent', valueType: 'ordinal' },
  ],
  formalization: { problemClass: 'none_stated', governingRelations: [], boundaryConditions: [], wellPosednessNotes: [] },
  dataInventory: [{ name: 'human trials', kind: 'retrieved_literature', accessState: 'available' }],
  statisticalPremises: { assumptions: [], causalClaims: [] },
  metrics: [],
  stopConditions: ['decision rule evaluated once on the assembled trials'],
  unknowns: [{ statement: 'dose-response shape beyond binary trained/untrained', blocking: false }],
  methodSelections: [{
    forObjective: 1,
    candidates: [
      { family: 'retrieval_synthesis', assessment: 'selected', rationale: 'the objective is trial-evidence synthesis', validationPlan: 'verbatim claim binding with counter-evidence search' },
      { family: 'machine_learning', assessment: 'rejected_inappropriate', rationale: 'no labeled tabular dataset covering the population' },
    ],
  }],
});

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;
const executorCalls: Array<{ runId: string; opts?: { stopAfter?: string } }> = [];

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-draft-'));
  app = await createApp({
    dataDir: tmp,
    // asLive: this stub stands in for a LIVE route's scope analysis (the §8.2
    // journey rides the real orchestrator, where test-stamped scientific output
    // is refused by the real-content discipline — the offline wire's template
    // refusal is asserted in offline-dev-run.test.ts instead).
    providerOverride: createTestStubProvider([
      { rawOutput: SCOPE_JSON, forPurpose: 'scope-refinement' },
      { rawOutput: PROBLEM_MODEL_JSON, forPurpose: 'problem-model-formation' },
    ], { asLive: true }),
  });
  // Real orchestrator for the scoped proposal pass (receipt-backed scope stage
  // over the scripted provider); the full-launch branch completes the run like
  // the api.test.ts seam — the draft contract under test is the HTTP journey,
  // not stage mechanics (covered elsewhere).
  const executor = async (runId: string, opts?: { stopAfter?: string }): Promise<unknown> => {
    executorCalls.push({ runId, opts });
    if (opts?.stopAfter !== undefined) {
      return app.orchestrator.execute(runId, opts);
    }
    const run = app.store.getRun(runId);
    if (run) {
      const now = new Date().toISOString();
      for (const s of run.stages) {
        s.state = 'done';
        s.endedAt = now;
      }
      run.status = 'completed';
      app.store.updateRun(run);
    }
    return null;
  };
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('§8.2 draft journey', () => {
  let draftId = '';
  let launchedId = '';

  it('draft:true creates a persisted run that does NOT start (status created, no execution)', async () => {
    const res = await postJson(`${base}/api/v1/runs`, {
      text: 'Does resistance training improve insulin sensitivity in older adults?',
      draft: true,
    });
    expect(res.status).toBe(202);
    expect(res.body.draft).toBe(true);
    draftId = res.body.runId;
    expect(executorCalls.filter((c) => c.runId === draftId)).toHaveLength(0);
    expect(app.store.getRun(draftId)?.status).toBe('created');
    const ev = app.store.listEvents(draftId).find((e) => e.detail?.reason === 'run_created_draft');
    expect(ev).toBeDefined();
  });

  it('scope-proposal runs ONLY the scope stage, parks the run at paused, returns the refined question', async () => {
    const res = await postJson(`${base}/api/v1/runs/${draftId}/scope-proposal`, {});
    expect(res.status).toBe(200);
    expect(res.body.question.scope.domain).toBe('exercise physiology');
    expect(res.body.question.scope.phenomena).toContain('skeletal muscle glucose uptake');
    expect(res.body.question.goalType).toBe('interventional');
    expect(res.body.next.edit).toBe('PATCH /runs/:id/question');
    const run = app.store.getRun(draftId)!;
    expect(run.status).toBe('paused'); // parked — watchdog can never auto-adopt
    expect(run.stages.find((s) => s.stage === 'scope')?.state).toBe('done');
    expect(run.stages.find((s) => s.stage === 'retrieve')?.state).toBe('pending');
    // crash-guard lifecycle: the pre-execution 'parking:*' tag is cleared by the park
    expect(run.tags.some((t) => String(t).startsWith('parking:'))).toBe(false);
    // receipt-backed: the scope model call has provenance in this run
    expect(app.store.listObjects('receipt', draftId).length).toBeGreaterThan(0);
    expect(executorCalls.find((c) => c.runId === draftId)?.opts?.stopAfter).toBe('retrieve');
  });

  it('PATCH question edits the pre-launch scope with audit; the stored question changes verbatim', async () => {
    const res = await postJson(`${base}/api/v1/runs/${draftId}/question`, {
      scope: { phenomena: ['insulin sensitivity in older adults (edited)'], outOfScope: ['cross-sectional designs'] },
    }, 'PATCH');
    expect(res.status).toBe(200);
    expect(res.body.changedFields).toEqual(expect.arrayContaining(['scope.phenomena', 'scope.outOfScope']));
    const q = app.store.getObject('question', app.store.getRun(draftId)!.questionId)!;
    expect(q.scope.phenomena).toEqual(['insulin sensitivity in older adults (edited)']);
    const ev = app.store.listEvents(draftId).find((e) => e.detail?.reason === 'question_edited_human');
    expect(ev?.detail).toMatchObject({ actor: 'human', changedFields: expect.arrayContaining(['scope.phenomena']) });
    // 400: nothing editable
    const empty = await postJson(`${base}/api/v1/runs/${draftId}/question`, {}, 'PATCH');
    expect(empty.status).toBe(400);
    // 400: bad goalType
    const badGoal = await postJson(`${base}/api/v1/runs/${draftId}/question`, { goalType: 'revolutionary' }, 'PATCH');
    expect(badGoal.status).toBe(400);
  });

  it('resume launches the remainder of the draft (execution starts, run leaves paused)', async () => {
    const res = await postJson(`${base}/api/v1/runs/${draftId}/resume`, {});
    expect(res.status).toBe(202);
    const full = executorCalls.filter((c) => c.runId === draftId && c.opts === undefined);
    expect(full.length).toBeGreaterThanOrEqual(1);
    expect(app.store.getRun(draftId)?.status).toBe('completed'); // test executor completes it
  });

  it('post-launch: PATCH question and scope-proposal both 409 already_launched', async () => {
    const patch = await postJson(`${base}/api/v1/runs/${draftId}/question`, { text: 'too late' }, 'PATCH');
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe('already_launched');
    const prop = await postJson(`${base}/api/v1/runs/${draftId}/scope-proposal`, {});
    expect(prop.status).toBe(409);
    expect(prop.body.error.code).toBe('already_launched');
  });

  it('resume refuses truthfully (409 lease_held) when a foreign process owns the run — no silent 202 no-op', async () => {
    // The pre-fix behavior: the lease check happened inside the async execution AFTER
    // the 202, so a cross-process resume was accepted and then silently never ran
    // (stderr only). The 409 must carry the holder and expiry so the caller knows
    // when the lease becomes reclaimable.
    const created = await postJson(`${base}/api/v1/runs`, { text: 'Foreign lease probe question for resume semantics?', draft: true });
    expect(created.status).toBe(202);
    const runId = created.body.runId as string;
    const until = new Date(Date.now() + 60_000).toISOString();
    expect(app.store.acquireLease(runId, 'proc-other-test', until)).toBe(true);
    const res = await postJson(`${base}/api/v1/runs/${runId}/resume`, {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('lease_held');
    expect(res.body.error.message).toContain('proc-other-test');
    expect(res.body.error.message).toContain(until);
    expect(executorCalls.filter((c) => c.runId === runId)).toHaveLength(0); // never accepted
    // expired/released foreign lease: reclaimable — resume proceeds (202, execution starts)
    app.store.releaseLease(runId, 'proc-other-test');
    expect(app.store.getRunLease(runId).holder).toBeNull();
    const res2 = await postJson(`${base}/api/v1/runs/${runId}/resume`, {});
    expect(res2.status).toBe(202);
    expect(executorCalls.filter((c) => c.runId === runId && c.opts === undefined)).toHaveLength(1);
  });

  it('non-draft POST auto-starts (regression: existing journey unchanged)', async () => {
    const res = await postJson(`${base}/api/v1/runs`, { text: 'A normal immediate launch question' });
    expect(res.status).toBe(202);
    expect(res.body.draft).toBeUndefined();
    launchedId = res.body.runId;
    expect(executorCalls.filter((c) => c.runId === launchedId && c.opts === undefined)).toHaveLength(1);
  });

  it('scope-proposal 502s with scope_proposal_failed when the scope stage fails (fail-visible, no fabricated proposal)', async () => {
    // New draft whose scripted scope call FAILS (provider error surfaces in stage state).
    const badApp = await createApp({
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-draft-bad-')),
      providerOverride: createTestStubProvider([{ fail: { kind: 'http_error', message: 'scripted scope failure' } }]),
    });
    const badApi = createApiServer(badApp, {
      port: 0,
      executor: (runId, opts) => badApp.orchestrator.execute(runId, opts),
      staticRoot: path.join(tmp, 'no-web-dist'),
    });
    const badPort = await badApi.start();
    try {
      const mk = await postJson(`http://127.0.0.1:${badPort}/api/v1/runs`, { text: 'Question whose scope fails', draft: true });
      const res = await postJson(`http://127.0.0.1:${badPort}/api/v1/runs/${mk.body.runId}/scope-proposal`, {});
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('scope_proposal_failed');
      expect(res.body.error.message).toContain('scripted scope failure');
    } finally {
      await badApi.stop();
      badApp.close();
    }
  });

  it('question edits stay schema-valid end-to-end (constraints path)', async () => {
    const mk = await postJson(`${base}/api/v1/runs`, { text: 'Draft for constraints editing', draft: true });
    const id = mk.body.runId as string;
    const res = await postJson(`${base}/api/v1/runs/${id}/question`, {
      text: 'Edited: Does resistance training improve insulin sensitivity in older adults, mechanically?',
      constraints: { assumptions: ['trainability is preserved at 70+'], dataConstraints: [], resourceConstraints: [], ethicalConstraints: [], methodologicalConstraints: ['randomized designs preferred'] },
      scope: { domain: 'gerontology' },
    }, 'PATCH');
    expect(res.status).toBe(200);
    expect(res.body.changedFields).toEqual(expect.arrayContaining(['text', 'constraints', 'scope.domain']));
    const q = app.store.getObject('question', app.store.getRun(id)!.questionId)!;
    expect(q.text).toContain('mechanically');
    expect(q.constraints.assumptions).toEqual(['trainability is preserved at 70+']);
    expect(q.scope.domain).toBe('gerontology');
    // invalid constraints shape -> 400 with path detail
    const bad = await postJson(`${base}/api/v1/runs/${id}/question`, { constraints: { assumptions: 'not-an-array' } }, 'PATCH');
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('constraints');
    // research-question remains parseable through the domain schema (single owner)
    expect(() => ResearchQuestion.parse({ ...q, id: newId('q'), createdAt: new Date().toISOString() })).not.toThrow();
  });
});

