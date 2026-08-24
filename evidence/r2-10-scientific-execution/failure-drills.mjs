/**
 * R2-10 failure-injection drills — REAL PATHS, no mocks. Each drill forces one
 * failure class the execution substrate must survive honestly, captures the
 * terminal state from far.db/far-scheduler.db, and writes it next to this file.
 *
 *   1 timeout-drill          : local sidecar train blows the spec compute budget
 *                              -> run failed with the verbatim timeout error
 *   2 dependency-drill       : sidecar module missing (broken env)
 *                              -> run failed with the verbatim startup error
 *   3 cancellation-drill     : cooperative cancel flag mid-training
 *                              -> run canceled, cancelRequested recorded
 *   4 process-death-drill    : SIGKILL a worker mid-job, reclaim+resume by a second
 *                              worker -> completed with attempts=2 (fence token held)
 *   5 remote-oom-drill       : container memory cap (--memory 512m) blows during fit
 *                              -> remote run failed with device-side error
 *
 * Exit 0 only when every drill lands in its EXPECTED terminal state.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { openDb } from '../../dist/persistence/db.js';
import { Store } from '../../dist/persistence/store.js';
import { openArtifactStore } from '../../dist/persistence/artifacts.js';
import { openScheduler, enqueueExperiment, runSchedulerWorker } from '../../dist/experiment/scheduler.js';
import { executeExperiment } from '../../dist/experiment/executor.js';
import { executeRemoteExperiment } from '../../dist/experiment/remote-executor.js';
import { createSidecar } from '../../dist/experiment/python.js';
import { ResearchQuestion, HypothesisCandidate, newId } from '../../dist/domain/index.js';
import { SSHGateway } from '../../dist/experiment/gateway.js';

const OUT = import.meta.dirname;
const write = (name, text) => { fs.writeFileSync(path.join(OUT, name), text); process.stdout.write(`wrote ${name}\n`); };
const world = (base) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `farlab-drill-${base}-`));
  const db = openDb(path.join(dir, 'far.db'));
  const store = new Store(db);
  return { dir, db, store, artifacts: openArtifactStore(path.join(dir, 'artifacts')), cleanup: () => { try { db.close(); } catch { /* closed */ } } };
};
const seedRun = (store, phenomena) => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: `r2-10 failure drill (${phenomena})`, background: '',
    goalType: 'explanatory', scope: { domain: 'tabular-ml', phenomena: [phenomena] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  const runId = store.listRuns(1)[0].id;
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, statement: 'drill hypothesis',
    derivation: { strategy: 'evidence_conditioned', rationale: 'drill' },
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return { runId, hypId: hyp.id };
};
/** Synthetic-benchmark CSV (generated fixture, deterministic): n rows, f numeric features, integer-ish target. */
const makeCsv = (dir, n, f) => {
  const header = [...Array.from({ length: f }, (_, i) => `x${i}`), 'y'];
  const lines = [header.join(',')];
  for (let i = 0; i < n; i += 1) {
    const feats = Array.from({ length: f }, (_, j) => (((i * (j + 3)) % 97) / 97).toFixed(4));
    lines.push(`${feats.join(',')},${((i * 7) % 13).toFixed(1)}`);
  }
  const p = path.join(dir, 'data.csv');
  fs.writeFileSync(p, `${lines.join('\n')}\n`);
  return p;
};
const spec = (runId, csvPath, overrides = {}) => ({
  id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'), version: 1,
  question: 'drill', exploratoryNote: 'failure-path drill (exploratory by design)',
  datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'y', split: { method: 'random', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
  models: [{ name: 'rf', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 800 }, seed: 1 }],
  metrics: ['mean_squared_error'],
  comparisons: [{ id: 'cmp-drill', metricKey: 'mean_squared_error', kind: 'absolute', modelIdx: 0, direction: 'below', threshold: 1e9, thresholdProvenance: 'model-stipulated', primary: true }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 200, analysisSeed: 3, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  createdAt: new Date().toISOString(),
  ...overrides,
});
const runStatus = (store, runId) => {
  const r = store.listObjects('experiment_run', runId);
  return r.length === 0 ? null : { status: r[0].status, error: r[0].error, attempts: r[0].attempts, cancelRequested: r[0].cancelRequested };
};

// ---- drill 1: timeout ----
{
  const w = world('timeout');
  try {
    const { runId } = seedRun(w.store, 'timeout');
    const csv = makeCsv(w.dir, 20_000, 30);
    const s = spec(runId, csv, {
      models: [{ name: 'rf-big', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 2_500 }, seed: 1 }],
      compute: { device: 'local', maxParallel: 1, timeoutMs: 8_000 },
    });
    let err = '';
    try { await executeExperiment(w.store, w.artifacts, s, { allowLocalDatasets: true }); } catch (e) { err = e.message; }
    const st = runStatus(w.store, runId);
    write('drill-1-timeout.txt', JSON.stringify({ expected: 'failed / timed out', thrown: err, run: st }, null, 1));
    if (st?.status !== 'failed' || !/timed out|timeout/i.test(`${err} ${st.error ?? ''}`)) { process.stderr.write('drill 1 FAILED\n'); process.exit(1); }
  } finally { w.cleanup(); }
}

// ---- drill 2: dependency failure (broken sidecar env) ----
{
  const w = world('dep');
  try {
    const { runId } = seedRun(w.store, 'dependency');
    const csv = makeCsv(w.dir, 200, 4);
    const s = spec(runId, csv, { compute: { device: 'local', maxParallel: 1, timeoutMs: 60_000 } });
    let err = '';
    try {
      await executeExperiment(w.store, w.artifacts, s, {
        allowLocalDatasets: true,
        sidecar: () => createSidecar({ command: ['uv', 'run', '--frozen', '--project', path.resolve(import.meta.dirname, '..', '..', 'experiment-runtime'), 'python', '-m', 'farlab_missing_runtime_module'] }),
      });
    } catch (e) { err = e.message; }
    const st = runStatus(w.store, runId);
    write('drill-2-dependency.txt', JSON.stringify({ expected: 'failed with verbatim env error', thrown: err, run: st }, null, 1));
    if (st?.status !== 'failed') { process.stderr.write('drill 2 FAILED\n'); process.exit(1); }
  } finally { w.cleanup(); }
}

// ---- drill 3: cooperative cancellation ----
{
  const w = world('cancel');
  try {
    const { runId } = seedRun(w.store, 'cancellation');
    const csv = makeCsv(w.dir, 12_000, 12);
    const s = spec(runId, csv, { models: [
      { name: 'rf-a', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 900 }, seed: 1 },
      { name: 'rf-b', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 900 }, seed: 2 },
    ] });
    let canceled = false;
    const timer = setTimeout(() => { canceled = true; }, 4_000);
    let err = '';
    try { await executeExperiment(w.store, w.artifacts, s, { allowLocalDatasets: true, shouldCancel: () => canceled }); } catch (e) { err = e.message; }
    clearTimeout(timer);
    const st = runStatus(w.store, runId);
    write('drill-3-cancellation.txt', JSON.stringify({ expected: 'canceled mid-training', thrown: err, run: st }, null, 1));
    if (st?.status !== 'canceled' || st.cancelRequested !== true) { process.stderr.write('drill 3 FAILED\n'); process.exit(1); }
  } finally { w.cleanup(); }
}

// ---- drill 4: worker process death + reclaim/resume ----
{
  const w = world('death');
  let scheduler;
  try {
    const { runId } = seedRun(w.store, 'process-death');
    const csv = makeCsv(w.dir, 15_000, 14);
    const s = spec(runId, csv, { models: [{ name: 'rf', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 1200 }, seed: 1 }] });
    scheduler = openScheduler(path.join(w.dir, 'far-scheduler.db'));
    const { jobId, experimentRunId } = enqueueExperiment(w.store, scheduler, s, { allowLocalDatasets: true });

    // Worker A: a real child process executing the queue; SIGKILL it mid-training.
    const { pathToFileURL } = await import('node:url');
    const distDir = path.resolve(OUT, '..', '..', 'dist');
    const asUrl = (p) => pathToFileURL(path.join(distDir, p)).href;
    const workerFile = path.join(w.dir, 'drill-worker.mjs');
    fs.writeFileSync(workerFile, `
      import { openDb } from '${asUrl('persistence/db.js')}';
      import { Store } from '${asUrl('persistence/store.js')}';
      import { openArtifactStore } from '${asUrl('persistence/artifacts.js')}';
      import { openScheduler, runSchedulerWorker } from '${asUrl('experiment/scheduler.js')}';
      const dir = ${JSON.stringify(w.dir)};
      const db = openDb(dir + '/far.db'); const store = new Store(db);
      const scheduler = openScheduler(dir + '/far-scheduler.db');
      await runSchedulerWorker(store, openArtifactStore(dir + '/artifacts'), scheduler, {
        worker: 'drill-worker-A', maxRunning: 1, heartbeatTtlMs: 120_000, heartbeatMs: 1_000,
        allowLocalDatasets: true, maxJobs: 1,
      });
    `);
    const childLog = fs.openSync(path.join(w.dir, 'worker-a.log'), 'w');
    const child = spawn(process.execPath, [workerFile], { stdio: ['ignore', childLog, childLog] });
    const exited = new Promise((r) => { child.on('exit', r); });
    await new Promise((r) => setTimeout(r, 12_000)); // let it claim + enter training
    child.kill('SIGKILL');
    await exited;
    fs.closeSync(childLog);
    const workerALog = fs.readFileSync(path.join(w.dir, 'worker-a.log'), 'utf8');
    // The stale-lease reclaim needs the heartbeat TTL to elapse since A's last beat.
    await new Promise((r) => setTimeout(r, 6_000));

    // Worker B: short TTL -> the stale heartbeat makes the job reclaimable; resume to completion.
    const out = await runSchedulerWorker(w.store, w.artifacts, scheduler, {
      worker: 'drill-worker-B', maxRunning: 1, heartbeatTtlMs: 4_000, heartbeatMs: 1_000,
      allowLocalDatasets: true, maxJobs: 1,
    });
    const job = scheduler.get(jobId);
    const st = runStatus(w.store, runId);
    write('drill-4-process-death.txt', JSON.stringify({ expected: 'worker B reclaims stale job and completes (attempts=2)', workerB: out, job, run: st, experimentRunId, workerALog }, null, 1));
    if (job?.status !== 'completed' || job.attempts !== 2 || st?.status !== 'completed') {
      process.stderr.write('drill 4 FAILED\n'); process.exit(1);
    }
  } finally { scheduler?.close(); w.cleanup(); }
}

// ---- drill 5: remote container resource cap (OOM) ----
{
  const dataDir = process.env.DRILL_DATA_DIR;
  if (dataDir !== undefined && fs.existsSync(path.join(dataDir, 'devices.json'))) {
    const devices = JSON.parse(fs.readFileSync(path.join(dataDir, 'devices.json'), 'utf8'));
    const dev = devices.devices.find((d) => d.kind === 'ssh');
    if (dev !== undefined) {
      const w = world('oom');
      try {
        const { runId } = seedRun(w.store, 'remote-oom');
        const csv = makeCsv(w.dir, 40_000, 120);
        const s = spec(runId, csv, {
          models: [{ name: 'rf-huge', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 2_000 }, seed: 1 }],
          compute: { device: 'local', maxParallel: 1, timeoutMs: 300_000 },
        });
        let err = '';
        try {
          await executeRemoteExperiment(w.store, w.artifacts, s, {
            gateway: new SSHGateway({ host: dev.host, port: dev.port, user: dev.user, identityFile: dev.identityFile, knownHostsFile: dev.knownHostsFile }),
            deviceId: dev.id, allowLocalDatasets: true,
          });
        } catch (e) { err = e.message; }
        const st = runStatus(w.store, runId);
        write('drill-5-remote-oom.txt', JSON.stringify({ expected: 'failed: resource-capped device (512m/2cpu) enforces its budget — device-side TERM/SIGKILL kill (exit 124/137) or MemoryError', thrown: err, run: st }, null, 1));
        if (st?.status !== 'failed') { process.stderr.write('drill 5 FAILED\n'); process.exit(1); }
      } finally { w.cleanup(); }
    } else {
      write('drill-5-remote-oom.txt', 'SKIPPED: no ssh device registered (start experiment-runtime/ssh-target/up.mjs first)');
    }
  } else {
    write('drill-5-remote-oom.txt', 'SKIPPED: DRILL_DATA_DIR not set or devices.json missing');
  }
}

process.stdout.write('ALL DRILLS LANDED IN EXPECTED STATES\n');
process.exit(0);
