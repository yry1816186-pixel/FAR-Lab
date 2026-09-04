import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../persistence/db.js';
import { Store } from '../persistence/store.js';
import { openArtifactStore } from '../persistence/artifacts.js';
import { openScheduler, enqueueExperiment, runSchedulerWorker } from '../experiment/scheduler.js';
import { ExperimentSpec } from '../domain/index.js';
import type { ExperimentRun } from '../domain/index.js';
import { SPEC_ID_RE } from '../experiment/approve.js';

/**
 * `far experiment ...` — the scheduler as a user-operable product surface (P3 CLI).
 * Owns nothing: far.db stays the domain authority, far-scheduler.db the job lifecycle,
 * artifacts the training logs. This layer only parses/validates input and renders
 * truthful state (no invented progress).
 *
 * Commands:
 *   far experiment run     <spec.json> [--priority N] [--allow-local-datasets]
 *   far experiment enqueue <spec.json> [--device <id>] (queue only; a worker executes later)
 *   far experiment simulate <simspec.json> (direct CRN monte-carlo execution)
 *   far experiment worker  [--max-jobs N] [--max-running N] [--heartbeat-ms MS]
 *   far experiment status  [--job <id>]
 *   far experiment cancel  <jobId>
 *   far experiment logs    <experimentRunId>
 *   far experiment approve <specId> --by <operator> [--hypothesis <hypId>] [--mde <value>]
 *   far experiment rerun   <specId> [--provider <name>] (confirmatory run after approval)
 * All accept --data-dir <dir> (default .far-run) and --json.
 */

export interface CliResult {
  code: number;
  json?: unknown;
  text?: string;
}

const JOB_ID_RE = /^job_[0-9a-z]{20,32}$/;
const XRUN_ID_RE = /^xrun_[0-9a-z]{20,32}$/;

interface Args {
  dataDir: string;
  positional: string | undefined;
  flag: (name: string) => boolean;
  arg: (name: string) => string | undefined;
}

const openWorld = (dataDir: string) => {
  const dir = path.resolve(dataDir);
  const db = openDb(path.join(dir, 'far.db'));
  const store = new Store(db);
  // Re-audit fix (DLQ terminal-truth split): when the scheduler dead-letters a
  // job, the far.db experiment_run is marked failed + audited so both stores
  // agree on the terminal state (never 'queued forever' in far.db again).
  const scheduler = openScheduler(path.join(dir, 'far-scheduler.db'), {
    onDead: (jobId, error) => {
      const job = scheduler0.get(jobId);
      if (job === null) return;
      const run = store.getObject('experiment_run', job.experimentRunId);
      if (run !== null && (run.status === 'queued' || run.status === 'running')) {
        store.putObjectEvented('experiment_run', { ...run, status: 'failed', error }, {
          type: 'experiment_failed',
          detail: { experimentRunId: job.experimentRunId, jobId, error },
        });
      }
    },
  });
  // small indirection so onDead can reference the scheduler being constructed
  const scheduler0 = scheduler;
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  return {
    store,
    scheduler,
    artifacts,
    close: () => { db.close(); scheduler.close(); },
  };
};

const readSpec = (specPath: string, allowLocalDatasets: boolean): ExperimentSpec => {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    throw new UsageError(`cannot read spec file ${specPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = ExperimentSpec.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(`spec file is not a valid ExperimentSpec: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  if (parsed.data.datasets.some((d) => d.source.resolver === 'local') && !allowLocalDatasets) {
    throw new UsageError('spec references a local-path dataset; pass --allow-local-datasets (operator-only, D-086-4)');
  }
  return parsed.data;
};

class UsageError extends Error {}

const summarizeRun = (store: Store, runId: string): ExperimentRun | null => store.getObject('experiment_run', runId);

const statLines = (job: {
  jobId: string; experimentRunId: string; status: string; priority: number; attempts: number;
  worker: string | null; heartbeatAt: string | null; error: string | null;
}, run: ExperimentRun | null): string =>
  `${job.jobId}  status=${job.status}  run=${job.experimentRunId}${run ? `(${run.status})` : '(missing in far.db)'}  prio=${job.priority} attempts=${job.attempts}` +
  `${job.worker ? ` worker=${job.worker}` : ''}${job.error ? `  error=${job.error}` : ''}`;

export const experimentCommand = async (sub: string | undefined, a: Args): Promise<CliResult> => {
  const usage = `far experiment requires a subcommand: run <spec.json> [--device <id>] | enqueue <spec.json> [--device <id>] | simulate <simspec.json> | worker | status [--job <id>] | dead-list | requeue <jobId> | cancel <jobId> | logs <experimentRunId> | approve <specId> --by <operator> [--hypothesis <hypId>] [--mde <value>] | rerun <specId>`;
  try {
    return await dispatch(sub, a, usage);
  } catch (e) {
    if (e instanceof UsageError) return { code: 2, text: e.message };
    throw e;
  }
};

/** Remote-device execution bridge (10→03 handoff 2026-08-25): one builder shared by
 * `worker` and `run --device` so per-device dispatch stays single-sourced. */
const executeViaFor = async (dataDir: string, device: string) => {
  const { openDeviceRegistry } = await import('../experiment/devices.js');
  const registry = openDeviceRegistry(path.join(dataDir, 'devices.json'));
  if (!registry.ids().includes(device)) {
    throw new UsageError(`unknown device '${device}' (declared: ${registry.ids().join(', ')})`);
  }
  if (registry.isLocal(device)) return undefined;
  return async (
    store: import('../persistence/store.js').Store,
    artifacts: import('../shared/ports.js').ArtifactStore,
    spec: import('../domain/index.js').ExperimentSpec,
    o: { allowLocalDatasets?: boolean; existingRunId: { toString(): string }; shouldCancel: () => boolean },
  ) => {
    const { executeRemoteExperiment } = await import('../experiment/remote-executor.js');
    const { gatewayForDevice } = await import('../experiment/device-gateway.js');
    await executeRemoteExperiment(store, artifacts, spec, {
      gateway: gatewayForDevice(registry, device, o.shouldCancel), deviceId: device,
      allowLocalDatasets: o.allowLocalDatasets,
      existingRunId: o.existingRunId as never,
      shouldCancel: o.shouldCancel,
    });
  };
};
const dispatch = async (sub: string | undefined, a: Args, usage: string): Promise<CliResult> => {

  if (sub === 'run' || sub === 'enqueue') {
    const specPath = a.positional;
    if (specPath === undefined) return { code: 2, text: `${sub} requires a spec JSON file path.\n${usage}` };
    const spec = readSpec(specPath, a.flag('--allow-local-datasets'));
    const priority = Number(a.arg('--priority') ?? 0);
    if (!Number.isInteger(priority)) return { code: 2, text: '--priority must be an integer' };
    const device = a.arg('--device');
    const w = openWorld(a.dataDir);
    try {
      const executeVia = device !== undefined ? await executeViaFor(a.dataDir, device) : undefined;
      const { experimentRunId, jobId } = enqueueExperiment(w.store, w.scheduler, spec, {
        priority,
        ...(device !== undefined ? { device } : {}),
        allowLocalDatasets: a.flag('--allow-local-datasets'),
      });
      if (sub === 'enqueue') {
        return {
          code: 0,
          json: { jobId, experimentRunId, status: 'queued' },
          text: `queued ${jobId} (experiment ${experimentRunId}, priority ${priority}); run 'far experiment worker' to execute`,
        };
      }
      const out = await runSchedulerWorker(w.store, w.artifacts, w.scheduler, {
        worker: `cli-${process.pid}${device !== undefined ? `-${device}` : ''}`,
        maxRunning: 1,
        heartbeatTtlMs: 120_000,
        heartbeatMs: 5_000,
        allowLocalDatasets: a.flag('--allow-local-datasets'),
        maxJobs: 1,
        ...(device !== undefined ? { device, executeVia: executeVia as never } : {}),
      });
      const job = w.scheduler.get(jobId)!;
      const run = summarizeRun(w.store, experimentRunId);
      const ok = job.status === 'completed';
      return {
        code: ok ? 0 : 1,
        json: {
          jobId, experimentRunId, jobStatus: job.status, farStatus: run?.status ?? null,
          executed: out.executed, failed: out.failed,
          resultIds: run?.resultIds ?? [], statReportIds: run?.statReportIds ?? [], error: job.error,
        },
        text: ok
          ? `completed ${jobId}: experiment ${experimentRunId} -> ${run?.status}; results ${run?.resultIds.join(', ') ?? '-'}`
          : `failed ${jobId}: ${job.error ?? 'unknown error'} (experiment ${experimentRunId})`,
      };
    } finally {
      w.close();
    }
  }

  if (sub === 'worker') {
    const w = openWorld(a.dataDir);
    try {
      const maxJobs = a.arg('--max-jobs') !== undefined ? Number(a.arg('--max-jobs')) : undefined;
      const device = a.arg('--device') ?? 'local';
      const { openDeviceRegistry } = await import('../experiment/devices.js');
      const registry = openDeviceRegistry(path.join(a.dataDir, 'devices.json'));
      if (!registry.ids().includes(device)) {
        return { code: 2, text: `unknown device '${device}' (declared: ${registry.ids().join(', ')})` };
      }
      const executeVia = registry.isLocal(device) ? undefined : async (
        store: import('../persistence/store.js').Store,
        artifacts: import('../shared/ports.js').ArtifactStore,
        spec: import('../domain/index.js').ExperimentSpec,
        o: { allowLocalDatasets?: boolean; existingRunId: { toString(): string }; shouldCancel: () => boolean },
      ) => {
        const { executeRemoteExperiment } = await import('../experiment/remote-executor.js');
        const { gatewayForDevice } = await import('../experiment/device-gateway.js');
        await executeRemoteExperiment(store, artifacts, spec, {
          gateway: gatewayForDevice(registry, device, o.shouldCancel), deviceId: device,
          allowLocalDatasets: o.allowLocalDatasets,
          existingRunId: o.existingRunId as never,
          shouldCancel: o.shouldCancel,
        });
      };
      const out = await runSchedulerWorker(w.store, w.artifacts, w.scheduler, {
        worker: `cli-${process.pid}-${device}`,
        maxRunning: Number(a.arg('--max-running') ?? 2),
        heartbeatTtlMs: 120_000,
        heartbeatMs: Number(a.arg('--heartbeat-ms') ?? 5_000),
        allowLocalDatasets: a.flag('--allow-local-datasets'),
        maxJobs,
        device,
        executeVia: executeVia as never,
      });
      return {
        code: out.failed > 0 ? 1 : 0,
        json: { ...out, device },
        text: `worker(${device}) drained: executed=${out.executed} failed=${out.failed}`,
      };
    } finally {
      w.close();
    }
  }

  if (sub === 'status') {
    const w = openWorld(a.dataDir);
    try {
      const jobId = a.arg('--job');
      if (jobId !== undefined) {
        if (!JOB_ID_RE.test(jobId)) return { code: 2, text: `invalid job id: ${jobId}` };
        const job = w.scheduler.get(jobId);
        if (job === null) return { code: 1, text: `job not found: ${jobId}` };
        const run = summarizeRun(w.store, job.experimentRunId);
        return { code: 0, json: { job, farRun: run }, text: statLines(job, run) };
      }
      const jobs = w.scheduler.list();
      const stats = w.scheduler.stats();
      const rows = jobs.map((j) => ({
        jobId: j.jobId, experimentRunId: j.experimentRunId, status: j.status, priority: j.priority,
        attempts: j.attempts, worker: j.worker, heartbeatAt: j.heartbeatAt, error: j.error,
        farStatus: summarizeRun(w.store, j.experimentRunId)?.status ?? null,
      }));
      return {
        code: 0,
        json: { stats, jobs: rows },
        text: rows.length === 0 ? 'no jobs queued' : `${JSON.stringify(stats)}\n${rows.map((j) => statLines(j, null)).join('\n')}`,
      };
    } finally {
      w.close();
    }
  }

  if (sub === 'dead-list') {
    const w = openWorld(a.dataDir);
    try {
      const dead = w.scheduler.listDead();
      return {
        code: 0,
        json: { dead },
        text: dead.length === 0
          ? 'no dead-lettered jobs'
          : dead.map((j) => `${j.jobId} attempts=${j.attempts} ${j.experimentRunId}: ${j.error ?? ''}`).join('\n'),
      };
    } finally { w.close(); }
  }

  if (sub === 'requeue') {
    const jobId = a.positional;
    if (jobId === undefined || !JOB_ID_RE.test(jobId)) return { code: 2, text: `requeue requires a valid job id (${usage})` };
    const w = openWorld(a.dataDir);
    try {
      const ok = w.scheduler.requeueDead(jobId);
      return ok
        ? { code: 0, text: `requeued ${jobId} with a fresh attempt budget` }
        : { code: 1, text: `cannot requeue ${jobId}: not in dead-letter state` };
    } finally { w.close(); }
  }

  if (sub === 'cancel') {
    const jobId = a.positional;
    if (jobId === undefined || !JOB_ID_RE.test(jobId)) return { code: 2, text: `cancel requires a valid job id (${usage})` };
    const w = openWorld(a.dataDir);
    try {
      const ok = w.scheduler.cancel(jobId);
      const job = w.scheduler.get(jobId);
      return ok
        ? { code: 0, json: { jobId, status: job?.status, cancelRequested: job?.cancelRequested }, text: `cancel applied to ${jobId} (status=${job?.status})` }
        : { code: 1, text: `cannot cancel ${jobId}: not queued or running` };
    } finally {
      w.close();
    }
  }

  if (sub === 'logs') {
    const runId = a.positional;
    if (runId === undefined || !XRUN_ID_RE.test(runId)) return { code: 2, text: `logs requires a valid experiment run id (${usage})` };
    const w = openWorld(a.dataDir);
    try {
      const run = summarizeRun(w.store, runId);
      if (run === null) return { code: 1, text: `experiment run not found: ${runId}` };
      if (run.trainingLogRef === undefined) {
        return { code: 0, json: { runId, trainingLogRef: null }, text: `no training log artifact recorded for ${runId} (sidecar emitted no output)` };
      }
      const log = await w.artifacts.get(run.trainingLogRef);
      return { code: 0, json: { runId, trainingLogRef: run.trainingLogRef, lines: log?.split('\n').length ?? 0 }, text: log ?? '' };
    } finally {
      w.close();
    }
  }

  if (sub === 'approve') {
    const specId = a.positional;
    if (specId === undefined || !SPEC_ID_RE.test(specId)) return { code: 2, text: `approve requires a spec id (${usage})` };
    const by = a.arg('--by');
    if (by === undefined || by.length === 0) return { code: 2, text: 'approve requires --by <operator> (the approving human — D-085 binding approvals are never self-granted)' };
    const mde = a.arg('--mde') !== undefined ? Number(a.arg('--mde')) : undefined;
    if (mde !== undefined && (!Number.isFinite(mde) || mde <= 0)) return { code: 2, text: '--mde must be a positive number (minimum detectable effect)' };
    const w = openWorld(a.dataDir);
    try {
      const { approveSpec } = await import('../experiment/approve.js');
      const outcome = approveSpec(w.store, specId, {
        by,
        ...(a.arg('--hypothesis') !== undefined ? { hypothesis: a.arg('--hypothesis') } : {}),
        ...(mde !== undefined ? { mde } : {}),
      });
      if (outcome.kind === 'error') return { code: outcome.code, text: outcome.message };
      const s = outcome.spec.spec;
      return {
        code: 0,
        json: {
          specId, version: s.version, kind: outcome.spec.kind,
          approvalsAdded: outcome.approvalsAdded, boundHypothesisIds: outcome.boundHypothesisIds, approvedBy: by,
        },
        text:
          `approved ${specId} v${s.version} (${outcome.spec.kind}; ${outcome.approvalsAdded} approval(s) covering ${outcome.boundHypothesisIds.join(', ')}) ` +
          `— confirmatory rerun: far experiment rerun ${specId}`,
      };
    } finally {
      w.close();
    }
  }

  if (sub === 'rerun') {
    const specId = a.positional;
    if (specId === undefined || !SPEC_ID_RE.test(specId)) return { code: 2, text: `rerun requires a spec id (${usage})` };
    const w = openWorld(a.dataDir);
    try {
      const { rerunSpec } = await import('../experiment/approve.js');
      const { getProvider, defaultLiveProvider } = await import('../providers/index.js');
      const providerName = a.arg('--provider');
      const provider = providerName !== undefined ? getProvider(providerName) : defaultLiveProvider();
      const out = await rerunSpec(w.store, w.artifacts, specId, {
        provider,
        allowLocalDatasets: a.flag('--allow-local-datasets'),
      });
      const verdicts = out.statReports.map((r) => `${r.comparisonId}=${r.verdict ?? 'exploratory'}`).join(', ');
      return {
        code: out.run.status === 'completed' ? 0 : 1,
        json: {
          specId, kind: out.kind, experimentRunId: out.run.id, status: out.run.status,
          statReports: out.statReports.map((r) => ({ id: r.id, comparison: r.comparisonId, verdict: r.verdict ?? null, metric: r.metricKey })),
          feedbackSignals: out.feedback.map((f) => f.id),
        },
        text:
          `rerun ${specId} (${out.kind}) -> ${out.run.status}: ${out.statReports.length} stat report(s) [${verdicts}], ` +
          `${out.feedback.length} feedback signal(s) queued for revision`,
      };
    } finally {
      w.close();
    }
  }

  if (sub === 'simulate') {
    // 10→03 handoff 2026-08-25: direct execution of a SimulationSpec (CRN monte-carlo
    // on the shared stats chain) — no queueing for v1, output mirrors `rerun`.
    const specPath = a.positional;
    if (specPath === undefined) return { code: 2, text: `simulate requires a simulation-spec JSON file path.\n${usage}` };
    let spec: unknown;
    try {
      spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    } catch (e) {
      return { code: 2, text: `cannot read simulation spec ${specPath}: ${e instanceof Error ? e.message : String(e)}` };
    }
    const w = openWorld(a.dataDir);
    try {
      const { executeSimulationExperiment } = await import('../experiment/executor-simulation.js');
      const out = await executeSimulationExperiment(w.store, w.artifacts, spec as never);
      const verdicts = out.statReports.map((r) => `${r.comparisonId}=${r.verdict ?? 'exploratory'}`).join(', ');
      return {
        code: out.run.status === 'completed' ? 0 : 1,
        json: {
          specId: (spec as { id?: string }).id ?? null, experimentRunId: out.run.id, status: out.run.status,
          statReports: out.statReports.map((r) => ({ id: r.id, comparison: r.comparisonId, verdict: r.verdict ?? null, metric: r.metricKey })),
          feedbackSignals: out.feedback.map((f) => f.id),
        },
        text:
          `simulate ${(spec as { id?: string }).id ?? '(unnamed)'} -> ${out.run.status}: ${out.statReports.length} stat report(s) [${verdicts}], ` +
          `${out.feedback.length} feedback signal(s) queued for revision`,
      };
    } finally {
      w.close();
    }
  }
  return { code: 2, text: usage };
};
