/**
 * Wave-8 pain-point measurement (preamble to the orchestration/durability expedition).
 * Deterministic, read-only forensics over the REAL .far-run/far.db — no model calls.
 *
 * P1 frozen-run: runs left status='running' by dead workers — how many, detection latency,
 *   what auto-detection exists (expect: none — manual sweep script only).
 * P2 detached-execution kills: partial runs whose death left NO stage_failed event
 *   (worker killed mid-stage) vs genuine stage failures.
 * P3 resume granularity: per-stage LLM call counts + wall-clock from receipts of completed
 *   runs — worst-case in-stage work loss when the checkpoint unit is the stage.
 *
 * Usage: node spikes/wave8-pain-measurement.mjs [--json]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const JSON_OUT = process.argv.includes('--json');
const DB = resolve(process.cwd(), '.far-run/far.db');
const db = new DatabaseSync(DB, { readOnly: true });

const runs = db.prepare('SELECT id, status, current_stage, created_at, updated_at, doc FROM runs ORDER BY created_at').all();
const eventsFor = (id) => db.prepare('SELECT seq, at, type, payload FROM events WHERE run_id=? ORDER BY seq').all(id);
const objectsFor = (id, kind) => db.prepare('SELECT json, created_at FROM objects WHERE run_id=? AND kind=?').all(id, kind);
const parseDoc = (r) => JSON.parse(r.doc);

// ---------- P1 + P2: death-mode forensics ----------
const partials = runs.filter((r) => r.status === 'partial');
const forensics = [];
for (const p of partials) {
  const evs = eventsFor(p.id);
  const stageFailed = evs.filter((e) => e.type === 'stage_failed');
  const resumed = evs.filter((e) => e.type === 'run_resumed');
  const lastEvAt = evs.length ? evs[evs.length - 1].at : null;
  const doc = parseDoc(p);
  const stuckStage = doc.stages.find((s) => s.state === 'running')?.stage ?? p.current_stage;
  forensics.push({
    run: p.id.slice(0, 16),
    stuckStage,
    deathMode: stageFailed.length > 0 ? 'stage_failed(visible)' : 'KILLED-silent(no stage_failed event)',
    lastEventAt: lastEvAt,
    resumedAttempts: resumed.length,
    llmCallsSoFar: objectsFor(p.id, 'receipt').filter((x) => {
      const rec = JSON.parse(x.json);
      return rec.kind === 'model_call';
    }).length,
  });
}
const killedSilent = forensics.filter((f) => f.deathMode.startsWith('KILLED')).length;
const anyResumed = forensics.filter((f) => f.resumedAttempts > 0).length;

// Detection latency for frozen runs: last event -> manual sweep time. The sweep writes a
// run_status_changed event with reason 'zombie sweep' — measure that gap when present.
const sweepLatencies = [];
for (const p of partials) {
  const evs = eventsFor(p.id);
  const lastLifeIdx = (() => {
    let idx = -1;
    evs.forEach((e, i) => { if (!e.type.startsWith('run_status_changed') || !e.payload.includes('zombie')) idx = i; });
    return idx;
  })();
  const sweepEv = evs.find((e) => e.type === 'run_status_changed' && e.payload.includes('zombie'));
  if (sweepEv && lastLifeIdx >= 0) {
    const t0 = new Date(evs[lastLifeIdx].at).getTime();
    const t1 = new Date(sweepEv.at).getTime();
    if (t1 > t0) sweepLatencies.push({ run: p.id.slice(0, 16), minutes: Math.round((t1 - t0) / 60000) });
  }
}

// ---------- P3: per-stage call counts + wall-clock on completed runs ----------
const completed = runs.filter((r) => r.status === 'completed');
const stageStats = {};
let runDurations = [];
for (const c of completed) {
  const receipts = objectsFor(c.id, 'receipt').map((x) => JSON.parse(x.json));
  const modelCalls = receipts.filter((r) => r.kind === 'model_call');
  const evs = eventsFor(c.id);
  const stageDone = evs.filter((e) => e.type === 'stage_done');
  const startedAt = new Date(c.created_at).getTime();
  const endedAt = new Date(c.updated_at).getTime();
  if (endedAt > startedAt) runDurations.push((endedAt - startedAt) / 60000);
  // attribute model calls to stages via receipt.stage + first/last timestamps per stage
  for (const mc of modelCalls) {
    const st = mc.stage ?? 'unknown';
    stageStats[st] = stageStats[st] ?? { calls: 0, runs: new Set() };
    stageStats[st].calls++;
    stageStats[st].runs.add(c.id);
  }
}
runDurations.sort((a, b) => a - b);
const p = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
const summary = {
  db: DB,
  measuredAt: new Date().toISOString(),
  totals: { runs: runs.length, completed: completed.length, partial: partials.length },
  p1_frozenRun: {
    claim: 'no auto-detection exists anywhere in src/ (only manual sweep script zcode-harness/scripts/sweep-zombie-runs.mjs)',
    silentKills: killedSilent,
    visibleStageFailures: partials.length - killedSilent,
    partialsEverResumed: anyResumed,
    sweepDetectionLatencyMinutes: sweepLatencies,
    sweepNeverResumes: true, // sweep marks partial only; resume is a separate manual CLI call
  },
  p2_detachedExecution: {
    claim: 'research start prints runId at creation then executes in-process; host reaping kills the worker mid-run with no supervisor to re-launch',
    partialsKilledMidStage: forensics.filter((f) => f.deathMode.startsWith('KILLED')),
    note: 'these runs required a FRESH run to redo work (see everResumed=0) unless manually resumed',
  },
  p3_resumeGranularity: {
    claim: 'checkpoint unit = stage (run row); StageRecord.checkpointRef is declared in src/domain/run.ts:31 but has zero users in src/ or tests/',
    perStageModelCalls: Object.fromEntries(
      Object.entries(stageStats).map(([st, v]) => [st, { calls: v.calls, meanCallsPerRun: +(v.calls / v.runs.size).toFixed(1), runs: v.runs.size }])
    ),
    completedRunWallClockMin: { n: runDurations.length, p50: +p(runDurations, 0.5).toFixed(1), max: +runDurations[runDurations.length - 1].toFixed(1) },
  },
  forensicDetail: forensics,
};

if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`totals: ${runs.length} runs = ${completed.length} completed + ${partials.length} partial`);
  console.log(`\nP1 frozen-run: ${killedSilent}/${partials.length} partials died SILENT (no stage_failed event = worker killed); ${anyResumed} were ever resumed (manual)`);
  console.log(`   sweep detection latencies (min):`, sweepLatencies.map((s) => `${s.run}:${s.minutes}`).join(' ') || '(no sweep events recorded — sweeps predate event or absent)');
  console.log(`\nP2 silent-kill victims (work abandoned, fresh run redid it):`);
  for (const f of forensics.filter((x) => x.deathMode.startsWith('KILLED'))) console.log(`   ${f.run} @${f.stuckStage} with ${f.llmCallsSoFar} model-call receipts already paid`);
  console.log(`\nP3 per-stage model calls (completed runs):`);
  for (const [st, v] of Object.entries(stageStats).sort((a, b) => b[1].calls - a[1].calls)) console.log(`   ${st}: ${v.calls} calls total, ${Math.round(v.calls / v.runs.size)} mean/run, ${v.runs.size} runs`);
  console.log(`   completed wall-clock: p50=${p(runDurations, 0.5).toFixed(1)}min max=${runDurations[runDurations.length - 1].toFixed(1)}min n=${runDurations.length}`);
}
db.close();
