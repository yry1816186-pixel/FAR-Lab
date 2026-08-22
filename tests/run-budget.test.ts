import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator, BUDGET_EXHAUSTED_REASON } from '../src/app/orchestrator.js';
import {
  makeRunBudget,
  runTokenBudgetCap,
  spentTokensForRun,
  RunBudgetExhaustedError,
} from '../src/app/run-budget.js';
import { callStructured } from '../src/pipeline/llm.js';
import { ResearchQuestion, newId, ProvenanceReceipt, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageContext, StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';

/**
 * BP-1 run-budget governance. All fixtures are in-memory/scripted; no network.
 * Behavioral assertions: refuse-new-calls, honest boundary skips, export always
 * runs, resume-with-raised-cap reopens exactly the budget-skipped stages.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-budget-'));

const HASH64 = 'a'.repeat(64);

const receiptWithUsage = (runId: string, totalTokens: number) =>
  ProvenanceReceipt.parse({
    id: newId('rcp'),
    runId,
    kind: 'model_call',
    executionMode: 'test',
    at: new Date().toISOString(),
    stage: 'scope',
    modelCall: {
      provider: 'test-stub',
      modelId: 'stub-model',
      usage: { promptTokens: 10, completionTokens: totalTokens - 10, totalTokens },
      latencyMs: 5,
      requestHash: HASH64,
      outputHash: HASH64,
    },
  });

describe('run-budget unit semantics', () => {
  it('env cap parses positive integers and rejects garbage as unlimited', () => {
    expect(runTokenBudgetCap({} as NodeJS.ProcessEnv)).toBeNull();
    expect(runTokenBudgetCap({ FARLAB_RUN_TOKEN_BUDGET: '' } as NodeJS.ProcessEnv)).toBeNull();
    expect(runTokenBudgetCap({ FARLAB_RUN_TOKEN_BUDGET: 'abc' } as NodeJS.ProcessEnv)).toBeNull();
    expect(runTokenBudgetCap({ FARLAB_RUN_TOKEN_BUDGET: '-5' } as NodeJS.ProcessEnv)).toBeNull();
    expect(runTokenBudgetCap({ FARLAB_RUN_TOKEN_BUDGET: '1000' } as NodeJS.ProcessEnv)).toBe(1000);
  });

  it('unlimited budget always has remaining; capped budget depletes via spend', () => {
    const unlimited = makeRunBudget({ listObjects: () => [] } as unknown as Store, 'run_x', null);
    expect(unlimited.cap).toBeNull();
    expect(unlimited.hasRemaining()).toBe(true);
    expect(unlimited.remaining()).toBeNull();
    expect(unlimited.nearLimit()).toBe(false);

    const capped = makeRunBudget({ listObjects: () => [] } as unknown as Store, 'run_x', 100);
    expect(capped.spent).toBe(0);
    expect(capped.hasRemaining()).toBe(true);
    expect(capped.nearLimit()).toBe(false);
    capped.spend(80);
    expect(capped.spent).toBe(80);
    expect(capped.hasRemaining()).toBe(true);
    expect(capped.nearLimit()).toBe(true); // >=80% of 100
    expect(capped.remaining()).toBe(20);
    capped.spend(25);
    expect(capped.hasRemaining()).toBe(false);
    expect(capped.remaining()).toBe(0); // never negative
    capped.spend(undefined); // missing usage is a no-op, not NaN
    expect(capped.spent).toBe(105);
  });

  it('spend is re-derived from persisted receipts (receipts are the only authority)', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    store.putObject('receipt', receiptWithUsage(run.id, 300));
    store.putObject('receipt', receiptWithUsage(run.id, 200));
    expect(spentTokensForRun(store, run.id)).toBe(500);
    const budget = makeRunBudget(store, run.id, 600);
    expect(budget.spent).toBe(500);
    expect(budget.remaining()).toBe(100);
    db.close();
  });
});

describe('callStructured budget gate', () => {
  it('refuses a new model call before touching the provider when the budget is spent', async () => {
    const provider: ModelProvider = {
      async structuredCall() {
        throw new Error('provider must not be called when the budget is exhausted');
      },
    };
    const ctx = {
      run: { id: 'run_test_budget_gate_1' },
      provider,
      recordReceipt: () => {},
      budget: makeRunBudget({ listObjects: () => [] } as unknown as Store, 'run_test_budget_gate_1', 100),
    } as unknown as StageContext;
    // pre-spend the cap
    ctx.budget!.spend(100);
    await expect(
      callStructured(ctx, {
        stage: 'scope',
        purpose: 'test',
        systemPrompt: 's',
        payload: {},
        schema: (await import('zod')).z.object({ ok: (await import('zod')).z.boolean() }),
      }),
    ).rejects.toBeInstanceOf(RunBudgetExhaustedError);
  });
});

describe('orchestrator budget boundary behavior', () => {
  const prevCap = process.env.FARLAB_RUN_TOKEN_BUDGET;
  afterEach(() => {
    if (prevCap === undefined) delete process.env.FARLAB_RUN_TOKEN_BUDGET;
    else process.env.FARLAB_RUN_TOKEN_BUDGET = prevCap;
  });

  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });

  const buildOrchestrator = (store: Store, stages: Map<RunStageName, StageHandler>) =>
    new Orchestrator({
      store,
      artifacts: {} as ArtifactStore,
      provider: {} as ModelProvider,
      sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('no source adapter'); }),
      stages,
      signals: new Map(),
    });

  it('spent cap skips remaining stages honestly, export still runs, resume reopens them', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    // pre-seed spend beyond a 1000-token cap: scope and retrieve already "consumed" it
    store.putObject('receipt', receiptWithUsage(run.id, 800));
    store.putObject('receipt', receiptWithUsage(run.id, 300));
    process.env.FARLAB_RUN_TOKEN_BUDGET = '1000';

    const planCalls: string[] = [];
    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'plan'
          ? {
              stage,
              applicable: async () => true,
              execute: async () => { planCalls.push('plan'); return { kind: 'done', summary: 'plan done' }; },
            }
          : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);
    const after = await orch.execute(run.id);

    // scope/retrieve ran (done), everything model-bearing after them is budget-skipped
    expect(after.status).toBe('completed'); // honest completion of a partial-but-bounded run
    const rec = (s: RunStageName) => after.stages.find((x) => x.stage === s);
    expect(rec('verify_sources')?.state).toBe('skipped');
    expect(rec('verify_sources')?.error?.startsWith(BUDGET_EXHAUSTED_REASON)).toBe(true);
    expect(rec('plan')?.state).toBe('skipped');
    expect(planCalls).toEqual([]); // boundary skip never invokes the handler
    expect(rec('export')?.state).toBe('done'); // export is never budget-gated
    // events tell the same story
    const skipEvents = store.listEvents(run.id).filter((e) => e.type === 'stage_skipped' && e.stage === 'plan');
    expect(skipEvents[0]?.detail.reason).toBe(BUDGET_EXHAUSTED_REASON);

    // resume with a raised cap reopens exactly the budget-skipped stages
    process.env.FARLAB_RUN_TOKEN_BUDGET = '100000';
    const afterResume = await orch.execute(run.id);
    expect(afterResume.status).toBe('completed');
    expect(afterResume.stages.find((x) => x.stage === 'plan')?.state).toBe('done');
    expect(planCalls).toEqual(['plan']);
    expect(store.listEvents(run.id).some((e) => e.type === 'note' && e.detail.reason === 'budget_skip_reopened')).toBe(true);
    db.close();
  });

  it('mid-stage exhaustion records an operational skip, not a failure, and the run completes', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    process.env.FARLAB_RUN_TOKEN_BUDGET = '100000';

    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'generate_hypotheses'
          ? {
              stage,
              applicable: async () => true,
              execute: async (ctx) => {
                // mirror callStructured's real sequence: spend first, then the NEXT
                // call's pre-check refuses — so the orchestrator sees an exhausted view
                ctx.budget?.spend(100000);
                throw new RunBudgetExhaustedError(run.id, 100000, 100000);
              },
            }
          : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);
    const after = await orch.execute(run.id);

    expect(after.status).toBe('completed');
    const genRec = after.stages.find((x) => x.stage === 'generate_hypotheses');
    expect(genRec?.state).toBe('skipped');
    expect(genRec?.error?.startsWith(BUDGET_EXHAUSTED_REASON)).toBe(true);
    // downstream stages boundary-skipped, export still done
    expect(after.stages.find((x) => x.stage === 'rank')?.state).toBe('skipped');
    expect(after.stages.find((x) => x.stage === 'export')?.state).toBe('done');
    const skipDetail = store.listEvents(run.id).find((e) => e.type === 'stage_skipped' && e.stage === 'generate_hypotheses')?.detail;
    expect(skipDetail?.midStage).toBe(true);
    db.close();
  });
});
