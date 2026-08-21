// exp2: transaction semantics of node:sqlite DatabaseSync.
// Phase A (default journal mode): ROLLBACK discards, COMMIT persists,
//   mid-txn SQL error + explicit ROLLBACK discards, close-without-commit discards (implicit rollback),
//   committed data survives reopen.
// Phase B (WAL): switch via PRAGMA journal_mode=WAL, rerun the same assertions,
//   verify -wal/-shm sidecar files while open and post-close checkpoint behavior.
import { DatabaseSync } from 'node:sqlite';
import { rmSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(dir, 'data');
mkdirSync(dataDir, { recursive: true }); // SQLite does NOT create parent dirs
const dbPath = join(dataDir, 'exp2.db');

let failures = 0;
const check = (name, cond, detail = '') => {
  const s = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${s}] ${name}${detail ? ' | ' + detail : ''}`);
};
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM runs').get().n;
const sidecars = () =>
  readdirSync(dataDir).filter((f) => f.startsWith('exp2.db')).join(', ');

// clean slate
rmSync(dbPath, { force: true });
rmSync(dbPath + '-wal', { force: true });
rmSync(dbPath + '-shm', { force: true });
rmSync(dbPath + '-journal', { force: true });

console.log('[exp2] transaction semantics, db =', dbPath);

// ---------- Phase A: default journal mode ----------
{
  const db = new DatabaseSync(dbPath);
  const mode = db.prepare('PRAGMA journal_mode').get().journal_mode;
  console.log('\n-- Phase A: default journal mode =', mode, '--');
  check('integrity_check (fresh)', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
  db.exec('CREATE TABLE runs (id INTEGER PRIMARY KEY, tag TEXT NOT NULL UNIQUE)');

  // A1: ROLLBACK discards
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a1');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a2');
  db.exec('ROLLBACK');
  check('A1 rollback discards', count(db) === 0, `count=${count(db)}`);

  // A2: COMMIT persists
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a3');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a4');
  db.exec('COMMIT');
  check('A2 commit persists', count(db) === 2, `count=${count(db)}`);

  // A3: mid-txn SQL error, explicit ROLLBACK -> nothing extra persisted
  let threw = '';
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a5');
  try {
    db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a3'); // UNIQUE violation
  } catch (e) {
    threw = `${e.code ?? ''} ${e.message}`;
  }
  db.exec('ROLLBACK');
  check('A3a mid-txn constraint error throws', threw.includes('UNIQUE'), threw.slice(0, 90));
  check('A3b rollback after error discards', count(db) === 2, `count=${count(db)}`);

  // A4: close without COMMIT -> implicit rollback of open txn
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('a6-leaked');
  db.close();
  const db2 = new DatabaseSync(dbPath);
  check('A4 close-without-commit rolls back', count(db2) === 2, `count=${count(db2)}`);
  check('A4b committed rows survive reopen', db2.prepare("SELECT COUNT(*) AS n FROM runs WHERE tag IN ('a3','a4')").get().n === 2);
  check('A4c integrity_check (post-reopen)', db2.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
  db2.close();
  console.log('  sidecar files after close (Phase A):', sidecars() || '(none)');
}

// ---------- Phase B: WAL mode ----------
{
  const db = new DatabaseSync(dbPath);
  const switched = db.prepare('PRAGMA journal_mode=WAL').get().journal_mode;
  console.log('\n-- Phase B: PRAGMA journal_mode=WAL ->', switched, '--');
  check('B0 journal mode switches to wal', switched === 'wal');

  // B1: ROLLBACK under WAL
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('b1');
  db.exec('ROLLBACK');
  check('B1 rollback under WAL discards', count(db) === 2, `count=${count(db)}`);

  // B2: COMMIT under WAL + sidecar files visible while connection open
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('b2');
  db.exec('COMMIT');
  check('B2 commit under WAL persists', count(db) === 3, `count=${count(db)}`);
  console.log('  sidecar files while open       :', sidecars());

  // B3: mid-txn error under WAL
  let threw = '';
  db.exec('BEGIN');
  db.prepare('INSERT INTO runs (tag) VALUES (?)').run('b3');
  try {
    db.prepare('INSERT INTO runs (tag) VALUES (?)').run('b2'); // UNIQUE violation
  } catch (e) {
    threw = `${e.code ?? ''} ${e.message}`;
  }
  db.exec('ROLLBACK');
  check('B3 rollback after mid-txn error', count(db) === 3 && threw.includes('UNIQUE'), `count=${count(db)}; err=${threw.slice(0, 60)}`);

  check('B4 integrity_check under WAL', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');

  // B5: WAL persists across connections, auto-checkpoint on last close
  db.close();
  const db3 = new DatabaseSync(dbPath);
  check('B5 mode + data survive reopen', db3.prepare('PRAGMA journal_mode').get().journal_mode === 'wal' && count(db3) === 3, `mode=${db3.prepare('PRAGMA journal_mode').get().journal_mode}, count=${count(db3)}`);
  db3.close();
  console.log('  sidecar files after last close :', sidecars());
}

console.log('\n[exp2] result:', failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
if (failures > 0) process.exitCode = 1;
