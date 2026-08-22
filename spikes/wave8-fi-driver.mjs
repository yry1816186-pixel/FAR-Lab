/**
 * W8 fault-injection driver (child process). Real dist orchestrator + step checkpoints.
 * Modes:
 *   worker   — create a run, execute it; the 'retrieve' stage runs SUBTASKS checkpointed
 *              subtasks and hard-exits (process.exit(86)) when reaching killAt (0 = never).
 *   watchdog — poll listExpiredLeaseRuns every POLL_MS and adopt (execute) — exactly the
 *              server watchdog's recovery path, driven cross-process here.
 * Shared state: scratch dir contains far.db + runid.txt + exec.log (one line per executed
 * subtask across ALL processes — the redo measurement).
 * Usage: node spikes/wave8-fi-driver.mjs <mode> <dir> [killAt] [pollMs] [ttlMs]
 *
 * NOTE: FARLAB_LEASE_TTL_MS must be set BEFORE the dist orchestrator module loads (the
 * TTL const is evaluated at import time), hence dynamic imports below.
 */
import fs from 'node:fs';
import path from 'node:path';

const [mode, dir, killAtArg, pollMsArg, ttlMsArg] = process.argv.slice(2);
const SUBTASKS = 12;
const killAt = Number(killAtArg ?? 0);
const POLL_MS = Number(pollMsArg ?? 1000);
process.env.FARLAB_LEASE_TTL_MS = String(Number(ttlMsArg ?? 5000));

const { openDb } = await import('../dist/persistence/db.js');
const { Store } = await import('../dist/persistence/store.js');
const { Orchestrator } = await import('../dist/app/orchestrator.js');
const { ResearchQuestion, newId } = await import('../dist/domain/index.js');
const { STAGE_ORDER } = await import('../dist/domain/run.js');

const dbPath = path.join(dir, 'far.db');
const execLog = path.join(dir, 'exec.log');
const runIdFile = path.join(dir, 'runid.txt');

const ok = (stage) => ({ stage, applicable: async () => true, execute: async () => ({ kind: 'done', summary: stage }) });
const counting = (stage) => ({
  stage,
  applicable: async () => true,
  execute: async (ctx) => {
    for (let i = 1; i <= SUBTASKS; i++) {
      await ctx.checkpointed(stage, 'subtasks', `sub:${i}`, undefined, async () => {
        fs.appendFileSync(execLog, `${i}\n`);
        if (i === killAt) process.exit(86); // simulated worker death (SIGKILL-equivalent)
        return { subtask: i };
      });
    }
    return { kind: 'done', summary: 'retrieve done' };
  },
});
const buildOrch = (store) => new Orchestrator({
  store, artifacts: {}, provider: {}, sourceFor: () => { throw new Error('unused'); },
  stages: new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? counting(s) : ok(s)])),
  signals: new Map(),
});

if (mode === 'worker') {
  const db = openDb(dbPath);
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'fault-injection question', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  fs.writeFileSync(runIdFile, run.id);
  const done = await buildOrch(store).execute(run.id);
  console.log(JSON.stringify({ mode, status: done.status }));
  db.close();
  process.exit(done.status === 'completed' ? 0 : 3);
}

if (mode === 'watchdog') {
  const runId = fs.readFileSync(runIdFile, 'utf8').trim();
  const db = openDb(dbPath);
  const store = new Store(db);
  const orch = buildOrch(store);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 60_000) { console.error('watchdog timeout'); process.exit(4); }
    const stale = store.listExpiredLeaseRuns(new Date().toISOString());
    for (const s of stale) {
      if (s.id !== runId) continue;
      store.appendEvent(s.id, { type: 'note', detail: { reason: 'harness_adoption', at: Date.now() - t0 } });
      const run = await orch.execute(s.id);
      console.log(JSON.stringify({ mode, adopted: true, status: run.status, msSinceWatchdogStart: Date.now() - t0 }));
      db.close();
      process.exit(run.status === 'completed' ? 0 : 5);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
console.error('unknown mode');
process.exit(2);
