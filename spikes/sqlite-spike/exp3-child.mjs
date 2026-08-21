// exp3-child: victim process. Killed by parent mid-transaction.
// Env: DB_PATH, BASELINE_ROWS, MODE (wal|delete)
// Protocol on stdout (line-buffered JSON events):
//   BASELINE_COMMITTED <n>  -> setup done, committed baseline rows
//   IN_TXN                  -> BEGIN executed, 1 uncommitted row inserted
//   PROGRESS <rows>         -> more uncommitted rows streaming
//   COMMITTED_BAD           -> only if parent failed to kill us in time (test failure)
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DB_PATH;
const baseline = Number(process.env.BASELINE_ROWS || 5);
const mode = process.env.MODE || 'wal';

const db = new DatabaseSync(dbPath);
if (mode === 'wal') {
  const got = db.prepare('PRAGMA journal_mode=WAL').get().journal_mode;
  console.log(`MODE_SET ${got}`);
}
db.exec('CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, seq INTEGER, source TEXT)');

// 1) committed baseline
db.exec('BEGIN');
const ins = db.prepare('INSERT INTO runs (seq, source) VALUES (?, ?)');
for (let i = 0; i < baseline; i++) ins.run(i, 'baseline');
db.exec('COMMIT');
console.log(`BASELINE_COMMITTED ${baseline}`);

// 2) long uncommitted transaction, then wait forever so the kill lands mid-txn
db.exec('BEGIN');
ins.run(1_000_000, 'txn-should-vanish');
console.log('IN_TXN');
let n = 0;
while (n < 500) {
  for (let i = 0; i < 1000; i++) ins.run(1_000_001 + n * 1000 + i, 'txn-should-vanish');
  n++;
  console.log(`PROGRESS ${n * 1000}`);
}
console.log('LOOP_DONE_WAITING');
await new Promise((r) => setTimeout(r, 60_000));
db.exec('COMMIT');
console.log('COMMITTED_BAD');
