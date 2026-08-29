import { describe, expect, it } from 'vitest';
import {
  FeedbackSignal,
  ProtocolExecution,
  ProtocolSpec,
  ResearchPlan,
  applyProtocolRecord,
  buildCollectionForm,
  generateAllocationSequence,
  newId,
  protocolOutcomeFeedback,
  protocolStepStates,
  seedFromPlanHash,
  validateProtocolAgainstPlan,
} from '../src/domain/index.js';

/**
 * Protocol domain (paradigm-honest execution layer): schema honesty gates,
 * deterministic allocation, collection-form projection, the human-attested
 * ledger state machine, plan cross-validation and the feedback bridge.
 */

const T0 = '2026-08-29T00:00:00.000Z';
const T1 = '2026-08-29T01:00:00.000Z';
const T2 = '2026-08-29T02:00:00.000Z';

const planFixture = (): ResearchPlan => ResearchPlan.parse({
  id: newId('pln'),
  runId: newId('run'),
  objective: 'Discriminate anion-redistribution-driven impedance growth from interface-degradation alternatives',
  hypothesisIds: [newId('hyp')],
  variables: ['impedance growth rate', 'anion redistribution index'],
  controls: ['inert-additive control cells'],
  inclusionCriteria: [],
  exclusionCriteria: [],
  dataRequirements: [],
  toolRequirements: [],
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

const PLAN_HASH = 'a'.repeat(64);

const protocolFixture = (plan: ResearchPlan, overrides: Record<string, unknown> = {}): ProtocolSpec => {
  const seed = seedFromPlanHash(PLAN_HASH);
  return ProtocolSpec.parse({
    id: newId('prt'),
    runId: plan.runId,
    planId: plan.id,
    planHash: PLAN_HASH,
    hypothesisIds: [...plan.hypothesisIds],
    title: 'Blocked-anion cycling protocol',
    objective: 'Operationalize the paired-cell cycling plan with human-confirmed steps',
    paradigm: 'bench',
    setting: 'electrochemistry bench, inert atmosphere glovebox',
    arms: [
      { label: 'blocked-additive', description: 'cells with the anion-blocking additive', isControl: false },
      { label: 'inert-additive control', description: 'cells with an inert additive', isControl: true },
    ],
    materials: [{ name: 'anion-blocking additive', quantity: '200 mg', hazardClass: 'irritant' }],
    instruments: [{ name: 'potentiostat', purpose: 'operando EIS' }],
    sampling: {
      unitLabel: 'cell',
      plannedN: 12,
      minN: 8,
      eligibilityIncludes: ['assembled from the same batch'],
      eligibilityExcludes: [],
      blinding: 'single',
    },
    allocation: {
      scheme: 'blocked',
      blockVariable: 'assembly batch',
      seed,
      sequence: generateAllocationSequence(12, ['blocked-additive', 'inert-additive control'], seed, 'blocked'),
    },
    steps: [
      {
        id: 'ps1',
        planStepId: plan.steps[0]!.id,
        title: 'Assemble paired cells',
        action: 'Assemble 12 cells in 6 batches, applying the committed allocation sequence per batch.',
        actor: 'technician',
        materials: ['anion-blocking additive'],
        instruments: [],
        duration: { value: 6, unit: 'hours' },
        conditions: 'glovebox, <1 ppm O2',
        producesMeasurements: [],
        confirmation: 'human_signed',
        dependsOn: [],
      },
      {
        id: 'ps2',
        planStepId: plan.steps[1]!.id,
        title: 'Cycle with operando EIS',
        action: 'Run 200 discharge cycles per cell, recording operando impedance spectra at cycles 1/50/100/150/200.',
        actor: 'researcher',
        materials: [],
        instruments: ['potentiostat'],
        duration: { value: 3, unit: 'weeks' },
        conditions: '25 C',
        producesMeasurements: ['interfacial impedance'],
        confirmation: 'instrument_record',
        dependsOn: ['ps1'],
      },
    ],
    variables: [
      {
        name: 'interfacial impedance',
        role: 'dependent',
        method: 'operando EIS, interface contribution fit',
        unit: 'ohm',
        valueType: 'numeric',
        timepoints: ['cycle 1', 'cycle 200'],
        qcRule: { kind: 'range', min: 0, max: 10000 },
      },
      {
        name: 'arm assignment',
        role: 'independent',
        method: 'committed allocation sequence',
        valueType: 'categorical',
        timepoints: ['assembly'],
        qcRule: { kind: 'enum', allowed: ['blocked-additive', 'inert-additive control'] },
      },
    ],
    ethics: { requiresApproval: false, consentRequired: false, riskLevel: 'minimal', notes: [] },
    stopConditions: [{ kind: 'safety', detail: 'stop on cell venting or thermal runaway' }],
    status: 'registered',
    createdAt: T0,
    frozenAt: T0,
    ...overrides,
  });
};

const stepFixture = (planStepId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'ps1',
  planStepId,
  title: 'fixture step',
  action: 'do the concrete fixture action with enough detail to follow',
  actor: 'researcher',
  materials: [],
  instruments: [],
  duration: { value: 1, unit: 'hours' },
  conditions: '',
  producesMeasurements: [],
  confirmation: 'human_signed',
  dependsOn: [],
  ...overrides,
});

const executionFixture = (protocol: ProtocolSpec): ProtocolExecution => ProtocolExecution.parse({
  id: newId('pex'),
  protocolId: protocol.id,
  runId: protocol.runId,
  status: protocol.ethics.requiresApproval ? 'awaiting_approval' : 'awaiting_human',
  records: [],
  measurements: [],
  approvals: [],
  deviations: [],
  createdAt: T0,
  updatedAt: T0,
});

describe('protocol domain', () => {
  it('parses a complete registered protocol', () => {
    expect(protocolFixture(planFixture()).status).toBe('registered');
  });

  it('rejects human_subjects protocols without declared consent', () => {
    expect(() => protocolFixture(planFixture(), { paradigm: 'human_subjects' })).toThrow(/consentRequired/);
  });

  it('rejects undeclared material references and dependency cycles', () => {
    const plan = planFixture();
    expect(() => protocolFixture(plan, { steps: [stepFixture(plan.steps[0]!.id, { materials: ['ghost material'] })] })).toThrow(/undeclared material/);
    expect(() => protocolFixture(plan, {
      steps: [
        stepFixture(plan.steps[0]!.id, { id: 'ps1', dependsOn: ['ps2'] }),
        stepFixture(plan.steps[1]!.id, { id: 'ps2', dependsOn: ['ps1'] }),
      ],
    })).toThrow(/acyclic/);
  });

  it('allocation sequences are deterministic, blocked-balanced and unique per unit', () => {
    const seed = 12345;
    const a = generateAllocationSequence(12, ['a', 'b'], seed, 'blocked');
    const b = generateAllocationSequence(12, ['a', 'b'], seed, 'blocked');
    expect(a).toEqual(b);
    for (let block = 0; block < 6; block += 1) {
      const arms = a.slice(block * 2, block * 2 + 2).map((x) => x.arm).sort();
      expect(arms).toEqual(['a', 'b']);
    }
    expect(new Set(a.map((x) => x.unitIndex)).size).toBe(12);
    expect(() => generateAllocationSequence(4, ['a'], seed, 'complete_randomization')).toThrow(/2 arms/);
  });

  it('seedFromPlanHash is a deterministic uint32 of the frozen hash', () => {
    const h = 'deadbeef'.padEnd(64, '0');
    expect(seedFromPlanHash(h)).toBe(0xdeadbeef >>> 0);
    expect(seedFromPlanHash(h)).toBe(seedFromPlanHash(h));
  });

  it('collection form projects variables with QC summaries', () => {
    const form = buildCollectionForm(protocolFixture(planFixture()).variables);
    expect(form.fields).toHaveLength(2);
    expect(form.fields[0]?.qcSummary).toContain('range');
    expect(form.fields[1]?.qcSummary).toContain('one of');
  });

  it('step state machine: start -> complete; double-start, cold-complete and dependency jumps rejected', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan);
    let ex = executionFixture(protocol);
    const r1 = applyProtocolRecord(protocol, ex, { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.execution.status).toBe('in_progress');
      expect(r1.execution.startedAt).toBe(T1);
      ex = r1.execution;
    }
    const again = applyProtocolRecord(protocol, ex, { at: T2, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    expect(again.ok).toBe(false);
    const cold = applyProtocolRecord(protocol, executionFixture(protocol), { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_completed' });
    expect(cold.ok).toBe(false);
    const jump = applyProtocolRecord(protocol, executionFixture(protocol), { at: T1, stepId: 'ps2', actor: 'tech', kind: 'step_started' });
    expect(jump.ok).toBe(false);
    if (!jump.ok) expect(jump.error).toContain('depends on');
  });

  it('ethics gate blocks execution records until the approval lands (fail-closed)', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan, {
      ethics: { requiresApproval: true, approvalBody: 'IRB-42', consentRequired: true, riskLevel: 'more_than_minimal', notes: [] },
    });
    let ex = executionFixture(protocol);
    expect(ex.status).toBe('awaiting_approval');
    const blocked = applyProtocolRecord(protocol, ex, { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain('ethics');
    const appr = applyProtocolRecord(protocol, ex, {
      at: T1,
      actor: 'PI',
      kind: 'approval',
      approval: { approvalBody: 'IRB-42', approvalId: '2026-118', approvedBy: 'PI' },
    });
    expect(appr.ok).toBe(true);
    if (appr.ok) {
      ex = appr.execution;
      expect(ex.status).toBe('awaiting_human');
      expect(ex.approvals).toHaveLength(1);
    }
    const started = applyProtocolRecord(protocol, ex, { at: T2, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    expect(started.ok).toBe(true);
  });

  it('measurements keep QC-failing values with visible verdicts; type mismatches rejected', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan);
    let ex = executionFixture(protocol);
    const s = applyProtocolRecord(protocol, ex, { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    if (s.ok) ex = s.execution;
    const bad = applyProtocolRecord(protocol, ex, {
      at: T2,
      stepId: 'ps1',
      actor: 'tech',
      kind: 'measurement',
      measurement: { variableName: 'interfacial impedance', value: 99999 },
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.execution.measurements[0]?.qcPassed).toBe(false);
      expect(bad.execution.measurements[0]?.qcDetail).toContain('range');
    }
    const wrongType = applyProtocolRecord(protocol, ex, {
      at: T2,
      stepId: 'ps1',
      actor: 'tech',
      kind: 'measurement',
      measurement: { variableName: 'interfacial impedance', value: 'high' },
    });
    expect(wrongType.ok).toBe(false);
  });

  it('completion requires every step in dependency order; terminal status locks the ledger', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan);
    let ex = executionFixture(protocol);
    const run = (rec: Parameters<typeof applyProtocolRecord>[2]): void => {
      const r = applyProtocolRecord(protocol, ex, rec);
      expect(r.ok).toBe(true);
      if (r.ok) ex = r.execution;
    };
    run({ at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    run({ at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_completed' });
    run({ at: T1, stepId: 'ps2', actor: 'researcher', kind: 'step_started' });
    run({ at: T2, stepId: 'ps2', actor: 'researcher', kind: 'step_completed' });
    expect(ex.status).toBe('completed');
    expect(ex.endedAt).toBe(T2);
    expect(protocolStepStates(protocol, ex)['ps1']).toBe('done');
    const after = applyProtocolRecord(protocol, ex, {
      at: T2,
      actor: 'tech',
      kind: 'measurement',
      measurement: { variableName: 'interfacial impedance', value: 42 },
    });
    expect(after.ok).toBe(false);
  });

  it('abort is available mid-flight and terminal', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan);
    let ex = executionFixture(protocol);
    const s = applyProtocolRecord(protocol, ex, { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    if (s.ok) ex = s.execution;
    const ab = applyProtocolRecord(protocol, ex, { at: T2, actor: 'PI', kind: 'abort', note: 'material contamination' });
    expect(ab.ok).toBe(true);
    if (ab.ok) {
      expect(ab.execution.status).toBe('aborted');
      expect(ab.execution.endedAt).toBe(T2);
    }
  });

  it('validateProtocolAgainstPlan: drift is an error, coverage gaps are advisories', () => {
    const plan = planFixture();
    expect(validateProtocolAgainstPlan(protocolFixture(plan), plan).passed).toBe(true);
    const drifted = protocolFixture(plan, { steps: [stepFixture(newId('task'))] });
    const v = validateProtocolAgainstPlan(drifted, plan);
    expect(v.passed).toBe(false);
    expect(v.errors[0]).toContain('unknown plan step');
    const thin = protocolFixture(plan, {
      variables: [{
        name: 'interfacial impedance',
        role: 'dependent',
        method: 'operando EIS, interface contribution fit',
        unit: 'ohm',
        valueType: 'numeric',
        timepoints: ['cycle 1', 'cycle 200'],
        qcRule: { kind: 'range', min: 0, max: 10000 },
      }],
    });
    const v2 = validateProtocolAgainstPlan(thin, plan);
    expect(v2.passed).toBe(true);
    expect(v2.advisories.some((a) => a.includes('anion redistribution index'))).toBe(true);
  });

  it('protocol outcomes project into a parseable experiment feedback signal', () => {
    const plan = planFixture();
    const protocol = protocolFixture(plan);
    let ex = executionFixture(protocol);
    const s = applyProtocolRecord(protocol, ex, { at: T1, stepId: 'ps1', actor: 'tech', kind: 'step_started' });
    if (s.ok) ex = s.execution;
    const fb = protocolOutcomeFeedback(protocol, ex);
    expect(fb.source).toBe('experiment');
    expect(fb.target).toEqual({ kind: 'protocol', id: protocol.id });
    const full = FeedbackSignal.parse({ ...fb, id: newId('fbk'), receivedAt: T2 });
    expect(full.provenance).toContain('protocol-execution:');
  });
});
