import { describe, expect, it } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { executeStage } from '../src/pipeline/stages/execute.js';
import { TEMPLATE_REFUSAL_REASON } from '../src/pipeline/stages/shared.js';
import { evaluateIteration, experimentLegStatus } from '../src/app/iteration.js';
import { makeRunBudget } from '../src/app/run-budget.js';
import { ResearchQuestion, ResearchRun, ResearchPlan, newId } from '../src/domain/index.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import type { StageContext } from '../src/pipeline/types.js';

/**
 * Execute-stage protocol fallback (convergence 2026-08-29): when neither the
 * tabular nor the literature-pool leg can run, the plan's real-world legs get a
 * FROZEN protocol + an empty human-attested ledger. The stage NEVER claims
 * machine execution; a product run on the deterministic development wire is
 * refused (template protocol ≠ preregistered science); registration is
 * idempotent per plan hash; the iteration controller stops machine rounds with
 * the protocol as the honest human-owned unblock path.
 */

const T0 = '2026-08-29T00:00:00.000Z';

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'What mechanisms drive interface impedance growth in polymer electrolyte cells?',
    background: 'transport degradation limits cycle life',
    goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: { assumptions: [] },
    createdAt: T0,
  });
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'),
    questionId: q.id,
    status: 'running',
    currentStage: 'execute',
    stages: [],
    createdAt: T0,
    updatedAt: T0,
    tags: [],
  });
  const plan = ResearchPlan.parse({
    id: newId('pln'),
    runId: run.id,
    objective: 'Discriminate anion-redistribution-driven impedance growth',
    hypothesisIds: [newId('hyp')],
    variables: ['impedance growth rate'],
    controls: ['inert-additive control cells'],
    steps: [
      {
        id: newId('task'),
        title: 'prepare paired cells',
        kind: 'experiment',
        inputs: [],
        outputs: ['paired cells'],
        method: 'assemble cells with and without the blocking additive',
        failureConditions: [],
        dependsOn: [],
      },
      {
        id: newId('task'),
        title: 'cycle with operando spectra',
        kind: 'experiment',
        inputs: ['paired cells'],
        outputs: ['spectra series'],
        method: '200 discharge cycles with operando EIS',
        failureConditions: [],
        dependsOn: [],
      },
    ],
    metrics: ['overpotential rise per 100 cycles'],
    statistics: [],
    decisionRules: {
      successCriterion: '>= 30% lower growth in blocked cells',
      weakeningCriterion: '< 10% difference',
      falsificationCriterion: 'interval excludes the predicted direction',
      stopCriterion: '20 cells per arm',
    },
    createdAt: T0,
  });
  store.putObject('plan', plan);
  return { store, run, plan };
};

// A VALID protocol draft the stub serves on purpose 'protocol-draft' — validity
// matters for both paths: asLive registers it; without asLive a product run must
// REFUSE it as template content (not fail it as garbage).
const protocolDraftPayload = (plan: ResearchPlan): string =>
  JSON.stringify({
    feasible: true,
    paradigm: 'bench',
    title: 'Paired-cell cycling protocol',
    objective: 'Operationalize the plan into bench-executable steps with human confirmations',
    setting: 'electrochemistry bench, glovebox',
    arms: [
      { label: 'blocked-additive', description: 'cells with anion-blocking additive', isControl: false },
      { label: 'inert-additive control', description: 'cells with inert additive', isControl: true },
    ],
    materials: [{ name: 'anion-blocking additive', quantity: '200 mg', hazardClass: 'irritant' }],
    instruments: [{ name: 'potentiostat', purpose: 'operando EIS' }],
    sampling: { unitLabel: 'cell', plannedN: 12, eligibilityIncludes: ['same batch'], eligibilityExcludes: [], blinding: 'single' },
    allocation: { scheme: 'blocked', blockVariable: 'assembly batch' },
    steps: [
      {
        planStepId: plan.steps[0]!.id,
        title: 'Assemble cells',
        action: 'Assemble 12 cells applying the committed allocation sequence per batch.',
        actor: 'technician',
        materials: ['anion-blocking additive'],
        instruments: [],
        durationValue: 6,
        durationUnit: 'hours',
        conditions: 'glovebox',
        producesMeasurements: [],
        confirmation: 'human_signed',
        dependsOnStepNumbers: [],
      },
      {
        planStepId: plan.steps[1]!.id,
        title: 'Cycle with EIS',
        action: 'Run 200 discharge cycles recording operando spectra.',
        actor: 'researcher',
        materials: [],
        instruments: ['potentiostat'],
        durationValue: 3,
        durationUnit: 'weeks',
        conditions: '25 C',
        producesMeasurements: ['interfacial impedance'],
        confirmation: 'instrument_record',
        dependsOnStepNumbers: [1],
      },
    ],
    variables: [
      {
        name: 'interfacial impedance',
        role: 'dependent',
        method: 'operando EIS fit',
        unit: 'ohm',
        valueType: 'numeric',
        timepoints: ['cycle 1', 'cycle 200'],
        qcRule: { kind: 'range', min: 0, max: 10000 },
      },
    ],
    ethics: { requiresApproval: false, consentRequired: false, riskLevel: 'minimal', notes: [] },
    stopConditions: [{ kind: 'safety', detail: 'stop on cell venting' }],
  });

// Both computational drafters are scripted infeasible so the protocol path engages.
const infeasibleTabular = JSON.stringify({
  feasible: false,
  skipReason: 'Requires wet-lab impedance data; no public tabular dataset maps to this plan',
});
const infeasibleMeta = JSON.stringify({
  feasible: false,
  skipReason: 'No published exposure-vs-outcome contrast to pool for a bench-cycling question',
});

const makeCtx = (store: Store, run: ResearchRun, plan: ResearchPlan, asLive: boolean, productRun: boolean): StageContext => ({
  run,
  store,
  artifacts: {
    async put(payload: string | Uint8Array) {
      const s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      return { ref: 'sha256:' + '0'.repeat(64), hash: '0'.repeat(64), size: s.length };
    },
    async get() {
      return null;
    },
    path: (ref: string) => ref,
  },
  provider: createTestStubProvider(
    [
      { rawOutput: infeasibleTabular, forPurpose: 'experiment-spec-draft' },
      { rawOutput: infeasibleMeta, forPurpose: 'meta-spec-draft' },
      { rawOutput: protocolDraftPayload(plan), forPurpose: 'protocol-draft' },
    ],
    { asLive },
  ),
  productRun,
  cancelled: () => false,
  disowned: () => false,
  log: () => {},
  recordReceipt: () => {},
  checkpointed: async <T>(_s: string, _f: string, _k: string, _fp: string | undefined, fn: () => Promise<T>): Promise<T> => fn(),
});

describe('execute stage: protocol fallback (paradigm-honest execution)', () => {
  it('registers a frozen protocol + empty awaiting-human ledger when both computational legs skip (live)', async () => {
    const { store, run, plan } = setup();
    const out = await executeStage.execute(makeCtx(store, run, plan, true, true));
    expect(out.kind).toBe('done');
    expect(out.kind === 'done' && out.summary).toContain('no machine execution claimed');
    const protocols = store.listObjects('protocol', run.id);
    expect(protocols).toHaveLength(1);
    expect(protocols[0]?.status).toBe('registered');
    expect(protocols[0]?.frozenAt).toBeDefined();
    const ledgers = store.listObjects('protocol_execution', run.id);
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.status).toBe('awaiting_human');
  });

  it('a product run on the deterministic development wire is refused (template protocol is not science)', async () => {
    const { store, run, plan } = setup();
    const out = await executeStage.execute(makeCtx(store, run, plan, false, true));
    expect(out.kind).toBe('skipped');
    expect(out.kind === 'skipped' && out.reason.startsWith(TEMPLATE_REFUSAL_REASON)).toBe(true);
    expect(store.listObjects('protocol', run.id)).toHaveLength(0);
    expect(store.listObjects('protocol_execution', run.id)).toHaveLength(0);
  });

  it('registration is idempotent per plan hash — a second pass reports, never re-drafts', async () => {
    const { store, run, plan } = setup();
    const ctx = makeCtx(store, run, plan, true, true);
    await executeStage.execute(ctx);
    const second = await executeStage.execute(ctx);
    expect(second.kind).toBe('done');
    expect(second.kind === 'done' && second.summary).toContain('already registered');
    expect(store.listObjects('protocol', run.id)).toHaveLength(1);
  });

  it('iteration: a registered protocol stops machine rounds and surfaces the human unblock path', async () => {
    const { store, run, plan } = setup();
    await executeStage.execute(makeCtx(store, run, plan, true, true));

    const leg = experimentLegStatus(store, run.id);
    expect(leg.kind).toBe('unexecuted'); // union unchanged — protocol awareness lives in the controller
    const decision = evaluateIteration({ store, runId: run.id, round: 1, budget: makeRunBudget(store, run.id) });
    expect(decision.decision).toBe('stop');
    expect(decision.record.stopReason?.kind).toBe('no_actionable_work');
    expect(decision.record.unblockHints.some((h) => h.includes('protocol ') && h.includes('human-attested'))).toBe(true);
    expect(decision.record.snapshot.protocolsRegistered).toBe(1);
  });

  it('without a protocol the unexecuted leg still re-arms (compatibility control)', () => {
    const { store, run } = setup();
    const decision = evaluateIteration({ store, runId: run.id, round: 1, budget: makeRunBudget(store, run.id) });
    expect(decision.decision).toBe('continue');
    expect(decision.record.continueTrigger?.kind).toBe('executable_plan_unexecuted');
  });
});
