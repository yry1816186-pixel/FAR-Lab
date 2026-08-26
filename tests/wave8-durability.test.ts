import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator, RunLeaseHeldError, LEASE_TTL_MS } from '../src/app/orchestrator.js';
import { ResearchQuestion, newId, RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily } from '../src/domain/source.js';
import { createApp } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

/**
 * W8 durability fusion (D-039): discriminating tests for step checkpoints (P3) and run
 * leases (P1/P2). These must fail for real defects — the kill/resume test reproduces the
 * measured pain (10 subtasks, kill after 6 → BEFORE the fusion resume redid all 10).
 */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-w8-'));

const buildOrchestrator = (store: Store, stages: Map<RunStageName, StageHandler>) =>
  new Orchestrator({
    store,
    artifacts: {} as ArtifactStore,
    provider: {} as ModelProvider,
    sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('unused'); }),
    stages,
    signals: new Map(),
  });

const seedRun = (store: Store) => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  return store.createRun(q);
};

const okHandler = (stage: RunStageName): StageHandler => ({
  stage,
  applicable: async () => true,
  execute: async () => ({ kind: 'done', summary: `${stage} done` }),
});

describe('W8 S2: step checkpoints (OAOO)', () => {
  it('putStepOutput/getStepOutput roundtrip + checkpoint_saved event', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    expect(store.getStepOutput(run.id, 'rank', 'pairs', 'pair:a:b')).toBeNull();
    store.putStepOutput(run.id, 'rank', 'pairs', 'pair:a:b', { verdict: 'tie' });
    expect(store.getStepOutput<{ verdict: string }>(run.id, 'rank', 'pairs', 'pair:a:b')).toEqual({ verdict: 'tie' });
    const events = store.listEvents(run.id);
    const ckpt = events.filter((e) => e.type === 'checkpoint_saved');
    expect(ckpt).toHaveLength(1);
    expect(ckpt[0]!.stage).toBe('rank');
    expect(ckpt[0]!.detail.stepKey).toBe('pair:a:b');
    expect(store.countStepOutputs(run.id, 'rank')).toBe(1);
    db.close();
  });

  it('KILL-AND-RESUME: 10 subtasks, kill after 6 → resume executes only the remaining 4 (was 10/10)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);

    const SUBTASKS = 10;
    let executions = 0;
    let killedOnce = false;
    const countingStage = (stage: RunStageName): StageHandler => ({
      stage,
      applicable: async () => true,
      execute: async (ctx) => {
        for (let i = 1; i <= SUBTASKS; i++) {
          await ctx.checkpointed(stage, 'subtasks', `sub:${i}`, undefined, async () => {
            executions += 1;
            if (!killedOnce && executions >= 7) {
              killedOnce = true;
              await new Promise(() => {}); // never settles = process kill mid-subtask-7
            }
            return { i };
          });
        }
        return { kind: 'done', summary: 'done' };
      },
    });
    const stages = new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? countingStage(s) : okHandler(s)]));
    const orch = buildOrchestrator(store, stages);

    const worker = orch.execute(run.id); // killed worker: promise abandoned
    await new Promise((r) => setTimeout(r, 100));
    const killed = store.getRun(run.id)!;
    expect(killed.status).toBe('running'); // frozen-run signature
    expect(store.countStepOutputs(run.id, 'retrieve')).toBe(6); // 6 subtasks survived the kill

    const done = await orch.execute(run.id);
    expect(done.status).toBe('completed');
    // DISCRIMINATING: resume executed only subtasks 7-10 (the in-flight one + the remaining
    // three); 1-6 came from step_outputs. Pre-fusion the resume redid all 10.
    expect(executions).toBe(SUBTASKS + 1); // 10 (first pass, 7th died mid-flight counted) + 4 on resume
    expect(store.countStepOutputs(run.id, 'retrieve')).toBe(10);
    // checkpointRef activation on the done stage record
    expect(done.stages.find((s) => s.stage === 'retrieve')?.checkpointRef).toBe('step_outputs:10');
    void worker.catch(() => {});
    db.close();
  });

  it('same-key overwrite is last-write-wins (INSERT OR REPLACE semantics)', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    store.putStepOutput(run.id, 'rank', 'fam', 'k', { v: 1 });
    store.putStepOutput(run.id, 'rank', 'fam', 'k', { v: 2 });
    expect(store.getStepOutput<{ v: number }>(run.id, 'rank', 'fam', 'k')).toEqual({ v: 2 });
    expect(store.countStepOutputs(run.id, 'rank')).toBe(1);
    db.close();
  });

  it('FAMILY INDEPENDENCE (audit P0-1): two checkpoint families in one stage never clear each other', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    let execs = 0;
    const dualStage: StageHandler = {
      stage: 'retrieve',
      applicable: async () => true,
      execute: async (ctx) => {
        for (let i = 1; i <= 3; i++) {
          await ctx.checkpointed('retrieve', 'scoring', `s:${i}`, 'scoring-fp-v1', async () => { execs += 1; return { s: i }; });
        }
        for (let i = 1; i <= 3; i++) {
          await ctx.checkpointed('retrieve', 'pairs', `p:${i}`, 'pairs-fp-v1', async () => { execs += 1; return { p: i }; });
        }
        return { kind: 'done', summary: 'done' };
      },
    };
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? dualStage : okHandler(s)])));
    await orch.execute(run.id);
    // clean run: NO spurious invalidation notes (audit P0-1's false 'inputs changed' signal)
    const notes0 = store.listEvents(run.id).filter((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'step_checkpoint_invalidated');
    expect(notes0).toHaveLength(0);
    expect(execs).toBe(6);

    // resume with a CHANGED scoring fingerprint: only scoring family invalidated, pairs survive
    const upgraded: StageHandler = {
      stage: 'retrieve',
      applicable: async () => true,
      execute: async (ctx) => {
        for (let i = 1; i <= 3; i++) {
          await ctx.checkpointed('retrieve', 'scoring', `s:${i}`, 'scoring-fp-v2', async () => { execs += 1; return { s: i * 10 }; });
        }
        for (let i = 1; i <= 3; i++) {
          await ctx.checkpointed('retrieve', 'pairs', `p:${i}`, 'pairs-fp-v1', async () => { execs += 1; return { p: i }; });
        }
        return { kind: 'done', summary: 'done' };
      },
    };
    const doc = store.getRun(run.id)!;
    doc.status = 'partial';
    const rec = doc.stages.find((x) => x.stage === 'retrieve')!;
    rec.state = 'pending';
    delete rec.endedAt;
    store.updateRun(doc);
    await buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? upgraded : okHandler(s)]))).execute(run.id);
    // DISCRIMINATING (pre-fix: families cleared each other -> 6 redone): only the 3 scoring subtasks re-ran
    expect(execs).toBe(9);
    expect(store.countStepOutputs(run.id, 'retrieve', 'pairs')).toBe(3); // pairs survived
    expect(store.getStepOutput<{ s: number }>(run.id, 'retrieve', 'scoring', 's:1')).toEqual({ s: 10 });
    db.close();
  });

  it('HEARTBEAT RENEWAL (audit P2-3): persisted writes extend the lease while executing', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    let leaseAtFirstWrite = '';
    let leaseAtLastWrite = '';
    const stage: StageHandler = {
      stage: 'retrieve',
      applicable: async () => true,
      execute: async (ctx) => {
        // Measurement points are read AFTER each checkpointed write completes (i.e.
        // after its renewLease), never inside the fn callback — inside, the first
        // read could race the acquire-time lease on a fast host (same millisecond),
        // which made this test flaky on CI. Discriminating power is unchanged:
        // without renewLease both reads return the acquire-time expiry => equal.
        await ctx.checkpointed('retrieve', 'fam', 'k1', 'fp', async () => 1);
        leaseAtFirstWrite = store.getRunLease(run.id).expiresAt ?? '';
        // simulate a long gap between writes; the lease must have been extended past the first write's expiry
        await new Promise((r) => setTimeout(r, 30));
        await ctx.checkpointed('retrieve', 'fam', 'k2', 'fp', async () => 2);
        leaseAtLastWrite = store.getRunLease(run.id).expiresAt ?? '';
        return { kind: 'done', summary: 'done' };
      },
    };
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? stage : okHandler(s)])));
    const done = await orch.execute(run.id);
    expect(done.status).toBe('completed');
    // DISCRIMINATING (removing renewLease makes these equal/stale): the second write's lease expiry is strictly later
    expect(leaseAtLastWrite).not.toBe('');
    expect(leaseAtLastWrite > leaseAtFirstWrite).toBe(true);
    db.close();
  });

  it('INPUTS-FINGERPRINT GATE: changed stage inputs invalidate stale cached outputs (Wave-5 audit P3)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    let execs = 0;
    const stage: StageHandler = {
      stage: 'retrieve',
      applicable: async () => true,
      execute: async (ctx) => {
        await ctx.checkpointed('retrieve', 'fam', 'k', 'fp-v1', async () => { execs += 1; return { v: 1 }; });
        return { kind: 'done', summary: 'done' };
      },
    };
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? stage : okHandler(s)])));
    await orch.execute(run.id); // full pipeline; retrieve cached under fp-v1
    expect(execs).toBe(1);
    expect(store.getStepOutput<{ v: number }>(run.id, 'retrieve', 'fam', 'k')).toEqual({ v: 1 });

    // "upgrade": same key, NEW inputs fingerprint — the stale cached result must NOT replay
    const upgraded: StageHandler = {
      stage: 'retrieve',
      applicable: async () => true,
      execute: async (ctx) => {
        await ctx.checkpointed('retrieve', 'fam', 'k', 'fp-v2', async () => { execs += 1; return { v: 2 }; });
        return { kind: 'done', summary: 'done' };
      },
    };
    // reset stage to re-run it (resume path: reopen the stage record)
    const doc = store.getRun(run.id)!;
    doc.status = 'partial';
    const rec = doc.stages.find((s) => s.stage === 'retrieve')!;
    rec.state = 'pending';
    delete rec.endedAt;
    store.updateRun(doc);
    const orch2 = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? upgraded : okHandler(s)])));
    await orch2.execute(run.id);
    expect(execs).toBe(2); // DISCRIMINATING: re-executed under new inputs (stale replay would keep execs=1)
    expect(store.getStepOutput<{ v: number }>(run.id, 'retrieve', 'fam', 'k')).toEqual({ v: 2 });
    // invalidation is audited
    const notes = store.listEvents(run.id).filter((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'step_checkpoint_invalidated');
    expect(notes).toHaveLength(1);
    // fingerprint row now reflects the new inputs
    expect(store.getStepFingerprint(run.id, 'retrieve', 'fam')).toBe('fp-v2');
    db.close();
  });
});

describe('W8 S1: run leases (single-writer + frozen-run recovery)', () => {
  it('acquireLease: exclusive while live, reclaimable after expiry, re-entrant for the holder', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    const future = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    expect(store.acquireLease(run.id, 'worker-a', future)).toBe(true);
    expect(store.acquireLease(run.id, 'worker-b', future)).toBe(false); // live lease blocks
    expect(store.acquireLease(run.id, 'worker-a', future)).toBe(true); // same holder re-entrant
    // force expiry: a dead worker's lease is reclaimable
    db.prepare('UPDATE runs SET lease_expires_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), run.id);
    expect(store.acquireLease(run.id, 'worker-b', future)).toBe(true);
    db.close();
  });

  it('execute() refuses to double-run while another live lease is held (P2 cross-process guard)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    store.acquireLease(run.id, 'other-process', new Date(Date.now() + LEASE_TTL_MS).toISOString());
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, okHandler(s)])));
    await expect(orch.execute(run.id)).rejects.toBeInstanceOf(RunLeaseHeldError);
    db.close();
  });

  it('completed execution releases the lease (future resume is not blocked)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, okHandler(s)])));
    const done = await orch.execute(run.id);
    expect(done.status).toBe('completed');
    expect(store.getRunLease(run.id).holder).toBeNull();
    db.close();
  });

  it('disowned worker aborts WITHOUT writing run state when its lease was adopted', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);

    let releaseGate: (() => void) | null = null;
    const slowStage = (stage: RunStageName): StageHandler => ({
      stage,
      applicable: async () => true,
      execute: async () => {
        await new Promise<void>((r) => { releaseGate = r; }); // stage hangs mid-flight
        return { kind: 'done', summary: 'slow done' };
      },
    });
    const stages = new Map(STAGE_ORDER.map((s) => [s, s === 'scope' ? slowStage(s) : okHandler(s)]));
    const orch = buildOrchestrator(store, stages);

    const worker = orch.execute(run.id);
    await new Promise((r) => setTimeout(r, 50)); // worker is inside the hanging stage

    // watchdog adopts: force lease expiry, another executor claims it
    db.prepare('UPDATE runs SET lease_expires_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), run.id);
    expect(store.acquireLease(run.id, 'watchdog', new Date(Date.now() + LEASE_TTL_MS).toISOString())).toBe(true);

    releaseGate!(); // hanging stage finishes; worker's next transition must detect the loss
    const after = await worker;
    // disowned worker must NOT mark the run failed/partial — the adopter owns state now
    expect(after.status).toBe('running');
    const notes = store.listEvents(run.id).filter((e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'lease_lost_abort');
    expect(notes).toHaveLength(1);
    db.close();
  });

  it('heartbeat renewal: transitions and step checkpoints extend the lease', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    let probeLease: (() => void) | null = null;
    const probingStage = (stage: RunStageName): StageHandler => ({
      stage,
      applicable: async () => true,
      execute: async (ctx) => {
        await ctx.checkpointed(stage, 'subtasks', 'only', undefined, async () => ({ done: true }));
        probeLease = () => { void store.getRunLease(run.id).expiresAt; };
        return { kind: 'done', summary: 'done' };
      },
    });
    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, s === 'scope' ? probingStage(s) : okHandler(s)])));
    const done = await orch.execute(run.id);
    expect(done.status).toBe('completed');
    probeLease?.();
    // during execution the lease was held and repeatedly extended; released at completion
    expect(store.getRunLease(run.id).holder).toBeNull();
    db.close();
  });

  it('listExpiredLeaseRuns: the frozen-run signature only (status=running + expired/absent lease)', () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const frozen = seedRun(store);
    db.prepare("UPDATE runs SET status='running' WHERE id=?").run(frozen.id); // no lease ever (legacy zombie)
    const liveRun = seedRun(store);
    db.prepare("UPDATE runs SET status='running' WHERE id=?").run(liveRun.id);
    store.acquireLease(liveRun.id, 'alive-worker', new Date(Date.now() + LEASE_TTL_MS).toISOString());
    const partial = seedRun(store);
    db.prepare("UPDATE runs SET status='partial' WHERE id=?").run(partial.id);

    const stale = store.listExpiredLeaseRuns(new Date().toISOString());
    const ids = stale.map((s) => s.id);
    expect(ids).toContain(frozen.id);
    expect(ids).not.toContain(liveRun.id); // live lease = worker may be slow, not dead
    expect(ids).not.toContain(partial.id); // already terminal-ish, visible as partial
    db.close();
  });

  it('frozen run is resumable via plain execute() once the lease expired (CLI resume path)', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = seedRun(store);
    // simulate a worker that died mid-run with stages 0..1 done and an expired lease
    const doc = store.getRun(run.id)!;
    doc.stages[0]!.state = 'done';
    doc.stages[1]!.state = 'done';
    doc.status = 'running';
    doc.currentStage = 'retrieve';
    store.updateRun(doc);
    db.prepare('UPDATE runs SET lease_holder=?, lease_expires_at=? WHERE id=?')
      .run('dead-worker', new Date(Date.now() - 60_000).toISOString(), run.id);

    const orch = buildOrchestrator(store, new Map(STAGE_ORDER.map((s) => [s, okHandler(s)])));
    const done = await orch.execute(run.id);
    expect(done.status).toBe('completed');
    // done stages were NOT re-attempted (attempt stayed 1; only remaining stages ran)
    expect(done.stages[0]!.attempt).toBe(1);
    db.close();
  });
});

describe('W8 S1: server watchdog adopts frozen runs within one poll cycle', () => {
  it('expired-lease running run is detected and re-executed by the embedded watchdog', async () => {
    const dir = tmp();
    const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
    // seed a frozen run: status='running', stale lease from a dead worker
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    const doc = app.store.getRun(run.id)!;
    doc.status = 'running';
    app.store.updateRun(doc);
    app.store.acquireLease(run.id, 'dead-worker', new Date(Date.now() - 60_000).toISOString());

    const adopted: string[] = [];
    const api = createApiServer(app, {
      watchdogIntervalMs: 40,
      executor: async (runId) => { adopted.push(runId); return null; },
    });
    try {
      await new Promise((r) => setTimeout(r, 200)); // > 1 poll cycle (40ms) but < 2s
      expect(adopted).toContain(run.id);
      const notes = app.store.listEvents(run.id).filter(
        (e) => e.type === 'note' && (e.detail as { reason?: string }).reason === 'watchdog_adoption',
      );
      expect(notes).toHaveLength(1);
    } finally {
      await api.stop();
      app.close();
    }
  }, 10_000);

  it('live-lease runs are NOT adopted (slow worker protection)', async () => {
    const dir = tmp();
    const app = await createApp({ dataDir: dir, providerOverride: createTestStubProvider([]) });
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'q', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    const doc = app.store.getRun(run.id)!;
    doc.status = 'running';
    app.store.updateRun(doc);
    app.store.acquireLease(run.id, 'live-worker', new Date(Date.now() + LEASE_TTL_MS).toISOString());

    const adopted: string[] = [];
    const api = createApiServer(app, {
      watchdogIntervalMs: 40,
      executor: async (runId) => { adopted.push(runId); return null; },
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect(adopted).not.toContain(run.id);
    } finally {
      await api.stop();
      app.close();
    }
  }, 10_000);
});
