import { z } from 'zod';
import { RunId, QuestionId, ProblemModelId, MethodSelectionId } from './ids.js';

/**
 * Scientific Problem Model + Method Selection (AOSSA convergence, 2026-08-30 —
 * project-spec/AOSSA-CONVERGENCE-PLAN.md §3).
 *
 * The pipeline was LLM-first: every question walked literature->hypothesis
 * generation. This module is the MISSING front of the north-star chain —
 * before hypotheses are generated, the run forms an explicit problem model
 * (objectives, variables/units, formalization, data inventory, statistical
 * premises, metrics, stop conditions, unknowns) and selects method families
 * for each objective with a REAL validation plan per selected family.
 *
 * Truth rules (house pattern, ported from protocol.ts/theory.ts):
 *  - the MODEL may propose inside the closed declarative spaces below;
 *    deterministic code owns ids, enums, cross-references and validation;
 *  - a SELECTED method family MUST name its validation plan — selecting
 *    "numerical_simulation" without saying what verifies the result is
 *    exactly the LLM-first mistake this object exists to prevent;
 *  - unknowns are first-class (a model with zero unknowns on a frontier
 *    question is suspicious, not excellent) and flagged blocking/non-blocking;
 *  - the problem model is NOT a second truth plane: one object per run,
 *    stored in far.db like every canonical kind, revised only through the
 *    causal Revision path.
 */

// ---------------------------------------------------------------------------
// ScientificProblemModel
// ---------------------------------------------------------------------------

export const ProblemObjective = z.object({
  /** Deterministic code id (obj1, obj2, ...) — never model-minted. */
  id: z.string().regex(/^obj[0-9]+$/, 'must be obj<digits>'),
  statement: z.string().min(5).max(400),
});
export type ProblemObjective = z.infer<typeof ProblemObjective>;

export const ProblemVariableRole = z.enum([
  'independent', 'dependent', 'controlled', 'nuisance', 'parameter', 'observable',
]);
export type ProblemVariableRole = z.infer<typeof ProblemVariableRole>;

export const ProblemVariable = z.object({
  name: z.string().min(1).max(120),
  role: ProblemVariableRole,
  /** Unit as the researcher writes it ("ms", "mg/L", "K"). Absent = dimensionless/unknown — not invented. */
  unit: z.string().max(60).optional(),
  valueType: z.enum(['numeric', 'categorical', 'ordinal', 'text', 'date', 'image', 'other']),
  description: z.string().max(400).optional(),
});
export type ProblemVariable = z.infer<typeof ProblemVariable>;

export const GoverningRelationKind = z.enum([
  'pde', 'ode', 'algebraic_identity', 'statistical_model', 'causal_dag',
  'objective_function', 'algorithmic', 'phenomenological', 'other',
]);
export type GoverningRelationKind = z.infer<typeof GoverningRelationKind>;

export const GoverningRelation = z.object({
  id: z.string().regex(/^rel[0-9]+$/, 'must be rel<digits>'),
  kind: GoverningRelationKind,
  /** The relation in the question's own terms (e.g. "-Laplacian(u) = f on Omega"). */
  statement: z.string().min(10).max(1000),
  /** Assumptions the relation relies on (linearity, isotropy, stationarity...). */
  assumptions: z.array(z.string().min(1).max(300)).max(12).default([]),
});
export type GoverningRelation = z.infer<typeof GoverningRelation>;

export const BoundaryConditionKind = z.enum([
  'dirichlet', 'neumann', 'robin', 'mixed', 'periodic', 'initial_value', 'other',
]);
export type BoundaryConditionKind = z.infer<typeof BoundaryConditionKind>;

export const BoundaryCondition = z.object({
  id: z.string().regex(/^bc[0-9]+$/, 'must be bc<digits>'),
  kind: BoundaryConditionKind,
  /** Where the condition applies and what it fixes, concretely. */
  statement: z.string().min(10).max(500),
});
export type BoundaryCondition = z.infer<typeof BoundaryCondition>;

export const ProblemFormalization = z.object({
  /**
   * What KIND of problem this is. 'none_stated' is legal and honest for
   * phenomenon-explanation questions with no formal structure yet.
   */
  problemClass: z.enum([
    'well_posed_computational', 'statistical_estimation', 'causal_identification',
    'design_optimization', 'phenomenon_explanation', 'descriptive_mapping',
    'formal_derivation', 'none_stated',
  ]),
  governingRelations: z.array(GoverningRelation).max(16).default([]),
  /** Computational/physical domain description ("unit square", "cohort 2015-2020"). */
  domainGeometry: z.string().max(500).optional(),
  boundaryConditions: z.array(BoundaryCondition).max(16).default([]),
  /** Existence/uniqueness/stability notes. Empty = unexamined (never fabricated). */
  wellPosednessNotes: z.array(z.string().min(1).max(400)).max(8).default([]),
});
export type ProblemFormalization = z.infer<typeof ProblemFormalization>;

export const ProblemDataKind = z.enum([
  'retrieved_literature', 'external_dataset', 'local_data', 'simulated',
  'physical_measurement', 'instrument_stream', 'none_available',
]);
export type ProblemDataKind = z.infer<typeof ProblemDataKind>;

export const ProblemDataItem = z.object({
  name: z.string().min(1).max(120),
  kind: ProblemDataKind,
  accessState: z.enum(['available', 'partial', 'unavailable', 'unknown']),
  notes: z.string().max(400).optional(),
});
export type ProblemDataItem = z.infer<typeof ProblemDataItem>;

export const ProblemStatisticalPremises = z.object({
  assumptions: z.array(z.string().min(1).max(300)).max(12).default([]),
  /** Causal claims the question presupposes ("X precedes and influences Y"). */
  causalClaims: z.array(z.string().min(1).max(300)).max(12).default([]),
  /** How causal identification would be achieved, if the question is causal. */
  identificationStrategy: z.string().max(500).optional(),
});
export type ProblemStatisticalPremises = z.infer<typeof ProblemStatisticalPremises>;

export const ProblemMetric = z.object({
  name: z.string().min(1).max(120),
  /** Definitional, checkable statement — not "performance is good". */
  definition: z.string().min(5).max(500),
  appliesTo: z.enum([
    'hypothesis_comparison', 'model_quality', 'prediction_accuracy',
    'estimation_precision', 'process_quality',
  ]),
});
export type ProblemMetric = z.infer<typeof ProblemMetric>;

export const ProblemUnknown = z.object({
  statement: z.string().min(3).max(400),
  /** A blocking unknown prevents any defensible method choice for its objective. */
  blocking: z.boolean().default(false),
  resolutionPath: z.string().max(400).optional(),
});
export type ProblemUnknown = z.infer<typeof ProblemUnknown>;

export const ScientificProblemModel = z.object({
  id: ProblemModelId,
  runId: RunId,
  questionId: QuestionId,
  objectives: z.array(ProblemObjective).min(1).max(6),
  variables: z.array(ProblemVariable).max(32).default([]),
  formalization: ProblemFormalization,
  dataInventory: z.array(ProblemDataItem).max(16).default([]),
  statisticalPremises: ProblemStatisticalPremises,
  metrics: z.array(ProblemMetric).max(12).default([]),
  /** What ends the study: at least one concrete stop condition. */
  stopConditions: z.array(z.string().min(3).max(300)).min(1).max(6),
  unknowns: z.array(ProblemUnknown).max(12).default([]),
  provenance: z.object({
    formedBy: z.enum(['model_proposed', 'researcher', 'mixed']).default('model_proposed'),
    /** Receipt id of the model call that proposed it (absent for pure researcher authorship). */
    proposalReceiptId: z.string().min(1).optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((m, ctx) => {
  const objIds = m.objectives.map((o) => o.id);
  if (new Set(objIds).size !== objIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate objective ids' });
  }
  const varNames = m.variables.map((v) => v.name);
  if (new Set(varNames).size !== varNames.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate variable names' });
  }
  const relIds = m.formalization.governingRelations.map((r) => r.id);
  if (new Set(relIds).size !== relIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate governing relation ids' });
  }
  const bcIds = m.formalization.boundaryConditions.map((b) => b.id);
  if (new Set(bcIds).size !== bcIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate boundary condition ids' });
  }
  const metricNames = m.metrics.map((x) => x.name);
  if (new Set(metricNames).size !== metricNames.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate metric names' });
  }
  // A formal computational class without any governing relation is a
  // self-contradiction the model must not be allowed to emit.
  const formalClasses = new Set(['well_posed_computational', 'formal_derivation']);
  if (formalClasses.has(m.formalization.problemClass) && m.formalization.governingRelations.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['formalization', 'governingRelations'],
      message: 'a formal problem class requires at least one governing relation (or use none_stated/phenomenon_explanation)',
    });
  }
});
export type ScientificProblemModel = z.infer<typeof ScientificProblemModel>;

// ---------------------------------------------------------------------------
// MethodSelection
// ---------------------------------------------------------------------------

/**
 * Method families the system knows how to ROUTE to (the enum is the closed
 * routing vocabulary; each family maps to the executor/leg that can actually
 * validate it — see AOSSA-CONVERGENCE-PLAN §3):
 *   analytic_symbolic    -> theory_identity leg (numerical spot-check of closed forms)
 *   numerical_simulation -> experiment-runtime numerical ops (FEM/ODE; convergence verification)
 *   statistical_inference-> EEL stats ops (preregistered tests) / meta-analysis leg
 *   causal_inference     -> declared; validator = the identification strategy itself
 *   optimization         -> declared; requires domain_software or sidecar op
 *   machine_learning     -> EEL train_eval (tabular today)
 *   retrieval_synthesis  -> retrieve/build_evidence stages (literature evidence)
 *   theorem_proving      -> NOT executable in-system today (theory leg is numerical only)
 *   domain_software      -> agent kernel run_command / sidecar extension
 *   llm_reasoning        -> hypothesis/critique stages (semantic reasoning only)
 *   physical_experiment  -> ProtocolSpec/ProtocolExecution (human-recorded events)
 *   archival_analysis    -> ProtocolSpec archive paradigm
 */
export const MethodFamily = z.enum([
  'analytic_symbolic', 'numerical_simulation', 'statistical_inference', 'causal_inference',
  'optimization', 'machine_learning', 'retrieval_synthesis', 'theorem_proving',
  'domain_software', 'llm_reasoning', 'physical_experiment', 'archival_analysis',
]);
export type MethodFamily = z.infer<typeof MethodFamily>;

export const MethodAssessment = z.enum([
  'selected', 'viable_alternative', 'rejected_inappropriate', 'insufficient_information',
]);
export type MethodAssessment = z.infer<typeof MethodAssessment>;

export const MethodCandidate = z.object({
  family: MethodFamily,
  assessment: MethodAssessment,
  /** Why this family fits or fails THIS objective (min substance enforced). */
  rationale: z.string().min(10).max(1000),
  /**
   * The REAL validator for a selected family: what deterministic/inspectable
   * check verifies results of this method (convergence order, preregistered
   * test, held-out metric, protocol QC rule...). REQUIRED when selected.
   */
    validationPlan: z.string().min(10).max(600).optional(), // canonical discipline: a real validation plan is at least a sentence (the DRAFT tolerates short placeholders; scope.ts strips them before this parse)
});
export type MethodCandidate = z.infer<typeof MethodCandidate>;

export const MethodSelection = z.object({
  id: MethodSelectionId,
  runId: RunId,
  questionId: QuestionId,
  /** Which objective of the run's problem model this selection decides for. */
  forObjectiveId: z.string().regex(/^obj[0-9]+$/, 'must be obj<digits>'),
  candidates: z.array(MethodCandidate).min(2).max(12),
  /** Required when no candidate is selected: an undecided choice must say why. */
  undecidedReason: z.string().min(10).max(500).optional(),
  decidedBy: z.enum(['researcher_override', 'model_proposed']).default('model_proposed'),
  createdAt: z.string().datetime(),
}).superRefine((s, ctx) => {
  const families = s.candidates.map((c) => c.family);
  if (new Set(families).size !== families.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate method families in one selection' });
  }
  const selected = s.candidates.filter((c) => c.assessment === 'selected');
  if (selected.length > 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'at most 2 selected families per objective (a plan spreading wider is two studies)' });
  }
  for (const [i, c] of s.candidates.entries()) {
    if (c.assessment === 'selected' && c.validationPlan === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidates', i, 'validationPlan'],
        message: `selected family ${c.family} must name its validation plan (the real check that verifies results)`,
      });
    }
  }
  if (selected.length === 0 && s.undecidedReason === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'no selected family requires undecidedReason (insufficient information must be stated, not implied)',
    });
  }
});
export type MethodSelection = z.infer<typeof MethodSelection>;

/**
 * Deterministic cross-object integrity: a method selection must decide for an
 * objective that exists in the run's problem model. The creation site calls
 * this (same pattern as protocol's planStepId existence check).
 */
export const checkMethodSelectionBinding = (
  selection: MethodSelection,
  model: ScientificProblemModel,
): string[] => {
  const missing: string[] = [];
  if (selection.runId !== model.runId) missing.push('selection and model belong to different runs');
  if (!model.objectives.some((o) => o.id === selection.forObjectiveId)) {
    missing.push(`forObjectiveId ${selection.forObjectiveId} not in problem model ${model.id}`);
  }
  return missing;
};

// ---------------------------------------------------------------------------
// Formation draft (LLM output shape) — ids are assigned by deterministic code
// ---------------------------------------------------------------------------

/**
 * The shape the model PROPOSES for problem-model formation. It carries NO ids:
 * the scope stage assigns objective/relation/boundary ids positionally
 * (obj1.., rel1.., bc1..) and mints the entity ids — the model never mints an
 * identifier (same discipline as protocol steps ps1..).
 */
export const MethodSelectionDraft = z.object({
  /** 1-based ordinal of the objective this selection decides for. */
  forObjective: z.number().int().min(1).max(6),
  candidates: z.array(z.object({
    family: MethodFamily,
    assessment: MethodAssessment,
    rationale: z.string().min(10).max(1000),
    validationPlan: z.string().min(1).max(600).optional(), // draft-tolerant (live-discovered 2026-08-30): models emit short placeholders on NON-selected candidates; scope.ts strips them deterministically, canonical MethodSelection keeps min(10)
  })).min(2).max(12),
  undecidedReason: z.string().min(10).max(500).optional(),
});
export type MethodSelectionDraft = z.infer<typeof MethodSelectionDraft>;

export const ProblemModelDraft = z.object({
  objectives: z.array(z.object({ statement: z.string().min(5).max(400) })).min(1).max(6),
  variables: z.array(ProblemVariable).max(32).default([]),
  formalization: z.object({
    problemClass: ProblemFormalization.shape.problemClass,
    governingRelations: z.array(z.object({
      kind: GoverningRelationKind,
      statement: z.string().min(10).max(1000),
      assumptions: z.array(z.string().min(1).max(300)).max(12).default([]),
    })).max(16).default([]),
    domainGeometry: z.string().max(500).optional(),
    boundaryConditions: z.array(z.object({
      kind: BoundaryConditionKind,
      statement: z.string().min(10).max(500),
    })).max(16).default([]),
    wellPosednessNotes: z.array(z.string().min(1).max(400)).max(8).default([]),
  }),
  dataInventory: z.array(ProblemDataItem).max(16).default([]),
  statisticalPremises: ProblemStatisticalPremises,
  metrics: z.array(ProblemMetric).max(12).default([]),
  stopConditions: z.array(z.string().min(3).max(300)).min(1).max(6),
  unknowns: z.array(ProblemUnknown).max(12).default([]),
  methodSelections: z.array(MethodSelectionDraft).min(1).max(6),
}).superRefine((d, ctx) => {
  const ordinals = new Set(d.methodSelections.map((s) => s.forObjective));
  if (ordinals.size !== d.methodSelections.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate forObjective ordinals in method selections' });
  }
  for (const s of d.methodSelections) {
    if (s.forObjective > d.objectives.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `method selection for objective ${s.forObjective} but only ${d.objectives.length} objectives exist`,
      });
    }
  }
});
export type ProblemModelDraft = z.infer<typeof ProblemModelDraft>;

/**
 * Audit W3 (engineering): the LLM-facing DRAFT must fail at the model-call
 * boundary (callStructured retry/refusal) rather than letting an incomplete
 * draft pass and explode in canonical parse AFTER the refined question was
 * already persisted. These guards mirror MethodSelection's superRefines,
 * applied per method selection.
 */
export const ProblemModelDraftGuards = ProblemModelDraft.superRefine((d, ctx) => {
  for (const [i, s] of d.methodSelections.entries()) {
    const selected = s.candidates.filter((c) => c.assessment === 'selected');
    if (selected.some((c) => c.validationPlan === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['methodSelections', i], message: 'every selected family must carry validationPlan in the draft' });
    }
    if (selected.length > 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['methodSelections', i], message: 'at most 2 selected families per objective' });
    }
    if (selected.length === 0 && s.undecidedReason === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['methodSelections', i], message: 'no selected family requires undecidedReason' });
    }
  }
});
