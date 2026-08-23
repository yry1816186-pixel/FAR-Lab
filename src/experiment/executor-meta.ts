import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore, ModelProvider } from '../shared/ports.js';
import { z } from 'zod';
import {
  newId, mechanicalVerdict,
  MetaAnalysisSpec, EffectEstimateRecord,
  type ExperimentRun,
  type StatReport, type FeedbackSignal, type HypothesisCandidate,
} from '../domain/index.js';
import { checkMetaSpec } from '../domain/meta.js';
import { poolFixed, poolRandomDL, leaveOneOut, eggerTest, chiSquareP, type StudyEstimate } from './meta-math.js';
import {
  validateEffectEstimate, toStudyEstimate, dedupeEstimates,
  EffectEstimateProposal,
} from './meta-estimate.js';

/**
 * W-F M3: statistical_meta executor — the literature-type falsification path.
 * Pure TS: no sidecar, no dataset acquisition, no training. The pipeline is
 * preregistered spec -> specHash binding -> LLM PROPOSES numbers -> DETERMINISTIC
 * admission gates (meta-estimate.ts) -> pooling (meta-math.ts) -> mechanical verdict
 * on the pooled log-scale CI -> feedback signals. The LLM never produces a verdict.
 */

export interface MetaExecuteOptions {
  /** Model provider for effect-estimate PROPOSALS (numbers, gated by validation). */
  provider: ModelProvider;
  shouldCancel?: () => boolean;
  now?: () => string;
}

export interface ExecutedMeta {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
  /** Validated and persisted estimates (post-dedupe pool inputs). */
  estimates: EffectEstimateRecord[];
}

export const metaSpecHash = (spec: MetaAnalysisSpec): string =>
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

const RAW_MEASURE: Record<MetaAnalysisSpec['effectMeasure'], 'or' | 'rr' | 'smd'> = {
  log_or: 'or',
  log_rr: 'rr',
  smd: 'smd',
};

const METRIC_KEY: Record<MetaAnalysisSpec['effectMeasure'], StatReport['metricKey']> = {
  log_or: 'pooled_log_or',
  log_rr: 'pooled_log_rr',
  smd: 'pooled_smd',
};

const ExtractionOut = z.object({
  estimates: z.array(EffectEstimateProposal).max(64).default([]),
});

const EXTRACTION_PROMPT = [
  'You extract quantitative effect estimates from verified scientific claims for meta-analysis.',
  'Rules:',
  '- Only extract a number the claim text ACTUALLY reports: the point estimate and its confidence interval as stated (raw scale: OR/RR ratios, SMD standardized differences), or a 2x2 event table when the claim reports counts.',
  '- The measure must be exactly the requested one; do not convert between OR/RR/SMD.',
  '- Each estimate echoes the claimId it came from. Never invent numbers, never re-derive, never round.',
  '- If NO claim reports a usable effect estimate, return {"estimates":[]}.',
].join('\n');

export const executeMetaAnalysis = async (
  store: Store,
  _artifacts: ArtifactStore,
  spec: MetaAnalysisSpec,
  opts: MetaExecuteOptions,
): Promise<ExecutedMeta> => {
  const now = opts.now ?? (() => new Date().toISOString());

  // 1. Fail-closed validation gate (approvals / exploratory / threshold provenance).
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkMetaSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id) });
  if (!validation.passed) {
    throw new Error(`meta spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: MetaAnalysisSpec = MetaAnalysisSpec.parse({ ...spec, validation });
  store.putObject('meta_spec', validated);

  const specHash = metaSpecHash(validated);
  let expRun: ExperimentRun = {
    id: newId('xrun') as ExperimentRun['id'],
    runId: spec.runId,
    specId: spec.id,
    specHash,
    status: 'queued',
    attempts: 1,
    executor: 'local',
    // Pure-TS path: no Python sidecar involved — recorded honestly, not as a missing env.
    environment: { pythonVersion: 'none (pure-TS meta executor)', versions: { node: process.version } },
    cancelRequested: false,
    resultIds: [],
    statReportIds: [],
    createdAt: now(),
  };
  const persist = (run: ExperimentRun, type: string, detail: Record<string, unknown>): void => {
    store.putObjectEvented('experiment_run', run, { type, detail } as never, now());
    expRun = run;
  };
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash, experimentType: 'statistical_meta' });
  if (opts.shouldCancel?.()) throw new Error('canceled before extraction');

  const fail = (message: string): never => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`meta experiment ${expRun.id} failed: ${message}`);
  };

  // 2. LLM PROPOSES numbers from the run's VERIFIED claims (grounding surface).
  const claims = store
    .listObjects('claim', spec.runId)
    .filter((c) => c.bindingStatus === 'verified');
  if (claims.length === 0) fail('no verified claims in the run — nothing to extract effect estimates from');

  const extraction = await opts.provider.structuredCall(
    {
      task: 'meta-effect-extraction',
      systemPrompt: EXTRACTION_PROMPT,
      userPayload: {
        researchQuestion: spec.question,
        requestedMeasure: RAW_MEASURE[spec.effectMeasure],
        inclusionCriteria: spec.inclusionCriteria,
        claims: claims.map((c) => ({
          claimId: c.id,
          sourceDocumentId: c.locators[0]?.sourceDocumentId ?? '',
          text: c.text,
          quote: c.locators[0]?.quote ?? '',
        })),
      },
      outputKind: 'json',
      temperature: 0,
      maxTokens: 4096,
      purpose: 'meta-effect-extraction',
    },
    (raw) => {
      const parsed = ExtractionOut.safeParse(raw);
      return parsed.success ? parsed.data : new Error(`extraction schema failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 4).join('; ')}`);
    },
  );
  const extData = extraction.data;
  if (!extraction.ok || extData === undefined) {
    return fail(`effect-estimate extraction failed (${extraction.error?.kind ?? 'unknown'}): ${(extraction.error?.message ?? '').slice(0, 200)}`);
  }
  const modelRef = `${extraction.receipt.provider}/${extraction.receipt.modelId}`;
  persist({ ...expRun, status: 'running', startedAt: now() }, 'experiment_started', { id: expRun.id, extractionModel: modelRef });

  // 3. DETERMINISTIC admission: every proposal passes the numeric invariants or is
  //    dropped with a countable reason (fail-closed, never averaged or repaired).
  const expectedMeasure = RAW_MEASURE[spec.effectMeasure];
  const admitted: EffectEstimateRecord[] = [];
  const rejectionReasons: string[] = [];
  let rejectedProposals = 0;
  const claimIds = new Set(claims.map((c) => c.id));
  for (const p of extData.estimates) {
    if (p.measure !== expectedMeasure) {
      rejectedProposals += 1;
      rejectionReasons.push(`${p.claimId}: measure ${p.measure} != requested ${expectedMeasure} (no cross-measure conversion in minimal scope)`);
      continue;
    }
    if (!claimIds.has(p.claimId)) {
      rejectedProposals += 1;
      rejectionReasons.push(`${p.claimId}: unknown claim id (proposal not grounded in this run)`);
      continue;
    }
    const outcome = validateEffectEstimate(p);
    if (!outcome.ok) {
      rejectedProposals += 1;
      rejectionReasons.push(`${p.claimId}: ${outcome.reason}`);
      continue;
    }
    admitted.push(EffectEstimateRecord.parse({
      id: newId('efx'),
      runId: spec.runId,
      metaSpecId: spec.id,
      claimId: p.claimId,
      sourceDocumentId: p.sourceDocumentId,
      measure: p.measure,
      point: p.point,
      ...(p.ciLow !== undefined ? { ciLow: p.ciLow } : {}),
      ...(p.ciHigh !== undefined ? { ciHigh: p.ciHigh } : {}),
      ciLevel: p.ciLevel ?? 0.95,
      ...(p.twoByTwo !== undefined ? { twoByTwo: p.twoByTwo } : {}),
      ...(p.nTotal !== undefined ? { nTotal: p.nTotal } : {}),
      extractionModelRef: modelRef,
      extractedAt: now(),
    }));
  }
  for (const e of admitted) store.putObject('effect_estimate', e);
  const { kept, duplicatesDropped } = dedupeEstimates(admitted);

  // 4. Feasibility gate (preregistered two-stage discipline): fewer admissible
  //    studies than minStudies => INSUFFICIENT_DATA — a mechanical verdict, never a
  //    thin pool presented as evidence.
  const cmp = spec.comparison;
  const bound = cmp.hypothesisId !== undefined;
  const hyp = bound ? hypotheses.find((h) => h.id === cmp.hypothesisId) : undefined;
  const priorSameComparison = (store.listObjects('stat_report', spec.runId) as StatReport[])
    .filter((r) => r.comparisonId === cmp.id);
  const sequential = priorSameComparison.length > 0;

  const studies: StudyEstimate[] = kept.map((e) => ({
    ...toStudyEstimate(e, e.claimId),
    label: e.claimId,
  }));
  const alpha = spec.alpha;

  const buildReport = (fields: {
    verdict: StatReport['verdict'];
    pointEstimate: number;
    ci: { level: number; low: number; high: number };
    derivation: string;
    meta: NonNullable<StatReport['meta']>;
    pValue?: number;
  }): StatReport => ({
    id: newId('srep') as StatReport['id'],
    experimentRunId: expRun.id,
    runId: spec.runId,
    comparisonId: cmp.id,
    metricKey: METRIC_KEY[spec.effectMeasure],
    primary: true,
    pointEstimate: fields.pointEstimate,
    ci: fields.ci,
    test: {
      kind: spec.metaModel === 'fixed' ? 'meta_iv_fixed' : 'meta_iv_random_dl',
      alpha,
      ...(fields.pValue !== undefined ? { pValue: fields.pValue } : {}),
    },
    effect: { kind: spec.effectMeasure, value: fields.pointEstimate },
    ...(bound && hyp !== undefined ? { hypothesisId: cmp.hypothesisId, hypothesisVersion: hyp.version } : {}),
    thresholdProvenance: cmp.thresholdProvenance,
    verdict: bound && !sequential ? fields.verdict : undefined,
    secondary: false,
    verdictDerivation: bound ? fields.derivation : undefined,
    exploratory: !bound || sequential,
    meta: fields.meta,
    analysisIteration: priorSameComparison.length + 1,
    createdAt: now(),
  });

  let statReport: StatReport;
  if (kept.length < spec.minStudies || studies.length < 2) {
    const reason = kept.length === 0
      ? 'no proposal passed the deterministic admission gate'
      : `only ${kept.length} admissible study(ies) < preregistered minStudies ${spec.minStudies}`;
    statReport = buildReport({
      verdict: 'insufficient_data',
      pointEstimate: 0,
      ci: { level: spec.ciLevel, low: 0, high: 0 },
      derivation: [
        `rule: pooled ${spec.effectMeasure} CI ${cmp.direction} threshold ${cmp.threshold} [threshold source: ${cmp.thresholdProvenance}]`,
        `measured: NO POOLING PERFORMED — ${reason} (rejected=${rejectedProposals}, duplicates=${duplicatesDropped})`,
        'verdict: insufficient_data — the current evidence base cannot mechanically test this hypothesis; the gap points at retrieval/extraction, not at the hypothesis',
      ].join('; '),
      meta: {
        k: kept.length, q: 0, i2: 0, tau2: 0,
        looFlips: [],
        lowK: true, duplicatesDropped, rejectedProposals,
        rejectionReasons: rejectionReasons.slice(0, 8),
      },
    });
  } else {
    const pool = spec.metaModel === 'fixed' ? poolFixed : poolRandomDL;
    const sensitivityPool = spec.metaModel === 'fixed' ? poolRandomDL : poolFixed;
    const pooled = pool(studies, alpha);
    const sensitivity = sensitivityPool(studies, alpha);
    const loo = leaveOneOut(studies, spec.metaModel, alpha);
    const looFlips = loo.excluded.filter((e) => e.directionFlipped || e.nullCrossingChanged).map((e) => e.label);
    const egger = eggerTest(studies);
    const verdict = mechanicalVerdict({ direction: cmp.direction, threshold: cmp.threshold }, pooled.ci);
    statReport = buildReport({
      verdict,
      pointEstimate: pooled.theta,
      ci: { level: pooled.ci.level, low: pooled.ci.low, high: pooled.ci.high },
      derivation: [
        `rule: pooled ${spec.effectMeasure} CI ${cmp.direction} threshold ${cmp.threshold} [threshold source: ${cmp.thresholdProvenance}]`,
        `measured: theta=${pooled.theta.toFixed(4)} CI${(1 - alpha).toFixed(2)}[${pooled.ci.low.toFixed(4)}, ${pooled.ci.high.toFixed(4)}] (k=${pooled.k}, model=${pooled.model}, I2=${pooled.i2.toFixed(1)}%, Q p=${chiSquareP(pooled.k - 1, pooled.q).toFixed(3)}; sensitivity ${sensitivity.model} theta=${sensitivity.theta.toFixed(4)})`,
        `verdict: ${verdict}${sequential ? ' (sequential re-analysis labelled exploratory)' : ''}`,
      ].join('; '),
      meta: {
        k: pooled.k, q: pooled.q, i2: pooled.i2, tau2: pooled.tau2,
        sensitivityModel: sensitivity.model,
        sensitivityTheta: sensitivity.theta,
        sensitivityCi: { low: sensitivity.ci.low, high: sensitivity.ci.high },
        egger: egger.kind === 'reported'
          ? { status: 'reported', pValue: egger.pValue }
          : { status: 'unreported', reason: egger.reason },
        looFlips,
        lowK: pooled.k < 4,
        duplicatesDropped, rejectedProposals,
        rejectionReasons: rejectionReasons.slice(0, 8),
      },
      pValue: chiSquareP(pooled.k - 1, pooled.q),
    });
  }
  store.putObjectEvented('stat_report', statReport, { type: 'note', detail: { stat_report: statReport.id, comparison: statReport.comparisonId, verdict: statReport.verdict } }, now());

  // 5. Feedback: bound, non-sequential reports feed the causal revision loop —
  //    INSUFFICIENT_DATA included (it points the revision at the evidence gap).
  const feedback: FeedbackSignal[] = [];
  const hypId = cmp.hypothesisId;
  if (hypId !== undefined && hyp !== undefined && !sequential) {
    feedback.push({
      id: newId('fbk') as FeedbackSignal['id'],
      runId: spec.runId,
      source: 'experiment',
      content: `meta-analysis comparison ${cmp.id} on ${METRIC_KEY[spec.effectMeasure]}: verdict=${statReport.verdict ?? 'none'} ` +
        `(k=${statReport.meta?.k}, theta=${statReport.pointEstimate.toFixed(4)}, CI[${statReport.ci.low.toFixed(4)}, ${statReport.ci.high.toFixed(4)}], ` +
        `I2=${statReport.meta?.i2.toFixed(1)}%, tau2=${(statReport.meta?.tau2 ?? 0).toFixed(4)}, egger=${statReport.meta?.egger?.status}, ` +
        `looFlips=${(statReport.meta?.looFlips ?? []).join(',') || 'none'}, threshold source=${cmp.thresholdProvenance})`,
      structured: {
        kind: 'statistical_meta',
        experimentRunId: expRun.id,
        statReportIds: [statReport.id],
        // narrow assertion: buildReport assigns the verdict whenever bound && !sequential,
        // which is exactly this branch's guard.
        verdicts: [statReport.verdict!],
      },
      target: { kind: 'hypothesis', id: hypId },
      provenance: `meta-executor:${expRun.id} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
      receivedAt: now(),
    });
    store.putObjectEvented('feedback', feedback[0]!, { type: 'feedback_received', detail: { feedback: feedback[0]!.id, source: 'experiment', target: hypId } }, now());
  }

  const completed: ExperimentRun = {
    ...expRun, status: 'completed', endedAt: now(),
    statReportIds: [statReport.id],
  };
  persist(completed, 'experiment_completed', { id: expRun.id, experimentType: 'statistical_meta', statReports: 1, feedback: feedback.length });
  return { run: completed, statReports: [statReport], feedback, estimates: kept };
};
