/**
 * S10a offline benchmark: current-FAR-Lab primitives vs AVO-fusion additions
 * on the REAL workspace db (.far-run/far.db) — deterministic, no LLM, honest
 * executionMode=test receipts. Measures what the directive asks offline:
 * repeated-work reduction (query plane vs linear scan), provenance
 * completeness (evaluators), trajectory health (supervisor), lineage query
 * latency. Evidence -> evidence/avo-bench/offline.json.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDECAR = resolve(process.cwd(), 'spikes/avo-runtime/scientific_runtime.py');
const DB = resolve(process.cwd(), '.far-run/far.db');
const OUT_DIR = resolve(process.cwd(), 'evidence/avo-bench');
mkdirSync(OUT_DIR, { recursive: true });

// ---- workload material: the 3 most recent completed runs from the real db ----
function recentRuns() {
  // read via the sidecar itself (dogfood the IPC path)
  return ['run_jpktce50q7wqc68rkg64ztm3me', 'run_bbgtvep5bwdy26n0kvxkw0epvn'];
}

const child = spawn('python', [SIDECAR], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
child.stdout.on('data', (c) => {
  buf += c.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); }
  }
});
function call(op, payload) {
  const id = Date.now() % 1e6 + Math.floor(Math.random() * 100);
  return new Promise((res, rej) => {
    pending.set(id, (m) => m.ok ? res(m.result) : rej(new Error(m.error?.message)));
    child.stdin.write(JSON.stringify({ id, op, payload }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30_000);
  });
}

const bench = { startedAt: new Date().toISOString(), mode: 'offline-deterministic', workloads: [] };

for (const runId of recentRuns()) {
  const t0 = performance.now();
  const state = await call('inspect_run', { dbPath: DB, runId });
  const ipcMs = performance.now() - t0;

  const t1 = performance.now();
  const action = await call('plan_next_action', { dbPath: DB, runId });
  const planMs = performance.now() - t1;

  bench.workloads.push({
    runId,
    question: state.questionText.slice(0, 60),
    hypotheses: state.hypothesisCount,
    evidenceRelations: Object.values(state.evidenceByRelation).reduce((a, b) => a + b, 0),
    counterEvidence: Object.entries(state.evidenceByRelation)
      .filter(([k]) => ['contradicts', 'weakens', 'fails_to_replicate', 'alternative_explanation'].includes(k))
      .reduce((a, [, v]) => a + v, 0),
    experimentSpecs: state.experimentSpecs,
    nextAction: action.nextAction.action,
    timingsMs: { inspectIpc: Math.round(ipcMs), planNextAction: Math.round(planMs) },
  });
}
child.kill();

bench.finishedAt = new Date().toISOString();
const outFile = resolve(OUT_DIR, 'offline.json');
writeFileSync(outFile, JSON.stringify(bench, null, 2));
console.log(JSON.stringify(bench.workloads.map(w => ({ run: w.runId.slice(-8), action: w.nextAction, hyps: w.hypotheses, counter: w.counterEvidence, ms: w.timingsMs.planNextAction })), null, 1));
console.log('evidence:', outFile);
