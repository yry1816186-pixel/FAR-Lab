import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId,
  checkExperimentSpec, mechanicalVerdict,
  type ExperimentRun, type ExperimentSpec, type ResultCell, type ResultSet, type StatReport,
  type FeedbackSignal, type HypothesisCandidate, type SplitOutcome, type SidecarStatsResult,
} from '../domain/index.js';
import { acquireDataset } from './datasets.js';
import { applySplit } from './split.js';
import { createSidecar, type Sidecar } from './python.js';

/**
 * Local experiment executor (P1 vertical slice). Real path only — no mocks; failures
 * mark the ExperimentRun failed with the verbatim error and stay inspectable.
 *
 * Statistical honesty chain (D-085 P0-1): preregistered spec -> executed results ->
 * deterministic CI -> mechanical verdict. Absolute/paired P1 comparisons ride per-row
 * correctness, so their metric is accuracy — the validator enforces that correspondence.
 * Training logs are content-addressed artifacts, never audit events (D-085 P0-3).
 */

export interface ExecuteOptions {
  /** Operator cancellation probe, checked between models (P1 granularity). */
  shouldCancel?: () => boolean;
  /** Sidecar factory override (tests may pass a real sidecar on another interpreter). */
  sidecar?: () => Sidecar;
  /** D-086-4: local-path datasets are operator-only; tests set this explicitly. */
  allowLocalDatasets?: boolean;
  now?: () => string;
}

interface TrainEvalResult {
  metrics: Record<string, number>;
  perRowCorrect: number[];
  nTrain: number;
  nTest: number;
  classes: string[];
}

export const experimentSpecHash = (spec: ExperimentSpec): string =>
  createHash('sha256').update(JSON.stringify(spec)).digest('hex');

export interface ExecutedExperiment {
  run: ExperimentRun;
  resultSet: ResultSet;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

export const executeExperiment = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: ExperimentSpec,
  opts: ExecuteOptions = {},
): Promise<ExecutedExperiment> => {
  const now = opts.now ?? (() => new Date().toISOString());

  // 1. Fail-closed validation gate BEFORE any resource is spent.
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkExperimentSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id), allowLocalDatasets: opts.allowLocalDatasets });
  if (!validation.passed) {
    throw new Error(`spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: ExperimentSpec = { ...spec, validation };
  store.putObject('experiment_spec', validated);

  const use = spec.datasets[0];
  if (use === undefined) throw new Error('spec has no dataset use');
  // Sequential-analysis guard input (D-086-7): confirmatory history on THIS dataset.
  const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];

  const specHash = experimentSpecHash(validated);
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
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash });

  // Explicit variable annotation: TS only narrows via never-returning calls on
  // const declarations with an explicit function type (env/raw/res guards below rely on it).
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`experiment ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
  };

  // One sidecar session carries training AND statistics; logs flush to an artifact at close.
  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  try {
    // 2. Dataset acquisition + deterministic split.
    const { record, parsed } = await acquireDataset(store, artifacts, spec.runId, use);
    if (opts.shouldCancel?.()) throw new Error('canceled before split');
    const outcome: SplitOutcome = applySplit(parsed.header, parsed.rows, {
      datasetRecordId: record.id,
      datasetContentRef: record.contentRef,
      targetColumn: use.targetColumn,
      split: use.split,
      groupColumn: use.groupColumn,
    });
    store.putObjectEvented('dataset_record', {
      ...record,
      lineage: [...record.lineage, { kind: 'split', detail: `method=${use.split.method} seed=${use.split.seed} specHash=${outcome.specHash} train/val/test=${outcome.trainIdx.length}/${outcome.valIdx.length}/${outcome.testIdx.length}`, at: now() }],
    }, { type: 'note', detail: { dataset: record.id, split: outcome.specHash } }, now());

    // 3. Sidecar identity (pinned family env recorded into the run).
    let env: Awaited<ReturnType<Sidecar['warmup']>> | undefined;
    try {
      env = await sidecar.warmup(spec.compute.timeoutMs);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e), e);
    }
    const lock = sidecar.lockfileHash();
    persist({
      ...expRun, status: 'running', startedAt: now(),
      environment: { pythonVersion: env.pythonVersion, versions: env.versions, lockfileHash: lock ?? undefined },
    }, 'experiment_started', { id: expRun.id, python: env.pythonVersion, versions: env.versions });

    // 4. Train/eval per model, with fingerprint dedup against earlier cells (D-086-1).
    const previousCells = (store.listObjects('result_set', spec.runId) as ResultSet[]).flatMap((rs) => rs.cells);
    const cells: ResultCell[] = [];
    const perRowByModel = new Map<number, number[]>();
    for (const [modelIdx, model] of spec.models.entries()) {
      if (opts.shouldCancel?.()) throw new Error('canceled');
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ specHash, contentRef: record.contentRef, envLock: lock, modelIdx, seed: model.seed, builder: model.builderId, hyperparams: model.hyperparams }))
        .digest('hex');
      const cached = previousCells.find((c) => c.fingerprint === fingerprint);
      if (cached !== undefined) {
        const raw = await artifacts.get(cached.perRowRef);
        if (raw === null) fail(`cached cell ${cached.modelName} lost its per-row artifact ${cached.perRowRef}`);
        perRowByModel.set(modelIdx, JSON.parse(raw) as number[]);
        cells.push(cached);
        continue;
      }
      const t0 = Date.now();
      const r = await sidecar.call<TrainEvalResult>('train_eval', {
        csvPath: artifacts.path(record.contentRef),
        targetColumn: use.targetColumn,
        trainIdx: outcome.trainIdx,
        testIdx: outcome.testIdx,
        metrics: spec.metrics,
        model: { builderId: model.builderId, hyperparams: model.hyperparams, seed: model.seed },
      }, spec.compute.timeoutMs);
      if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'train_eval returned no result');
      const res = r.result;
      if (res.nTrain !== outcome.trainIdx.length || res.nTest !== outcome.testIdx.length) {
        fail(`sidecar row-count mismatch: nTrain ${res.nTrain} != ${outcome.trainIdx.length} or nTest ${res.nTest} != ${outcome.testIdx.length}`);
      }
      const perRowRef = (await artifacts.put(JSON.stringify(res.perRowCorrect))).ref;
      perRowByModel.set(modelIdx, res.perRowCorrect);
      cells.push({ modelIdx, modelName: model.name, metrics: res.metrics, perRowRef, fingerprint, tags: model.tags, nTrain: res.nTrain, nTest: res.nTest, timingMs: Date.now() - t0 });
    }

    const resultSet: ResultSet = {
      id: newId('rset') as ResultSet['id'],
      experimentRunId: expRun.id,
      runId: spec.runId,
      datasetRecordId: record.id,
      splitHash: outcome.specHash,
      cells,
      computedAt: now(),
    };
    store.putObjectEvented('result_set', resultSet, { type: 'note', detail: { result_set: resultSet.id, cells: cells.length } }, now());

    // 5. Preregistered statistics on the SAME sidecar session, then mechanical verdicts.
    // P2 multiple-testing enforcement (EVALUATION §10): single_primary => only the primary
    // comparison is confirmatory (others descriptive, never feed feedback); alpha_spending
    // => equal Bonferroni-style split over ALL confirmatory comparisons, adjustedAlpha recorded.
    const datasetIteration = priorReports.length + 1;
    const sequential = datasetIteration > 1;
    const confirmatoryCount = spec.statistics.multipleTestingPolicy === 'alpha_spending'
      ? spec.comparisons.length
      : 0;
    const statReports: StatReport[] = [];
    for (const comp of spec.comparisons) {
      const secondary = spec.statistics.multipleTestingPolicy === 'single_primary' ? !comp.primary : false;
      const effectiveAlpha = confirmatoryCount > 0 ? spec.statistics.alpha / confirmatoryCount : spec.statistics.alpha;
      let stat: SidecarStatsResult;
      if (comp.kind === 'absolute') {
        const rows = perRowByModel.get(comp.modelIdx ?? -1);
        if (rows === undefined) fail(`comparison ${comp.id}: model ${comp.modelIdx} has no per-row results`);
        const r = await sidecar.call<SidecarStatsResult>('abs_stats', {
          rows, alpha: effectiveAlpha, nBoot: spec.statistics.nBoot, analysisSeed: spec.statistics.analysisSeed,
        }, spec.compute.timeoutMs);
        if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'abs_stats failed');
        stat = r.result;
      } else {
        const rowsA = perRowByModel.get(comp.modelAIdx ?? -1);
        const rowsB = perRowByModel.get(comp.modelBIdx ?? -1);
        if (rowsA === undefined || rowsB === undefined) fail(`comparison ${comp.id}: paired models missing per-row results`);
        const r = await sidecar.call<SidecarStatsResult>('paired_stats', {
          rowsA, rowsB, diffMode: 'correctness',
          kind: spec.statistics.test === 'paired_t' ? 'paired_t' : 'paired_bootstrap_ci',
          alpha: effectiveAlpha, nBoot: spec.statistics.nBoot, analysisSeed: spec.statistics.analysisSeed,
        }, spec.compute.timeoutMs);
        if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'paired_stats failed');
        stat = r.result;
      }
      const hyp = comp.hypothesisId !== undefined ? hypotheses.find((h) => h.id === comp.hypothesisId) : undefined;
      const bound = comp.hypothesisId !== undefined && hyp !== undefined;
      const verdict = bound && !sequential ? mechanicalVerdict(comp, stat.ci) : undefined;
      const derivation = bound
        ? [
          `rule: ${comp.metricKey}(${describe(comp)}) ${comp.direction === 'above' ? '>' : '<'} ${comp.threshold} [threshold source: ${comp.thresholdProvenance}]`,
          `measured: point=${stat.pointEstimate.toFixed(4)} CI${spec.statistics.ciLevel}[${stat.ci.low.toFixed(4)}, ${stat.ci.high.toFixed(4)}]${stat.pValue !== undefined ? ` p=${stat.pValue.toFixed(4)}` : ''}`,
          `verdict: ${verdict ?? 'inconclusive (sequential re-analysis on this dataset is labelled exploratory)'}`,
        ].join('; ')
        : undefined;
      const report: StatReport = {
        id: newId('srep') as StatReport['id'],
        experimentRunId: expRun.id,
        runId: spec.runId,
        comparisonId: comp.id,
        metricKey: comp.metricKey,
        primary: comp.primary,
        pointEstimate: stat.pointEstimate,
        ci: { level: 1 - effectiveAlpha, low: stat.ci.low, high: stat.ci.high },
        test: { kind: spec.statistics.test, alpha: spec.statistics.alpha, pValue: stat.pValue, nBoot: stat.nBoot },
        effect: stat.effect,
        hypothesisId: comp.hypothesisId,
        hypothesisVersion: hyp?.version,
        thresholdProvenance: comp.thresholdProvenance,
        verdict,
        secondary,
        adjustedAlpha: confirmatoryCount > 0 ? effectiveAlpha : undefined,
        verdictDerivation: derivation,
        exploratory: !bound || sequential,
        analysisIteration: datasetIteration,
        createdAt: now(),
      };
      statReports.push(report);
      store.putObjectEvented('stat_report', report, { type: 'note', detail: { stat_report: report.id, comparison: comp.id, verdict } }, now());
    }

    // 6. Confirmatory verdicts become feedback signals (exploratory results never revise
    // hypotheses, D-086-6; secondary/descriptive comparisons never do either, P2 policy).
    const feedback: FeedbackSignal[] = [];
    const byHypothesis = new Map<string, StatReport[]>();
    for (const rep of statReports) {
      if (rep.hypothesisId !== undefined && !rep.exploratory && !rep.secondary) {
        const list = byHypothesis.get(rep.hypothesisId);
        if (list === undefined) byHypothesis.set(rep.hypothesisId, [rep]);
        else list.push(rep);
      }
    }
    for (const [hypId, reps] of byHypothesis) {
      const sig: FeedbackSignal = {
        id: newId('fbk') as FeedbackSignal['id'],
        runId: spec.runId,
        source: 'experiment',
        content: reps.map((r) => `comparison ${r.comparisonId} on ${r.metricKey}: verdict=${r.verdict} (point=${r.pointEstimate.toFixed(4)}, CI[${r.ci.low.toFixed(4)},${r.ci.high.toFixed(4)}], threshold source=${r.thresholdProvenance})`).join(' | '),
        structured: { experimentRunId: expRun.id, statReportIds: reps.map((r) => r.id), verdicts: reps.map((r) => r.verdict) },
        target: { kind: 'hypothesis', id: hypId },
        provenance: `experiment-executor:${expRun.id} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
        receivedAt: now(),
      };
      feedback.push(sig);
      store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: hypId } }, now());
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(),
      resultIds: [resultSet.id], statReportIds: statReports.map((r) => r.id),
    };
    persist(completed, 'experiment_completed', { id: expRun.id, results: resultSet.id, statReports: statReports.length, feedback: feedback.length });
    return { run: completed, resultSet, statReports, feedback };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`experiment ${expRun.id} canceled`, { cause: e });
    }
    fail(e instanceof Error ? e.message : String(e), e);
  } finally {
    const logs = sidecar.logs();
    if (logs.length > 0) {
      await artifacts.put(`[experiment ${expRun.id}]\n${logs.join('\n')}`);
    }
    sidecar.close();
  }
};

const describe = (comp: { kind: string; modelIdx?: number; modelAIdx?: number; modelBIdx?: number }): string =>
  comp.kind === 'absolute' ? `model[${comp.modelIdx}]` : `model[${comp.modelAIdx}] - model[${comp.modelBIdx}]`;
