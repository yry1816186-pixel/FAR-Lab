import { describe, expect, it } from 'vitest';
import {
  ScientificProblemModel, MethodSelection, ProblemModelDraft, ProblemModelDraftGuards,
  checkMethodSelectionBinding,
} from '../src/domain/problem-model.js';

/**
 * Scientific Problem Model + Method Selection domain contract (AOSSA
 * convergence §3). These tests pin the deterministic validation rules the
 * model-proposed draft must satisfy — the honesty gates that keep method
 * selection from degenerating back into LLM-first guessing.
 */

const RUN = 'run_abcdefghijklmnopqrstuvwxyz12' as const;
const Q = 'q_abcdefghijklmnopqrstuvwxyz12' as const;
const NOW = '2026-08-30T00:00:00.000Z';

const baseModel = {
  id: 'pmod_abcdefghijklmnopqrstuvwxyz12',
  runId: RUN,
  questionId: Q,
  objectives: [{ id: 'obj1', statement: 'solve the stated boundary-value problem' }],
  variables: [
    { name: 'u', role: 'dependent' as const, unit: 'K', valueType: 'numeric' as const },
    { name: 'f', role: 'parameter' as const, valueType: 'numeric' as const },
  ],
  formalization: {
    problemClass: 'well_posed_computational' as const,
    governingRelations: [
      { id: 'rel1', kind: 'pde' as const, statement: '-Laplacian(u) = f on the unit square', assumptions: ['f is square-integrable'] },
    ],
    boundaryConditions: [
      { id: 'bc1', kind: 'mixed' as const, statement: 'u = 0 on the vertical edges; du/dn = g on the horizontal edges' },
    ],
    wellPosednessNotes: ['elliptic with coercive bilinear form: Lax-Milgram applies'],
  },
  dataInventory: [],
  statisticalPremises: { assumptions: [], causalClaims: [] },
  metrics: [
    { name: 'L2 error', definition: 'sqrt(integral of (u_h - u)^2) against the analytic solution', appliesTo: 'model_quality' as const },
  ],
  stopConditions: ['all planned refinement levels evaluated and the convergence order measured'],
  unknowns: [{ statement: 'regularity of f at the corner singularities', blocking: false }],
  provenance: { formedBy: 'model_proposed' as const },
  createdAt: NOW,
  updatedAt: NOW,
};

const baseSelection = {
  id: 'msel_abcdefghijklmnopqrstuvwxyz12',
  runId: RUN,
  questionId: Q,
  forObjectiveId: 'obj1',
  candidates: [
    {
      family: 'numerical_simulation' as const,
      assessment: 'selected' as const,
      rationale: 'an elliptic BVP with mixed boundary conditions is solved by FEM',
      validationPlan: 'convergence order check: L2 error must decay at the expected rate under uniform refinement',
    },
    {
      family: 'analytic_symbolic' as const,
      assessment: 'rejected_inappropriate' as const,
      rationale: 'the mixed boundary data admits no closed-form solution',
    },
  ],
  decidedBy: 'model_proposed' as const,
  createdAt: NOW,
};

describe('ScientificProblemModel schema', () => {
  it('accepts a well-formed model', () => {
    expect(() => ScientificProblemModel.parse(baseModel)).not.toThrow();
  });

  it('rejects a formal problem class with zero governing relations', () => {
    const bad = { ...baseModel, formalization: { ...baseModel.formalization, governingRelations: [] } };
    expect(() => ScientificProblemModel.parse(bad)).toThrow(/at least one governing relation/);
  });

  it('rejects duplicate variable names and objective ids', () => {
    expect(() => ScientificProblemModel.parse({
      ...baseModel,
      variables: [...baseModel.variables, { ...baseModel.variables[0]! }],
    })).toThrow(/duplicate variable names/);
    expect(() => ScientificProblemModel.parse({
      ...baseModel,
      objectives: [...baseModel.objectives, { ...baseModel.objectives[0]! }],
    })).toThrow(/duplicate objective ids/);
  });
});

describe('MethodSelection schema', () => {
  it('accepts a well-formed selection', () => {
    expect(() => MethodSelection.parse(baseSelection)).not.toThrow();
  });

  it('rejects a selected family without a validation plan', () => {
    const bad = {
      ...baseSelection,
      candidates: [
        { ...baseSelection.candidates[0]!, validationPlan: undefined },
        baseSelection.candidates[1]!,
      ],
    };
    expect(() => MethodSelection.parse(bad)).toThrow(/must name its validation plan/);
  });

  it('rejects more than two selected families', () => {
    const bad = {
      ...baseSelection,
      candidates: [
        ...baseSelection.candidates,
        { family: 'statistical_inference' as const, assessment: 'selected' as const, rationale: 'fills a third lane', validationPlan: 'preregistered test under the frozen policy' },
        { family: 'machine_learning' as const, assessment: 'selected' as const, rationale: 'fills a fourth lane', validationPlan: 'held-out test metric' },
      ],
    };
    expect(() => MethodSelection.parse(bad)).toThrow(/at most 2 selected/);
  });

  it('rejects an undecided selection without an undecidedReason', () => {
    const bad = {
      ...baseSelection,
      candidates: baseSelection.candidates.map((c) => ({ ...c, assessment: 'insufficient_information' as const })),
    };
    expect(() => MethodSelection.parse(bad)).toThrow(/undecidedReason/);
  });

  it('rejects duplicate families within one selection', () => {
    const bad = {
      ...baseSelection,
      candidates: [baseSelection.candidates[0]!, { ...baseSelection.candidates[1]!, family: 'numerical_simulation' as const }],
    };
    expect(() => MethodSelection.parse(bad)).toThrow(/duplicate method families/);
  });
});

describe('checkMethodSelectionBinding', () => {
  const model = ScientificProblemModel.parse(baseModel);
  const selection = MethodSelection.parse(baseSelection);

  it('passes for a consistent pair', () => {
    expect(checkMethodSelectionBinding(selection, model)).toEqual([]);
  });

  it('flags an objective that does not exist in the model', () => {
    const stray = MethodSelection.parse({ ...baseSelection, forObjectiveId: 'obj9' });
    expect(checkMethodSelectionBinding(stray, model)).toContain('forObjectiveId obj9 not in problem model pmod_abcdefghijklmnopqrstuvwxyz12');
  });

  it('flags cross-run pairing', () => {
    const foreign = MethodSelection.parse({ ...baseSelection, runId: 'run_abcdefghijklmnopqrstuvwxyz34' });
    expect(checkMethodSelectionBinding(foreign, model)).toContain('selection and model belong to different runs');
  });
});

describe('ProblemModelDraft (model-proposed shape)', () => {
  const draft = {
    objectives: [{ statement: 'estimate the treatment effect' }],
    variables: [],
    formalization: { problemClass: 'statistical_estimation', governingRelations: [], boundaryConditions: [], wellPosednessNotes: [] },
    dataInventory: [],
    statisticalPremises: { assumptions: [], causalClaims: [] },
    metrics: [],
    stopConditions: ['one preregistered analysis'],
    unknowns: [],
    methodSelections: [
      {
        forObjective: 1,
        candidates: [
          { family: 'statistical_inference', assessment: 'selected', rationale: 'effect estimation from trial data', validationPlan: 'preregistered test at the frozen alpha' },
          { family: 'retrieval_synthesis', assessment: 'viable_alternative', rationale: 'literature context informs priors but cannot estimate the local effect' },
        ],
      },
    ],
  };

  it('accepts a valid draft', () => {
    expect(() => ProblemModelDraft.parse(draft)).not.toThrow();
  });

  it('rejects a method selection for a nonexistent objective ordinal', () => {
    const bad = { ...draft, methodSelections: [{ ...draft.methodSelections[0]!, forObjective: 3 }] };
    expect(() => ProblemModelDraft.parse(bad)).toThrow(/only 1 objectives exist/);
  });

  it('rejects duplicate objective ordinals across selections', () => {
    const bad = { ...draft, methodSelections: [draft.methodSelections[0]!, draft.methodSelections[0]!] };
    expect(() => ProblemModelDraft.parse(bad)).toThrow(/duplicate forObjective ordinals/);
  });
});

describe('ProblemModelDraftGuards (W3: boundary rejection before persistence)', () => {
  const makeDraft = () => ({
    objectives: [{ statement: 'estimate the treatment effect' }],
    variables: [],
    formalization: { problemClass: 'statistical_estimation', governingRelations: [], boundaryConditions: [], wellPosednessNotes: [] },
    dataInventory: [],
    statisticalPremises: { assumptions: [], causalClaims: [] },
    metrics: [],
    stopConditions: ['one preregistered analysis'],
    unknowns: [],
    methodSelections: [{
      forObjective: 1,
      candidates: [
        { family: 'statistical_inference', assessment: 'selected', rationale: 'effect estimation from trial data', validationPlan: 'preregistered test at the frozen alpha' },
        { family: 'retrieval_synthesis', assessment: 'viable_alternative', rationale: 'literature context informs priors but cannot estimate the local effect' },
      ],
    }],
  });

  it('rejects a selected candidate without validationPlan at the call boundary', () => {
    const draft = makeDraft();
    draft.methodSelections[0]!.candidates[0]!.validationPlan = undefined;
    expect(() => ProblemModelDraftGuards.parse(draft)).toThrow(/every selected family must carry validationPlan/);
  });

  it('rejects an undecided selection without undecidedReason', () => {
    const draft = makeDraft();
    draft.methodSelections[0]!.candidates.forEach((c) => { c.assessment = 'rejected_inappropriate'; });
    expect(() => ProblemModelDraftGuards.parse(draft)).toThrow(/no selected family requires undecidedReason/);
  });
});
