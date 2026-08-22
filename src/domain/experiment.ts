import { z } from 'zod';
import {
  RunId, PlanId, TaskId, HypothesisId, ExperimentSpecId, ExperimentRunId,
  DatasetRecordId, ResultSetId, StatReportId,
} from './ids.js';
import { MultipleTestingPolicy } from './plan.js';
import { DecisionRuleProvenance } from './hypothesis.js';

/**
 * EEL domain layer (D-081, SCIENTIFIC_MODEL §10). Semantics that must not drift:
 * - The statistical analysis is PREREGISTERED here before execution; a changed
 *   analysis is a new spec version, never a silent mutation.
 * - Verdicts (supports/falsifies/inconclusive) derive mechanically from a
 *   decision rule against a confidence interval. An LLM never produces them.
 * - Same (spec, seed, environment) => same results, or the divergence is reported.
 */

// ---- datasets ----

/** Where a dataset comes from. P1 implements openml + local (tests); url arrives with env pinning. */
export const DatasetSource = z.discriminatedUnion('resolver', [
  z.object({
    resolver: z.literal('openml'),
    openmlId: z.number().int().positive(),
    name: z.string().min(1).optional(),
  }),
  z.object({
    resolver: z.literal('local'),
    /** Path as provided by the operator; recorded verbatim for lineage. */
    path: z.string().min(1),
    sha256Expected: z.string().length(64).optional(),
  }),
]);
export type DatasetSource = z.infer<typeof DatasetSource>;

export const SplitSpec = z.object({
  method: z.enum(['random', 'random_stratified']),
  /** Must sum to 1 (+/- 1e-9); val may be 0 (train/test only). */
  ratios: z.object({
    train: z.number().positive(),
    val: z.number().nonnegative(),
    test: z.number().positive(),
  }),
  seed: z.number().int().nonnegative(),
}).superRefine((s, ctx) => {
  const sum = s.ratios.train + s.ratios.val + s.ratios.test;
  if (Math.abs(sum - 1) > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `split ratios must sum to 1, got ${sum}` });
  }
});
export type SplitSpec = z.infer<typeof SplitSpec>;

export const DatasetUse = z.object({
  source: DatasetSource,
  targetColumn: z.string().min(1),
  split: SplitSpec,
  /** Declared leakage control: group column kept intact within splits when present. */
  groupColumn: z.string().min(1).optional(),
});
export type DatasetUse = z.infer<typeof DatasetUse>;

/** Immutable record of an acquired dataset (E2). Identity = content hash + lineage. */
export const DatasetRecord = z.object({
  id: DatasetRecordId,
  runId: RunId,
  name: z.string().min(1),
  source: DatasetSource,
  license: z.string().default('unknown'),
  format: z.enum(['csv', 'arff']),
  /** Content-addressed ref of the RAW acquired file (before any preprocessing). */
  contentRef: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  targetColumn: z.string().min(1),
  columns: z.array(z.string()).min(1),
  nRows: z.number().int().positive(),
  /** Ordered lineage steps applied after acquisition (split recorded on first use). */
  lineage: z.array(z.object({
    kind: z.enum(['acquired', 'split', 'preprocess']),
    detail: z.string().min(1),
    at: z.string().datetime(),
  })).default([]),
  fetchedAt: z.string().datetime(),
});
export type DatasetRecord = z.infer<typeof DatasetRecord>;

/** Outcome of applying a SplitSpec: the assignment itself is an artifact (auditable). */
export const SplitOutcome = z.object({
  datasetRecordId: DatasetRecordId,
  specHash: z.string().length(64),
  trainIdx: z.array(z.number().int().nonnegative()),
  valIdx: z.array(z.number().int().nonnegative()),
  testIdx: z.array(z.number().int().nonnegative()),
  classBalance: z.record(z.string(), z.number()).default({}),
});
export type SplitOutcome = z.infer<typeof SplitOutcome>;

// ---- models ----

export const BuilderId = z.enum([
  'dummy_most_frequent', 'logistic_regression', 'random_forest_classifier', 'gradient_boosting_classifier',
]);
export type BuilderId = z.infer<typeof BuilderId>;

/** Hyperparameters are primitives only — deterministic serialization, no code injection surface. */
export const Hyperparams = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
export type Hyperparams = z.infer<typeof Hyperparams>;

export const ModelSpec = z.object({
  name: z.string().min(1),
  builderId: BuilderId,
  hyperparams: Hyperparams.default({}),
  seed: z.number().int().nonnegative(),
});
export type ModelSpec = z.infer<typeof ModelSpec>;

// ---- metrics & comparisons ----

export const MetricKey = z.enum([
  'accuracy', 'balanced_accuracy', 'f1_macro', 'roc_auc', 'log_loss',
  'mean_squared_error', 'r2',
]);
export type MetricKey = z.infer<typeof MetricKey>;

/**
 * A comparison is the unit of statistical analysis. `absolute` scores one model
 * against a threshold; `paired_diff` scores modelA − modelB (same split rows).
 * hypothesisId present => the verdict binds to that hypothesis' decision rule;
 * absent => explicitly exploratory (labelled, never promoted to a hypothesis verdict).
 * thresholdProvenance (D-085 P0-1): where the threshold came from — inherited from the
 * bound hypothesis' decisionRuleProvenance when present. Every stat_report and rendering
 * must display it; a mechanical verdict on a model-stipulated threshold is exactly as
 * strong as that disclosure makes clear.
 */
export const Comparison = z.object({
  id: z.string().min(1),
  metricKey: MetricKey,
  kind: z.union([z.literal('absolute'), z.literal('paired_diff')]),
  modelIdx: z.number().int().nonnegative().optional(),
  modelAIdx: z.number().int().nonnegative().optional(),
  modelBIdx: z.number().int().nonnegative().optional(),
  direction: z.enum(['above', 'below']),
  threshold: z.number(),
  thresholdProvenance: DecisionRuleProvenance,
  hypothesisId: HypothesisId.optional(),
  primary: z.boolean().default(false),
});
export type Comparison = z.infer<typeof Comparison>;

/**
 * D-085 P0-1: the correspondence between a machine-readable decision binding and the
 * (free-text) hypothesis decision rule cannot be verified deterministically — a human
 * approves it ONCE PER BINDING, and the approval snapshots the rule text it was judged
 * against. The executor refuses hypothesis-bound comparisons without a covering approval.
 */
export const BindingApproval = z.object({
  hypothesisId: HypothesisId,
  comparisonIds: z.array(z.string().min(1)).min(1),
  decisionRuleSnapshot: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
});
export type BindingApproval = z.infer<typeof BindingApproval>;

/** Preregistered statistical analysis (frozen at spec creation). */
export const StatisticsPlan = z.object({
  test: z.enum(['paired_bootstrap_ci', 'paired_t']),
  alpha: z.number().positive().max(0.5),
  /** Bootstrap resamples (ignored for paired_t); deterministic given analysisSeed. */
  nBoot: z.number().int().positive().default(2000),
  analysisSeed: z.number().int().nonnegative(),
  ciLevel: z.number().positive().max(0.999).default(0.95),
  multipleTestingPolicy: MultipleTestingPolicy.optional(),
  /** Required when >1 comparison exists (no silent default, mirrors plan-level gate). */
  multipleTestingNote: z.string().optional(),
});
export type StatisticsPlan = z.infer<typeof StatisticsPlan>;

// ---- experiment spec ----

export const ComputeProfile = z.object({
  device: z.enum(['local']).default('local'),
  maxParallel: z.number().int().positive().max(16).default(2),
  timeoutMs: z.number().int().positive().default(600_000),
});
export type ComputeProfile = z.infer<typeof ComputeProfile>;

export const ExperimentSpec = z.object({
  id: ExperimentSpecId,
  runId: RunId,
  planId: PlanId,
  planStepId: TaskId,
  /** Bumped on any change; execution binds to a spec hash so mutations cannot sneak in. */
  version: z.number().int().nonnegative().default(1),
  question: z.string().min(1),
  datasets: z.array(DatasetUse).length(1),
  models: z.array(ModelSpec).min(1),
  metrics: z.array(MetricKey).min(1),
  comparisons: z.array(Comparison).min(1),
  statistics: StatisticsPlan,
  compute: ComputeProfile.default({}),
  /** D-085 P0-1: per-binding human approvals covering all hypothesis-bound comparisons. */
  approvals: z.array(BindingApproval).default([]),
  /** D-086-6: required when NO comparison binds a hypothesis — exploratory runs are explicit, never silent. */
  exploratoryNote: z.string().min(10).optional(),
  validation: z.object({
    passed: z.boolean(),
    missing: z.array(z.string()).default([]),
  }).optional(),
  createdAt: z.string().datetime(),
});
export type ExperimentSpec = z.infer<typeof ExperimentSpec>;

// ---- execution ----

export const ExperimentRunStatus = z.enum([
  'queued', 'running', 'completed', 'failed', 'canceled',
]);
export type ExperimentRunStatus = z.infer<typeof ExperimentRunStatus>;

export const EnvInfo = z.object({
  pythonVersion: z.string().min(1),
  versions: z.record(z.string(), z.string()),
  /** uv.lock hash when the pinned sidecar env was used; absent for system interpreter (recorded honestly). */
  lockfileHash: z.string().length(64).optional(),
});
export type EnvInfo = z.infer<typeof EnvInfo>;

export const ExperimentRun = z.object({
  id: ExperimentRunId,
  runId: RunId,
  specId: ExperimentSpecId,
  /** sha256 of the canonical spec serialization at execution start — post-hoc spec edits are detectable. */
  specHash: z.string().length(64),
  status: ExperimentRunStatus,
  attempts: z.number().int().nonnegative().default(0),
  executor: z.enum(['local', 'remote']).default('local'),
  environment: EnvInfo.optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  cancelRequested: z.boolean().default(false),
  resultIds: z.array(ResultSetId).default([]),
  statReportIds: z.array(StatReportId).default([]),
  createdAt: z.string().datetime(),
});
export type ExperimentRun = z.infer<typeof ExperimentRun>;

/** Per-model executed measurements. Per-row outputs live in artifacts (paired tests need them). */
export const ResultCell = z.object({
  modelIdx: z.number().int().nonnegative(),
  modelName: z.string().min(1),
  metrics: z.record(z.string(), z.number()),
  /** Content-addressed per-row correctness (classification) or signed error (regression) arrays. */
  perRowRef: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  /** D-086-1: result identity — hash(specHash + dataset contentRef + env identity + modelIdx + seed). Executor dedups on it. */
  fingerprint: z.string().length(64),
  nTrain: z.number().int().positive(),
  nTest: z.number().int().positive(),
  timingMs: z.number().nonnegative(),
});
export type ResultCell = z.infer<typeof ResultCell>;

export const ResultSet = z.object({
  id: ResultSetId,
  experimentRunId: ExperimentRunId,
  runId: RunId,
  datasetRecordId: DatasetRecordId,
  splitHash: z.string().length(64),
  cells: z.array(ResultCell).min(1),
  computedAt: z.string().datetime(),
});
export type ResultSet = z.infer<typeof ResultSet>;

export const ExperimentVerdict = z.enum(['supports', 'weakens', 'falsifies', 'inconclusive']);
export type ExperimentVerdict = z.infer<typeof ExperimentVerdict>;

export const StatReport = z.object({
  id: StatReportId,
  experimentRunId: ExperimentRunId,
  runId: RunId,
  comparisonId: z.string().min(1),
  metricKey: MetricKey,
  primary: z.boolean().default(false),
  pointEstimate: z.number(),
  ci: z.object({ level: z.number(), low: z.number(), high: z.number() }),
  test: z.object({
    kind: StatisticsPlan.shape.test,
    alpha: z.number(),
    pValue: z.number().optional(),
    nBoot: z.number().int().optional(),
  }),
  effect: z.object({ kind: z.string().min(1), value: z.number() }),
  /** Present only when the comparison binds a hypothesis (SCIENTIFIC_MODEL §10). */
  hypothesisId: HypothesisId.optional(),
  /** D-086-8: the verdict pins the hypothesis VERSION it was computed against. */
  hypothesisVersion: z.number().int().nonnegative().optional(),
  /** D-085 P0-1: echoed threshold provenance — must be displayed wherever this report renders. */
  thresholdProvenance: DecisionRuleProvenance,
  verdict: ExperimentVerdict.optional(),
  /** Human-readable derivation: rule + measured values -> verdict. Auditable, mechanical. */
  verdictDerivation: z.string().optional(),
  exploratory: z.boolean().default(false),
  /** D-086-7: which re-analysis iteration on this dataset version produced this report (1 = first). */
  analysisIteration: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
});
export type StatReport = z.infer<typeof StatReport>;

// ---- deterministic validation & verdict mapping ----

/**
 * Fail-closed spec validation (ACC-21). Cross-reference integrity + D-085/D-086 honesty
 * gates — this is the boundary between "a spec was proposed" and "the executor may run it".
 */
export const checkExperimentSpec = (
  spec: ExperimentSpec,
  ctx: {
    hypothesisIds: readonly HypothesisId[];
    /** D-086-4: local-path datasets are operator-only; LLM-proposed specs must use registered resolvers. */
    allowLocalDatasets?: boolean;
  },
): { passed: boolean; missing: string[] } => {
  const missing: string[] = [];
  const nModels = spec.models.length;
  const hypSet = new Set(ctx.hypothesisIds);

  for (const [i, use] of spec.datasets.entries()) {
    if (use.source.resolver === 'local' && ctx.allowLocalDatasets !== true) {
      missing.push(`datasets[${i}]: local-path source requires operator allowLocalDatasets (LLM specs may not read arbitrary paths)`);
    }
  }
  for (const [i, m] of spec.models.entries()) {
    if (spec.models.some((o, j) => j < i && o.name === m.name)) missing.push(`models[${i}].name duplicate`);
  }
  if (spec.models.filter((m) => m.name === 'baseline').length > 1) missing.push('multiple models named "baseline"');

  const boundComparisons = new Map<string, string>(); // comparisonId -> hypothesisId
  for (const [ci, c] of spec.comparisons.entries()) {
    if (c.kind === 'absolute') {
      if (c.modelIdx === undefined || c.modelIdx >= nModels) missing.push(`comparisons[${ci}].modelIdx out of range`);
    } else {
      if (c.modelAIdx === undefined || c.modelAIdx >= nModels) missing.push(`comparisons[${ci}].modelAIdx out of range`);
      if (c.modelBIdx === undefined || c.modelBIdx >= nModels) missing.push(`comparisons[${ci}].modelBIdx out of range`);
      if (c.modelAIdx !== undefined && c.modelAIdx === c.modelBIdx) missing.push(`comparisons[${ci}] compares a model with itself`);
    }
    if (c.hypothesisId !== undefined && !hypSet.has(c.hypothesisId)) {
      missing.push(`comparisons[${ci}].hypothesisId not in run`);
    }
    if (!spec.metrics.includes(c.metricKey)) missing.push(`comparisons[${ci}].metricKey not in spec.metrics`);
    if (c.hypothesisId !== undefined) boundComparisons.set(c.id, c.hypothesisId);
  }
  // D-085 P0-1: every hypothesis-bound comparison must be covered by an approval whose
  // hypothesis matches; approvals covering unknown comparisons are rejected too.
  if (boundComparisons.size > 0) {
    const approved = new Map<string, string>();
    for (const a of spec.approvals) {
      if (!hypSet.has(a.hypothesisId)) missing.push(`approval for unknown hypothesis ${a.hypothesisId}`);
      for (const cid of a.comparisonIds) {
        const bound = boundComparisons.get(cid);
        if (bound === undefined) missing.push(`approval covers non-hypothesis-bound comparison ${cid}`);
        else if (bound !== a.hypothesisId) missing.push(`approval of ${cid} names hypothesis ${a.hypothesisId} but binding is ${bound}`);
        else approved.set(cid, a.hypothesisId);
      }
    }
    for (const cid of boundComparisons.keys()) {
      if (!approved.has(cid)) missing.push(`hypothesis-bound comparison ${cid} lacks a binding approval (D-085 P0-1)`);
    }
  }
  // D-086-6: no hypothesis-bound comparison at all => explicitly exploratory or reject.
  if (boundComparisons.size === 0 && spec.exploratoryNote === undefined) {
    missing.push('no hypothesis-bound comparison and no exploratoryNote — exploratory runs must be explicit');
  }
  const primaries = spec.comparisons.filter((c) => c.primary);
  if (spec.comparisons.length > 1) {
    if (primaries.length !== 1) missing.push('multiple comparisons require exactly one primary');
    if (spec.statistics.multipleTestingPolicy === undefined) missing.push('multiple comparisons require multipleTestingPolicy');
  }
  if (spec.statistics.multipleTestingPolicy !== undefined && primaries.length < 1) {
    missing.push('multipleTestingPolicy set but no primary comparison');
  }
  // Classification builders + regression metrics is a semantic mismatch the sidecar would only hit mid-run.
  const regressionMetrics: MetricKey[] = ['mean_squared_error', 'r2'];
  const classifierBuilders: BuilderId[] = ['dummy_most_frequent', 'logistic_regression', 'random_forest_classifier', 'gradient_boosting_classifier'];
  if (spec.models.every((m) => classifierBuilders.includes(m.builderId)) && spec.metrics.some((mk) => regressionMetrics.includes(mk))) {
    missing.push('classifier-only spec declares regression metrics');
  }
  return { passed: missing.length === 0, missing };
};

/**
 * Mechanical verdict (SCIENTIFIC_MODEL §10): the decision rule predicts the statistic
 * beyond `threshold` in `direction`. CI entirely beyond => supports; entirely on the
 * opposite side => falsifies; crossing the threshold => inconclusive (honest uncertainty,
 * never a coin-flip). 'weakens' is reserved for future multi-binding aggregation — it is
 * never emitted here, so no report claims more resolution than the data gives.
 */
export const mechanicalVerdict = (
  comparison: Pick<Comparison, 'direction' | 'threshold'>,
  ci: { low: number; high: number },
): ExperimentVerdict => {
  const satisfied = comparison.direction === 'above' ? ci.low > comparison.threshold : ci.high < comparison.threshold;
  const refuted = comparison.direction === 'above' ? ci.high < comparison.threshold : ci.low > comparison.threshold;
  if (satisfied) return 'supports';
  if (refuted) return 'falsifies';
  return 'inconclusive';
};

/** Sidecar statistics result (abs_stats / paired_stats) — mirrored from experiment-runtime/ops.py. */
export const SidecarStatsResult = z.object({
  pointEstimate: z.number(),
  ci: z.object({ level: z.number(), low: z.number(), high: z.number() }),
  pValue: z.number().optional(),
  nBoot: z.number().int().optional(),
  n: z.number().int(),
  effect: z.object({ kind: z.string().min(1), value: z.number() }),
});
export type SidecarStatsResult = z.infer<typeof SidecarStatsResult>;
