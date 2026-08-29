import { describe, expect, it } from 'vitest';
import { ResearchPlan, newId } from '../src/domain/index.js';
import { draftProtocolFromPlan, planHashOf } from '../src/experiment/protocol-from-plan.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import type { ModelPlaneDeps } from '../src/pipeline/llm.js';

/**
 * Protocol drafting (convergence 2026-08-29): the model proposes inside a closed
 * space; deterministic code owns the freeze binding, seeds, sequences, step
 * remapping, the consent floor and allocation downgrades — every adjustment
 * disclosed in draftNotes, never silent.
 */

const T0 = '2026-08-29T00:00:00.000Z';

const planFixture = (): ResearchPlan => ResearchPlan.parse({
  id: newId('pln'),
  runId: newId('run'),
  objective: 'Discriminate anion-redistribution-driven impedance growth from interface-degradation alternatives',
  hypothesisIds: [newId('hyp')],
  variables: ['impedance growth rate'],
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

const plane = (rawOutput: string, asLive = true): ModelPlaneDeps => ({
  provider: createTestStubProvider([{ rawOutput, forPurpose: 'protocol-draft' }], { asLive }),
  recordReceipt: () => {},
});

const draftJson = (plan: ResearchPlan, overrides: Record<string, unknown> = {}): string =>
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
    sampling: {
      unitLabel: 'cell',
      plannedN: 12,
      eligibilityIncludes: ['same batch'],
      eligibilityExcludes: [],
      blinding: 'single',
    },
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
    ...overrides,
  });

describe('draftProtocolFromPlan', () => {
  it('a live draft assembles a plan-bound protocol with code-owned sequence and ids', async () => {
    const plan = planFixture();
    const out = await draftProtocolFromPlan(plan, 'what drives impedance growth?', plane(draftJson(plan)));
    expect(out.kind).toBe('protocol');
    if (out.kind !== 'protocol') return;
    expect(out.executionMode).toBe('live');
    expect(out.spec.id).toMatch(/^prt_/);
    expect(out.spec.planHash).toBe(planHashOf(plan));
    expect(out.spec.hypothesisIds).toEqual(plan.hypothesisIds);
    expect(out.spec.steps.map((s) => s.id)).toEqual(['ps1', 'ps2']);
    expect(out.spec.steps[1]?.dependsOn).toEqual(['ps1']);
    expect(out.spec.allocation.scheme).toBe('blocked');
    if (out.spec.allocation.scheme === 'blocked') {
      expect(out.spec.allocation.sequence).toHaveLength(12);
      expect(out.spec.allocation.blockVariable).toBe('assembly batch');
    }
    expect(out.spec.status).toBe('draft');
  });

  it('an infeasible verdict skips honestly with the reason', async () => {
    const plan = planFixture();
    const out = await draftProtocolFromPlan(
      plan,
      'pure ML question',
      plane(JSON.stringify({ feasible: false, skipReason: 'every step is tabular ML on public datasets' })),
    );
    expect(out.kind).toBe('skip');
    expect(out.kind === 'skip' && out.reason).toContain('tabular ML');
  });

  it('steps referencing unknown plan steps are dropped with disclosure; all-unknown skips', async () => {
    const plan = planFixture();
    const ghost = newId('task');
    const oneValid = await draftProtocolFromPlan(
      plan,
      'q',
      plane(draftJson(plan, {
        steps: [
          JSON.parse(draftJson(plan).slice(0, 0) || '{}') && {
            planStepId: ghost,
            title: 'ghost',
            action: 'references a plan step that does not exist',
            durationValue: 1,
            durationUnit: 'hours',
          },
          ...JSON.parse(draftJson(plan)).steps,
        ],
      })),
    );
    expect(oneValid.kind).toBe('protocol');
    if (oneValid.kind === 'protocol') {
      expect(oneValid.spec.steps).toHaveLength(2);
      expect(oneValid.spec.draftNotes.some((n) => n.includes('dropped 1 draft step'))).toBe(true);
    }
    const allGhost = await draftProtocolFromPlan(
      plan,
      'q',
      plane(draftJson(plan, {
        steps: [
          {
            planStepId: ghost,
            title: 'ghost',
            action: 'references a plan step that does not exist',
            durationValue: 1,
            durationUnit: 'hours',
          },
        ],
      })),
    );
    expect(allGhost.kind).toBe('skip');
  });

  it('human_subjects consent floor is forced and disclosed', async () => {
    const plan = planFixture();
    const out = await draftProtocolFromPlan(
      plan,
      'interview study',
      plane(draftJson(plan, {
        paradigm: 'human_subjects',
        ethics: { requiresApproval: true, approvalBody: 'IRB-42', consentRequired: false, riskLevel: 'unknown', notes: [] },
      })),
    );
    expect(out.kind).toBe('protocol');
    if (out.kind === 'protocol') {
      expect(out.spec.ethics.consentRequired).toBe(true);
      expect(out.spec.draftNotes.some((n) => n.includes('consentRequired forced true'))).toBe(true);
    }
  });

  it('randomization without >= 2 arms is downgraded to none with disclosure', async () => {
    const plan = planFixture();
    const out = await draftProtocolFromPlan(
      plan,
      'q',
      plane(draftJson(plan, {
        arms: [{ label: 'single-arm', description: 'only one arm', isControl: false }],
      })),
    );
    expect(out.kind).toBe('protocol');
    if (out.kind === 'protocol') {
      expect(out.spec.allocation.scheme).toBe('none');
      expect(out.spec.draftNotes.some((n) => n.includes('downgraded to none'))).toBe(true);
    }
  });
});
