/**
 * Route A bridge spike driver (S7): drives the scientific runtime sidecar from
 * Node-style orchestration the way src/experiment/executor.ts drives the EEL
 * sidecar -- spawn, JSON-lines request/response, structured error handling.
 *
 * Real-path verification: this script spawns the ACTUAL sidecar process and reads
 * the REAL far.db. No mocks. Evidence goes to spikes/avo-runtime/output/.
 *
 * Usage: node spikes/avo-runtime/driver.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDECAR = resolve(process.cwd(), 'spikes/avo-runtime/scientific_runtime.py');
const DB = resolve(process.cwd(), '.far-run/far.db');
const OUT_DIR = resolve(process.cwd(), 'spikes/avo-runtime/output');
mkdirSync(OUT_DIR, { recursive: true });

const RUNS = {
  completed: 'run_jpktce50q7wqc68rkg64ztm3me',
  partial: 'run_bbgtvep5bwdy26n0kvxkw0epvn',
};

const child = spawn('python', [SIDECAR], { stdio: ['pipe', 'pipe', 'pipe'] });
let nextId = 1;
const pending = new Map();
let buf = '';

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { child.kill(); throw new Error(`unparsable sidecar line: ${line.slice(0,120)}`); }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
child.stderr.on('data', (c) => process.stderr.write(`[sidecar stderr] ${c}`));

function call(op, payload) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, (msg) => msg.ok ? res(msg.result) : rej(new Error(`${op}: ${msg.error?.message}`)));
    child.stdin.write(JSON.stringify({ id, op, payload }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`${op}: timeout`)); } }, 30_000);
  });
}

const report = { startedAt: new Date().toISOString(), protocol: [], verdicts: {} };
try {
  // T1 protocol liveness
  const ping = await call('ping', {});
  report.protocol.push({ t: 'ping', ok: ping.ok === true, runtime: ping.runtime });
  report.verdicts.T1_protocol = ping.ok === true ? 'PASS' : 'FAIL';

  // T2 real-run inspection (completed run)
  const s1 = await call('inspect_run', { dbPath: DB, runId: RUNS.completed });
  report.protocol.push({
    t: 'inspect_run/completed',
    question: s1.questionText.slice(0, 80),
    hypotheses: s1.hypothesisCount,
    evidence: s1.evidenceByRelation,
    specs: s1.experimentSpecs,
  });
  report.verdicts.T2_inspect_completed =
    s1.hypothesisCount > 0 && s1.run.current_stage === 'export' ? 'PASS' : 'FAIL';

  // T3 real-run inspection (partial run) + agentic-choice probe on BOTH runs:
  // the two runs must produce DIFFERENT next actions given their different states.
  const a1 = await call('plan_next_action', { dbPath: DB, runId: RUNS.completed });
  const s2 = await call('inspect_run', { dbPath: DB, runId: RUNS.partial });
  const a2 = await call('plan_next_action', { dbPath: DB, runId: RUNS.partial });
  report.protocol.push({
    t: 'plan_next_action/divergence',
    completedRunAction: a1.nextAction.action,
    partialRunAction: a2.nextAction.action,
    partialEvidence: s2.evidenceByRelation,
  });
  report.verdicts.T3_state_dependent_choice =
    a1.nextAction.action !== a2.nextAction.action ? 'PASS' : 'FAIL';

  // T4 failure paths are visible and structured (no silent swallow)
  try {
    await call('inspect_run', { dbPath: DB, runId: 'does_not_exist' });
    report.verdicts.T4_fail_visible = 'FAIL (error not raised)';
  } catch (e) {
    report.verdicts.T4_fail_visible = /run not found/.test(e.message) ? 'PASS' : `FAIL (${e.message})`;
  }
} finally {
  child.kill();
}
report.finishedAt = new Date().toISOString();

// Honest overall verdict
const vs = Object.values(report.verdicts);
report.overall = vs.every((v) => v === 'PASS') ? 'ALL PASS' : `${vs.filter(v=>v!=='PASS').length} FAILURE(S)`;

const outFile = resolve(OUT_DIR, 'route-a-bridge.json');
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.verdicts, null, 1));
console.log('overall:', report.overall);
console.log('evidence:', outFile);
process.exit(report.overall === 'ALL PASS' ? 0 : 1);
