import { z } from 'zod';
import { ClaimId, HypothesisId, RunId } from './ids.js';

/** Generation strategies actually exercised (mission §26) — measured, not decorative. */
export const GenerationStrategy = z.enum([
  'evidence_conditioned', 'contradiction_driven', 'mechanism_driven',
  'analogy_driven', 'boundary_condition', 'assumption_perturbation',
  'counterfactual', 'multi_model',
]);
export type GenerationStrategy = z.infer<typeof GenerationStrategy>;

export const NoveltyLabel = z.enum(['evidence_grounded', 'novel_speculation', 'mixed']);
export type NoveltyLabel = z.infer<typeof NoveltyLabel>;

export const Assumption = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  /** Is this assumption backed by retrieved evidence or is it a premise? */
  kind: z.enum(['empirical', 'theoretical', 'methodological', 'stipulated']),
  backingClaimIds: z.array(ClaimId).default([]),
  uncertainty: z.string().optional(),
});
export type Assumption = z.infer<typeof Assumption>;

/**
 * W5/S3 — where the quantitative thresholds of a decision rule come from
 * (model self-assessment, disclosed in the report). Optional: specs persisted
 * before W5 have no provenance and render as「来源未声明」.
 */
export const DecisionRuleProvenance = z.enum(['evidence-derived', 'community-standard', 'model-stipulated']);
export type DecisionRuleProvenance = z.infer<typeof DecisionRuleProvenance>;

/** Mission §29 — a real falsification spec, not "could be tested in the future". */
export const FalsificationSpec = z.object({
  observable: z.string().min(1),
  measurement: z.string().min(1),
  /** Expected relation + decision threshold; qualitative decision rules are legitimate. */
  expectedRelation: z.string().min(1),
  decisionRule: z.string().min(1),
  /** Self-assessed source of the decision rule's thresholds (W5/S3; backward-compatible optional). */
  decisionRuleProvenance: DecisionRuleProvenance.optional(),
  supportCondition: z.string().min(1),
  weakeningCondition: z.string().min(1),
  falsificationCondition: z.string().min(1),
  confounders: z.array(z.string()).default([]),
  alternativeExplanations: z.array(z.string()).default([]),
  dataRequirements: z.array(z.string()).default([]),
  method: z.string().min(1),
  failureInterpretation: z.string().min(1),
  /** Deterministic check result: are the required semantics actually present? */
  completenessCheck: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
});
export type FalsificationSpec = z.infer<typeof FalsificationSpec>;

export const TestabilityStatus = z.enum(['testable_now', 'testable_with_data', 'untestable_currently', 'unfalsifiable']);
export type TestabilityStatus = z.infer<typeof TestabilityStatus>;

export const HypothesisCandidate = z.object({
  id: HypothesisId,
  runId: RunId,
  version: z.number().int().nonnegative().default(0), // bumped on causal revision
  statement: z.string().min(1),
  mechanism: z.string().default(''),
  derivation: z.object({
    strategy: GenerationStrategy,
    rationale: z.string().min(1),
    inputClaimIds: z.array(ClaimId).default([]),
    modelRef: z.string().optional(),
  }),
  assumptions: z.array(Assumption).default([]),
  predictions: z.array(z.string()).default([]),
  supportingClaimIds: z.array(ClaimId).default([]),
  counterClaimIds: z.array(ClaimId).default([]),
  uncertainties: z.array(z.string()).default([]),
  noveltyLabel: NoveltyLabel.default('mixed'),
  testability: TestabilityStatus.default('testable_with_data'),
  falsification: FalsificationSpec.optional(),
  /** Cluster of paraphrase-equivalent candidates; one representative survives ranking. */
  clusterKey: z.string().optional(),
  distinctnessRationale: z.string().optional(), // how it differs in mechanism/assumptions/predictions
  createdAt: z.string().datetime(),
});
export type HypothesisCandidate = z.infer<typeof HypothesisCandidate>;
