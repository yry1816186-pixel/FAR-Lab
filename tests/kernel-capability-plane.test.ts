import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { createRunKernelPlane, type KernelCapabilityPlane, type RunKernelPlaneDeps } from '../src/kernel/capability-plane.js';
import { resolveKernelCapability, KERNEL_CAPABILITY_NAMES } from '../src/kernel/capabilities/registry.js';
import { defaultWorkflow, WorkflowPlanSchema } from '../src/domain/workflow-plan.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import { ResearchQuestion, newId, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';
import type { ReceiptSink } from '../src/agent/protocol.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-kplane-'));
const openStore = (dir: string) => new Store(openDb(path.join(dir, 'far.db')));

const noSource: (f: SourceFamily) => SourceAdapter = () => {
  throw new Error('no source adapter in this test');
};

const finishDebate = JSON.stringify({
  action: 'finish', reason: 'review complete',
  result: {
    verdicts: [{ hypothesisId: 'hyp_1', verdict: 'insufficient_evidence', counterFindings: [], uncertainties: ['no literature found'] }],
    discriminatingObservations: [],
    honestLimits: 'stub provider; mechanics test only',
  },
});

describe('kernel capability plane', () => {
  it('registry exposes counter-evidence-debate with a parseable result schema', () => {
    expect(KERNEL_CAPABILITY_NAMES).toContain('counter-evidence-debate');
    const spec = resolveKernelCapability('counter-evidence-debate');
    expect(spec).toBeDefined();
    expect(() => spec!.resultSchema.parse(JSON.parse(finishDebate).result)).not.toThrow();
  });

  it('runCapability with an unknown name fails visibly without touching the loop', async () => {
    const dir = tmp();
    const store = openStore(dir);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const deps: RunKernelPlaneDeps = {
      provider: {} as ModelProvider, store, runId: run.id, integrations: [],
      sourceFor: noSource, recordReceipt: () => {}, rolloutDir: dir,
    };
    const out = await createRunKernelPlane(deps).runCapability('does-not-exist');
    expect(out.ok).toBe(false);
    expect(out.error).toContain('unknown kernel capability');
    expect(out.reportId).toBeNull();
  });

  it('runCapability runs the real loop with a stub provider and persists session + report', async () => {
    const dir = tmp();
    const store = openStore(dir);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const receipts: Parameters<ReceiptSink>[0][] = [];
    const deps: RunKernelPlaneDeps = {
      provider: createTestStubProvider([{ rawOutput: finishDebate }]),
      store, runId: run.id, integrations: [],
      sourceFor: noSource,
      recordReceipt: (r) => { receipts.push(r); },
      rolloutDir: path.join(dir, 'agent-sessions'),
    };
    const out = await createRunKernelPlane(deps).runCapability('counter-evidence-debate');
    expect(out.ok).toBe(true);
    expect(out.status).toBe('completed');
    expect(out.reportId).not.toBeNull();
    const session = store.listObjects('agent_session', run.id).find((s) => s.id === out.sessionId);
    expect(session?.status).toBe('completed');
    expect(session?.capability).toBe('counter-evidence-debate');
    const report = store.listObjects('agent_report', run.id).find((r) => r.id === out.reportId);
    expect(report).toBeDefined();
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    expect(receipts.every((r) => r.kind === 'model_call')).toBe(true);
  });

  it('runCapability bridges the persisted cancelRequested flag into the loop (external cancels stop agent steps)', async () => {
    const dir = tmp();
    const store = openStore(dir);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const persisted = store.getRun(run.id)!;
    persisted.cancelRequested = true; // an external (other-process) cancel
    store.updateRun(persisted);
    const deps: RunKernelPlaneDeps = {
      provider: createTestStubProvider([{ rawOutput: finishDebate }]),
      store, runId: run.id, integrations: [],
      sourceFor: noSource,
      recordReceipt: () => {},
      rolloutDir: path.join(dir, 'agent-sessions'),
    };
    const out = await createRunKernelPlane(deps).runCapability('counter-evidence-debate');
    expect(out.status).toBe('aborted');
    expect(out.ok).toBe(false);
    const session = store.listObjects('agent_session', run.id).find((s) => s.id === out.sessionId);
    expect(session?.status).toBe('cancelled');
  });
});

describe('orchestrator: agent-kind workflow steps', () => {
  const makeRun = (store: Store) => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    return store.createRun(q);
  };
  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });
  const okStages = () => new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as [RunStageName, StageHandler]));

  const planWithDebate = (runId: string) => {
    const plan = defaultWorkflow(runId);
    const rankIdx = plan.steps.findIndex((s) => s.kind === 'stage' && s.target === 'rank');
    const steps = [...plan.steps];
    steps.splice(rankIdx + 1, 0, {
      id: 'debate1', kind: 'agent' as const, target: 'counter-evidence-debate',
      after: [plan.steps[rankIdx]!.id], completion: { kind: 'agent_result_ok' as const }, attemptCap: 1,
    });
    return WorkflowPlanSchema.parse({ ...plan, steps });
  };

  it('executes the agent step between rank and plan, with audit events, then completes the run', async () => {
    const dir = tmp();
    const store = openStore(dir);
    const run = makeRun(store);
    store.putObject('workflow_plan', planWithDebate(run.id));
    const calls: string[] = [];
    const plane: KernelCapabilityPlane = {
      runCapability: async (name) => {
        calls.push(name);
        return { ok: true, status: 'completed' as const, turns: 1, sessionId: 'ags_test', reportId: 'agr_test' };
      },
      runAgent: async () => { throw new Error('not used in this test'); },
    };
    const after = await new Orchestrator({
      store, artifacts: {} as ArtifactStore, provider: {} as ModelProvider,
      sourceFor: noSource, stages: okStages(), signals: new Map(),
      kernelPlane: () => plane,
    }).execute(run.id);

    expect(after.status).toBe('completed');
    expect(after.stages.every((s) => s.state === 'done')).toBe(true); // agent steps never touch stage records
    expect(calls).toEqual(['counter-evidence-debate']);
    const events = store.listEvents(run.id);
    const reasons = events.map((e) => (e.detail as { reason?: unknown })?.reason);
    expect(reasons).toContain('agent_step_started');
    expect(reasons).toContain('agent_step_done');
    const rankDone = events.findIndex((e) => e.type === 'stage_done' && e.stage === 'rank');
    const agentStarted = events.findIndex((e) => e.detail.reason === 'agent_step_started');
    const planStarted = events.findIndex((e) => e.type === 'stage_started' && e.stage === 'plan');
    expect(rankDone).toBeGreaterThanOrEqual(0);
    expect(agentStarted).toBeGreaterThan(rankDone);
    expect(planStarted).toBeGreaterThan(agentStarted);
    const done = events.find((e) => (e.detail as { reason?: unknown })?.reason === 'agent_step_done')?.detail as { reportId?: string };
    expect(done?.reportId).toBe('agr_test');
  });

  it('without a plane, the agent step is skipped honestly with an audit event and the run still completes', async () => {
    const dir = tmp();
    const store = openStore(dir);
    const run = makeRun(store);
    store.putObject('workflow_plan', planWithDebate(run.id));
    const after = await new Orchestrator({
      store, artifacts: {} as ArtifactStore, provider: {} as ModelProvider,
      sourceFor: noSource, stages: okStages(), signals: new Map(),
    }).execute(run.id);
    expect(after.status).toBe('completed');
    const reasons = store.listEvents(run.id).map((e) => (e.detail as { reason?: unknown })?.reason);
    expect(reasons).toContain('agent_step_unavailable');
  });
});
