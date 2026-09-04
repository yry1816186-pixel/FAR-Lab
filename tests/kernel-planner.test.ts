import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { contestednessOf, kernelPlanRevisionFor } from '../src/kernel/planner.js';
import { defaultWorkflow } from '../src/domain/workflow-plan.js';
import { ScientificProblemModel, ResearchQuestion, newId, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';
import type { KernelCapabilityPlane } from '../src/kernel/capability-plane.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-planner-'));
const noSource: (f: SourceFamily) => SourceAdapter = () => {
  throw new Error('no source adapter in this test');
};

const makeRun = (store: Store): { runId: string; questionId: string } => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { runId: run.id, questionId: q.id };
};

/** Minimal valid problem model; causalClaims controls the contestedness trigger. */
const seedProblemModel = (store: Store, runId: string, questionId: string, causalClaims: string[]) => {
  store.putObject('problem_model', ScientificProblemModel.parse({
    id: newId('pmod'), runId, questionId,
    objectives: [{ id: 'obj1', statement: 'explain the contested mechanism' }],
    formalization: { problemClass: 'phenomenon_explanation' },
    statisticalPremises: { causalClaims },
    stopConditions: ['at least one discriminating observation'],
    provenance: { formedBy: 'model_proposed' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
};

describe('kernel planner v1 (deterministic contestedness)', () => {
  it('contestednessOf: absent model / weak premises / contested premises', () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const { runId, questionId } = makeRun(store);
    expect(contestednessOf(store, runId)).toEqual({ contested: false, hasProblemModel: false, governingRelations: 0, causalClaims: 0 });
    seedProblemModel(store, runId, questionId, ['A influences B']);
    expect(contestednessOf(store, runId).contested).toBe(false);
    seedProblemModel(store, runId, questionId, ['A influences B', 'C gates A->B']);
    expect(contestednessOf(store, runId)).toMatchObject({ contested: true, causalClaims: 2 });
  });

  it('kernelPlanRevisionFor: null when not contested; revised chain when contested; idempotent', () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const { runId, questionId } = makeRun(store);
    const plan = defaultWorkflow(runId);
    expect(kernelPlanRevisionFor(store, runId, plan)).toBeNull();

    seedProblemModel(store, runId, questionId, ['A influences B', 'C gates A->B']);
    const revised = kernelPlanRevisionFor(store, runId, plan);
    expect(revised).not.toBeNull();
    expect(revised!.origin).toBe('kernel');
    expect(revised!.version).toBe(2);
    expect(revised!.revisedFrom).toBe(plan.id);
    const rankIdx = revised!.steps.findIndex((s) => s.kind === 'stage' && s.target === 'rank');
    const debate = revised!.steps[rankIdx + 1]!;
    expect(debate.kind).toBe('agent');
    if (debate.kind === 'agent') expect(debate.target).toBe('counter-evidence-debate');
    // follower's dependency is re-pointed through the debate step
    const follower = revised!.steps[rankIdx + 2]!;
    expect(follower.after).toEqual([debate.id]);
    // every original stage is still present exactly once
    expect(revised!.steps.filter((s) => s.kind === 'stage').map((s) => s.target)).toEqual([...STAGE_ORDER]);
    // idempotent: a kernel-origin plan is never revised again
    expect(kernelPlanRevisionFor(store, runId, revised!)).toBeNull();
  });
});

describe('orchestrator: kernel plan revision at rank', () => {
  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });

  it('contested problem: rank triggers workflow_plan_revised + debate runs before plan', async () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const { runId, questionId } = makeRun(store);
    seedProblemModel(store, runId, questionId, ['A influences B', 'C gates A->B']);
    const calls: string[] = [];
    const plane: KernelCapabilityPlane = {
      runCapability: async (name) => {
        calls.push(name);
        return { ok: true, status: 'completed' as const, turns: 1, sessionId: 'ags_t', reportId: 'agr_t' };
      },
      runAgent: async () => { throw new Error('not used'); },
    };
    const after = await new Orchestrator({
      store, artifacts: {} as ArtifactStore, provider: {} as ModelProvider,
      sourceFor: noSource, stages: new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as [RunStageName, StageHandler])),
      signals: new Map(), kernelPlane: () => plane,
    }).execute(runId);
    expect(after.status).toBe('completed');
    expect(calls).toEqual(['counter-evidence-debate']);
    const events = store.listEvents(runId);
    const reasons = events.map((e) => (e.detail as { reason?: unknown })?.reason);
    expect(reasons).toContain('workflow_plan_revised');
    const rankDone = events.findIndex((e) => e.type === 'stage_done' && e.stage === 'rank');
    const agentDone = events.findIndex((e) => (e.detail as { reason?: unknown })?.reason === 'agent_step_done');
    const planStarted = events.findIndex((e) => e.type === 'stage_started' && e.stage === 'plan');
    expect(agentDone).toBeGreaterThan(rankDone);
    expect(planStarted).toBeGreaterThan(agentDone);
    // the revised plan is persisted and is the latest
    const plans = store.listObjects('workflow_plan', runId);
    expect(plans.at(-1)?.origin).toBe('kernel');
  });

  it('uncontested problem: no revision, no debate, default plan completes', async () => {
    const dir = tmp();
    const store = new Store(openDb(path.join(dir, 'far.db')));
    const { runId, questionId } = makeRun(store);
    seedProblemModel(store, runId, questionId, ['A influences B']); // single causal claim — not contested
    const calls: string[] = [];
    const plane: KernelCapabilityPlane = {
      runCapability: async (name) => {
        calls.push(name);
        return { ok: true, status: 'completed' as const, turns: 1, sessionId: 'ags_t', reportId: 'agr_t' };
      },
      runAgent: async () => { throw new Error('not used'); },
    };
    const after = await new Orchestrator({
      store, artifacts: {} as ArtifactStore, provider: {} as ModelProvider,
      sourceFor: noSource, stages: new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as [RunStageName, StageHandler])),
      signals: new Map(), kernelPlane: () => plane,
    }).execute(runId);
    expect(after.status).toBe('completed');
    expect(calls).toEqual([]);
    const reasons = store.listEvents(runId).map((e) => (e.detail as { reason?: unknown })?.reason);
    expect(reasons).not.toContain('workflow_plan_revised');
  });
});
