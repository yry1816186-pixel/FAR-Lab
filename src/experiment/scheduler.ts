import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { newId, type ExperimentRunId, type RunId, type ExperimentSpec, checkExperimentSpec } from '../domain/index.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { experimentSpecHash, executeExperiment } from './executor.js';

/**
 * Durable experiment job queue in its OWN SQLite file (D-085 P0-3): the far.db WAL is
 * the orchestrator's write domain; mixing per-job heartbeats into it was measured-risky
 * (migration v4 already documents watchdog-poll contention). Authority matrix:
 *   - scheduler job row  = operational lifecycle truth (fence token, heartbeat, attempts)
 *   - far.db experiment_run = terminal projection + audit events (written by the worker)
 *   - training logs stay content-addressed artifacts (never queue rows, never events)
 *
 * Crash window semantics: a worker may finish far.db but die before scheduler.complete.
 * The reclaiming worker re-executes; ResultCell fingerprint dedup (D-086-1) makes the
 * re-run replay from cache instead of recomputing — idempotent by construction.
 *
 * Fence tokens: every claim (fresh or reclaim) increments the token; terminal writes and
 * heartbeats must carry the CURRENT token+worker, so a disowned zombie can never
 * overwrite the adopter's outcome (temporal sticky-lease pattern, single integer form).
 */

const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    experiment_run_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    spec_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','canceled')),
    fence_token INTEGER NOT NULL DEFAULT 0,
    worker TEXT,
    heartbeat_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON jobs(status, priority DESC, id ASC);
  CREATE INDEX IF NOT EXISTS idx_jobs_heartbeat ON jobs(status, heartbeat_at);
`;

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface SchedulerJob {
  jobId: string;
  experimentRunId: string;
  runId: string;
  specId: string;
  priority: number;
  status: JobStatus;
  fenceToken: number;
  worker: string | null;
  heartbeatAt: string | null;
  attempts: number;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
}

export interface Claim {
  job: SchedulerJob;
  fenceToken: number;
}

export interface Scheduler {
  enqueue(input: { experimentRunId: string; runId: string; specId: string; priority?: number; at?: string }): SchedulerJob;
  /** Atomically claim the highest-priority runnable job (fresh queued, or running with an expired heartbeat). */
  claimNext(worker: string, opts: { maxRunning: number; heartbeatTtlMs: number; at?: string }): Claim | null;
  heartbeat(jobId: string, worker: string, fenceToken: number, at?: string): boolean;
  /** Terminal write; requires the current fence token+worker — disowned writers are rejected loudly. */
  complete(jobId: string, worker: string, fenceToken: number, outcome: { ok: boolean; error?: string }, at?: string): boolean;
  /** Queued jobs cancel immediately; running jobs get the cooperative cancel flag (executor polls it). */
  cancel(jobId: string, at?: string): boolean;
  cancelRequested(jobId: string): boolean;
  get(jobId: string): SchedulerJob | null;
  list(filter?: { status?: JobStatus }): SchedulerJob[];
  stats(): Record<JobStatus | 'total', number>;
  close(): void;
}

const rowToJob = (r: Record<string, unknown>): SchedulerJob => ({
  jobId: String(r.job_id),
  experimentRunId: String(r.experiment_run_id),
  runId: String(r.run_id),
  specId: String(r.spec_id),
  priority: Number(r.priority),
  status: String(r.status) as JobStatus,
  fenceToken: Number(r.fence_token),
  worker: r.worker === null || r.worker === undefined ? null : String(r.worker),
  heartbeatAt: r.heartbeat_at === null || r.heartbeat_at === undefined ? null : String(r.heartbeat_at),
  attempts: Number(r.attempts),
  cancelRequested: Number(r.cancel_requested) === 1,
  createdAt: String(r.created_at),
  startedAt: r.started_at === null || r.started_at === undefined ? null : String(r.started_at),
  endedAt: r.ended_at === null || r.ended_at === undefined ? null : String(r.ended_at),
  error: r.error === null || r.error === undefined ? null : String(r.error),
});

export const openScheduler = (dbPath: string): Scheduler => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { timeout: 10_000 });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_V1);

  const prepare = (sql: string) => db.prepare(sql);
  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  const scheduler: Scheduler = {
    enqueue({ experimentRunId, runId, specId, priority = 0, at }) {
      const now = at ?? new Date().toISOString();
      const jobId = newId('job');
      tx(() => {
        prepare('INSERT INTO jobs (job_id, experiment_run_id, run_id, spec_id, priority, status, fence_token, attempts, cancel_requested, created_at) VALUES (?,?,?,?,?,?,?,?,0,?)')
          .run(jobId, experimentRunId, runId, specId, priority, 'queued', 0, 0, now);
      });
      return scheduler.get(jobId)!;
    },

    claimNext(worker, { maxRunning, heartbeatTtlMs, at }) {
      const now = at ?? new Date().toISOString();
      const staleBefore = new Date(Date.parse(now) - heartbeatTtlMs).toISOString();
      return tx(() => {
        // Only LIVE running jobs (heartbeat newer than the TTL) occupy concurrency
        // slots; a stale running job is a dead worker and is reclaimable below.
        const running = prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='running' AND heartbeat_at >= ?").get(staleBefore);
        if (Number(running?.n ?? 0) >= maxRunning) return null;
        const row = prepare(
          "SELECT * FROM jobs WHERE status='queued' OR (status='running' AND heartbeat_at IS NOT NULL AND heartbeat_at < ?) ORDER BY priority DESC, id ASC LIMIT 1",
        ).get(staleBefore);
        if (row === undefined) return null;
        const job = rowToJob(row);
        const reclaimed = job.status === 'running';
        const token = job.fenceToken + 1;
        const res = prepare(
          "UPDATE jobs SET status='running', worker=?, fence_token=?, heartbeat_at=?, attempts=attempts+1, started_at=COALESCE(started_at, ?), error=NULL WHERE job_id=? AND fence_token=?",
        ).run(worker, token, now, now, job.jobId, job.fenceToken);
        if (Number(res.changes) !== 1) return null; // lost the race inside BEGIN IMMEDIATE — impossible today, guarded anyway
        const updated = rowToJob(prepare('SELECT * FROM jobs WHERE job_id=?').get(job.jobId)!);
        return { job: updated, fenceToken: token, reclaimed } as Claim & { reclaimed: boolean };
      });
    },

    heartbeat(jobId, worker, fenceToken, at) {
      const res = prepare("UPDATE jobs SET heartbeat_at=? WHERE job_id=? AND worker=? AND fence_token=? AND status='running'")
        .run(at ?? new Date().toISOString(), jobId, worker, fenceToken);
      return Number(res.changes) === 1;
    },

    complete(jobId, worker, fenceToken, outcome, at) {
      const now = at ?? new Date().toISOString();
      const res = prepare("UPDATE jobs SET status=?, ended_at=?, error=? WHERE job_id=? AND worker=? AND fence_token=? AND status='running'")
        .run(outcome.ok ? 'completed' : 'failed', now, outcome.error ?? null, jobId, worker, fenceToken);
      return Number(res.changes) === 1;
    },

    cancel(jobId, at) {
      const now = at ?? new Date().toISOString();
      const res = tx(() => {
        const queued = prepare("UPDATE jobs SET status='canceled', ended_at=? WHERE job_id=? AND status='queued'").run(now, jobId);
        if (Number(queued.changes) === 1) return true;
        const running = prepare("UPDATE jobs SET cancel_requested=1 WHERE job_id=? AND status='running'").run(jobId);
        return Number(running.changes) === 1;
      });
      return res;
    },

    cancelRequested(jobId) {
      const row = prepare('SELECT cancel_requested FROM jobs WHERE job_id=?').get(jobId);
      return row !== undefined && Number(row.cancel_requested) === 1;
    },

    get(jobId) {
      const row = prepare('SELECT * FROM jobs WHERE job_id=?').get(jobId);
      return row === undefined ? null : rowToJob(row);
    },

    list(filter) {
      const rows = filter?.status !== undefined
        ? prepare('SELECT * FROM jobs WHERE status=? ORDER BY id ASC').all(filter.status)
        : prepare('SELECT * FROM jobs ORDER BY id ASC').all();
      return rows.map(rowToJob);
    },

    stats() {
      const out: Record<string, number> = { total: 0 };
      for (const r of prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all()) {
        out[String(r.status)] = Number(r.n);
        out.total = (out.total ?? 0) + Number(r.n);
      }
      return out as Record<JobStatus | 'total', number>;
    },

    close: () => db.close(),
  };
  return scheduler;
};

/**
 * Validate + persist the spec as an experiment_run(queued) and enqueue it — the split
 * between "accepted for execution" and "actually executing" is what the queue owns.
 */
export const enqueueExperiment = (
  store: Store,
  scheduler: Scheduler,
  spec: ExperimentSpec,
  opts: { priority?: number; allowLocalDatasets?: boolean } = {},
): { experimentRunId: ExperimentRunId; jobId: string } => {
  const hypotheses = store.listObjects('hypothesis', spec.runId);
  const validation = checkExperimentSpec(spec, {
    hypothesisIds: hypotheses.map((h) => h.id),
    allowLocalDatasets: opts.allowLocalDatasets,
  });
  if (!validation.passed) throw new Error(`spec failed validation: ${validation.missing.join('; ')}`);
  const validated = { ...spec, validation };
  store.putObject('experiment_spec', validated); // the worker reads the spec back by id
  const specHash = experimentSpecHash(validated);
  // Reuse a prior queued run for this spec if present (enqueue idempotence).
  const existing = (store.listObjects('experiment_run', spec.runId) as import('../domain/index.js').ExperimentRun[])
    .find((r) => r.specId === spec.id && r.specHash === specHash && (r.status === 'queued' || r.status === 'canceled'));
  const run = existing ?? {
    id: newId('xrun'),
    runId: spec.runId,
    specId: spec.id,
    specHash,
    status: 'queued' as const,
    attempts: 0,
    executor: 'local' as const,
    cancelRequested: false,
    resultIds: [],
    statReportIds: [],
    createdAt: new Date().toISOString(),
  };
  store.putObjectEvented('experiment_run', run, { type: 'experiment_queued', detail: { specId: spec.id, specHash } });
  const job = scheduler.enqueue({ experimentRunId: run.id, runId: spec.runId, specId: spec.id, priority: opts.priority ?? 0 });
  return { experimentRunId: run.id as ExperimentRunId, jobId: job.jobId };
};

/**
 * Worker loop: claim -> execute (reusing the queued experiment_run) -> terminal
 * projection in far.db (executeExperiment) + scheduler completion. Heartbeats are
 * renewed around each model to keep long trainings adopted (D-085 P0-2 note).
 */
export const runSchedulerWorker = async (
  store: Store,
  artifacts: ArtifactStore,
  scheduler: Scheduler,
  opts: {
    worker: string;
    maxRunning: number;
    heartbeatTtlMs: number;
    heartbeatMs?: number;
    allowLocalDatasets?: boolean;
    maxJobs?: number;
  },
): Promise<{ executed: number; failed: number }> => {
  let executed = 0;
  let failed = 0;
  let beat: ReturnType<typeof setInterval> | undefined;
  let current: { jobId: string; fenceToken: number } | undefined;
  let taken = 0;
  try {
    while (opts.maxJobs === undefined || taken < opts.maxJobs) {
      const claim = scheduler.claimNext(opts.worker, { maxRunning: opts.maxRunning, heartbeatTtlMs: opts.heartbeatTtlMs });
      if (claim === null) break;
      taken += 1;
      current = { jobId: claim.job.jobId, fenceToken: claim.fenceToken };
      beat = setInterval(() => { scheduler.heartbeat(current!.jobId, opts.worker, current!.fenceToken); }, opts.heartbeatMs ?? 5_000);
      try {
        const spec = store.getObject('experiment_spec', claim.job.specId);
        if (spec === null) throw new Error(`spec ${claim.job.specId} not found in far.db`);
        await executeExperiment(store, artifacts, spec, {
          allowLocalDatasets: opts.allowLocalDatasets,
          existingRunId: claim.job.experimentRunId as ExperimentRunId,
          shouldCancel: () => scheduler.cancelRequested(claim.job.jobId),
        });
        executed += 1;
        scheduler.complete(claim.job.jobId, opts.worker, claim.fenceToken, { ok: true });
      } catch (e) {
        failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        scheduler.complete(claim.job.jobId, opts.worker, claim.fenceToken, { ok: false, error: message });
      } finally {
        clearInterval(beat);
        beat = undefined;
        current = undefined;
      }
    }
  } finally {
    if (beat !== undefined) clearInterval(beat);
  }
  return { executed, failed };
};

export type { RunId };
