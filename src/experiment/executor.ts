import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId, ExperimentSpec,
  checkExperimentSpec, mechanicalVerdict, impliedPowerFor, POWER_METHOD,
  type ExperimentRun, type ResultCell, type ResultSet, type StatReport,
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
  /**
   * P3 scheduler path: reuse an already-queued experiment_run (created by
   * enqueueExperiment) instead of minting a new one — the job and the far.db projection
   * then refer to the same id. attempts increments per execution try.
   */
  existingRunId?: ExperimentRun['id'];
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
  // Canonical (key-sorted) serialization: a spec round-tripped through the store comes
  // back with zod schema key ORDER, which plain JSON.stringify would hash differently —
  // the executor's drift check must never false-positive on serialization order.
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

export interface ExecutedExperiment {
  run: ExperimentRun;
  resultSet: ResultSet;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

/** Statistics-call seam: local sidecar or a remote-backed implementation (P3). */
export type StatCall = (op: 'abs_stats' | 'paired_stats', payload: Record<string, unknown>) => Promise<SidecarStatsResult>;

/**
 * Shared terminal statistics (P3 refactor): the preregistered comparison loop with
 * multiple-testing enforcement and mechanical verdicts — identical semantics whether
 * cells were produced locally or on a remote device.
 */
export const computeStatReports = async (args: {
  spec: ExperimentSpec;
  hypotheses: HypothesisCandidate[];
  priorReports: StatReport[];
  perRowByModel: Map<number, number[]>;
  statCall: StatCall;
  fail: (message: string) => never;
  now: () => string;
}): Promise<StatReport[]> => {
  const { spec, hypotheses, priorReports, perRowByModel, statCall, fail, now } = args;
  const datasetIteration = priorReports.length + 1;
  const sequential = datasetIteration > 1;
  const confirmatoryCount = spec.statistics.multipleTestingPolicy === 'alpha_spending' ? spec.comparisons.length : 0;
  const statReports: StatReport[] = [];
  for (const comp of spec.comparisons) {
    const secondary = spec.statistics.multipleTestingPolicy === 'single_primary' ? !comp.primary : false;
    const effectiveAlpha = confirmatoryCount > 0 ? spec.statistics.alpha / confirmatoryCount : spec.statistics.alpha;
    let stat: SidecarStatsResult;
    if (comp.kind === 'absolute') {
      const rows = perRowByModel.get(comp.modelIdx ?? -1);
      if (rows === undefined) fail(`comparison ${comp.id}: model ${comp.modelIdx} has no per-row results`);
      const r = await statCall('abs_stats', { rows, alpha: effectiveAlpha, nBoot: spec.statistics.nBoot, analysisSeed: spec.statistics.analysisSeed });
      stat = r;
    } else {
      const rowsA = perRowByModel.get(comp.modelAIdx ?? -1);
      const rowsB = perRowByModel.get(comp.modelBIdx ?? -1);
      if (rowsA === undefined || rowsB === undefined) fail(`comparison ${comp.id}: paired models missing per-row results`);
      const r = await statCall('paired_stats', {
        rowsA, rowsB, diffMode: 'correctness',
        kind: spec.statistics.test === 'paired_t' ? 'paired_t' : 'paired_bootstrap_ci',
        alpha: effectiveAlpha, nBoot: spec.statistics.nBoot, analysisSeed: spec.statistics.analysisSeed,
      });
      stat = r;
    }
    const hyp = comp.hypothesisId !== undefined ? hypotheses.find((h) => h.id === comp.hypothesisId) : undefined;
    const bound = comp.hypothesisId !== undefined && hyp !== undefined;
    const verdict = bound && !sequential ? mechanicalVerdict(comp, stat.ci) : undefined;
    // BP-5: disclosed-convention implied power — visible BEFORE results are over-read.
    const nTest = comp.kind === 'absolute'
      ? (perRowByModel.get(comp.modelIdx ?? -1)?.length ?? 0)
      : (perRowByModel.get(comp.modelAIdx ?? -1)?.length ?? 0);
    const impliedPower = comp.mde !== undefined ? impliedPowerFor(comp.mde, effectiveAlpha, nTest) : null;
    const derivation = bound
      ? [
        `rule: ${comp.metricKey}(${describe(comp)}) ${comp.direction === 'above' ? '>' : '<'} ${comp.threshold} [threshold source: ${comp.thresholdProvenance}]`,
        `measured: point=${stat.pointEstimate.toFixed(4)} CI${(1 - effectiveAlpha).toFixed(3)}[${stat.ci.low.toFixed(4)}, ${stat.ci.high.toFixed(4)}]${stat.pValue !== undefined ? ` p=${stat.pValue.toFixed(4)}` : ''}`,
        `verdict: ${verdict ?? 'inconclusive (sequential re-analysis on this dataset is labelled exploratory)'}`,
      ].join('; ')
      : undefined;
    statReports.push({
      id: newId('srep') as StatReport['id'],
      experimentRunId: '', // caller binds to the run
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
      ...(impliedPower !== null ? { impliedPower, powerMethod: POWER_METHOD } : {}),
      exploratory: !bound || sequential,
      analysisIteration: datasetIteration,
      createdAt: now(),
    });
  }
  return statReports;
};

/** Shared feedback aggregation: confirmatory, non-sequential, non-secondary only (D-086-6 + P2 policy). */
export const buildFeedback = (spec: ExperimentSpec, statReports: StatReport[], experimentRunId: string, specHash: string, now: () => string): FeedbackSignal[] => {
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
    feedback.push({
      id: newId('fbk') as FeedbackSignal['id'],
      runId: spec.runId,
      source: 'experiment',
      content: reps.map((r) => `comparison ${r.comparisonId} on ${r.metricKey}: verdict=${r.verdict} (point=${r.pointEstimate.toFixed(4)}, CI[${r.ci.low.toFixed(4)},${r.ci.high.toFixed(4)}], threshold source=${r.thresholdProvenance})`).join(' | '),
      structured: { experimentRunId, statReportIds: reps.map((r) => r.id), verdicts: reps.map((r) => r.verdict) },
      target: { kind: 'hypothesis', id: hypId },
      provenance: `experiment-executor:${experimentRunId} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
      receivedAt: now(),
    });
  }
  return feedback;
};

const describe = (comp: { kind: string; modelIdx?: number; modelAIdx?: number; modelBIdx?: number }): string =>
  comp.kind === 'absolute' ? `model[${comp.modelIdx}]` : `model[${comp.modelAIdx}] - model[${comp.modelBIdx}]`;

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
  const validated: ExperimentSpec = ExperimentSpec.parse({ ...spec, validation });
  store.putObject('experiment_spec', validated);

  const use = spec.datasets[0];
  if (use === undefined) throw new Error('spec has no dataset use');
  // Sequential-analysis guard input (D-086-7): confirmatory history on THIS dataset.
  const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];

  const specHash = experimentSpecHash(validated);
  let expRun: ExperimentRun;
  if (opts.existingRunId !== undefined) {
    const existing = store.getObject('experiment_run', opts.existingRunId);
    if (existing === null) throw new Error(`existing experiment_run ${opts.existingRunId} not found`);
    if (existing.specHash !== specHash) {
      throw new Error(`spec drifted since ${opts.existingRunId} was queued: expected hash ${existing.specHash}, computed ${specHash}`);
    }
    expRun = { ...existing, status: 'queued', attempts: existing.attempts + 1, cancelRequested: false, error: undefined };
  } else {
    expRun = {
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
  }
  const persist = (run: ExperimentRun, type: 'experiment_queued' | 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_canceled', detail: Record<string, unknown>): void => {
    store.putObjectEvented('experiment_run', run, { type, detail }, now());
    expRun = run;
  };
  if (opts.existingRunId === undefined) {
    persist(expRun, 'experiment_queued', { specId: spec.id, specHash });
  } else {
    // enqueueExperiment already emitted the queued event; this is a claim-time object
    // projection only (status reset, attempts+1) — the started event follows shortly.
    store.putObject('experiment_run', expRun);
  }

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
    // Wave-S/s2 #6 (g5) post-acquisition re-check: nRows is known now, so the nTest floor
    // and MDE attainability floor apply for real. Fail-closed before any training spend.
    const postAcquisition = checkExperimentSpec(validated, {
      hypothesisIds: hypotheses.map((h) => h.id),
      allowLocalDatasets: opts.allowLocalDatasets,
      nRows: record.nRows,
    });
    if (!postAcquisition.passed) {
      throw new Error(`spec failed post-acquisition statistical gate: ${postAcquisition.missing.join('; ')}`);
    }
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

    // RU-8 GO1 pre-execution dataset audit (verdict ceiling = data quality):
    // leakage or exact duplicates make a preregistered verdict MEANINGLESS —
    // refuse before training spend. Label issues are advisory and disclosed in
    // the audit note (data is never auto-mutated).
    interface DatasetAuditResult {
      rows: { train: number; test: number };
      exactDuplicates: { train: number; test: number };
      trainTestLeakRows: number;
      labelIssueCount: number;
      labelIssueRate: number | null;
      verdict: 'ok' | 'degraded';
    }
    const audit = await sidecar.call<DatasetAuditResult>('dataset_audit', {
      csvPath: artifacts.path(record.contentRef),
      targetColumn: use.targetColumn,
      trainIdx: outcome.trainIdx,
      testIdx: outcome.testIdx,
      seed: spec.models[0]?.seed ?? 0,
    }, spec.compute.timeoutMs);
    if (!audit.ok || audit.result === undefined) fail(audit.error?.message ?? 'dataset_audit returned no result');
    const a = audit.result;
    if (a.trainTestLeakRows > 0) {
      fail(`dataset audit REFUSED execution: ${a.trainTestLeakRows} identical row(s) appear in BOTH train and test — the verdict would be meaningless (leakage)`);
    }
    store.appendEvent(spec.runId, {
      type: 'note',
      detail: {
        kind: 'dataset_audit',
        rows: a.rows,
        labelIssueCount: a.labelIssueCount,
        labelIssueRate: a.labelIssueRate,
        verdict: a.verdict,
      },
    });

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

    // 5-6. Shared terminal statistics + feedback aggregation (identical for local/remote cells).
    const statReports = (await computeStatReports({
      spec, hypotheses, priorReports, perRowByModel,
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
    const feedback = buildFeedback(spec, statReports, expRun.id, specHash, now);
    for (const sig of feedback) {
      store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: sig.target?.id ?? null } }, now());
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
      const logRef = (await artifacts.put(`[experiment ${expRun.id}]\n${logs.join('\n')}`)).ref;
      // Metadata completion (not a state transition): attach the log artifact to the
      // run object so export/bundle can reference it; audited as a note event.
      store.putObjectEvented('experiment_run', { ...expRun, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    sidecar.close();
  }
};
