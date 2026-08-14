/**
 * research/experiment — the ExperimentAdapter glue (directive §11.4, Phase 3).
 *
 * `runPlanExperiment` executes the FIRST real analysis step of a ResearchPlan
 * against an authoritative dataset, parses the real output into a structured
 * Observation, and converts the Observation into a FeedbackSignal that drives
 * the next revision. This is the "plan parameters → real execution → parsed
 * result → next-round influence" loop (Phase 3 exit conditions) — without
 * claiming the full direction-B closed loop (there is no instrument loop here,
 * only a real analysis step; that is stated, not hidden).
 *
 * Honesty rules enforced here:
 *   - plan parameters (not hardcoded values) control the adapter inputs;
 *   - nulls / small samples / non-significance are preserved in the Observation;
 *   - a failed or plateau result is a valid Observation (never filtered out);
 *   - replay mode is explicitly labeled RECORDED_REPLAY, live fetch is LIVE.
 */

import type { PsRow, ExoplanetDatasetCard } from './adapters/exoplanet_dataset.ts';
import { fetchExoplanetPsLive, HOT_JUPITER_QUERY } from './adapters/exoplanet_dataset.ts';
import { analyzeRadiusInsolation, type RadiusInsolationObservation } from './adapters/exoplanet_analysis.ts';
import { buildFeedbackSignal } from './revision.ts';
import type { ComponentMode, FeedbackSignal, ResearchRun } from './types.ts';

/** A parsed tool/analysis Observation attached to a run (directive §9.10/§11.4). */
export interface Observation {
  /** Observation id (hash of the input + analysis, deterministic). */
  readonly id: string;
  /** Which adapter produced it. */
  readonly adapter: 'exoplanet-archive-radius-insolation';
  /** The hypothesis ids this observation speaks to. */
  readonly affectsHypothesisIds: readonly string[];
  /** The structured analysis result. */
  readonly result: RadiusInsolationObservation;
  /** The dataset card (provenance of the input data). */
  readonly datasetCard: ExoplanetDatasetCard;
  /** Execution mode of the data/analysis component. */
  readonly mode: ComponentMode;
  /** ISO timestamp. */
  readonly producedAt: string;
}

/** Options for running the experiment. */
export interface RunExperimentOptions {
  /** The run whose plan drives the analysis. */
  readonly run: ResearchRun;
  /** Injected replay rows (offline mode; live fetch when omitted). */
  readonly replayRows?: readonly PsRow[];
  /** Replay card (must accompany replayRows). */
  readonly replayCard?: ExoplanetDatasetCard;
  /** Time source (tests). */
  readonly now?: () => Date;
}

/** Result of the experiment step: observation + the feedback it proposes. */
export interface ExperimentResult {
  readonly observation: Observation;
  readonly feedback: FeedbackSignal;
  readonly updatedRun: ResearchRun;
}

/** Plan-parameter defaults when the plan does not specify them (§9.9). */
const DEFAULT_MIN_RADIUS = 6; // Earth radii
const DEFAULT_MAX_PERIOD = 10; // days
const DEFAULT_CONFIDENCE = 0.95;

/**
 * Applicability terms for the exoplanet adapter: at least TWO distinct term
 * hits across the run's scientific text (question + hypotheses + plan), or an
 * exoplanet/astrophysics domain hint, are required. A single loose hit
 * ("period", "radius") is deliberately NOT enough — a diabetes or NLP plan
 * must be REFUSED, not analyzed against hot-Jupiter data (2026-08-14 defect:
 * `far research analyze` grafted an exoplanet correlation onto a diabetes run).
 */
const APPLICABILITY_TERMS = [
  'exoplanet',
  'transit',
  'hot jupiter',
  'planetary radius',
  'planet radius',
  'insolation',
  'light curve',
  'orbital period',
  'starspot',
  'photometric',
  'radial velocity',
  'planetary system',
] as const;

const ASTRO_DOMAIN_HINTS = ['astro', 'exoplanet', 'astronom', 'planetary science', 'stellar'];

/** Does this run fall inside the exoplanet adapter's scientific domain? */
export function isExoplanetApplicable(run: ResearchRun): boolean {
  const domain = run.gateReport.scope.domain ?? '';
  if (ASTRO_DOMAIN_HINTS.some((h) => domain.toLowerCase().includes(h))) {
    return true;
  }
  const text = [
    run.question,
    ...run.hypotheses.map((h) => `${h.statement} ${h.mechanism}`),
    ...run.plan.variables,
    ...run.plan.dataRequirements,
  ]
    .join('\n')
    .toLowerCase();
  const hits = new Set(
    APPLICABILITY_TERMS.filter((term) => text.includes(term)),
  );
  return hits.size >= 2;
}

/**
 * Extract executable numeric parameters from the frozen ResearchPlan
 * (directive §11.4: "input parameters come from the current ResearchPlan").
 *
 * The plan's `variables` array carries "name: value" dictionary entries
 * (units in brackets); a deterministic regex extracts the three parameters
 * the exoplanet adapter consumes. Missing / unparsable → the documented
 * default, and `source='default'` records that honestly in the observation.
 */
export function extractPlanParameters(plan: ResearchRun['plan']): {
  readonly minRadiusEarth: number;
  readonly maxPeriodDays: number;
  readonly confidenceLevel: number;
  readonly source: 'plan' | 'default';
} {
  const text = [...plan.variables, ...plan.dataRequirements].join('\n').toLowerCase();
  // Separators are bounded to one line ([^0-9\n]) so a value can never bleed
  // across entries; values must be positive finite numbers.
  const num = (pattern: RegExp): number | null => {
    const m = text.match(pattern);
    if (m === null || m[1] === undefined) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const minRadiusEarth =
    num(/\bmin(?:imum)?[\s_-]*radius\b[^0-9\n]{0,20}(\d+(?:\.\d+)?)/) ??
    num(/\bradius\b[^0-9\n]{0,20}(\d+(?:\.\d+)?)/) ??
    DEFAULT_MIN_RADIUS;
  const maxPeriodDays =
    num(/\bmax(?:imum)?[\s_-]*period\b[^0-9\n]{0,20}(\d+(?:\.\d+)?)/) ??
    num(/\bperiod\b[^0-9\n]{0,20}(\d+(?:\.\d+)?)/) ??
    DEFAULT_MAX_PERIOD;
  const confidenceLevel =
    num(/\bconfidence[\s_-]*level\b[^0-9\n]{0,20}(0?\.\d+)/) ?? DEFAULT_CONFIDENCE;

  const source: 'plan' | 'default' =
    /\bradius\b|\bperiod\b|\bconfidence\b/.test(text) ? 'plan' : 'default';
  return { minRadiusEarth, maxPeriodDays, confidenceLevel, source };
}

/**
 * Execute the first executable analysis step of the run's plan against the
 * NASA Exoplanet Archive, collect the Observation, and propose the feedback
 * that should drive the next revision.
 *
 * Fail-closed: a live fetch failure propagates (never silently returns []).
 */
export async function runPlanExperiment(opts: RunExperimentOptions): Promise<ExperimentResult> {
  const now = opts.now ?? (() => new Date());
  const producedAt = now().toISOString();

  // 0. Domain gate (fail-closed): the only available adapter is the exoplanet
  //    one; a run outside its domain is REFUSED with a structured error — an
  //    exoplanet correlation must never be grafted onto a non-exoplanet plan,
  //    and the absence of a domain adapter is stated, not papered over.
  if (!isExoplanetApplicable(opts.run)) {
    const domain = opts.run.gateReport.scope.domain ?? 'unknown';
    throw new Error(
      'experiment: no available ExperimentAdapter matches this run — the only implemented ' +
        `adapter (exoplanet-archive-radius-insolation) does not apply to domain "${domain}". ` +
        'No analysis was executed and no observation was fabricated; this run has no real-data ' +
        'experiment path yet (honest limitation, directive §3.3/§13).',
    );
  }

  // 1. Prepare inputs: the plan's hypotheses select the analysis; the plan's
  //    variables/dataRequirements supply the executable parameters (extracted
  //    deterministically; documented defaults only when the plan is silent).
  const primaryId = opts.run.plan.primaryHypothesisId;
  const liveFetch = opts.replayRows === undefined;
  let rows: readonly PsRow[];
  let card: ExoplanetDatasetCard;
  const mode: ComponentMode = liveFetch ? 'LIVE' : 'RECORDED_REPLAY';
  if (liveFetch) {
    const fetched = await fetchExoplanetPsLive(HOT_JUPITER_QUERY, now);
    rows = fetched.rows;
    card = fetched.card;
  } else {
    if (opts.replayRows === undefined || opts.replayCard === undefined) {
      throw new Error('experiment: replay mode requires replayRows + replayCard');
    }
    rows = opts.replayRows;
    card = opts.replayCard;
  }
  const params = extractPlanParameters(opts.run.plan);

  // 2. Execute: plan parameters → real statistical computation.
  const result = analyzeRadiusInsolation(rows, {
    minRadiusEarth: params.minRadiusEarth,
    maxPeriodDays: params.maxPeriodDays,
    confidenceLevel: params.confidenceLevel,
    source: params.source,
  }, producedAt);

  // 3. Collect the Observation (deterministic id over input hash + params).
  const observation: Observation = {
    id: `${result.inputHash.slice(0, 16)}`,
    adapter: 'exoplanet-archive-radius-insolation',
    affectsHypothesisIds: [primaryId],
    result,
    datasetCard: card,
    mode,
    producedAt,
  };

  // 4. Propose feedback: the observation's implication for the next round.
  //    A null/non-significant/failed result is preserved — it may weaken the
  //    primary hypothesis (changesScore=true) or trigger a plan rewrite, but
  //    it is never converted into fake confirmation.
  const implication = interpretObservation(observation);
  const feedback: FeedbackSignal = buildFeedbackSignal({
    source: 'analysis',
    actor: 'exoplanet-archive-radius-insolation',
    text: implication.text,
    affectsHypothesisIds: [primaryId],
    changesScore: implication.changesScore,
    triggers: implication.triggers,
    receivedAt: producedAt,
  });

  const updatedRun: ResearchRun = {
    ...opts.run,
    observations: [...opts.run.observations, observation],
    modes: {
      ...opts.run.modes,
      experimentExecutionMode: mode,
    },
    runMode: aggregateWithExperiment(opts.run, mode),
  };

  return { observation, feedback, updatedRun };
}

/** What the observation implies for the next round (honest interpretation). */
export function interpretObservation(obs: Observation): {
  readonly text: string;
  readonly changesScore: boolean;
  readonly triggers: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
} {
  const r = obs.result;
  if (r.status === 'FAILED') {
    return {
      text: `real-data analysis reported ${r.status} (n=${r.n}) — the plan needs a larger or better-covered sample before any conclusion; revise data requirements`,
      changesScore: true,
      triggers: ['plan_rewrite'],
    };
  }
  if (r.significantAt05 === false) {
    return {
      text: `real-data analysis: correlation not significant (n=${r.n}, r=${r.pearsonR?.toFixed(3) ?? 'n/a'}, p=${r.pValue?.toFixed(3) ?? 'n/a'}) — the irradiation-inflation association is not supported by this snapshot; null preserved`,
      changesScore: true,
      triggers: ['alternative_hypothesis'],
    };
  }
  return {
    text: `real-data analysis: significant positive correlation (n=${r.n}, r=${r.pearsonR?.toFixed(3)}, p=${r.pValue?.toFixed(3)}) — association consistent with irradiation-driven inflation (association, not causation)`,
    changesScore: false,
    triggers: ['none'],
  };
}

/** Aggregate run mode when the experiment component becomes non-NOT_EXECUTED. */
function aggregateWithExperiment(
  run: ResearchRun,
  experimentMode: ComponentMode,
): ResearchRun['runMode'] {
  const { modelExecutionMode, retrievalExecutionMode } = run.modes;
  const components: readonly ComponentMode[] = [modelExecutionMode, retrievalExecutionMode, experimentMode];
  if (components.every((m) => m === 'LIVE')) return 'LIVE';
  if (components.every((m) => m === 'RECORDED_REPLAY' || m === 'OFFLINE_DEVELOPMENT' || m === 'SYNTHETIC_TEST')) {
    return 'RECORDED_REPLAY';
  }
  return 'MIXED';
}
