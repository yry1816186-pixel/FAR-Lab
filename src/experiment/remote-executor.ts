import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId, checkExperimentSpec, ExperimentSpec,
  type ExperimentRun, type ResultCell, type ResultSet,
  type StatReport, type FeedbackSignal, type HypothesisCandidate, type SplitOutcome,
} from '../domain/index.js';
import { acquireDataset } from './datasets.js';
import { applySplit } from './split.js';
import { createSidecar, type Sidecar } from './python.js';
import { SSHGateway } from './gateway.js';
import { experimentSpecHash, computeStatReports, buildFeedback } from './executor.js';

/**
 * Remote experiment executor (P3, D-084/D-087). Division of authority:
 *   - data identity (acquire/split/lineage) stays in TS on this machine;
 *   - CELL PRODUCTION (training) runs on the remote device via the SSH gateway,
 *     using ONLY the reviewed template (experiment-runtime/remote/train_eval.py, D-086-5);
 *   - statistics + mechanical verdicts + feedback run on the LOCAL sidecar so the
 *     confirmatory chain stays deterministic on the orchestrator's terms.
 * Result fingerprints include the remote device id + probe identity: same-device
 * determinism per D-086-3, honestly device-scoped.
 */

const REMOTE_TEMPLATE = path.resolve(import.meta.dirname, '..', '..', 'experiment-runtime', 'remote', 'train_eval.py');

export interface RemoteExecuteOptions {
  gateway: SSHGateway;
  deviceId: string;
  allowLocalDatasets?: boolean;
  existingRunId?: ExperimentRun['id'];
  shouldCancel?: () => boolean;
  now?: () => string;
}

export interface RemoteExecutedExperiment {
  run: ExperimentRun;
  resultSet: ResultSet;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

interface RemoteTrainResult {
  metrics: Record<string, number>;
  perRowCorrect: number[];
  nTrain: number;
  nTest: number;
  classes: string[];
}

export const executeRemoteExperiment = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: ExperimentSpec,
  opts: RemoteExecuteOptions,
): Promise<RemoteExecutedExperiment> => {
  const now = opts.now ?? (() => new Date().toISOString());
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkExperimentSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id), allowLocalDatasets: opts.allowLocalDatasets });
  if (!validation.passed) throw new Error(`spec failed validation: ${validation.missing.join('; ')}`);
  const validated: ExperimentSpec = ExperimentSpec.parse({ ...spec, validation });
  store.putObject('experiment_spec', validated);

  const use = spec.datasets[0];
  if (use === undefined) throw new Error('spec has no dataset use');
  const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];
  const specHash = experimentSpecHash(validated);

  let expRun: ExperimentRun;
  if (opts.existingRunId !== undefined) {
    const existing = store.getObject('experiment_run', opts.existingRunId);
    if (existing === null) throw new Error(`existing experiment_run ${opts.existingRunId} not found`);
    if (existing.specHash !== specHash) throw new Error(`spec drifted since ${opts.existingRunId} was queued`);
    expRun = { ...existing, status: 'queued', attempts: existing.attempts + 1, cancelRequested: false, error: undefined };
    store.putObject('experiment_run', expRun);
  } else {
    expRun = {
      id: newId('xrun') as ExperimentRun['id'], runId: spec.runId, specId: spec.id, specHash,
      status: 'queued', attempts: 1, executor: 'remote', cancelRequested: false,
      resultIds: [], statReportIds: [], createdAt: now(),
    };
    store.putObjectEvented('experiment_run', expRun, { type: 'experiment_queued', detail: { specId: spec.id, specHash, device: opts.deviceId } });
  }
  const persist = (run: ExperimentRun, type: 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_canceled', detail: Record<string, unknown>): void => {
    store.putObjectEvented('experiment_run', run, { type, detail }, now());
    expRun = run;
  };
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`remote experiment ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
  };

  const logLines: string[] = [];
  try {
    // 1. Data identity locally; ship raw CSV + split assignment to the device.
    const { record, parsed } = await acquireDataset(store, artifacts, spec.runId, use);
    const outcome: SplitOutcome = applySplit(parsed.header, parsed.rows, {
      datasetRecordId: record.id, datasetContentRef: record.contentRef,
      targetColumn: use.targetColumn, split: use.split, groupColumn: use.groupColumn,
    });
    const probe = await opts.gateway.probe();
    if (!probe.reachable || probe.pythonVersion === null) fail(`device ${opts.deviceId} unreachable or has no python3`);
    logLines.push(`device=${opts.deviceId} python=${probe.pythonVersion} numpy=${probe.numpy}`);
    persist({ ...expRun, status: 'running', startedAt: now(), executor: 'remote', environment: { pythonVersion: `remote:${probe.pythonVersion}`, versions: { remoteDevice: opts.deviceId, remoteNumpy: String(probe.numpy) } } }, 'experiment_started', { id: expRun.id, device: opts.deviceId, python: probe.pythonVersion });

    const remoteDir = `/tmp/farlab/${expRun.id}`;
    await opts.gateway.exec(`mkdir -p ${remoteDir}`);
    await opts.gateway.putFile(artifacts.path(record.contentRef), `${remoteDir}/data.csv`);
    await opts.gateway.putFile(REMOTE_TEMPLATE, `${remoteDir}/train_eval.py`);

    // 2. Remote cell production per model (reviewed template only).
    const cells: ResultCell[] = [];
    const perRowByModel = new Map<number, number[]>();
    for (const [modelIdx, model] of spec.models.entries()) {
      if (opts.shouldCancel?.()) throw new Error('canceled');
      const payloadPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-payload-')), 'payload.json');
      fs.writeFileSync(payloadPath, JSON.stringify({
        csvPath: `${remoteDir}/data.csv`, targetColumn: use.targetColumn,
        trainIdx: outcome.trainIdx, testIdx: outcome.testIdx,
        metrics: spec.metrics, model: { builderId: model.builderId, hyperparams: model.hyperparams, seed: model.seed },
      }), 'utf8');
      await opts.gateway.putFile(payloadPath, `${remoteDir}/payload.json`);
      fs.rmSync(path.dirname(payloadPath), { recursive: true, force: true });
      const t0 = Date.now();
      const r = await opts.gateway.exec(`python3 ${remoteDir}/train_eval.py ${remoteDir}/payload.json`, spec.compute.timeoutMs);
      logLines.push(`model=${model.name} exit=${r.code} ${r.stderr.trim().slice(0, 300)}`);
      if (r.code !== 0) fail(`remote training ${model.name} exited ${r.code}: ${r.stderr.trim().slice(0, 400)}`);
      const res = JSON.parse(r.stdout.trim()) as RemoteTrainResult;
      if (res.nTrain !== outcome.trainIdx.length || res.nTest !== outcome.testIdx.length) {
        fail(`remote row-count mismatch for ${model.name}: ${res.nTrain}/${res.nTest} != ${outcome.trainIdx.length}/${outcome.testIdx.length}`);
      }
      const perRowRef = (await artifacts.put(JSON.stringify(res.perRowCorrect))).ref;
      perRowByModel.set(modelIdx, res.perRowCorrect);
      cells.push({
        modelIdx, modelName: model.name, metrics: res.metrics, perRowRef, tags: model.tags,
        fingerprint: createHash('sha256').update(JSON.stringify({
          specHash, contentRef: record.contentRef, device: opts.deviceId, remotePython: probe.pythonVersion,
          modelIdx, seed: model.seed, builder: model.builderId, hyperparams: model.hyperparams,
        })).digest('hex'),
        nTrain: res.nTrain, nTest: res.nTest, timingMs: Date.now() - t0,
      });
    }

    const resultSet: ResultSet = {
      id: newId('rset') as ResultSet['id'], experimentRunId: expRun.id, runId: spec.runId,
      datasetRecordId: record.id, splitHash: outcome.specHash, cells, computedAt: now(),
    };
    store.putObjectEvented('result_set', resultSet, { type: 'note', detail: { result_set: resultSet.id, device: opts.deviceId, cells: cells.length } }, now());

    // 3. Confirmatory chain on the LOCAL sidecar (deterministic verdicts, shared code path).
    const sidecar: Sidecar = createSidecar();
    let statReports: StatReport[];
    let feedback: FeedbackSignal[];
    const sidecarLogs: string[] = [];
    try {
      await sidecar.warmup(spec.compute.timeoutMs);
      statReports = (await computeStatReports({
        spec, hypotheses, priorReports, perRowByModel,
        statCall: async (op, payload) => {
          const r = await sidecar.call<import('../domain/index.js').SidecarStatsResult>(op, payload, spec.compute.timeoutMs);
          if (!r.ok || r.result === undefined) fail(r.error?.message ?? `${op} failed`);
          return r.result;
        },
        fail, now,
      })).map((rep) => ({ ...rep, experimentRunId: expRun.id }));
      for (const report of statReports) {
        store.putObjectEvented('stat_report', report, { type: 'note', detail: { stat_report: report.id, comparison: report.comparisonId, verdict: report.verdict } }, now());
      }
      feedback = buildFeedback(spec, statReports, expRun.id, specHash, now);
      for (const sig of feedback) {
        store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: sig.target?.id ?? null } }, now());
      }
    } finally {
      // Logs collected; persisted AFTER the terminal write below so the ref survives
      // (an intermediate-note write would be overwritten by the completed projection).
      sidecarLogs.push(...sidecar.logs());
      sidecar.close();
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(), executor: 'remote',
      resultIds: [resultSet.id], statReportIds: statReports.map((r) => r.id),
    };
    persist(completed, 'experiment_completed', { id: expRun.id, device: opts.deviceId, results: resultSet.id, statReports: statReports.length, feedback: feedback.length });
    const logs = [...logLines, ...sidecarLogs];
    if (logs.length > 0) {
      const logRef = (await artifacts.put(`[remote experiment ${expRun.id} @ ${opts.deviceId}]\n${logs.join('\n')}`)).ref;
      store.putObjectEvented('experiment_run', { ...completed, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    await opts.gateway.exec(`rm -rf ${remoteDir}`);
    return { run: completed, resultSet, statReports, feedback };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`remote experiment ${expRun.id} canceled`, { cause: e });
    }
    fail(e instanceof Error ? e.message : String(e), e);
  }
};
