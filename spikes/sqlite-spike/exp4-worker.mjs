// exp4-worker: concurrent writer. Env: DB_PATH, TAG, ITERS, BUSY_MS ('' = leave default)
// Each iteration = one BEGIN IMMEDIATE ... INSERT ... COMMIT transaction.
// Emits one final JSON line: RESULT {...}
import { DatabaseSync } from 'node:sqlite';

const { DB_PATH, TAG } = process.env;
const ITERS = Number(process.env.ITERS || 300);
const busyMs = process.env.BUSY_MS || '';

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');
if (busyMs !== '') db.exec(`PRAGMA busy_timeout = ${busyMs}`);
const configured = db.prepare('PRAGMA busy_timeout').get().timeout; // result column is named "timeout"
const ins = db.prepare('INSERT INTO hits (worker, seq) VALUES (?, ?)');

let ok = 0, busy = 0, other = 0;
const samples = [];
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  try {
    db.exec('BEGIN IMMEDIATE');
    ins.run(TAG, i);
    db.exec('COMMIT');
    ok++;
  } catch (e) {
    // classify
    const code = e.errcode;
    const msg = String(e.message);
    if (code === 5 || code === 6 || /locked|busy/i.test(msg)) {
      busy++;
      if (samples.length < 3) samples.push(`errcode=${code}: ${msg.slice(0, 80)}`);
      try { db.exec('ROLLBACK'); } catch { /* nothing to undo */ }
    } else {
      other++;
      if (samples.length < 3) samples.push(`errcode=${code}: ${msg.slice(0, 80)}`);
      try { db.exec('ROLLBACK'); } catch { /* nothing to undo */ }
    }
  }
}
const elapsed = Math.round(performance.now() - t0);
db.close();
console.log('RESULT ' + JSON.stringify({ tag: TAG, iters: ITERS, ok, busy, other, configured_busy_timeout_ms: configured, elapsed_ms: elapsed, samples }));
