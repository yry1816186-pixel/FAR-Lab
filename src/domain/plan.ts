import { z } from 'zod';
import { HypothesisId, PlanId, RunId, TaskId, ClaimId } from './ids.js';

/** Mission §31 — a plan a human researcher or adapter can actually execute, not an essay. */
export const PlanStep = z.object({
  id: TaskId,
  title: z.string().min(1),
  kind: z.enum(['literature', 'data_analysis', 'tool_run', 'simulation', 'experiment', 'human_review', 'negative_control', 'other']),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  method: z.string().min(1),
  failureConditions: z.array(z.string()).default([]),
  dependsOn: z.array(TaskId).default([]),
  estimatedCost: z.string().optional(),
  /** Stage-gate (Wave-S/s2): failureConditions become executable stop criteria. */
  gate: z.object({
    proceedIf: z.string().min(1),
    killIf: z.string().min(1),
  }).optional(),
  /** FORRT-style replication classification when the step repeats prior work (Wave-S/s6). */
  replication: z.object({
    type: z.enum(['reproduction', 'direct_replication', 'conceptual_replication', 'extension']),
    targetStepId: z.string().optional(),
  }).optional(),
});

export const DecisionRules = z.object({
  successCriterion: z.string().min(1),
  weakeningCriterion: z.string().min(1),
  falsificationCriterion: z.string().min(1),
  stopCriterion: z.string().min(1),
});

/**
 * Mission §29 multiple-testing discipline (POPPER paper-EXTRACT, D-024 Wave-3 #5):
 * a plan that discriminates between several hypotheses runs several inferential
 * checks; without an explicit policy the chance that SOMETHING looks
 * falsified/supportive by luck grows with the number of checks.
 * - single_primary: one designated primary comparison carries the decision, all
 *   others are secondary/descriptive;
 * - alpha_spending: explicit error budget split across staged checks (fixed
 *   allocation, decided before looking at the data);
 * - e_value_accumulation: anytime-valid e-values aggregated across checks
 *   (no fixed schedule needed).
 * Deliberately optional in the schema (single-hypothesis plans have one primary
 * comparison by construction); the deterministic executability gate REQUIRES it
 * when hypothesisIds.length > 1 — no silent default.
 */
export const MultipleTestingPolicy = z.enum(['single_primary', 'alpha_spending', 'e_value_accumulation']);
export type MultipleTestingPolicy = z.infer<typeof MultipleTestingPolicy>;

export const DatasetRequirement = z.object({
  name: z.string().min(1),
  variables: z.array(z.string()).min(1),
  availability: z.enum(['public', 'request_required', 'must_collect', 'unavailable', 'unknown']),
  sourceHint: z.string().optional(),
});

export const ToolRequirement = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  kind: z.enum(['software', 'compute', 'instrument', 'human', 'other']),
});

/**
 * Wave-S/s4 P0 — structured preregistration. The free-text metrics/statistics/
 * decisionRules stay (legacy rendering, human prose); when this structured layer is
 * present the deterministic gate audits it (plan-formal.ts): free-text preregistration
 * is not auditable — "a preregistration that cannot be checked ≈ no preregistration"
 * (mapping on Claesen 2021 preregistration-completeness taxonomy).
 */
export const MetricSpec = z.object({
  name: z.string().min(1),
  definition: z.string().min(1),
  role: z.enum(['primary', 'secondary']),
  direction: z.enum(['higher_better', 'lower_better', 'two_sided']),
});
export type MetricSpec = z.infer<typeof MetricSpec>;

export const TestStatistic = z.enum(['permutation', 'bootstrap_ci', 'wilson', 'kappa', 'mde_gate', 'descriptive']);
export type TestStatistic = z.infer<typeof TestStatistic>;

/** d4: one inference framework per test — cross-framework atom conjunctions are gate errors. */
export const InferenceFramework = z.enum(['np_test', 'estimation_ci', 'bayesian']);
export type InferenceFramework = z.infer<typeof InferenceFramework>;

export const TestSpec = z.object({
  id: z.string().min(1),
  /** Must resolve to a MetricSpec name (gate-checked). */
  metric: z.string().min(1),
  statistic: TestStatistic,
  hypothesisIds: z.array(HypothesisId).default([]),
  prediction: z.enum(['supports', 'weakens', 'excludes']),
  interpretation: InferenceFramework.default('np_test'),
  alpha: z.number().min(0).max(1).optional(),
  threshold: z.number().optional(),
  thresholdOp: z.enum(['>=', '<=', '>', '<']).optional(),
});
export type TestSpec = z.infer<typeof TestSpec>;

/**
 * Platt/Chamberlin machine-checkable prediction (g3): two hypotheses genuinely COMPETE
 * only when they predict different relations for the same (observable, condition) —
 * the conflict matrix check turns "competing hypotheses" from prose into structure.
 */
export const StructuredPrediction = z.object({
  hypothesisId: HypothesisId,
  observable: z.string().min(1),
  condition: z.string().min(1),
  expectedRelation: z.string().min(1),
});
export type StructuredPrediction = z.infer<typeof StructuredPrediction>;

/** VOI semi-structure (s2): auditable rationale for WHY this evidence is worth buying. */
export const VoiBlock = z.object({
  decisionAtStake: z.string().min(1),
  ambiguitySource: z.string().min(1),
  discriminatingMetric: z.string().min(1),
  expectedSeparation: z.string().min(1),
});
export type VoiBlock = z.infer<typeof VoiBlock>;

/** Hernán & Robins target-trial seven elements (s4) — required for causal claims from
 * observational data; the gate downgrades causal claims that lack the protocol. */
export const TargetTrialProtocol = z.object({
  eligibility: z.string().min(1),
  treatmentStrategy: z.string().min(1),
  assignmentProcedure: z.string().min(1),
  followUpPeriod: z.string().min(1),
  outcome: z.string().min(1),
  causalContrast: z.string().min(1),
  analysisPlan: z.string().min(1),
});
export type TargetTrialProtocol = z.infer<typeof TargetTrialProtocol>;

/** Wave-S/s6 — RR stage-1 freeze: the plan as registered, deviations as first-class objects. */
export const PlanDeviation = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  stepId: TaskId.optional(),
  what: z.string().min(1),
  why: z.string().min(1),
  consequence: z.string().min(1),
});
export type PlanDeviation = z.infer<typeof PlanDeviation>;

export const ResearchPlan = z.object({
  id: PlanId,
  runId: RunId,
  objective: z.string().min(1),
  hypothesisIds: z.array(HypothesisId).min(1),
  variables: z.array(z.string()).default([]),
  controls: z.array(z.string()).default([]),
  inclusionCriteria: z.array(z.string()).default([]),
  exclusionCriteria: z.array(z.string()).default([]),
  dataRequirements: z.array(DatasetRequirement).default([]),
  toolRequirements: z.array(ToolRequirement).default([]),
  steps: z.array(PlanStep).min(1),
  metrics: z.array(z.string()).min(1),
  statistics: z.array(z.string()).default([]),
  decisionRules: DecisionRules,
  /** Required by the executability gate when the plan discriminates >1 hypothesis (see MultipleTestingPolicy). */
  multipleTestingPolicy: MultipleTestingPolicy.optional(),
  /** How the error budget / primary comparison is allocated — auditable rationale, not just the label. */
  multipleTestingNote: z.string().optional(),
  // ---- Wave-S structured preregistration layer (g1; audited by plan-formal.ts) ----
  metricSpecs: z.array(MetricSpec).default([]),
  testSpecs: z.array(TestSpec).default([]),
  predictions: z.array(StructuredPrediction).default([]),
  /** Structured VOI (replaces the advisory string when present; gate-required >1 hypothesis). */
  expectedInfoGain: VoiBlock.optional(),
  targetTrialProtocol: TargetTrialProtocol.optional(),
  /** ARC-Bench manifest factors (s5): what is measured, of what population, vs which control. */
  measurable: z.string().optional(),
  estimand: z.string().optional(),
  controlRun: z.string().optional(),
  robustnessPlan: z.array(z.string()).default([]),
  /**
   * g4 (d4): required when any testSpec declares interpretation='bayesian' — how the
   * Bayesian decision thresholds are calibrated to error rates (FDA-device-Bayesian
   * guidance lineage). Frequency-side vocabulary needs no calibration note.
   */
  bayesianCalibrationNote: z.string().min(1).optional(),
  // ---- g13 freeze triplet (RR stage-1): hash at registration + first-class deviations ----
  planHash: z.string().optional(),
  frozenAt: z.string().datetime().optional(),
  deviations: z.array(PlanDeviation).default([]),
  confounders: z.array(z.string()).default([]),
  alternativeExplanations: z.array(z.string()).default([]),
  resources: z.object({
    compute: z.string().default('unspecified'),
    cost: z.string().default('unspecified'),
    time: z.string().default('unspecified'),
  }).default({}),
  risks: z.array(z.string()).default([]),
  ethics: z.array(z.string()).default([]),
  prerequisites: z.array(z.string()).default([]),
  expectedInformationGain: z.string().optional(),
  alternativeBranches: z.array(z.string()).default([]),
  reproducibilityRequirements: z.array(z.string()).default([]),
  evidenceClaimIds: z.array(ClaimId).default([]),
  /** Deterministic executability gate output (W2 checker). */
  executabilityCheck: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
    /**
     * Statistical-design advisory (W-G follow-up, Maastricht-checklist pattern):
     * quantitative plans with no power/sample-size/effect-size/significance declaration
     * are executable but statistically under-specified. Advisory only — never fails
     * the gate (qualitative plans legitimately omit statistical design).
     */
    statisticalDesignNote: z.string().optional(),
    /** Wave-S structured-layer warnings (advisory; errors go into `missing`). */
    structuredWarnings: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
});
export type ResearchPlan = z.infer<typeof ResearchPlan>;
export type PlanStep = z.infer<typeof PlanStep>;
export type DatasetRequirement = z.infer<typeof DatasetRequirement>;
export type ToolRequirement = z.infer<typeof ToolRequirement>;
export type DecisionRules = z.infer<typeof DecisionRules>;
