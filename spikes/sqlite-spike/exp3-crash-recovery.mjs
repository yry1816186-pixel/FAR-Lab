// exp3: crash recovery. Spawns a child that holds an OPEN transaction with
// ~uncommitted rows, hard-kills it (TerminateProcess semantics on Windows),
// then reopens the db and verifies: integrity_check, uncommitted-txn rollback,
// WAL auto-recovery, and post-crash writability.
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(dir, 'data');
mkdirSync(dataDir, { recursive: true });
const BASELINE = 5;

let failures = 0;
const check = (name, cond, detail = '') => {
  const s = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`    [${s}] ${name}${detail ? ' | ' + detail : ''}`);
};
const clean = (base) => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(base + suffix, { force: true });
};
const files = (base) =>
  readdirSync(dataDir).filter((f) => f === base.split(/[\\/]/).pop() || f.startsWith(base.split(/[\\/]/).pop() + '-'));

async function runScenario(label, mode, dbBase) {
  console.log(`\n-- Scenario: ${label} (${dbBase}) --`);
  clean(dbBase);
  const child = spawn(process.execPath, [join(dir, 'exp3-child.mjs')], {
    env: { ...process.env, DB_PATH: dbBase, MODE: mode, BASELINE_ROWS: String(BASELINE) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  createInterface({ input: child.stdout }).on('line', (l) => {
    if (l.startsWith('PROGRESS') || l === 'IN_TXN' || l.startsWith('BASELINE') || l.startsWith('MODE_SET') || l === 'LOOP_DONE_WAITING' || l === 'COMMITTED_BAD') {
      console.log(`    child> ${l}`);
    }
    if (l.startsWith('PROGRESS') && !child.killed) {
      child.kill('SIGKILL'); // Windows: TerminateProcess, no cleanup handlers
      console.log('    parent> SIGKILL sent after first PROGRESS line');
    }
  });
  child.stderr.on('data', (d) => process.stderr.write(`    child! ${d}`));

  const exit = await new Promise((res) => child.on('exit', (code, signal) => res({ code, signal })));
  console.log(`    child exit: code=${exit.code} signal=${exit.signal} killed=${child.killed}`);

  const crashedFiles = files(dbBase);
  console.log('    files present right after crash:', crashedFiles.join(', ') || '(none)');

  // reopen + verify
  const db = new DatabaseSync(dbBase);
  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
  const jmode = db.prepare('PRAGMA journal_mode').get().journal_mode;
  const n = db.prepare('SELECT COUNT(*) AS n FROM runs').get().n;
  const vanished = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE source = 'txn-should-vanish'").get().n;
  const kept = db.prepare("SELECT COUNT(*) AS n FROM runs WHERE source = 'baseline'").get().n;

  check('child was killed before COMMIT', child.killed === true, `signal=${exit.signal}`);
  check(`integrity_check = ok`, integrity === 'ok', `got=${integrity}`);
  check('uncommitted txn rolled back', vanished === 0, `txn rows=${vanished}`);
  check('committed baseline survived', kept === BASELINE, `baseline rows=${kept}/${BASELINE}`);
  if (mode === 'wal') check('journal mode still wal after recovery', jmode === 'wal', `mode=${jmode}`);

  // post-crash writability probe
  db.prepare('INSERT INTO runs (seq, source) VALUES (?, ?)').run(9_999, 'post-crash-write');
  db.close();
  const db2 = new DatabaseSync(dbBase);
  const n2 = db2.prepare("SELECT COUNT(*) AS n FROM runs WHERE source = 'post-crash-write'").get().n;
  check('db writable after recovery (insert+commit survives)', n2 === 1, `rows=${n2}`);
  check('integrity_check ok after post-crash write', db2.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
  db2.close();
  console.log('    files after clean close:', files(dbBase).join(', '));
}

console.log('[exp3] crash recovery, killing child mid-transaction');
await runScenario('WAL mode, kill mid-txn', 'wal', join(dataDir, 'exp3-wal.db'));
await runScenario('DELETE journal mode, kill mid-txn', 'delete', join(dataDir, 'exp3-del.db'));

console.log('\n[exp3] result:', failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
if (failures > 0) process.exitCode = 1;
