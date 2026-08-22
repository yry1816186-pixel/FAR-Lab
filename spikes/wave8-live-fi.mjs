/**
 * W8 LIVE fault-injection — minimal, cost-bounded (user directive: 节省额度).
 * Exactly ONE pipeline-shaped scenario on the REAL zai Anthropic route:
 *   3 checkpointed subtasks, worker killed DURING subtask 2 (subtask 1 already
 *   persisted), watchdog adopts after lease expiry and completes via cache-hit.
 * Real-call budget: 4 structured calls total (~100 in / ~50 out tokens each).
 *
 * Modes: worker <dir> <killAt> | watchdog <dir>
 * Shared files in dir: far.db, runid.txt, exec.log (one line per REAL call, any process).
 * Usage (from repo root):
 *   node -e "import('./spikes/load-secrets-env.mjs').then(()=>import('./spikes/wave8-live-fi.mjs'))" worker <dir> 2
 */
import fs from 'node:fs';
import path from 'node:path';

// args may arrive via argv (direct node run) or env (spawned via -e wrapper, where
// argv offsets shift) — env wins when present.
const [argvMode, argvDir, argvKill] = process.argv.slice(2);
const mode = process.env.W8FI_MODE ?? argvMode;
const dir = process.env.W8FI_DIR ?? argvDir;
const killAtArg = process.env.W8FI_KILLAT ?? argvKill;
const SUBTASKS = 3;
const killAt = Number(killAtArg ?? 2);
process.env.FARLAB_LEASE_TTL_MS = '60000'; // comfortably above one live call's latency (no false adoption of a live worker)

const { openDb } = await import('../dist/persistence/db.js');
const { Store } = await import('../dist/persistence/store.js');
const { Orchestrator } = await import('../dist/app/orchestrator.js');
const { ResearchQuestion, newId } = await import('../dist/domain/index.js');
const { STAGE_ORDER } = await import('../dist/domain/run.js');
const { createZaiProvider } = await import('../dist/providers/zai.js');

const dbPath = path.join(dir, 'far.db');
const execLog = path.join(dir, 'exec.log');
const runIdFile = path.join(dir, 'runid.txt');
const provider = createZaiProvider({ totalTimeoutMs: 90_000 });

const parse = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return new Error('not an object');
  if (typeof raw.hypothesis !== 'string' || raw.hypothesis.length < 10) return new Error('hypothesis missing');
  return raw;
};

const ok = (stage) => ({ stage, applicable: async () => true, execute: async () => ({ kind: 'done', summary: stage }) });
const liveStage = (stage) => ({
  stage,
  applicable: async () => true,
  execute: async (ctx) => {
    for (let i = 1; i <= SUBTASKS; i++) {
      await ctx.checkpointed(stage, 'live', `sub:${i}`, 'live-fi-v1', async () => {
        const res = await provider.structuredCall(
          {
            task: `Propose one short falsifiable hypothesis about subtask ${i}: why bacteria develop antibiotic resistance so quickly. One sentence.`,
            systemPrompt: 'Respond ONLY with JSON: {"hypothesis": string}.',
            userPayload: { subtask: i },
            outputKind: 'json',
            temperature: 0,
            maxTokens: 60,
            purpose: `wave8-live-fi:sub${i}`,
          },
          parse,
        );
        if (!res.ok) throw new Error(`live call failed: ${res.error.kind} ${res.error.message}`);
        fs.appendFileSync(execLog, `${i}\t${res.receipt.outputHash}\n`);
        if (i === killAt && mode === 'worker') process.exit(86); // simulated death AFTER the call, BEFORE persistence
        return { subtask: i, hypothesis: res.data.hypothesis, outputHash: res.receipt.outputHash };
      });
    }
    return { kind: 'done', summary: 'live retrieve done' };
  },
});
const buildOrch = (store) => new Orchestrator({
  store, artifacts: {}, provider, sourceFor: () => { throw new Error('unused'); },
  stages: new Map(STAGE_ORDER.map((s) => [s, s === 'retrieve' ? liveStage(s) : ok(s)])),
  signals: new Map(),
});

if (mode === 'worker') {
  const db = openDb(dbPath);
  const store = new Store(db);
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'wave8 live fault-injection', background: '', goalType: 'explanatory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = store.createRun(q);
  fs.writeFileSync(runIdFile, run.id);
  await buildOrch(store).execute(run.id); // never returns (exit 86 inside)
}
if (mode === 'watchdog') {
  const runId = fs.readFileSync(runIdFile, 'utf8').trim();
  const db = openDb(dbPath);
  const store = new Store(db);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 240_000) { console.error('watchdog timeout'); process.exit(4); }
    const stale = store.listExpiredLeaseRuns(new Date().toISOString());
    for (const s of stale) {
      if (s.id !== runId) continue;
      store.appendEvent(s.id, { type: 'note', detail: { reason: 'live_harness_adoption', atMs: Date.now() - t0 } });
      const run = await buildOrch(store).execute(s.id);
      console.log(JSON.stringify({ mode, adopted: true, status: run.status, msSinceWatchdogStart: Date.now() - t0 }));
      db.close();
      process.exit(run.status === 'completed' ? 0 : 5);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
console.error('unknown mode');
process.exit(2);
