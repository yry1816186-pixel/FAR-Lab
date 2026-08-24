import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId, SimulationSpec, checkSimulationSpec, SIM_STATISTIC_METRIC,
  type ExperimentRun, type StatReport, type FeedbackSignal, type HypothesisCandidate,
  type Comparison, type SidecarStatsResult,
} from '../domain/index.js';
import { createSidecar, lockfileHash, type Sidecar } from './python.js';
import { computeStatReports, buildFeedback } from './executor.js';

/**
 * Simulation experiment executor (R2-10): preregistered Monte-Carlo configs -> seeded
 * per-replicate outcomes on the REAL sidecar -> the SAME terminal statistics chain as
 * ML experiments (abs_stats/paired_stats -> mechanical verdict -> feedback). No second
 * statistical engine and no new store kinds: the spec snapshot is a content-addressed
 * artifact (kind registration for `simulation_spec` is offered to lane 12 via handoff),
 * results are StatReports, raw per-replicate arrays are artifacts referenced from the
 * feedback signal's structured payload and audit events.
 *
 * Authority mirrors executor.ts: far.db experiment_run = terminal projection + audit
 * events; sidecar logs = content-addressed artifacts; verdicts mechanical, never LLM.
 */

export interface SimulationExecuteOptions {
  shouldCancel?: () => boolean;
  sidecar?: () => Sidecar;
  now?: () => string;
}

export interface ExecutedSimulation {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
  perReplicateRefs: string[];
}

export const simulationSpecHash = (spec: SimulationSpec): string =>
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

interface SimulateResult {
  perReplicate: number[];
  pointEstimate: number;
  n: number;
  blockSize: number;
}

export const executeSimulationExperiment = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: SimulationSpec,
  opts: SimulationExecuteOptions = {},
): Promise<ExecutedSimulation> => {
  const now = opts.now ?? (() => new Date().toISOString());

  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkSimulationSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id) });
  if (!validation.passed) {
    throw new Error(`simulation spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: SimulationSpec = SimulationSpec.parse({ ...spec, validation });
  const specHash = simulationSpecHash(validated);

  const specArtifact = (await artifacts.put(canonicalJson(validated))).ref;

  let expRun: ExperimentRun = {
    id: newId('xrun') as ExperimentRun['id'],
    runId: spec.runId,
    specId: spec.id,
    specHash,
    status: 'queued',
    attempts: 1,
    executor: 'local',
    cancelRequested: false,
    resultIds: [],
    statReportIds: [],
    createdAt: now(),
  };
  const persist = (run: ExperimentRun, type: 'experiment_queued' | 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_canceled', detail: Record<string, unknown>): void => {
    store.putObjectEvented('experiment_run', run, { type, detail }, now());
    expRun = run;
  };
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash, kind: 'simulation', specArtifactRef: specArtifact });
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`simulation ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
  };

  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  try {
    let env: Awaited<ReturnType<Sidecar['warmup']>>;
    try {
      env = await sidecar.warmup(spec.compute.timeoutMs);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e), e);
    }
    const lock = sidecar.lockfileHash();
    persist({
      ...expRun, status: 'running', startedAt: now(),
      environment: { pythonVersion: env.pythonVersion, versions: env.versions, lockfileHash: lock ?? undefined, ...(env.hardware !== undefined ? { hardware: env.hardware } : {}) },
    }, 'experiment_started', { id: expRun.id, kind: 'simulation', python: env.pythonVersion, versions: env.versions });

    const perReplicateByConfig = new Map<number, number[]>();
    const perReplicateRefs: string[] = [];
    for (const [idx, config] of validated.configs.entries()) {
      if (opts.shouldCancel?.()) throw new Error('canceled');
      const r = await sidecar.call<SimulateResult>('simulate', {
        template: config.template,
        distribution: config.distribution,
        statistic: config.statistic,
        ...(config.threshold !== undefined ? { threshold: config.threshold } : {}),
        ...(config.blockSize !== undefined ? { blockSize: config.blockSize } : {}),
        replicates: config.replicates,
        seed: config.seed,
      }, spec.compute.timeoutMs);
      if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'simulate returned no result');
      const res = r.result;
      if (res.n !== config.replicates || res.perReplicate.length !== config.replicates) {
        fail(`simulate replicate-count mismatch for ${config.name}: ${res.perReplicate.length} != ${config.replicates}`);
      }
      const ref = (await artifacts.put(JSON.stringify(res.perReplicate))).ref;
      perReplicateByConfig.set(idx, res.perReplicate);
      perReplicateRefs.push(ref);
      store.appendEvent(spec.runId, {
        type: 'note',
        detail: { kind: 'simulation_config', config: config.name, idx, perReplicateRef: ref, pointEstimate: res.pointEstimate, n: res.n, blockSize: res.blockSize },
      }, now());
    }

    // Comparison view: SimComparison -> the shared Comparison shape the statistics
    // chain consumes (metricKey = the per-replicate statistic's decomposition).
    const comparisonsView: Comparison[] = validated.comparisons.map((c) => ({
      id: c.id,
      metricKey: SIM_STATISTIC_METRIC[c.statistic],
      kind: c.kind,
      modelIdx: c.configIdx,
      modelAIdx: c.configAIdx,
      modelBIdx: c.configBIdx,
      direction: c.direction,
      threshold: c.threshold,
      thresholdProvenance: c.thresholdProvenance,
      hypothesisId: c.hypothesisId,
      primary: c.primary,
      mde: c.mde,
    }));

    // Sequential-analysis guard input: confirmatory history on this run (same discipline
    // as dataset re-analysis — a re-run of statistics over the same simulation is labelled exploratory).
    const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];
    const statReports = (await computeStatReports({
      spec: { runId: validated.runId, statistics: validated.statistics, comparisons: comparisonsView },
      hypotheses,
      priorReports,
      perRowByModel: perReplicateByConfig,
      statCall: async (op, payload) => {
        const r = await sidecar.call<SidecarStatsResult>(op, payload, spec.compute.timeoutMs);
        if (!r.ok || r.result === undefined) fail(r.error?.message ?? `${op} failed`);
        return r.result;
      },
      fail, now,
    })).map((r) => ({ ...r, experimentRunId: expRun.id }));
    for (const report of statReports) {
      store.putObjectEvented('stat_report', report, { type: 'note', detail: { stat_report: report.id, comparison: report.comparisonId, verdict: report.verdict } }, now());
    }
    const feedback = buildFeedback(validated, statReports, expRun.id, specHash, now).map((f) => ({
      ...f,
      structured: { ...(f.structured ?? {}), kind: 'simulation', perReplicateRefs },
    }));
    for (const sig of feedback) {
      store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: sig.target?.id ?? null } }, now());
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(),
      statReportIds: statReports.map((r) => r.id),
    };
    persist(completed, 'experiment_completed', { id: expRun.id, kind: 'simulation', statReports: statReports.length, feedback: feedback.length });
    return { run: completed, statReports, feedback, perReplicateRefs };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`simulation ${expRun.id} canceled`, { cause: e });
    }
    fail(e instanceof Error ? e.message : String(e), e);
  } finally {
    const logs = sidecar.logs();
    if (logs.length > 0) {
      const logRef = (await artifacts.put(`[simulation ${expRun.id}]\n${logs.join('\n')}`)).ref;
      store.putObjectEvented('experiment_run', { ...expRun, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    sidecar.close();
  }
};

export { lockfileHash };
