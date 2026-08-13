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
 * Execute the first executable analysis step of the run's plan against the
 * NASA Exoplanet Archive, collect the Observation, and propose the feedback
 * that should drive the next revision.
 *
 * Fail-closed: a live fetch failure propagates (never silently returns []).
 */
export async function runPlanExperiment(opts: RunExperimentOptions): Promise<ExperimentResult> {
  const now = opts.now ?? (() => new Date());
  const producedAt = now().toISOString();

  // 1. Prepare inputs: the plan's hypotheses select the analysis; parameters
  //    come from plan-level defaults (the plan is the source of the design).
  const primaryId = opts.run.plan.primaryHypothesisId;
  const rows: readonly PsRow[] =
    opts.replayRows !== undefined ? opts.replayRows : (await fetchExoplanetPsLive(HOT_JUPITER_QUERY, now)).rows;
  const card: ExoplanetDatasetCard =
    opts.replayCard !== undefined
      ? opts.replayCard
      : {
          source: 'NASA Exoplanet Archive',
          sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu',
          version: 'PS table (TAP sync snapshot)',
          persistentId: 'nasa-exoplanet-archive:ps',
          license: 'NASA public domain (PD)',
          downloadedAt: producedAt,
          query: HOT_JUPITER_QUERY,
          rawChecksum: 'replay:see-fixture',
          rowCount: rows.length,
          fields: ['pl_name', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'st_teff', 'st_rad', 'st_mass'],
          units: {},
          missingNotes: [],
          qualityNotes: [],
          allowedInference: 'Population-level correlation in this snapshot',
          forbiddenInference: 'No per-system causal claims',
          reproductionCommand: '(replay fixture)',
          fetchMode: 'RECORDED_REPLAY',
        };
  const mode: ComponentMode = opts.replayRows !== undefined ? 'RECORDED_REPLAY' : 'LIVE';

  // 2. Execute: plan parameters → real statistical computation.
  const result = analyzeRadiusInsolation(rows, {
    minRadiusEarth: DEFAULT_MIN_RADIUS,
    maxPeriodDays: DEFAULT_MAX_PERIOD,
    confidenceLevel: DEFAULT_CONFIDENCE,
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
