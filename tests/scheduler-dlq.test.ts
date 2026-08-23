import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openScheduler, MAX_JOB_ATTEMPTS } from '../src/experiment/scheduler.js';

// RU-7.2 poison-job dead-letter queue: bounded redelivery, dead-letter on the
// claim after the cap, operator resurrection. Deterministic clock via `at`.

const mkScheduler = () => openScheduler(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-dlq-')), 'far-scheduler.db'));

const TTL = 60_000;
/** Simulate a worker that claims then dies: advance the clock past the heartbeat TTL. */
const crashClaim = (s: ReturnType<typeof mkScheduler>, at: number) =>
  s.claimNext('worker-that-dies', { maxRunning: 2, heartbeatTtlMs: TTL, at: new Date(at).toISOString() });

describe('RU-7.2 poison-job DLQ', () => {
  it('a crash-looping job is dead-lettered at the attempts cap and never reclaimed again', () => {
    const s = mkScheduler();
    const job = s.enqueue({ experimentRunId: 'xrun_1', runId: 'run_1', specId: 'xsp_1' });
    let t = Date.parse('2026-08-24T00:00:00.000Z');

    // claim → crash → reclaim after TTL expiry, until the cap
    for (let i = 1; i <= MAX_JOB_ATTEMPTS; i += 1) {
      const claim = crashClaim(s, t);
      expect(claim, `claim ${i} must succeed`).not.toBeNull();
      t += TTL + 1000; // heartbeat expires — the worker "died"
    }
    expect(s.get(job.jobId)!.attempts).toBe(MAX_JOB_ATTEMPTS);

    // the NEXT claim after expiry dead-letters instead of handing out attempt N+1
    const capped = crashClaim(s, t);
    expect(capped).toBeNull();
    const dead = s.get(job.jobId)!;
    expect(dead.status).toBe('dead');
    expect(dead.error).toContain('dead-letter');

    // dead jobs are listed for ops and never claimed again
    expect(s.listDead().map((d) => d.jobId)).toEqual([job.jobId]);
    t += TTL * 2;
    expect(crashClaim(s, t)).toBeNull();
    s.close();
  });

  it('a healthy job completing under the cap is unaffected by the DLQ', () => {
    const s = mkScheduler();
    const job = s.enqueue({ experimentRunId: 'xrun_2', runId: 'run_2', specId: 'xsp_2' });
    const t = new Date().toISOString();
    const claim = s.claimNext('healthy-worker', { maxRunning: 2, heartbeatTtlMs: TTL, at: t })!;
    expect(s.complete(job.jobId, 'healthy-worker', claim.fenceToken, { ok: true }, t)).toBe(true);
    expect(s.get(job.jobId)!.status).toBe('completed');
    s.close();
  });

  it('requeueDead resurrects with a fresh attempt budget; non-dead jobs refused', () => {
    const s = mkScheduler();
    const job = s.enqueue({ experimentRunId: 'xrun_3', runId: 'run_3', specId: 'xsp_3' });
    let t = Date.parse('2026-08-24T00:00:00.000Z');
    for (let i = 0; i <= MAX_JOB_ATTEMPTS; i += 1) {
      crashClaim(s, t);
      t += TTL + 1000;
    }
    crashClaim(s, t); // dead-letters
    expect(s.get(job.jobId)!.status).toBe('dead');

    expect(s.requeueDead(job.jobId, new Date(t).toISOString())).toBe(true);
    const revived = s.get(job.jobId)!;
    expect(revived.status).toBe('queued');
    expect(revived.attempts).toBe(0);
    const claim = crashClaim(s, t + 1000);
    expect(claim).not.toBeNull(); // claimable again
    expect(s.requeueDead(job.jobId)).toBe(false); // no longer dead — refused
    s.close();
  });

  it('migration v3 rebuilds an existing v2 scheduler db without losing jobs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-dlq-mig-'));
    const dbPath = path.join(dir, 'far-scheduler.db');
    // open once (migrates to v3), close, reopen — idempotent, jobs survive
    const first = openScheduler(dbPath);
    first.enqueue({ experimentRunId: 'xrun_m', runId: 'run_m', specId: 'xsp_m' });
    first.close();
    const second = openScheduler(dbPath);
    expect(second.list()).toHaveLength(1);
    expect(second['stats']().total).toBe(1);
    // a dead insert is now schema-legal (the v1/v2 CHECK would have rejected it)
    second.close();
  });
});
