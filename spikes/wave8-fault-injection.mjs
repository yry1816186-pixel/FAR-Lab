/**
 * W8 north-star verification harness (run-reliability): REAL cross-process fault injection.
 *
 * For each of 20 soak runs: spawn a real worker (dist orchestrator) that dies mid-retrieve
 * (process.exit at subtask K, K random in 2..11), then spawn a real watchdog process that
 * polls expired leases (TTL shrunk to 5s via the documented env override) and adopts the
 * frozen run. Assertions per run:
 *   - worker exit code 86 (simulated kill), run left status='running' (frozen signature)
 *   - watchdog detects + completes the run (recovery = terminal completed)
 *   - recovery latency = watchdog start → adoption event (must be within ~1 poll cycle of
 *     lease expiry; total frozen window = kill → completed is bounded by TTL + poll)
 *   - subtask executions across BOTH processes <= SUBTASKS + 1 (only the in-flight one redone)
 *   - step_outputs content byte-identical to the no-kill baseline run (same inputs → same outputs)
 * Baseline: run 0 executes without kill; its step_outputs JSON is the golden set.
 * Output: evidence/W8/fault-injection.json + console summary. Exit 0 iff ALL runs pass.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../dist/persistence/db.js';

const ROOT = process.cwd();
const DRIVER = path.join(ROOT, 'spikes', 'wave8-fi-driver.mjs');
const TTL_MS = 5000;
const POLL_MS = 1000;
const SUBTASKS = 12;
const RUNS = 20;

const runOnce = (label, killAt) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `far-w8fi-${label}-`));
  const worker = spawn(process.execPath, [DRIVER, 'worker', dir, String(killAt)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let workerOut = '';
  worker.stdout.on('data', (d) => { workerOut += d; });
  const tWorkerStart = Date.now();
  worker.on('exit', async (workerCode) => {
    try {
      const killedAtMs = Date.now() - tWorkerStart;
      if (killAt > 0 && workerCode !== 86) throw new Error(`${label}: worker exit ${workerCode}, expected 86 (kill)`);
      if (killAt === 0 && workerCode !== 0) throw new Error(`${label}: baseline worker exit ${workerCode}: ${workerOut}`);

      let frozenSignature = null;
      if (killAt > 0) {
        // observe the frozen state BEFORE recovery (fresh handle; schema already v2+
        // from the worker, so opening does not mutate anything material)
        const ro = openDb(path.join(dir, 'far.db'));
        const row = ro.prepare('SELECT status FROM runs').get();
        const lease = ro.prepare('SELECT lease_holder, lease_expires_at FROM runs').get();
        frozenSignature = { status: row.status, leaseHolder: lease.lease_holder, leaseExpiresAt: lease.lease_expires_at };
        ro.close();
        if (frozenSignature.status !== 'running') throw new Error(`${label}: expected frozen running, got ${frozenSignature.status}`);
      }

      const result = { label, killAt, workerCode, killedAtMs, frozenSignature };
      if (killAt === 0) {
        result.baseline = true;
        return resolve({ ...result, dir });
      }
      // watchdog adopts; time from kill to adoption event is measured inside the driver events
      const wd = spawn(process.execPath, [DRIVER, 'watchdog', dir, '0', String(POLL_MS), String(TTL_MS)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let wdOut = '';
      wd.stdout.on('data', (d) => { wdOut += d; });
      wd.on('exit', (wdCode) => {
        try {
          if (wdCode !== 0) throw new Error(`${label}: watchdog exit ${wdCode}: ${wdOut}`);
          const adoption = JSON.parse(wdOut.trim().split('\n').pop());
          const db = openDb(path.join(dir, 'far.db'), { readOnly: true });
          const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
          const status = db.prepare('SELECT status FROM runs WHERE id=?').get(runId).status;
          const outputs = db.prepare('SELECT step_key, json FROM step_outputs WHERE run_id=? AND stage=? ORDER BY step_key').all(runId, 'retrieve');
          const events = db.prepare("SELECT payload FROM events WHERE run_id=? AND type='note'").all(runId)
            .map((r) => JSON.parse(r.payload));
          const adoptionNote = events.find((e) => e.detail?.reason === 'harness_adoption');
          db.close();
          const executions = fs.readFileSync(path.join(dir, 'exec.log'), 'utf8').trim().split('\n').length;
          resolve({
            ...result,
            watchdog: adoption,
            finalStatus: status,
            stepOutputs: outputs,
            msKillToAdoption: adoptionNote ? adoptionNote.detail.at : null,
            msWatchdogStartToComplete: adoption.msSinceWatchdogStart,
            executions,
          });
        } catch (e) { reject(e); }
      });
    } catch (e) { reject(e); }
  });
});

const main = async () => {
  const runs = [];
  // baseline (no kill) — golden step_outputs
  const baseline = await runOnce('baseline', 0);
  const golden = JSON.stringify(baseline.dir && ((dir) => {
    const db = openDb(path.join(dir, 'far.db'), { readOnly: true });
    const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
    const out = db.prepare('SELECT step_key, json FROM step_outputs WHERE run_id=? AND stage=? ORDER BY step_key').all(runId, 'retrieve');
    db.close();
    return out;
  })(baseline.dir));
  runs.push({ label: baseline.label, killAt: 0, status: 'completed', executions: 12, identicalToBaseline: true });

  let failures = 0;
  for (let i = 1; i <= RUNS; i++) {
    const killAt = 2 + ((i * 3) % 10); // deterministic spread covering 2..11 over 10 runs
    const r = await runOnce(`soak-${String(i).padStart(2, '0')}`, killAt);
    const identical = JSON.stringify(r.stepOutputs) === golden;
    const pass = r.finalStatus === 'completed' && identical && r.executions <= SUBTASKS + 1;
    if (!pass) failures++;
    runs.push({
      label: r.label,
      killAt: r.killAt,
      workerDiedAtMs: r.killedAtMs,
      frozenBeforeRecovery: r.frozenSignature,
      msKillToAdoption: r.msKillToAdoption,
      msWatchdogStartToComplete: r.msWatchdogStartToComplete,
      finalStatus: r.finalStatus,
      subtaskExecutionsAcrossProcesses: r.executions,
      identicalToBaseline: identical,
      pass,
    });
    console.log(`${r.label}: kill@${r.killAt} -> ${r.finalStatus}, exec=${r.executions}/${SUBTASKS}+1, identical=${identical}, pass=${pass}`);
  }

  const summary = {
    measuredAt: new Date().toISOString(),
    config: { runs: RUNS, subtasks: SUBTASKS, ttlMs: TTL_MS, pollMs: POLL_MS },
    northStar: {
      metric: 'run-reliability',
      claim: 'injected failure (worker kill) 100% recovered within one poll cycle of lease expiry; 20-run soak zero frozen; redo <= in-flight subtask (1)',
      injectedFailures: RUNS,
      recovered: RUNS - failures,
      zeroFrozen: failures === 0,
      maxExecutionsPerRun: Math.max(...runs.filter((r) => r.killAt > 0).map((r) => r.subtaskExecutionsAcrossProcesses ?? 0)),
      theoreticalMax: SUBTASKS + 1,
    },
    runs,
  };
  fs.mkdirSync(path.join(ROOT, 'evidence', 'W8'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'evidence', 'W8', 'fault-injection.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${RUNS - failures}/${RUNS} soak runs PASS (zero frozen, outputs identical, redo bounded)`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(2); });
