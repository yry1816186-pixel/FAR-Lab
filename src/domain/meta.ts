import { z } from 'zod';
import { RunId, PlanId, TaskId, HypothesisId, ExperimentSpecId, EffectEstimateId } from './ids.js';
import { BindingApproval } from './experiment.js';
import { DecisionRuleProvenance } from './hypothesis.js';

/**
 * W-F M3: statistical_meta experiment domain (scout §3). Literature-type questions
 * close their falsification loop by POOLING effect estimates extracted from the
 * retrieved corpus — no dataset acquisition, no training, no sidecar.
 *
 * Discipline ported verbatim from the ML path (D-081/D-085):
 * - the analysis is PREREGISTERED here (measure, model, threshold, minStudies)
 *   before any number is pooled; execution binds to a spec hash;
 * - verdicts derive mechanically from a decision rule on the pooled log-scale CI —
 *   an LLM never produces one (it only PROPOSES numbers, which pass deterministic
 *   admission gates in experiment/meta-estimate.ts);
 * - hypothesis-bound comparisons require a covering human approval.
 */

/** 2×2 contingency table: exposed cases / exposed non-cases / control cases / control non-cases. */
export const TwoByTwo = z.object({
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative(),
  c: z.number().int().nonnegative(),
  d: z.number().int().nonnegative(),
});
export type TwoByTwo = z.infer<typeof TwoByTwo>;

export const EffectMeasureScale = z.enum(['log_or', 'log_rr', 'smd']);
export type EffectMeasureScale = z.infer<typeof EffectMeasureScale>;

export const MetaPoolingModel = z.enum(['fixed', 'random_dl']);
export type MetaPoolingModel = z.infer<typeof MetaPoolingModel>;

/** The single primary comparison of a meta spec (log scale; OR/RR null boundary = 0). */
export const MetaComparison = z.object({
  id: z.string().min(1),
  effectMeasure: EffectMeasureScale,
  /** Analysis-scale threshold the preregistered rule tests against (log scale). */
  direction: z.enum(['above', 'below']),
  threshold: z.number().default(0),
  thresholdProvenance: DecisionRuleProvenance,
  hypothesisId: HypothesisId.optional(),
  primary: z.literal(true).default(true),
});
export type MetaComparison = z.infer<typeof MetaComparison>;

export const MetaAnalysisSpec = z.object({
  id: ExperimentSpecId,
  runId: RunId,
  planId: PlanId,
  planStepId: TaskId,
  version: z.number().int().nonnegative().default(1),
  question: z.string().min(1),
  experimentType: z.literal('statistical_meta'),
  /** Preregistered study inclusion/exclusion criteria (text, auditable). */
  inclusionCriteria: z.string().min(10),
  effectMeasure: EffectMeasureScale,
  /** Which pooling model produces the VERDICT-bearing CI; the other runs as sensitivity. */
  metaModel: MetaPoolingModel,
  /** Preregistered feasibility floor: fewer admissible studies => INSUFFICIENT_DATA, never a thin pool. */
  minStudies: z.number().int().min(2),
  alpha: z.number().positive().max(0.5).default(0.05),
  ciLevel: z.number().positive().max(0.999).default(0.95),
  comparison: MetaComparison,
  approvals: z.array(BindingApproval).default([]),
  /** Required when the comparison binds no hypothesis (exploratory runs are explicit). */
  exploratoryNote: z.string().min(10).optional(),
  validation: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
});
export type MetaAnalysisSpec = z.infer<typeof MetaAnalysisSpec>;

/**
 * A VALIDATED numeric estimate extracted from one claim (the admission gate lives in
 * experiment/meta-estimate.ts; only estimates that PASSED are ever persisted here).
 */
export const EffectEstimateRecord = z.object({
  id: EffectEstimateId,
  runId: RunId,
  metaSpecId: ExperimentSpecId.optional(),
  claimId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  measure: z.enum(['or', 'rr', 'smd']),
  /** Raw-scale point/bounds exactly as reported. */
  point: z.number().positive(),
  ciLow: z.number().positive().optional(),
  ciHigh: z.number().positive().optional(),
  ciLevel: z.number().positive().max(0.999).default(0.95),
  twoByTwo: TwoByTwo.optional(),
  nTotal: z.number().int().positive().optional(),
  extractionModelRef: z.string().min(1),
  extractedAt: z.string().datetime(),
});
export type EffectEstimateRecord = z.infer<typeof EffectEstimateRecord>;

/**
 * Fail-closed meta spec validation (the analogue of checkExperimentSpec): cross-reference
 * integrity + approval/exploratory honesty gates. Numbers are NOT checked here —
 * estimates do not exist until execution, and their gate is deterministic validation.
 */
export const checkMetaSpec = (
  spec: MetaAnalysisSpec,
  ctx: { hypothesisIds: readonly HypothesisId[] },
): { passed: boolean; missing: string[] } => {
  const missing: string[] = [];
  const hypSet = new Set(ctx.hypothesisIds);
  const cmp = spec.comparison;
  if (cmp.effectMeasure !== spec.effectMeasure) {
    missing.push(`comparison.effectMeasure (${cmp.effectMeasure}) != spec.effectMeasure (${spec.effectMeasure})`);
  }
  if (spec.minStudies < 2) missing.push('minStudies must be >= 2 (a single study cannot pool)');
  if (cmp.hypothesisId !== undefined && !hypSet.has(cmp.hypothesisId)) {
    missing.push('comparison.hypothesisId not in run');
  }
  if (cmp.hypothesisId !== undefined) {
    const covered = spec.approvals.some(
      (a) => a.hypothesisId === cmp.hypothesisId && a.comparisonIds.includes(cmp.id),
    );
    if (!covered) {
      missing.push(`hypothesis-bound comparison ${cmp.id} lacks a covering binding approval (D-085 P0-1)`);
    }
  }
  if (cmp.hypothesisId === undefined && spec.exploratoryNote === undefined) {
    missing.push('no hypothesis-bound comparison and no exploratoryNote — exploratory runs must be explicit');
  }
  // Null-boundary thresholds (log 0 for OR/RR) are a mathematical fact, not a choice:
  // they are the ONLY thresholds that may ride the default instead of an explicit
  // provenance decision — and they must say so honestly.
  if (cmp.threshold === 0 && (spec.effectMeasure === 'log_or' || spec.effectMeasure === 'log_rr')
      && cmp.thresholdProvenance !== 'null-boundary' && cmp.thresholdProvenance !== 'community-standard') {
    missing.push('threshold=0 on a ratio measure must declare provenance null-boundary (or community-standard)');
  }
  for (const a of spec.approvals) {
    if (!hypSet.has(a.hypothesisId)) missing.push(`approval for unknown hypothesis ${a.hypothesisId}`);
    if (!a.comparisonIds.includes(cmp.id)) missing.push(`approval covers comparison outside this spec (${a.comparisonIds.join(',')})`);
  }
  return { passed: missing.length === 0, missing };
};
