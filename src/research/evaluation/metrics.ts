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

import type { ResearchRun } from '../types.ts';
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
