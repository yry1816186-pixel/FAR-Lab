import { describe, expect, it } from 'vitest';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { planStage } from '../src/pipeline/stages/plan.js';
import type { StageContext } from '../src/pipeline/types.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import type { ModelProvider, StructuredCallRequest } from '../src/shared/ports.js';
import {
  HypothesisCandidate, ResearchQuestion, ResearchRun, ScientificClaim,
  ScientificProblemModel, MethodSelection, newId,
} from '../src/domain/index.js';
import { canonicalSha256 } from '../src/shared/crypto.js';

/**
 * AOSSA disclosure wiring (problem-model slice 2): the plan stage's model call
 * must carry the run's problem model (objectives + selected method families)
 * when one exists, and stay clean when it does not.
 */

const setup = () => {
  const store = new Store(openDb(':memory:'));
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Does anion redistribution drive interface impedance growth in polymer electrolyte cells?',
    background: 'transport degradation limits cycle life',
    goalType: 'explanatory',
    scope: { domain: 'electrochemistry', phenomena: ['interface degradation'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  store.putObject('question', q);
  const run = ResearchRun.parse({
    id: newId('run'), questionId: q.id, status: 'running', currentStage: 'plan',
    stages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tags: [],
  });
  const claim = ScientificClaim.parse({
    id: newId('clm'), runId: run.id,
    text: 'Operando impedance spectra show the interface contribution grows 3-fold over 200 discharge cycles while bulk transport stays constant',
    locators: [{ sourceDocumentId: newId('src'), quote: 'interface contribution grows 3-fold over 200 discharge cycles' }],
    bindingStatus: 'verified', alignmentChecked: true,
  });
  store.putObject('claim', claim);
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId: run.id, version: 0,
    statement: 'Anion redistribution across the electrolyte interface concentrates mobile charge at degraded sites, driving impedance growth',
    mechanism: 'redistribution creates local depletion zones that raise the interfacial charge-transfer barrier',
    derivation: { strategy: 'mechanism_driven', rationale: 'seeded real hypothesis', inputClaimIds: [claim.id] },
    assumptions: [{ id: 'a0', statement: 'anion motion couples to interface impedance', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['blocked-redistribution cells show materially lower impedance growth than controls'],
    supportingClaimIds: [], counterClaimIds: [], uncertainties: [], noveltyLabel: 'mixed',
    testability: 'testable_with_data', clusterKey: 'seeded', createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return { store, run, hyp, q };
};

const seedProblemModel = (store: Store, runId: string, questionId: string): void => {
  const now = new Date().toISOString();
  store.putObject('problem_model', ScientificProblemModel.parse({
    id: newId('pmod'), runId, questionId,
    objectives: [{ id: 'obj1', statement: 'identify whether anion redistribution drives impedance growth' }],
    variables: [{ name: 'impedance growth rate', role: 'dependent', unit: 'ohm/cycle', valueType: 'numeric' }],
    formalization: { problemClass: 'none_stated', governingRelations: [], boundaryConditions: [], wellPosednessNotes: [] },
    dataInventory: [], statisticalPremises: { assumptions: [], causalClaims: [] }, metrics: [],
    stopConditions: ['decision rule evaluated once on the paired cycling contrast'],
    unknowns: [], provenance: { formedBy: 'model_proposed' }, createdAt: now, updatedAt: now,
  }));
  store.putObject('method_selection', MethodSelection.parse({
    id: newId('msel'), runId, questionId, forObjectiveId: 'obj1',
    candidates: [
      { family: 'physical_experiment', assessment: 'selected', rationale: 'the objective needs paired cycling experiments with operando spectra', validationPlan: 'protocol QC rules at measurement record time' },
      { family: 'numerical_simulation', assessment: 'rejected_inappropriate', rationale: 'no calibrated transport model is available for this cell chemistry' },
    ],
    decidedBy: 'model_proposed', createdAt: now,
  }));
};

const memArtifacts = () => {
  const data = new Map<string, string>();
  return {
    async put(payload: string | Uint8Array) {
      const s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const hash = canonicalSha256(s);
      const ref = `sha256:${hash}`;
      data.set(ref, s);
      return { ref, hash, size: s.length };
    },
    async get(ref: string) { return data.get(ref) ?? null; },
    path: (ref: string) => ref,
  };
};

/** Wraps the scripted stub to CAPTURE requests (assertion surface for payloads). */
const capturing = (inner: ModelProvider, reqs: StructuredCallRequest[]): ModelProvider => ({
  name: inner.name,
  liveReady: inner.liveReady,
  async structuredCall(req, parse) {
    reqs.push(req);
    return inner.structuredCall(req, parse);
  },
});

const makeCtx = (store: Store, run: ResearchRun, provider: ModelProvider): StageContext => ({
  run, store, artifacts: memArtifacts(), provider,
  cancelled: () => false, disowned: () => false, log: () => {}, recordReceipt: () => {},
  checkpointed: async <T>(_s: string, _f: string, _k: string, _fp: string | undefined, fn: () => Promise<T>) => fn(),
});

const DRAFT = () => {
  const step = (id: string, title: string, deps: string[] = []) => ({
    id, title, kind: 'data_analysis', inputs: [], outputs: [`${title} out`], method: 'fixture method', failureConditions: [], dependsOn: deps,
  });
  return {
    objective: 'Discriminate the redistribution-impedance pathway against interface-degradation alternatives',
    hypothesisIds: [], variables: ['impedance growth rate'], controls: ['inert-additive control cells'],
    inclusionCriteria: [], exclusionCriteria: [], dataRequirements: [], toolRequirements: [],
    steps: [step('s1', 'prepare paired cells'), step('s2', 'cycle with operando spectra', ['s1']), step('s3', 'estimate growth-rate contrast', ['s2'])],
    metrics: ['impedance interface contribution', 'overpotential rise per 100 cycles'],
    statistics: [],
    decisionRules: { successCriterion: '>= 30% lower growth in blocked cells', weakeningCriterion: '< 10% difference', falsificationCriterion: 'interval excludes the predicted direction', stopCriterion: '20 cells per arm' },
    confounders: [], alternativeExplanations: [], resources: { compute: 'low', cost: 'low', time: '3 months' }, risks: [], ethics: [], prerequisites: [], alternativeBranches: [], reproducibilityRequirements: [],
  };
};

describe('plan stage problem-model disclosure', () => {
  it('carries problemModel (objectives + selected families) in the research-plan-design payload when one exists', async () => {
    const { store, run, q, hyp } = setup();
    seedProblemModel(store, run.id, q.id);
    const reqs: StructuredCallRequest[] = [];
    const provider = capturing(
      createTestStubProvider([{ rawOutput: JSON.stringify({ ...DRAFT(), hypothesisIds: [hyp.id] }), forPurpose: 'research-plan-design' }], { asLive: true }),
      reqs,
    );
    const out = await planStage.execute(makeCtx(store, run, provider));
    expect(out.kind).toBe('done');
    expect(store.listObjects('plan', run.id)).toHaveLength(1);
    const req = reqs.find((r) => r.task === 'research-plan-design');
    expect(req).toBeDefined();
    const input = ((req?.userPayload as { input?: Record<string, unknown> })?.input ?? {}) as {
      problemModel?: { objectives?: unknown[]; selectedMethods?: string[] };
    };
    expect(input.problemModel).toBeDefined();
    expect(input.problemModel?.selectedMethods).toEqual(['physical_experiment']);
    expect(String(req?.systemPrompt ?? '')).toContain('Problem-model alignment');
  });

  it('stays clean (no problemModel key) on pre-AOSSA runs without one', async () => {
    const { store, run, hyp } = setup();
    const reqs: StructuredCallRequest[] = [];
    const provider = capturing(
      createTestStubProvider([{ rawOutput: JSON.stringify({ ...DRAFT(), hypothesisIds: [hyp.id] }), forPurpose: 'research-plan-design' }], { asLive: true }),
      reqs,
    );
    const out = await planStage.execute(makeCtx(store, run, provider));
    expect(out.kind).toBe('done');
    const req = reqs.find((r) => r.task === 'research-plan-design');
    const input = ((req?.userPayload as { input?: Record<string, unknown> })?.input ?? {}) as Record<string, unknown>;
    expect('problemModel' in input).toBe(false);
  });
});
