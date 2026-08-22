/**
 * Parent orchestrator for the ONE cost-bounded W8 LIVE fault-injection run
 * (user directive: 节省额度 — this script makes exactly 4 real structured calls
 * via the child driver and then STOPS; it is not a soak).
 * Verifies, from the scratch DB, with ZERO additional model calls:
 *   - worker died (exit 86) leaving status=running (frozen signature) + sub1 checkpointed
 *   - watchdog adopted and run reached completed
 *   - REAL-call count == 4 (exec.log lines) with sub1 NOT re-called by the adopter
 *     (cache-hit: its outputHash appears once) and sub2 re-called exactly once (in-flight redo)
 *   - persisted step_outputs content == what the calls returned (hashes match exec.log)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../dist/persistence/db.js';

const ROOT = process.cwd();
const DRIVER = path.join(ROOT, 'spikes', 'wave8-live-fi.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-w8live-'));
const TTL_NOTE = 'FARLAB_LEASE_TTL_MS=60000 (set inside driver), poll 3s';
const KILL_AT = 2;

const child = (mode) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath,
    ['-e', `import('./spikes/load-secrets-env.mjs').then(()=>import('./spikes/${path.basename(DRIVER)}'))`],
    {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, W8FI_MODE: mode, W8FI_DIR: dir, W8FI_KILLAT: mode === 'worker' ? String(KILL_AT) : '' },
    });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.on('exit', (code) => resolve({ code, out }));
  p.on('error', reject);
});

const t0 = Date.now();
const worker = await child('worker');
const workerMs = Date.now() - t0;

// frozen-state observation (fresh handle; no model calls)
const ro = openDb(path.join(dir, 'far.db'));
const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
const frozen = ro.prepare('SELECT status FROM runs WHERE id=?').get(runId);
const frozenOutputs = ro.prepare('SELECT step_key, json FROM step_outputs WHERE run_id=?').all(runId);
ro.close();

const t1 = Date.now();
const wd = await child('watchdog');
const watchdogMs = Date.now() - t1;

const db = openDb(path.join(dir, 'far.db'), { readOnly: true });
const finalStatus = db.prepare('SELECT status FROM runs WHERE id=?').get(runId).status;
const outputs = db.prepare('SELECT step_key, json FROM step_outputs WHERE run_id=? AND stage=? ORDER BY step_key').all(runId, 'retrieve');
const notes = db.prepare("SELECT payload FROM events WHERE run_id=? AND type='note'").all(runId).map((r) => JSON.parse(r.payload));
const receipts = db.prepare("SELECT json FROM objects WHERE run_id=? AND kind='receipt'").all(runId).length;
db.close();

const execLines = fs.readFileSync(path.join(dir, 'exec.log'), 'utf8').trim().split('\n');
const callsPerSub = {};
for (const line of execLines) {
  const [n] = line.split('\t');
  callsPerSub[n] = (callsPerSub[n] ?? 0) + 1;
}
// sub1 must appear exactly ONCE (worker's call, cached thereafter);
// sub2 exactly TWICE (worker's in-flight call lost to the kill + adopter redo);
// sub3 exactly ONCE (adopter only).
const pass =
  worker.code === 86 && wd.code === 0 && finalStatus === 'completed'
  && Object.keys(callsPerSub).length === 3
  && callsPerSub['1'] === 1 && callsPerSub['2'] === 2 && callsPerSub['3'] === 1
  && execLines.length === 4;

const record = {
  measuredAt: new Date().toISOString(),
  costNote: 'EXACTLY 4 real structured calls (glm-4.6 Anthropic wire, ~60 max_tokens each); zero other model usage',
  config: { subtasks: 3, killAt: KILL_AT, ttl: TTL_NOTE, pollMs: 3000 },
  worker: { exit: worker.code, wallMs: workerMs },
  frozenBeforeAdoption: { status: frozen.status, persistedStepOutputs: frozenOutputs.length, stepKeys: frozenOutputs.map((o) => o.step_key) },
  watchdog: { exit: wd.code, wallMs: watchdogMs, out: wd.out.trim() },
  finalStatus,
  realCallsPerSubtask: callsPerSub,
  totalRealCalls: execLines.length,
  persistedOutputs: outputs,
  auditNotes: notes.map((n) => n.detail?.reason),
  receipts,
  pass,
};
fs.writeFileSync(path.join(ROOT, 'evidence', 'W8', 'live-fault-injection.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify({ pass, finalStatus, callsPerSub, total: execLines.length, frozenStatus: frozen.status, frozenOutputs: frozenOutputs.length, watchdog: record.watchdog.out || `exit=${wd.code}` }, null, 1));
process.exit(pass ? 0 : 1);
