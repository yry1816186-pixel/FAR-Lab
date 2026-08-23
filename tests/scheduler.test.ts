import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { openScheduler, enqueueExperiment, runSchedulerWorker } from '../src/experiment/scheduler.js';
import { ResearchQuestion, HypothesisCandidate, newId, type ExperimentSpec } from '../src/domain/index.js';
import { uvAvailable } from './helpers/uv-gate.js';

const makeWorld = (): { store: Store; scheduler: ReturnType<typeof openScheduler>; dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-sched-'));
  const db = openDb(join(dir, 'far.db'));
  return {
    store: new Store(db),
    scheduler: openScheduler(join(dir, 'far-scheduler.db')),
    dir,
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      try { scheduler().close(); } catch { /* closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
    },
  };
};
// openScheduler returns an object with close(); keep a handle for cleanup.
const scheduler = (s: { close(): void }) => s;

const makeRun = (store: Store): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'sched?', background: '', goalType: 'explanatory',
    scope: { domain: 'tabular-ml', phenomena: ['classification'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  return store.listRuns(1)[0]!.id;
};

const makeHyp = (runId: string) =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'separable', derivation: { strategy: 'evidence_conditioned', rationale: 'fixture' },
    createdAt: new Date().toISOString(),
  });

const fixtureCsv = (): string => {
  const rows = ['x0,label'];
  // 100 data rows => nTest=30 at the 0.3 test ratio — the g5 confirmatory floor.
  for (let i = 0; i < 50; i += 1) {
    rows.push(`${2 + (i % 9) * 0.1},pos`);
    rows.push(`${0.1 + (i % 7) * 0.1},neg`);
  }
  return rows.join('\n') + '\n';
};

const makeSpec = (runId: string, csvPath: string, hypothesisId: string, variant = 0): ExperimentSpec => ({
  id: newId('xsp'), runId: runId as ExperimentSpec['runId'], planId: newId('pln'), planStepId: newId('task'),
  version: 1, question: `q${variant}`,
  datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'label', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
  models: [
    { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0, tags: [] },
    { name: 'logistic', builderId: 'logistic_regression', hyperparams: {}, seed: 7 + variant, tags: [] },
  ],
  metrics: ['accuracy'],
  comparisons: [{ id: 'cmp', metricKey: 'accuracy', kind: 'paired_diff', modelAIdx: 1, modelBIdx: 0, direction: 'above', threshold: 0, thresholdProvenance: 'model-stipulated', hypothesisId: hypothesisId as never, primary: true, mde: 0.3 }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 200, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  approvals: [{ hypothesisId: hypothesisId as never, comparisonIds: ['cmp'], decisionRuleSnapshot: 'diff > 0', approvedBy: 'op', approvedAt: new Date().toISOString() }],
  createdAt: new Date().toISOString(),
});

describe('P3 scheduler: durable queue semantics', () => {
  it('enqueue -> claim -> heartbeat -> complete lifecycle with priority ordering', () => {
    const w = makeWorld();
    try {
      const a = w.scheduler.enqueue({ experimentRunId: 'xrun_aaaaaaaaaaaaaaaaaaaaaaaa', runId: 'run_aaaaaaaaaaaaaaaaaaaaaaaa', specId: 'xsp_aaaaaaaaaaaaaaaaaaaaaaaa', priority: 1 });
      const b = w.scheduler.enqueue({ experimentRunId: 'xrun_bbbbbbbbbbbbbbbbbbbbbbbb', runId: 'run_bbbbbbbbbbbbbbbbbbbbbbbb', specId: 'xsp_bbbbbbbbbbbbbbbbbbbbbbbb', priority: 5 });
      const c = w.scheduler.enqueue({ experimentRunId: 'xrun_cccccccccccccccccccccccc', runId: 'run_cccccccccccccccccccccccc', specId: 'xsp_cccccccccccccccccccccccc', priority: 3 });
      expect(w.scheduler.stats()).toEqual({ queued: 3, total: 3 });

      // Priority DESC wins regardless of insertion order.
      const first = w.scheduler.claimNext('w1', { maxRunning: 2, heartbeatTtlMs: 60_000 })!;
      expect(first.job.experimentRunId).toBe(b.experimentRunId);
      expect(first.fenceToken).toBe(1);
      expect(w.scheduler.heartbeat(b.jobId, 'w1', first.fenceToken)).toBe(true);
      // Wrong fence/worker heartbeat is rejected — a disowned worker cannot keep a job adopted.
      expect(w.scheduler.heartbeat(b.jobId, 'w1', first.fenceToken + 999)).toBe(false);
      expect(w.scheduler.heartbeat(b.jobId, 'other', first.fenceToken)).toBe(false);

      const second = w.scheduler.claimNext('w2', { maxRunning: 2, heartbeatTtlMs: 60_000 })!;
      expect(second.job.experimentRunId).toBe(c.experimentRunId);
      // maxRunning=2 reached: third claim returns null while both are live.
      expect(w.scheduler.claimNext('w3', { maxRunning: 2, heartbeatTtlMs: 60_000 })).toBeNull();

      expect(w.scheduler.complete(b.jobId, 'w1', first.fenceToken, { ok: true })).toBe(true);
      // Stale-token terminal write (the zombie-disowned case) is REJECTED loudly.
      expect(w.scheduler.complete(c.jobId, 'w1', second.fenceToken, { ok: true })).toBe(false);
      expect(w.scheduler.get(c.jobId)!.status).toBe('running');

      const third = w.scheduler.claimNext('w3', { maxRunning: 2, heartbeatTtlMs: 60_000 })!;
      expect(third.job.experimentRunId).toBe(a.experimentRunId);
    } finally {
      w.cleanup();
    }
  });

  it('expired heartbeat makes a running job reclaimable; the zombie cannot complete it afterwards', () => {
    const w = makeWorld();
    try {
      const j = w.scheduler.enqueue({ experimentRunId: 'xrun_aaaaaaaaaaaaaaaaaaaaaaaa', runId: 'run_aaaaaaaaaaaaaaaaaaaaaaaa', specId: 'xsp_aaaaaaaaaaaaaaaaaaaaaaaa' });
      const c1 = w.scheduler.claimNext('w1', { maxRunning: 1, heartbeatTtlMs: 50 })!;
      expect(c1.fenceToken).toBe(1);
      // Heartbeat expires (TTL 50ms, no renewals).
      const later = new Date(Date.now() + 500).toISOString();
      const c2 = w.scheduler.claimNext('w2', { maxRunning: 1, heartbeatTtlMs: 50, at: later })!;
      expect(c2.job.experimentRunId).toBe(j.experimentRunId);
      expect(c2.fenceToken).toBe(2);
      expect(c2.job.attempts).toBe(2);
      // The original worker wakes up and tries to write its terminal state -> rejected.
      expect(w.scheduler.complete(j.jobId, 'w1', c1.fenceToken, { ok: true })).toBe(false);
      expect(w.scheduler.complete(j.jobId, 'w2', c2.fenceToken, { ok: true })).toBe(true);
      expect(w.scheduler.get(j.jobId)!.status).toBe('completed');
    } finally {
      w.cleanup();
    }
  });

  it('queued jobs cancel immediately; running jobs flip the cooperative cancel flag', () => {
    const w = makeWorld();
    try {
      const q = w.scheduler.enqueue({ experimentRunId: 'xrun_aaaaaaaaaaaaaaaaaaaaaaaa', runId: 'run_aaaaaaaaaaaaaaaaaaaaaaaa', specId: 'xsp_aaaaaaaaaaaaaaaaaaaaaaaa' });
      expect(w.scheduler.cancel(q.jobId)).toBe(true);
      expect(w.scheduler.get(q.jobId)!.status).toBe('canceled');
      expect(w.scheduler.claimNext('w1', { maxRunning: 1, heartbeatTtlMs: 60_000 })).toBeNull();

      const r = w.scheduler.enqueue({ experimentRunId: 'xrun_bbbbbbbbbbbbbbbbbbbbbbbb', runId: 'run_bbbbbbbbbbbbbbbbbbbbbbbb', specId: 'xsp_bbbbbbbbbbbbbbbbbbbbbbbb' });
      w.scheduler.claimNext('w1', { maxRunning: 1, heartbeatTtlMs: 60_000 });
      expect(w.scheduler.cancel(r.jobId)).toBe(true);
      expect(w.scheduler.get(r.jobId)!.status).toBe('running');
      expect(w.scheduler.cancelRequested(r.jobId)).toBe(true);
    } finally {
      w.cleanup();
    }
  });
});

describe('P3 scheduler: end-to-end worker + throughput (real sidecar, real far.db)', { timeout: 300_000 }, () => {
  it.runIf(uvAvailable())('enqueueExperiment -> worker executes -> terminal projection in BOTH stores with same run id', async () => {
    const w = makeWorld();
    try {
      const artifacts = openArtifactStore(join(w.dir, 'artifacts'));
      const runId = makeRun(w.store);
      const hyp = makeHyp(runId);
      w.store.putObject('hypothesis', hyp);
      const csvPath = join(w.dir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      // enqueue persists the spec's queued experiment_run and the job atomically per store.
      const { experimentRunId, jobId } = enqueueExperiment(w.store, w.scheduler, spec, { allowLocalDatasets: true });
      expect(w.scheduler.get(jobId)!.status).toBe('queued');
      expect(w.store.getObject('experiment_run', experimentRunId)!.status).toBe('queued');

      const out = await runSchedulerWorker(w.store, artifacts, w.scheduler, {
        worker: 'w-e2e', maxRunning: 1, heartbeatTtlMs: 60_000, allowLocalDatasets: true, maxJobs: 5,
      });
      const jobAfter = w.scheduler.get(jobId)!;
      expect(out, `worker error: ${jobAfter.error ?? 'none'}`).toEqual({ executed: 1, failed: 0 });

      // Same id across both stores: scheduler row terminal, far.db projection terminal.
      const job = w.scheduler.get(jobId)!;
      expect(job.status).toBe('completed');
      expect(job.attempts).toBe(1);
      const expRun = w.store.getObject('experiment_run', experimentRunId)!;
      expect(expRun.status).toBe('completed');
      expect(expRun.attempts).toBe(1);
      expect(expRun.resultIds.length).toBe(1);
    } finally {
      w.cleanup();
    }
  });

  it.runIf(uvAvailable())('throughput + mutual exclusion: 2 concurrent workers drain 4 jobs, each executed exactly once', async () => {
    const w = makeWorld();
    try {
      const artifacts = openArtifactStore(join(w.dir, 'artifacts'));
      const csvPath = join(w.dir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const jobs: { jobId: string; experimentRunId: string }[] = [];
      for (let i = 0; i < 4; i += 1) {
        const runId = makeRun(w.store);
        const hyp = makeHyp(runId);
        w.store.putObject('hypothesis', hyp);
        jobs.push(enqueueExperiment(w.store, w.scheduler, makeSpec(runId, csvPath, hyp.id, i), { allowLocalDatasets: true, priority: i }));
      }
      const t0 = Date.now();
      const [r1, r2] = await Promise.all([
        runSchedulerWorker(w.store, artifacts, w.scheduler, { worker: 'w1', maxRunning: 2, heartbeatTtlMs: 120_000, heartbeatMs: 1_000, allowLocalDatasets: true }),
        runSchedulerWorker(w.store, artifacts, w.scheduler, { worker: 'w2', maxRunning: 2, heartbeatTtlMs: 120_000, heartbeatMs: 1_000, allowLocalDatasets: true }),
      ]);
      const elapsed = Date.now() - t0;
      expect(r1.executed + r2.executed).toBe(4);
      expect(r1.failed + r2.failed).toBe(0);
      // Exactly-once: every job terminal, attempts === 1 (no double-claim under concurrency).
      for (const j of jobs) {
        const job = w.scheduler.get(j.jobId)!;
        expect(job.status).toBe('completed');
        expect(job.attempts).toBe(1);
        expect(w.store.getObject('experiment_run', j.experimentRunId)!.status).toBe('completed');
      }
      // Priority semantics: the two concurrent workers claim the two HIGHEST-priority
      // jobs first (claimNext is strictly priority DESC — start order proves it).
      const startOrder = w.scheduler.list()
        .slice()
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
        .map((x) => x.priority);
      expect(startOrder.slice(0, 2).sort((a, b) => b - a)).toEqual([3, 2]);
      console.log(`scheduler throughput: 4 real jobs / 2 workers in ${elapsed}ms (mutual exclusion held, attempts all 1)`);
    } finally {
      w.cleanup();
    }
  });

  it.runIf(uvAvailable())('crash-window idempotence: worker dies post-far.db, reclaim re-executes WITHOUT recomputing (fingerprint cache)', async () => {
    const w = makeWorld();
    try {
      const artifacts = openArtifactStore(join(w.dir, 'artifacts'));
      const runId = makeRun(w.store);
      const hyp = makeHyp(runId);
      w.store.putObject('hypothesis', hyp);
      const csvPath = join(w.dir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      const { experimentRunId, jobId } = enqueueExperiment(w.store, w.scheduler, spec, { allowLocalDatasets: true });

      // First worker completes far.db fully, then "dies" before scheduler.complete.
      const claim1 = w.scheduler.claimNext('w1', { maxRunning: 1, heartbeatTtlMs: 60_000 })!;
      const { executeExperiment } = await import('../src/experiment/executor.js');
      await executeExperiment(w.store, artifacts, spec, { allowLocalDatasets: true, existingRunId: experimentRunId });
      const firstCells = w.store.getObject('experiment_run', experimentRunId)!.resultIds;

      // Reclaim after heartbeat expiry; the re-execution replays from the fingerprint cache.
      const later = new Date(Date.now() + 500).toISOString();
      const claim2 = w.scheduler.claimNext('w2', { maxRunning: 1, heartbeatTtlMs: 50, at: later })!;
      expect(claim2.fenceToken).toBe(claim1.fenceToken + 1);
      await executeExperiment(w.store, artifacts, spec, { allowLocalDatasets: true, existingRunId: experimentRunId });
      expect(w.scheduler.complete(jobId, 'w2', claim2.fenceToken, { ok: true })).toBe(true);

      const run = w.store.getObject('experiment_run', experimentRunId)!;
      expect(run.status).toBe('completed');
      expect(run.attempts).toBe(2); // two tries recorded honestly
      // Fingerprint-level idempotence: the reclaim REPLAYED from cache — same cell
      // fingerprints/metrics, no recomputed training outcome (a fresh result_set row is
      // appended and auditable; the expensive computation was not repeated).
      const firstSet = w.store.getObject('result_set', firstCells[0]!)!;
      const lastSet = w.store.getObject('result_set', run.resultIds[run.resultIds.length - 1]!)!;
      expect(lastSet.cells.map((c) => c.fingerprint).sort()).toEqual(firstSet.cells.map((c) => c.fingerprint).sort());
      for (const c of lastSet.cells) {
        const orig = firstSet.cells.find((o) => o.fingerprint === c.fingerprint)!;
        expect(c.metrics).toEqual(orig.metrics);
        expect(c.perRowRef).toBe(orig.perRowRef);
      }
      void claim1;
    } finally {
      w.cleanup();
    }
  });
});
