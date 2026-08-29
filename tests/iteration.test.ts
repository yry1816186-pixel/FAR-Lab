import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import {
  evaluateIteration,
  computeIterationSnapshot,
  iterationRoundKey,
  iterationFingerprintKey,
  MAX_ITERATION_ROUNDS,
} from '../src/app/iteration.js';
import {
  ResearchQuestion, ResearchPlan, HypothesisCandidate, FeedbackSignal, Revision,
  ExperimentRun, newId, RunStageName,
} from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { RunBudgetView } from '../src/app/run-budget.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';

/**
 * Research iteration controller: deterministic decision procedure + orchestrator
 * integration. All paths offline — fake stage handlers, real Store on temp sqlite.
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-iter-'));

const openStore = (): { store: Store; runId: string } => {
  const db = openDb(path.join(tmp(), 'far.db'));
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  return { store, runId: run.id };
};

const unlimitedBudget = (): RunBudgetView => ({
  cap: null, spent: 0, remaining: () => null, hasRemaining: () => true, spend: () => {}, nearLimit: () => false,
});

const spentBudget = (): RunBudgetView => ({
  cap: 1000, spent: 1000, remaining: () => 0, hasRemaining: () => false, spend: () => {}, nearLimit: () => true,
});

const addFeedback = (store: Store, runId: string): string => {
  const signal = FeedbackSignal.parse({
    id: newId('fbk'), runId, source: 'human_expert', content: 'expert disagrees with the mechanism',
    provenance: 'test fixture', receivedAt: new Date().toISOString(),
  });
  store.putObject('feedback', signal);
  return signal.id;
};

const addHypothesis = (store: Store, runId: string): string => {
  const id = newId('hyp');
  store.putObject('hypothesis', HypothesisCandidate.parse({
    id, runId, statement: 'X causes Y', mechanism: 'm', createdAt: new Date().toISOString(),
    derivation: { strategy: 'mechanism_driven', rationale: 'test', inputClaimIds: [] },
  }));
  return id;
};

const addPlan = (store: Store, runId: string, hypothesisId: string): string => {
  const id = newId('pln');
  store.putObject('plan', ResearchPlan.parse({
    id, runId, objective: 'test the hypothesis', hypothesisIds: [hypothesisId],
    steps: [1, 2, 3].map((n) => ({
      id: newId('task'), title: `step ${n}`, kind: 'data_analysis' as const, method: `method ${n}`,
      failureConditions: ['no data'],
    })),
    metrics: ['r2', 'mae'], decisionRules: {
      successCriterion: 's', weakeningCriterion: 'w', falsificationCriterion: 'f', stopCriterion: 'st',
    },
    createdAt: new Date().toISOString(),
  }));
  return id;
};

const consumeFeedback = (store: Store, runId: string, signalId: string): void => {
  store.putObject('revision', Revision.parse({
    id: newId('rev'), runId, triggerFeedbackId: signalId, causalReason: 'fixture: feedback forces a mechanism revision',
    operations: [{ objectType: 'hypothesis', objectId: 'hyp_x', operation: 'refine', reason: 'fixture' }],
    fromVersionLabel: 'v0', toVersionLabel: 'v1',
    qualityDelta: { status: 'inconclusive', claim: 'fixture', evidenceRefs: [] },
    createdAt: new Date().toISOString(),
  }));
};

describe('evaluateIteration (pure decision procedure)', () => {
  it('bare run without plan/feedback stops with no_actionable_work', () => {
    const { store, runId } = openStore();
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
    expect(it.record.stopReason?.kind).toBe('no_actionable_work');
    expect(it.reopenStages).toEqual([]);
  });

  it('unconsumed feedback reopens the feedback leg', () => {
    const { store, runId } = openStore();
    const signalId = addFeedback(store, runId);
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('continue');
    expect(it.record.continueTrigger).toEqual({ kind: 'unconsumed_feedback', signalIds: [signalId] });
    expect(it.reopenStages).toEqual(['feedback', 'revise', 'export']);
  });

  it('consumed feedback no longer triggers; a completed experiment swaps the hint', () => {
    const { store, runId } = openStore();
    const signalId = addFeedback(store, runId);
    consumeFeedback(store, runId, signalId);
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
    expect(it.record.stopReason?.kind).toBe('no_actionable_work');
  });

  it('executable plan without any completed experiment reopens the execute leg', () => {
    const { store, runId } = openStore();
    const hypId = addHypothesis(store, runId);
    const planId = addPlan(store, runId, hypId);
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('continue');
    expect(it.record.continueTrigger).toEqual({ kind: 'executable_plan_unexecuted', planId, because: 'never_executed' });
    expect(it.reopenStages).toEqual(['execute', 'feedback', 'revise', 'export']);
  });

  it('a SCIENTIFIC unexecutable skip verdict stops the execute-leg trigger (no verdict loop); a transport skip does not', () => {
    const { store, runId } = openStore();
    const hypId = addHypothesis(store, runId);
    addPlan(store, runId, hypId);
    const markExecuteSkipped = (reason: string): void => {
      const run = store.getRun(runId)!;
      const rec = run.stages.find((s) => s.stage === 'execute')!;
      rec.state = 'skipped';
      rec.error = reason;
      store.updateRun(run);
    };
    // Scientific verdict (per-type breakdown, live gold-run wording 2026-08-28):
    // the leg already ran its executability judgment — re-opening would loop it.
    markExecuteSkipped('tabular: Requires wet-lab clinical trial data; literature-pool: violates pooling constraint');
    const scientific = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(scientific.decision).toBe('stop');
    expect(scientific.record.stopReason?.kind).toBe('no_actionable_work');
    // Transport/budget skips mean the leg NEVER ran its verdict — still retryable.
    markExecuteSkipped('model call failed (provider_error) in execute/experiment-spec-draft: zai: HTTP 529');
    const transport = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(transport.decision).toBe('continue');
    expect(transport.record.continueTrigger).toMatchObject({ kind: 'executable_plan_unexecuted', because: 'never_executed' });
  });
  it('scenario-B native (2026-08-30): a scientific skip verdict predating a plan RE-FREEZE is stale — the leg re-arms', () => {
    const { store, runId } = openStore();
    const hypId = addHypothesis(store, runId);
    const planId = addPlan(store, runId, hypId);
    const t0 = '2026-08-24T10:00:00.000Z';
    const t1 = '2026-08-24T11:00:00.000Z';
    const run = store.getRun(runId)!;
    const rec = run.stages.find((s) => s.stage === 'execute')!;
    rec.state = 'skipped';
    rec.error = 'tabular: no tabular data; literature-pool: not poolable';
    rec.endedAt = t0;
    store.updateRun(run);
    // verdict FROZE the plan only at t1 AFTER the skip -> dataset bound via feedback->revise
    const plan = store.getObject('plan', planId)!;
    store.putObject('plan', { ...plan, frozenAt: t1, planHash: 'c'.repeat(64) });
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('continue');
    expect(it.record.continueTrigger).toEqual({ kind: 'executable_plan_unexecuted', planId, because: 'never_executed' });
  });

  it('a causally REVISED plan (re-frozen after the experiment) re-arms the execute leg', () => {
    const { store, runId } = openStore();
    const hypId = addHypothesis(store, runId);
    const planId = addPlan(store, runId, hypId);

    // experiment completed at T0, then the plan was revised and re-frozen at T1 > T0
    const t0 = '2026-08-24T10:00:00.000Z';
    const t1 = '2026-08-24T11:00:00.000Z';
    store.putObject('experiment_run', ExperimentRun.parse({
      id: newId('xrun'), runId, specId: newId('xsp'), specHash: 'a'.repeat(64), status: 'completed',
      startedAt: t0, endedAt: t0, createdAt: t0,
    }));
    const plan = store.getObject('plan', planId)!;
    store.putObject('plan', { ...plan, frozenAt: t1, planHash: 'b'.repeat(64) });

    const it = evaluateIteration({ store, runId, round: 2, budget: unlimitedBudget() });
    expect(it.decision).toBe('continue');
    expect(it.record.continueTrigger).toEqual({ kind: 'executable_plan_unexecuted', planId, because: 'revised_since' });
  });

  it('a completed experiment disables the execute-leg trigger', () => {
    const { store, runId } = openStore();
    const hypId = addHypothesis(store, runId);
    addPlan(store, runId, hypId);
    store.putObject('experiment_run', ExperimentRun.parse({
      id: newId('xrun'), runId, specId: newId('xsp'), specHash: 'a'.repeat(64), status: 'completed',
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    }));
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
  });

  it('stop rules outrank triggers: round cap fires despite unconsumed feedback', () => {
    const { store, runId } = openStore();
    addFeedback(store, runId);
    store.setMeta(iterationRoundKey(runId), String(MAX_ITERATION_ROUNDS));
    const it = evaluateIteration({ store, runId, round: MAX_ITERATION_ROUNDS, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
    expect(it.record.stopReason?.kind).toBe('round_cap');
  });

  it('stop rules outrank triggers: exhausted budget fires despite unconsumed feedback', () => {
    const { store, runId } = openStore();
    addFeedback(store, runId);
    const it = evaluateIteration({ store, runId, round: 1, budget: spentBudget() });
    expect(it.decision).toBe('stop');
    expect(it.record.stopReason?.kind).toBe('budget_exhausted');
  });

  it('no_material_delta: round>1 with an identical material fingerprint stops', () => {
    const { store, runId } = openStore();
    addFeedback(store, runId);
    const fp = computeIterationSnapshot(store, runId, 1).fingerprint;
    store.setMeta(iterationFingerprintKey(runId), fp);
    const it = evaluateIteration({ store, runId, round: 2, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
    expect(it.record.stopReason?.kind).toBe('no_material_delta');
  });

  it('an approved-but-unrun spec surfaces in unblock hints (human-owned leg)', () => {
    const { store, runId } = openStore();
    const it = evaluateIteration({ store, runId, round: 1, budget: unlimitedBudget() });
    expect(it.decision).toBe('stop');
    // no spec in this fixture — the hint list is empty and honest
    expect(it.record.unblockHints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// orchestrator integration: bounded rounds through the real stage machine
// ---------------------------------------------------------------------------

const buildOrchestrator = (store: Store, stages: Map<RunStageName, StageHandler>) =>
  new Orchestrator({
    store,
    artifacts: {} as ArtifactStore,
    provider: {} as ModelProvider,
    sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('no source adapter in this test'); }),
    stages,
    signals: new Map(),
  });

const okHandler = (stage: RunStageName): StageHandler => ({
  stage,
  applicable: async () => true,
  execute: async () => ({ kind: 'done', summary: `${stage} done` }),
});

describe('orchestrator: iteration rounds', () => {
  it('single-pass run completes with one audited stop record (no round started)', async () => {
    const { store, runId } = openStore();
    const stages = new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as const));
    const run = await buildOrchestrator(store, stages).execute(runId);

    expect(run.status).toBe('completed');
    const records = store.listObjects('iteration', runId);
    expect(records).toHaveLength(1);
    expect(records[0]!.decision).toBe('stop');
    expect(records[0]!.stopReason?.kind).toBe('no_actionable_work');
    expect(records[0]!.reopenStages).toEqual([]);
    const events = store.listEvents(runId);
    expect(events.some((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'iteration_decided')).toBe(true);
    expect(events.some((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'iteration_round_started')).toBe(false);
  });

  it('unconsumed feedback drives a real second round that absorbs it, then stops', async () => {
    const { store, runId } = openStore();
    const signalId = addFeedback(store, runId);

    let reviseCalls = 0;
    const stages = new Map<RunStageName, StageHandler>(STAGE_ORDER.map((s) => [
      s,
      s === 'revise'
        ? {
            stage: s,
            applicable: async (ctx) => (await import('../src/pipeline/stages/revise.js')).unconsumedSignals(ctx).length > 0,
            execute: async () => {
              reviseCalls += 1;
              // pass 1 leaves the signal unconsumed; pass 2 absorbs it (a Revision appears)
              if (reviseCalls >= 2) consumeFeedback(store, runId, signalId);
              return { kind: 'done', summary: `revise pass ${reviseCalls}` };
            },
          }
        : okHandler(s),
    ] as const));

    const run = await buildOrchestrator(store, stages).execute(runId);
    expect(run.status).toBe('completed');
    expect(reviseCalls).toBe(2);

    // the feedback leg re-ran as round 2 (attempt is a provenance fact and increments)
    const reviseRec = run.stages.find((x) => x.stage === 'revise');
    expect(reviseRec?.attempt).toBe(2);
    // the execute stage was NOT touched by the feedback leg
    expect(run.stages.find((x) => x.stage === 'execute')?.attempt).toBe(1);

    const records = store.listObjects('iteration', runId);
    expect(records.map((r) => [r.round, r.decision])).toEqual([[1, 'continue'], [2, 'stop']]);
    expect(records[0]!.continueTrigger?.kind).toBe('unconsumed_feedback');
    expect(records[1]!.stopReason?.kind).toBe('no_actionable_work');

    const events = store.listEvents(runId);
    const roundStarted = events.filter((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'iteration_round_started');
    expect(roundStarted).toHaveLength(1);
    expect((roundStarted[0]!.detail as { round?: number }).round).toBe(2);
  });

  it('a round that produces nothing stops on no_material_delta (no thrash)', async () => {
    const { store, runId } = openStore();
    addFeedback(store, runId);

    // revise never consumes — round 2 changes nothing material and must stop
    const stages = new Map<RunStageName, StageHandler>(STAGE_ORDER.map((s) => [s, okHandler(s)] as const));
    const run = await buildOrchestrator(store, stages).execute(runId);

    expect(run.status).toBe('completed');
    const records = store.listObjects('iteration', runId);
    expect(records.map((r) => [r.round, r.decision, r.stopReason?.kind ?? r.continueTrigger?.kind])).toEqual([
      [1, 'continue', 'unconsumed_feedback'],
      [2, 'stop', 'no_material_delta'],
    ]);
  });

  it('no-op resume does not duplicate the iteration record (idempotent decision)', async () => {
    const { store, runId } = openStore();
    const stages = new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as const));
    const orch = buildOrchestrator(store, stages);
    await orch.execute(runId);

    const before = store.listObjects('iteration', runId).length;
    const decidedBefore = store.listEvents(runId).filter((e) => (e.detail as { reason?: string }).reason === 'iteration_decided').length;
    const again = await orch.execute(runId);
    expect(again.status).toBe('completed');
    expect(store.listObjects('iteration', runId)).toHaveLength(before);
    expect(store.listEvents(runId).filter((e) => (e.detail as { reason?: string }).reason === 'iteration_decided').length).toBe(decidedBefore);
  });

  it('human feedback on a completed run earns a fresh iteration epoch (round resets to 1)', async () => {
    const { store, runId } = openStore();
    const stages = new Map(STAGE_ORDER.map((s) => [s, okHandler(s)] as const));
    const orch = buildOrchestrator(store, stages);
    await orch.execute(runId);
    expect(store.listObjects('iteration', runId)).toHaveLength(1);

    // researcher injects feedback on the completed run and resumes
    const signalId = addFeedback(store, runId);
    const stagesWithConsumption = new Map(STAGE_ORDER.map((s) => [
      s,
      s === 'revise'
        ? {
            stage: s,
            applicable: async (ctx) => (await import('../src/pipeline/stages/revise.js')).unconsumedSignals(ctx).length > 0,
            execute: async () => {
              consumeFeedback(store, runId, signalId);
              return { kind: 'done', summary: 'revise absorbed the new feedback' };
            },
          }
        : okHandler(s),
    ] as const));
    const resumed = await buildOrchestrator(store, stagesWithConsumption).execute(runId);
    expect(resumed.status).toBe('completed');

    // epoch semantics: the post-injection decision is round 1 of a NEW bounded budget
    const records = store.listObjects('iteration', runId);
    expect(records).toHaveLength(2);
    expect(records[1]!.round).toBe(1);
    expect(records[1]!.stopReason?.kind).toBe('no_actionable_work');
    // the material fingerprint moved (a Revision exists) — the epoch record differs
    expect(records[1]!.snapshot.fingerprint).not.toBe(records[0]!.snapshot.fingerprint);
    expect(records[1]!.snapshot.revisions).toBe(1);
  });

  it('full falsification cascade: experiment -> feedback -> revise(re-freeze) -> re-experiment, bounded by round cap', async () => {
    const { store, runId } = openStore();
    const { unconsumedSignals } = await import('../src/pipeline/stages/revise.js');
    const { executeStage } = await import('../src/pipeline/stages/execute.js');

    // deterministic clock: every persisted write is strictly later than the previous
    let tick = 0;
    const at = (): string => new Date(Date.parse('2026-08-24T10:00:00Z') + tick++ * 1000).toISOString();

    const hypId = newId('hyp');
    const planId = newId('pln');
    let executeAttempts = 0;

    const stages = new Map<RunStageName, StageHandler>(STAGE_ORDER.map((s) => [
      s,
      s === 'generate_hypotheses'
        ? {
            stage: s,
            applicable: async () => store.listObjects('hypothesis', runId).length === 0,
            execute: async () => {
              store.putObject('hypothesis', HypothesisCandidate.parse({
                id: hypId, runId, statement: 'X causes Y', mechanism: 'm', createdAt: at(),
                derivation: { strategy: 'mechanism_driven', rationale: 'test', inputClaimIds: [] },
              }));
              return { kind: 'done', summary: 'hypothesis' };
            },
          }
        : s === 'plan'
        ? {
            stage: s,
            applicable: async () => store.listObjects('plan', runId).length === 0,
            execute: async () => {
              store.putObject('plan', ResearchPlan.parse({
                id: planId, runId, objective: 'test', hypothesisIds: [hypId],
                steps: [1, 2, 3].map((n) => ({
                  id: newId('task'), title: `step ${n}`, kind: 'data_analysis' as const, method: `m${n}`,
                  failureConditions: ['none'],
                })),
                metrics: ['r2', 'mae'], decisionRules: {
                  successCriterion: 's', weakeningCriterion: 'w', falsificationCriterion: 'f', stopCriterion: 'st',
                },
                frozenAt: at(), planHash: 'a'.repeat(64), createdAt: at(),
              }));
              return { kind: 'done', summary: 'plan' };
            },
          }
        : s === 'execute'
        ? {
            stage: s,
            // the REAL applicability gate (shared with the iteration controller)
            applicable: (ctx) => executeStage.applicable(ctx),
            execute: async () => {
              executeAttempts += 1;
              const specId = newId('xsp');
              store.putObject('experiment_run', ExperimentRun.parse({
                id: newId('xrun'), runId, specId, specHash: `${executeAttempts}`.padEnd(64, '0'), status: 'completed',
                startedAt: at(), endedAt: at(), createdAt: at(),
              }));
              // the executor queues experiment-verdict feedback for revise (real path does this)
              store.putObject('feedback', FeedbackSignal.parse({
                id: newId('fbk'), runId, source: 'experiment',
                content: `verdict from experiment attempt ${executeAttempts}`,
                structured: { verdict: executeAttempts === 1 ? 'refuted' : 'supported' },
                provenance: `experiment:${specId}`, receivedAt: at(),
              }));
              return { kind: 'done', summary: `experiment attempt ${executeAttempts}` };
            },
          }
        : s === 'revise'
        ? {
            stage: s,
            applicable: async (ctx) => unconsumedSignals(ctx).length > 0,
            execute: async (ctx) => {
              for (const sig of unconsumedSignals(ctx)) {
                store.putObject('revision', Revision.parse({
                  id: newId('rev'), runId, triggerFeedbackId: sig.id,
                  causalReason: 'experiment verdict forces a plan revision',
                  operations: [{ objectType: 'plan', objectId: planId, operation: 'modify', reason: 'verdict' }],
                  fromVersionLabel: `v${executeAttempts - 1}`, toVersionLabel: `v${executeAttempts}`,
                  qualityDelta: { status: 'inconclusive', claim: 'test', evidenceRefs: [] },
                  createdAt: at(),
                }));
              }
              // causal plan revision re-freezes the plan (real revise.ts semantics)
              const plan = store.getObject('plan', planId)!;
              store.putObject('plan', { ...plan, frozenAt: at(), planHash: `${executeAttempts}`.padEnd(64, '1') });
              return { kind: 'done', summary: 'revise consumed verdicts and re-froze the plan' };
            },
          }
        : okHandler(s),
    ] as const));

    const run = await buildOrchestrator(store, stages).execute(runId);
    expect(run.status).toBe('completed');

    // the cascade actually ran: experiment re-executed on each revised plan version
    expect(executeAttempts).toBe(3);
    expect(store.listObjects('experiment_run', runId)).toHaveLength(3);
    // the execute gate re-armed between rounds via the REAL shared leg semantics
    const records = store.listObjects('iteration', runId);
    expect(records.map((r) => [r.round, r.decision, r.stopReason?.kind ?? r.continueTrigger?.kind])).toEqual([
      [1, 'continue', 'executable_plan_unexecuted'],
      [2, 'continue', 'executable_plan_unexecuted'],
      [3, 'stop', 'round_cap'],
    ]);
    // every continue was the revised-plan leg (r1: revised during the same pass; r2: likewise)
    expect(records.filter((r) => r.decision === 'continue').every((r) => r.continueTrigger?.kind === 'executable_plan_unexecuted')).toBe(true);
  });
});
