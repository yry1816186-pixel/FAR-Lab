// exp4: concurrent writers on one WAL db.
// Round 0: probe how busy_timeout can be configured (constructor options vs PRAGMA).
// Round A: 2 concurrent worker processes, default busy_timeout -> observe SQLITE_BUSY.
// Round B: same workload with PRAGMA busy_timeout=3000 -> expect busy errors to disappear.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(dir, 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'exp4.db');

let failures = 0;
const check = (name, cond, detail = '') => {
  const s = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${s}] ${name}${detail ? ' | ' + detail : ''}`);
};

console.log('[exp4] concurrent writers, WAL, db =', dbPath);

// ---------- Round 0: how do we set busy_timeout? ----------
console.log('\n-- Round 0: busy_timeout configuration probe --');
const probeDb = join(dataDir, 'exp4-probe.db');
rmSync(probeDb, { force: true });
{
  const d1 = new DatabaseSync(probeDb);
  console.log('  default PRAGMA busy_timeout          =', JSON.stringify(d1.prepare('PRAGMA busy_timeout').get()), '(ms; 0 = off)');
  d1.close();
  for (const opt of [{ timeout: 1234 }, { busyTimeout: 1234 }]) {
    try {
      const d = new DatabaseSync(probeDb, opt);
      const v = d.prepare('PRAGMA busy_timeout').get();
      console.log(`  constructor option ${JSON.stringify(opt)} -> PRAGMA busy_timeout = ${JSON.stringify(v)}`);
      d.close();
    } catch (e) {
      console.log(`  constructor option ${JSON.stringify(opt)} -> THROWS ${e.code ?? ''} ${e.message.slice(0, 90)}`);
    }
  }
  const d2 = new DatabaseSync(probeDb);
  d2.exec('PRAGMA busy_timeout = 2500');
  console.log('  after PRAGMA busy_timeout = 2500       ->', JSON.stringify(d2.prepare('PRAGMA busy_timeout').get()));
  d2.close();
}

// ---------- helpers ----------
function resetDb() {
  for (const s of ['', '-wal', '-shm', '-journal']) rmSync(dbPath + s, { force: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE hits (id INTEGER PRIMARY KEY, worker TEXT, seq INTEGER)');
  db.close();
}

function runWorker(tag, busyMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dir, 'exp4-worker.mjs')], {
      env: { ...process.env, DB_PATH: dbPath, TAG: tag, ITERS: '300', BUSY_MS: busyMs },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let result = null;
    createInterface({ input: child.stdout }).on('line', (l) => {
      if (l.startsWith('RESULT ')) result = JSON.parse(l.slice(7));
    });
    child.stderr.on('data', () => {});
    child.on('exit', (code) => (code === 0 && result ? resolve(result) : reject(new Error(`worker ${tag} exit=${code}`))));
  });
}

async function runRound(label, busyMs) {
  console.log(`\n-- ${label} --`);
  resetDb();
  const [a, b] = await Promise.all([runWorker('A', busyMs), runWorker('B', busyMs)]);
  for (const r of [a, b]) {
    console.log(`  worker ${r.tag}: ok=${r.ok}/${r.iters} busy_errs=${r.busy} other_errs=${r.other} busy_timeout=${r.configured_busy_timeout_ms}ms elapsed=${r.elapsed_ms}ms`);
    for (const s of r.samples) console.log(`    sample-err: ${s}`);
  }
  const db = new DatabaseSync(dbPath);
  const n = db.prepare('SELECT COUNT(*) AS n FROM hits').get().n;
  const perWorker = Object.fromEntries(db.prepare('SELECT worker, COUNT(*) AS n FROM hits GROUP BY worker').all().map((r) => [r.worker, r.n]));
  db.close();
  console.log(`  rows actually in db: ${n} (per worker: ${JSON.stringify(perWorker)})`);
  check('committed rows == sum of worker ok counts', n === a.ok + b.ok, `db=${n} vs ok=${a.ok + b.ok}`);
  return { a, b, n };
}

const roundA = await runRound('Round A: 2 concurrent writers, DEFAULT busy_timeout (off)', '');
const roundB = await runRound('Round B: 2 concurrent writers, PRAGMA busy_timeout=3000', '3000');

console.log('\n-- analysis --');
check('Round A: contention actually observed (busy errors > 0)', roundA.a.busy + roundA.b.busy > 0, `busy=${roundA.a.busy + roundA.b.busy}`);
check('Round B: busy_timeout=3000 eliminates busy errors', roundB.a.busy + roundB.b.busy === 0, `busy=${roundB.a.busy + roundB.b.busy}`);
check('Round B: no writes lost (ok counts also clean)', roundB.a.other + roundB.b.other === 0 && roundB.n === 600, `other=${roundB.a.other + roundB.b.other}`);

console.log('\n[exp4] result:', failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
if (failures > 0) process.exitCode = 1;
