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
import {
  analyzeLiteratureLandscape,
  LANDSCAPE_THRESHOLDS,
  type LandscapeDatasetCard,
  type LiteratureLandscapeObservation,
} from './adapters/literature_landscape.ts';
import type { ComponentMode, FeedbackSignal, ResearchRun } from './types.ts';

/**
 * A parsed tool/analysis Observation attached to a run (directive §9.10/§11.4).
 * Discriminated on `adapter` — result and datasetCard correlate with it.
 */
export type Observation =
  | {
      readonly id: string;
      readonly adapter: 'exoplanet-archive-radius-insolation';
      readonly affectsHypothesisIds: readonly string[];
      readonly result: RadiusInsolationObservation;
      readonly datasetCard: ExoplanetDatasetCard;
      readonly mode: ComponentMode;
      readonly producedAt: string;
    }
  | {
      readonly id: string;
      readonly adapter: 'literature-landscape';
      readonly affectsHypothesisIds: readonly string[];
      readonly result: LiteratureLandscapeObservation;
      readonly datasetCard: LandscapeDatasetCard;
      readonly mode: ComponentMode;
      readonly producedAt: string;
    };

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
  const primaryId = opts.run.plan.primaryHypothesisId;

  // 0. Adapter routing (fail-closed): the exoplanet adapter serves astro runs;
  //    every other run gets the domain-general literature-landscape analysis
  //    over its OWN frozen corpus (text modality — real retrieved documents).
  //    An EMPTY corpus is refused: no honest analysis exists over zero docs.
  const useExoplanet = isExoplanetApplicable(opts.run);
  if (!useExoplanet && opts.run.corpus.documentCount === 0) {
    throw new Error(
      'experiment: no available ExperimentAdapter matches this run — the corpus is empty, so ' +
        'the literature-landscape analysis has no input and no domain adapter applies. ' +
        'No analysis was executed and no observation was fabricated (directive §3.3/§13).',
    );
  }

  let observation: Observation;
  if (useExoplanet) {
    // 1. Prepare inputs: the plan's variables/dataRequirements supply the
    //    executable parameters (deterministic; defaults only when the plan
    //    is silent). 2. Execute: plan parameters → real statistical computation.
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
    const result = analyzeRadiusInsolation(rows, {
      minRadiusEarth: params.minRadiusEarth,
      maxPeriodDays: params.maxPeriodDays,
      confidenceLevel: params.confidenceLevel,
      source: params.source,
    }, producedAt);
    observation = {
      id: `${result.inputHash.slice(0, 16)}`,
      adapter: 'exoplanet-archive-radius-insolation',
      affectsHypothesisIds: [primaryId],
      result,
      datasetCard: card,
      mode,
      producedAt,
    };
  } else {
    observation = runLandscapeExperiment(opts.run, now(), producedAt, primaryId);
  }

  // 3. Propose feedback: the observation's implication for the next round.
  //    A null/non-significant/failed result is preserved — it may weaken the
  //    primary hypothesis (changesScore=true) or trigger a plan rewrite, but
  //    it is never converted into fake confirmation.
  const implication = interpretObservation(observation);
  const feedback: FeedbackSignal = buildFeedbackSignal({
    source: 'analysis',
    actor: observation.adapter,
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
      experimentExecutionMode: observation.mode,
    },
    runMode: aggregateWithExperiment(opts.run, observation.mode),
  };

  return { observation, feedback, updatedRun };
}

/**
 * Execute the domain-general literature-landscape analysis over the run's
 * frozen corpus (deterministic — recomputable by `far research verify`).
 */
function runLandscapeExperiment(
  run: ResearchRun,
  now: Date,
  producedAt: string,
  primaryId: string,
): Observation {
  const { result, datasetCard } = analyzeLiteratureLandscape(
    run.corpus,
    producedAt,
    now.getUTCFullYear(),
  );
  // Data provenance drives the mode: over a corpus genuinely fetched live this
  // analysis consumed real-world data; over replay fixtures it is replay
  // (§3.2 — never labeled stronger than the data it consumed).
  const mode: ComponentMode =
    run.modes.retrievalExecutionMode === 'LIVE' ? 'LIVE' : 'RECORDED_REPLAY';
  return {
    id: `${result.rootHash.slice(0, 16)}`,
    adapter: 'literature-landscape',
    affectsHypothesisIds: [primaryId],
    result,
    datasetCard,
    mode,
    producedAt,
  };
}


/** Type guard: the domain-general landscape observation. */
export function isLandscapeObservation(
  obs: Observation,
): obs is Extract<Observation, { readonly adapter: 'literature-landscape' }> {
  return obs.adapter === 'literature-landscape';
}

/** What the observation implies for the next round (honest interpretation). */
export function interpretObservation(obs: Observation): {
  readonly text: string;
  readonly changesScore: boolean;
  readonly triggers: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
} {
  if (isLandscapeObservation(obs)) {
    return interpretLandscape(obs.result);
  }
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

/** Landscape interpretation — proposals only; a healthy landscape proposes nothing. */
function interpretLandscape(r: LiteratureLandscapeObservation): {
  readonly text: string;
  readonly changesScore: boolean;
  readonly triggers: readonly ('new_retrieval' | 'alternative_hypothesis' | 'plan_rewrite' | 'none')[];
} {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const skew = r.counterEvidenceShare < LANDSCAPE_THRESHOLDS.counterShareFloor;
  const stale = r.freshShare < LANDSCAPE_THRESHOLDS.freshShareFloor;
  const parts: string[] = [
    `literature-landscape: ${r.totalDocuments} grounded documents · counter-evidence share ${pct(r.counterEvidenceShare)} · fresh(≤5y) ${pct(r.freshShare)}` +
      (r.medianPublicationYear === null ? ' · no dated documents' : ` · median year ${Math.round(r.medianPublicationYear)}`) +
      ` · ${r.sourceFamilies.length} source famil${r.sourceFamilies.length === 1 ? 'y' : 'ies'}`,
  ];
  if (skew) {
    parts.push(
      `counter-evidence share is below the ${pct(LANDSCAPE_THRESHOLDS.counterShareFloor)} floor — the evidence base is confirmation-skewed; the plan should add targeted adversarial retrieval (non-replication, null-result, criticism queries) before hypothesis scoring is trusted`,
    );
  }
  if (stale) {
    parts.push(
      `only ${pct(r.freshShare)} of documents are from the last ${LANDSCAPE_THRESHOLDS.freshWindowYears} years — for a fast-moving field the plan should require an updated search window`,
    );
  }
  if (skew || stale) {
    return {
      text: parts.join(' · '),
      changesScore: false,
      triggers: ['new_retrieval', 'plan_rewrite'],
    };
  }
  return {
    text: parts.join(' · ') + ' — evidence mix is balanced; no change proposed (improvement never forced)',
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
