/**
 * research/evaluation/metrics — program-computed evaluation metrics for a
 * ResearchRun (directive §14.3).
 *
 * Every metric is COMPUTED from the run's frozen state by this script — no
 * hand-edited numbers, no model self-grades (§14.5 "原始结果必须有 provenance，
 * 可重算，不手工编辑"). The metrics below cover the mandatory list from §14.3
 * that is computable OFFLINE from a ResearchRun; model-quality dimensions that
 * require human rubrics (scientific plausibility of text) are deliberately NOT
 * faked here — they are labeled as human-rubric metrics in the report.
 */

import type { HypothesisScorecard, ResearchRun } from '../types.ts';
import type { ResearchPlan } from '../types.ts';

/** One computed metric value. */
export interface MetricValue {
  readonly name: string;
  readonly value: number | boolean | null;
  readonly definition: string;
}

/** The full evaluation report for one run. */
export interface EvaluationReport {
  readonly runId: string;
  readonly question: string;
  readonly computedAt: string;
  readonly metrics: readonly MetricValue[];
  /** Deterministic-recompute status (PASS = far research verify exit 0). */
  readonly deterministicRecompute: 'PASS' | 'FAIL' | 'NOT_RUN';
  /** Metrics that require a human rubric (never auto-scored here). */
  readonly humanRubricMetrics: readonly string[];
  readonly schemaVersion: number;
}

/** Plan array fields (completeness denominator). */
const PLAN_ARRAY_FIELDS: ReadonlyArray<keyof ResearchPlan> = [
  'objectives',
  'preregisteredPredictions',
  'dataRequirements',
  'inclusionExclusionCriteria',
  'variables',
  'analysisDag',
  'tools',
  'statisticalMethods',
  'stoppingConditions',
  'checkpoints',
  'risks',
  'reproducibility',
  'nextRoundDecisionRules',
  'humanApprovalRequired',
];

/** Is a falsification method fully specified (metric + comparator + threshold)? */
function falsificationComplete(m: {
  metric: string;
  comparator: string;
  value?: number | undefined;
  lower?: number | undefined;
  upper?: number | undefined;
}): boolean {
  if (m.metric.trim().length === 0) return false;
  if (m.comparator === 'gt' || m.comparator === 'lt') return m.value !== undefined;
  return m.lower !== undefined && m.upper !== undefined;
}

/**
 * Grade → grade-point mapping for scorecard means (NOT_APPLICABLE excluded).
 *
 * DISPLAY CONVENTION, NOT MEASUREMENT THEORY (day-r10 backlog #2): A=4…F=0 is
 * an ordinal letter scale flattened to equal 1-point steps for aggregation
 * readability. It is NOT a claim that adjacent grades are equidistant in
 * scientific quality. Cross-arm comparisons under the SAME grading pipeline
 * are valid (the mapping is monotone); absolute grade-point values must not
 * be read as ratio-scale quality. Consumers needing the letters can recover
 * them from the run's scorecards.
 */
const GRADE_POINTS: Readonly<Record<string, number>> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

/**
 * Discriminating scorecard metrics (day-r10): the gate metrics saturate on
 * pinned-corpus questions (2026-08-16 ablation pilot: binding/falsifiability
 * both 1.0 on BOTH arms), so primitive-value adjudication needs per-dimension
 * grade means. Deterministic and pure: grade-point mean per dimension name
 * (A=4…F=0), NOT_APPLICABLE excluded from that dimension's mean, dimensions
 * emitted in sorted-name order (stable), null when no hypothesis carries a
 * graded instance of that dimension.
 */
function scorecardDimensionMetrics(
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): MetricValue[] {
  const byDim = new Map<string, { points: number; n: number; na: number }>();
  for (const sc of Object.values(scorecards)) {
    for (const dim of sc.dimensions) {
      const slot = byDim.get(dim.name) ?? { points: 0, n: 0, na: 0 };
      const gp = GRADE_POINTS[dim.grade];
      if (gp === undefined) slot.na += 1;
      else {
        slot.points += gp;
        slot.n += 1;
      }
      byDim.set(dim.name, slot);
    }
  }
  const out: MetricValue[] = [];
  for (const name of [...byDim.keys()].sort()) {
    const { points, n, na } = byDim.get(name)!;
    out.push({
      name: `scorecardMeanGrade.${name}`,
      value: n === 0 ? null : points / n,
      definition:
        `mean grade-point of the ${name} scorecard dimension across hypotheses (A=4…F=0; ` +
        `NOT_APPLICABLE excluded${na > 0 ? `, ${na} NA instance(s) observed` : ''})`,
    });
  }
  return out;
}

/**
 * Grade → grade-point mapping for scorecard means (NOT_APPLICABLE excluded).
 *
 * DISPLAY CONVENTION, NOT MEASUREMENT THEORY (day-r10 backlog #2): A=4…F=0 is
 * an ordinal letter scale flattened to equal 1-point steps for aggregation
 * readability. It is NOT a claim that adjacent grades are equidistant in
 * scientific quality. Cross-arm comparisons under the SAME grading pipeline
 * are valid (the mapping is monotone); absolute grade-point values must not
 * be read as ratio-scale quality. Consumers needing the letters can recover
 * them from the run's scorecards.
 */
const GRADE_POINTS: Readonly<Record<string, number>> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

/**
 * Discriminating scorecard metrics (day-r10): the gate metrics saturate on
 * pinned-corpus questions (2026-08-16 ablation pilot: binding/falsifiability
 * both 1.0 on BOTH arms), so primitive-value adjudication needs per-dimension
 * grade means. Deterministic and pure: grade-point mean per dimension name
 * (A=4…F=0), NOT_APPLICABLE excluded from that dimension's mean, dimensions
 * emitted in sorted-name order (stable), null when no hypothesis carries a
 * graded instance of that dimension.
 */
function scorecardDimensionMetrics(
  scorecards: Readonly<Record<string, HypothesisScorecard>>,
): MetricValue[] {
  const byDim = new Map<string, { points: number; n: number; na: number }>();
  for (const sc of Object.values(scorecards)) {
    for (const dim of sc.dimensions) {
      const slot = byDim.get(dim.name) ?? { points: 0, n: 0, na: 0 };
      const gp = GRADE_POINTS[dim.grade];
      if (gp === undefined) slot.na += 1;
      else {
        slot.points += gp;
        slot.n += 1;
      }
      byDim.set(dim.name, slot);
    }
  }
  const out: MetricValue[] = [];
  for (const name of [...byDim.keys()].sort()) {
    const { points, n, na } = byDim.get(name)!;
    out.push({
      name: `scorecardMeanGrade.${name}`,
      value: n === 0 ? null : points / n,
      definition:
        `mean grade-point of the ${name} scorecard dimension across hypotheses (A=4…F=0; ` +
        `NOT_APPLICABLE excluded${na > 0 ? `, ${na} NA instance(s) observed` : ''})`,
    });
  }
  return out;
}

/**
 * Compute all offline metrics for a ResearchRun (pure; deterministic).
 * `deterministicRecompute` is filled by the caller (it runs far research
 * verify's recompute — see the evaluate command).
 */
export function computeRunMetrics(
  run: ResearchRun,
  deterministicRecompute: 'PASS' | 'FAIL' | 'NOT_RUN',
  computedAt: string,
): EvaluationReport {
  // Citation binding (§14.3: 文献身份真实性 / 有效引用率 / claim–citation 一致性).
  let cited = 0;
  let bound = 0;
  let unbound = 0;
  for (const b of Object.values(run.bindings)) {
    cited += b.supportingIds.length + b.counterIds.length;
    bound += b.boundSupporting.length + b.boundCounter.length;
    unbound += b.unbound.length;
  }
  const citationBindingRate = cited === 0 ? null : bound / cited;

  // Falsifiability completeness across hypotheses.
  const hypotheses = run.hypotheses;
  const falsifiable = hypotheses.filter((h) => falsificationComplete(h.falsificationMethod)).length;
  const falsifiabilityCompleteness = hypotheses.length === 0 ? null : falsifiable / hypotheses.length;

  // Mechanism diversity proxy: distinct (statement, mechanism) content ids.
  const distinctIds = new Set(hypotheses.map((h) => h.id)).size;

  // Counter-evidence coverage: counter queries issued during grounding
  // (sourceQueries beyond the first = counter-evidence + decomposition queries).
  const counterEvidenceQueryCount = Math.max(0, run.corpus.sourceQueries.length - 1);

  // Plan completeness: non-empty array fields + non-empty string fields.
  let planFilled = 0;
  let planTotal = 0;
  for (const field of PLAN_ARRAY_FIELDS) {
    planTotal += 1;
    if ((run.plan[field] as readonly unknown[]).length > 0) planFilled += 1;
  }
  const stringFields: ReadonlyArray<keyof ResearchPlan> = [
    'design', 'sampleSizeRationale', 'multiplicityHandling', 'missingOutlierStrategy', 'budget',
  ];
  for (const field of stringFields) {
    planTotal += 1;
    if ((run.plan[field] as string).trim().length > 0) planFilled += 1;
  }
  const planCompleteness = planTotal === 0 ? null : planFilled / planTotal;

  // Provenance completeness: fraction of stage receipts with status 'complete'.
  const receipts = run.stageReceipts;
  const completeReceipts = receipts.filter((r) => r.provenanceStatus === 'complete').length;
  const receiptCompleteness = receipts.length === 0 ? null : completeReceipts / receipts.length;

  // Scorecard dimension means (computed once; the memory-novelty dim is also
  // surfaced standalone because the ablation layer reads it by name).
  const scorecardDims = scorecardDimensionMetrics(run.scorecards);
  const memoryNoveltyDim = scorecardDims.find(
    (m) => m.name === 'scorecardMeanGrade.NoveltyVsResearchMemory',
  );

  const metrics: MetricValue[] = [
    { name: 'citationBindingRate', value: citationBindingRate, definition: 'bound citations / total cited ids across hypotheses (accepted claims must reach 1.0)' },
    { name: 'unboundEvidenceCount', value: unbound, definition: 'citations that did not resolve in the corpus (must be 0 for accepted claims)' },
    { name: 'hypothesisCount', value: hypotheses.length, definition: 'candidate hypotheses generated (3-5 required, mechanistically distinct)' },
    { name: 'distinctHypothesisIdCount', value: distinctIds, definition: 'unique content-addressed hypothesis ids (paraphrase padding would collapse here)' },
    { name: 'falsifiabilityCompleteness', value: falsifiabilityCompleteness, definition: 'fraction of hypotheses with a fully-specified falsification method (metric + comparator + threshold)' },
    { name: 'counterEvidenceQueryCount', value: counterEvidenceQueryCount, definition: 'counter-evidence + decomposition queries issued during grounding (bounded snapshot)' },
    { name: 'planCompleteness', value: planCompleteness, definition: 'fraction of ResearchPlan fields that are non-empty (§9.9 executable-plan contract)' },
    { name: 'revisionCount', value: run.revisions.length, definition: 'immutable revisions recorded (feedback → revision loop)' },
    { name: 'observationCount', value: run.observations.length, definition: 'real-data/tool observations collected (Phase 3 loop)' },
    { name: 'receiptCompleteness', value: receiptCompleteness, definition: 'fraction of stage receipts with provenanceStatus=complete' },
    { name: 'humanApprovalGateCount', value: run.plan.humanApprovalRequired.length, definition: 'plan steps requiring human approval before execution' },
    { name: 'gateVerdictResearchable', value: run.gateReport.verdict === 'RESEARCHABLE', definition: 'whether the researchability gate admitted the question' },
    { name: 'runModeIsLive', value: run.runMode === 'LIVE', definition: 'aggregate run mode (LIVE only when every science-affecting component is live)' },
    // ── Discriminating metrics (day-r10; the ablation pilot proved gate metrics saturate) ──
    ...scorecardDims,
    {
      name: 'noveltyVsResearchMemoryGrade',
      value: memoryNoveltyDim === undefined ? null : memoryNoveltyDim.value,
      definition:
        'mean grade-point of the cross-run memory-novelty dimension (A=4 novel, C=2 explored-branch dup, F=0 eliminated-direction dup); ' +
        'null when the run carried no memory flags (memory disabled or no exact match) — absence is honest, never imputed',
    },
    {
      name: 'falsificationMetricDiversity',
      value:
        hypotheses.length === 0
          ? null
          : new Set(hypotheses.map((h) => h.falsificationMethod.metric.trim().toLowerCase())).size /
            hypotheses.length,
      definition:
        'distinct falsification metrics / hypotheses (1.0 = every hypothesis tests a DIFFERENT measurable quantity; the fan-out diversity signal)',
    },
    {
      name: 'strategyOriginDiversity',
      value: (() => {
        const origins = hypotheses.filter((h) => h.strategyOrigin !== undefined);
        if (origins.length === 0) return null; // legacy single-shot arm: structurally absent
        return new Set(origins.map((h) => h.strategyOrigin)).size / hypotheses.length;
      })(),
      definition:
        'distinct discovery strategies among hypotheses / hypotheses (null = no hypothesis carries strategyOrigin, i.e. legacy single-shot)',
    },
    {
      name: 'paretoFrontSize',
      value: Object.values(run.scorecards).filter((sc) => sc.paretoOptimal).length,
      definition: 'hypotheses on the scorecard Pareto front (non-dominated candidates)',
    },
  ];

  return {
    runId: run.runId,
    question: run.question,
    computedAt,
    metrics,
    deterministicRecompute,
    humanRubricMetrics: [
      'scientificPlausibilityOfText',
      'relativeNoveltyQuality',
      'planExecutabilityByDomainExpert',
      'mechanismDiversityQuality',
      'citationClaimAlignmentSemantic',
    ],
    schemaVersion: 1,
  };
}
