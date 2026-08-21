import { z } from 'zod';
import { HypothesisId, PlanId, RunId, TaskId, ClaimId } from './ids.js';

/** Mission §31 — a plan a human researcher or adapter can actually execute, not an essay. */
export const PlanStep = z.object({
  id: TaskId,
  title: z.string().min(1),
  kind: z.enum(['literature', 'data_analysis', 'tool_run', 'simulation', 'experiment', 'human_review', 'other']),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  method: z.string().min(1),
  failureConditions: z.array(z.string()).default([]),
  dependsOn: z.array(TaskId).default([]),
  estimatedCost: z.string().optional(),
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
  }).optional(),
  createdAt: z.string().datetime(),
});
export type ResearchPlan = z.infer<typeof ResearchPlan>;
export type PlanStep = z.infer<typeof PlanStep>;
export type DatasetRequirement = z.infer<typeof DatasetRequirement>;
export type ToolRequirement = z.infer<typeof ToolRequirement>;
export type DecisionRules = z.infer<typeof DecisionRules>;
