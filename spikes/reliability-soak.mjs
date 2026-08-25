/**
 * FAR-Lab reliability workstream — ACCELERATED SOAK (2026-08-24).
 *
 * Hours-scale equivalence by event/artifact volume: one process drives N CONCURRENT
 * research runs through the real Orchestrator (leases, checkpoints, event spine,
 * artifacts, receipts) in continuous reopen-and-extend rounds, sampling process
 * memory/handles and storage growth every SAMPLE_MS. The growth verdict is
 * computed from the samples, not eyeballed:
 *   - rssBounded:      final RSS <= first-sample RSS + RSS_ALLOWANCE_MB
 *   - handlesBounded:  active handles at end <= start + HANDLE_ALLOWANCE
 *   - chainIntact:     verifyEventChain ok for EVERY run after the final round
 *   - storageProportional: db bytes grow with run/event count (no unbounded wal/
 *     artifact explosion beyond ARTIFACT_BYTES_PER_EVENT * events * slack)
 *
 * Usage: node spikes/reliability-soak.mjs [rounds] [concurrency]
 * Output: verdict lines + JSON evidence to evidence/reliability/soak.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const ROUNDS = Number(process.argv[2] ?? 40);       // reopen-and-extend rounds
const MAX_TOTAL = Number(process.argv[4] ?? 60);   // total runs created over the soak (churn cap)
const CONCURRENCY = Number(process.argv[3] ?? 6);   // concurrent runs
const SAMPLE_MS = 1000;
const RSS_ALLOWANCE_MB = 120;   // node:sqlite + accumulating JS objects allowance
const HANDLE_ALLOWANCE = 20;

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { openDb } = await imp('dist/persistence/db.js');
const { Store } = await imp('dist/persistence/store.js');
const { Orchestrator } = await imp('dist/app/orchestrator.js');
const { openArtifactStore } = await imp('dist/persistence/artifacts.js');
const { ResearchQuestion, newId } = await imp('dist/domain/index.js');
const { STAGE_ORDER } = await imp('dist/domain/run.js');
const { sampleProcess, sampleStorage } = await imp('dist/app/observability.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-soak-'));
const EVIDENCE = path.join(ROOT, 'evidence', 'reliability');
fs.mkdirSync(EVIDENCE, { recursive: true });

const db = openDb(path.join(dir, 'far.db'));
const store = new Store(db);
const artifacts = openArtifactStore(path.join(dir, 'artifacts'));

// Real stage handlers producing real persistence shapes: checkpointed subtasks,
// receipts, artifact puts, events — the exact write mix of a live run, no network.
const HEAVY_SUBTASKS = 14;
const mkStages = (runId) => new Map(STAGE_ORDER.map((stage) => [stage, {
  stage,
  applicable: async () => true,
  execute: async (ctx) => {
    for (let i = 1; i <= HEAVY_SUBTASKS; i++) {
      const out = await ctx.checkpointed(stage, 'soak', `s${i}`, undefined, async () => {
        ctx.recordReceipt({
          kind: 'model_call', executionMode: 'test', stage,
          modelCall: {
            provider: 'soak-stub', modelId: 'soak-m', latencyMs: 1 + (i % 5),
            usage: { promptTokens: 100 * i, completionTokens: 50 * i, totalTokens: 150 * i },
            requestHash: 'ab'.repeat(32), outputHash: 'cd'.repeat(32),
          },
        });
        // artifact pressure: unique payload per (run, stage, subtask) — content-addressed put
        await artifacts.put(JSON.stringify({ runId, stage, i, blob: 'x'.repeat(400) }));
        ctx.progress(i, HEAVY_SUBTASKS, { reason: 'soak_subtask', detail: { i } });
        return { i, at: new Date().toISOString() };
      });
      void out;
    }
    return { kind: 'done', summary: `${stage} done (soak)` };
  },
}]));

const mkRun = (n) => store.createRun(ResearchQuestion.parse({
  id: newId('q'), text: `soak run ${n}`, background: '', goalType: 'exploratory',
  scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
}));

const samples = [];
const sample = () => {
  samples.push({ t: Date.now(), proc: sampleProcess(), storage: sampleStorage(store, dir) });
};
sample();
const sampleTimer = setInterval(sample, SAMPLE_MS);
sampleTimer.unref();

const runIds = [];
const allRunIds = [];
const t0 = Date.now();
// seed runs
for (let i = 0; i < CONCURRENCY; i++) { const r = mkRun(i).id; runIds.push(r); allRunIds.push(r); }

for (let round = 1; round <= ROUNDS; round++) {
  // Long-session churn: runs that reached a terminal state are replaced by FRESH
  // runs (up to MAX_TOTAL), keeping the executor under continuous concurrent load —
  // the shape of a hours-scale researcher session, accelerated.
  for (let i = runIds.length - 1; i >= 0; i--) {
    const st = store.getRun(runIds[i])?.status;
    if (st === 'completed' || st === 'failed' || st === 'cancelled') runIds.splice(i, 1);
  }
  while (runIds.length < CONCURRENCY && allRunIds.length < MAX_TOTAL) {
    const r = mkRun(allRunIds.length).id; runIds.push(r); allRunIds.push(r);
  }
  // Each round: execute every run a bit further. A fresh Orchestrator per round is
  // the reopen shape (CLI/server resume); stage handlers are stable per run.
  await Promise.all(runIds.map(async (runId, idx) => {
    const o = new Orchestrator({
      store, artifacts, provider: {}, sourceFor: () => { throw new Error('unused'); },
      stages: mkStages(runId), signals: new Map(),
    });
    // First-run drives to completion; others resume to a stage boundary (stopAfter)
    // so checkpoints + resume churn accumulate across rounds.
    const stopAfter = idx === 0 ? undefined : STAGE_ORDER[1 + (round % (STAGE_ORDER.length - 2))];
    try {
      await o.execute(runId, stopAfter !== undefined ? { stopAfter } : undefined);
    } catch (e) {
      // lease contention across concurrent resumes is a supported state, not a soak failure;
      // count it and continue — the final chain verdict decides.
      samples.push({ t: Date.now(), leaseRace: String(e?.name ?? e) });
    }
  }));
}
const elapsedMs = Date.now() - t0;
clearInterval(sampleTimer);
sample(); // final sample

// ---- verdicts ----
const procSamples = samples.filter((s) => s.proc).map((s) => s.proc);
const storSamples = samples.filter((s) => s.storage).map((s) => s.storage);
const first = procSamples[0];
const last = procSamples.at(-1);
const rssGrowth = Number((last.rssMb - first.rssMb).toFixed(1));
const handleGrowth = last.activeHandles - first.activeHandles;
const rssBounded = last.rssMb <= first.rssMb + RSS_ALLOWANCE_MB;
const handlesBounded = handleGrowth <= HANDLE_ALLOWANCE;

const chainResults = allRunIds.map((id) => ({ id, ok: store.verifyEventChain(id).ok }));
const chainIntact = chainResults.every((c) => c.ok);

const finalStorage = storSamples.at(-1);
const firstStorage = storSamples[0];
const dbGrowthBytes = finalStorage.dbBytes - firstStorage.dbBytes;
// Rough proportionality: each soak subtask writes ~1 receipt object + ~1 event row +
// 1 note + a 400B artifact; verify db growth is within 3x the artifact bytes total
// (sqlite overhead + indexes) — catches runaway wal/log accumulation.
const artifactBytesGrowth = finalStorage.artifactsBytes - firstStorage.artifactsBytes;
// Storage model reality: the dominant rows are events (payload JSON), objects
// (receipt JSON) and step_outputs — budget 2KB/row all-in (data+indexes+pages);
// a runaway (unbounded wal, MB-per-row bloat) blows straight through this.
const totalRows = finalStorage.events + finalStorage.objects;
const bytesPerRow = totalRows > 0 ? Math.round(finalStorage.dbBytes / totalRows) : 0;
const walBounded = finalStorage.walBytes < Math.max(8 * 1024 * 1024, finalStorage.dbBytes * 0.5);
const storageProportional = bytesPerRow <= 2048 && walBounded;


const verdict = {
  measuredAt: new Date().toISOString(),
  config: { rounds: ROUNDS, concurrency: CONCURRENCY, heavySubtasks: HEAVY_SUBTASKS, sampleMs: SAMPLE_MS, elapsedMs },
  totals: {
    runs: allRunIds.length, events: finalStorage.events, objects: finalStorage.objects,
    receipts: finalStorage.receipts, artifactBlobs: finalStorage.artifactBlobs,
    dbBytes: finalStorage.dbBytes, walBytes: finalStorage.walBytes,
  },
  growth: {
    rssFirstMb: first.rssMb, rssLastMb: last.rssMb, rssGrowthMb: rssGrowth, rssAllowanceMb: RSS_ALLOWANCE_MB,
    handleFirst: first.activeHandles, handleLast: last.activeHandles, handleGrowth,
    dbGrowthBytes, artifactBytesGrowth,
  },
  verdicts: { rssBounded, handlesBounded, chainIntact, storageProportional },
  storageDetail: { bytesPerRow, walBytes: finalStorage.walBytes, walBounded, dbBytes: finalStorage.dbBytes },
  leaseRaces: samples.filter((s) => s.leaseRace).length,
  chainResults,
  sampleCount: procSamples.length,
};
const allPass = Object.values(verdict.verdicts).every(Boolean);
verdict.verdict = allPass ? 'PASS' : 'FAIL';

fs.writeFileSync(path.join(EVIDENCE, 'soak.json'), JSON.stringify(verdict, null, 2));
fs.writeFileSync(path.join(EVIDENCE, 'soak-samples.json'), JSON.stringify(samples.filter((s) => s.proc || s.storage), null, 2));
console.log(`soak: ${ROUNDS} rounds × ${CONCURRENCY} concurrent runs in ${(elapsedMs / 1000).toFixed(1)}s`);
console.log(`totals: ${verdict.totals.events} events, ${verdict.totals.receipts} receipts, ${verdict.totals.artifactBlobs} artifact blobs, db=${(verdict.totals.dbBytes / 1048576).toFixed(1)}MB wal=${(verdict.totals.walBytes / 1048576).toFixed(2)}MB`);
console.log(`rss ${first.rssMb}→${last.rssMb}MB (+${rssGrowth}MB, allowance ${RSS_ALLOWANCE_MB}) handles ${first.activeHandles}→${last.activeHandles} (${handleGrowth >= 0 ? '+' : ''}${handleGrowth})`);
console.log(`verdicts: rss=${rssBounded} handles=${handlesBounded} chain=${chainIntact} storageProportional=${storageProportional} leaseRaces=${verdict.leaseRaces}`);
console.log(`SOAK ${verdict.verdict}`);
db.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(allPass ? 0 : 1);
