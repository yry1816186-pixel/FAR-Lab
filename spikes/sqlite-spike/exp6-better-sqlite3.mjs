// exp6: better-sqlite3 control experiment in an ISOLATED dir (spikes/sqlite-spike/tmp-bsql).
// Steps: npm init -y -> timed `npm install better-sqlite3` -> measure node_modules size ->
// run CRUD + transaction + WAL smoke against better-sqlite3 under Node 24.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const tmp = join(dir, 'tmp-bsql');
console.log('[exp6] better-sqlite3 isolated install + smoke, dir =', tmp);

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: tmp, encoding: 'utf8', shell: true, ...opts });
  return r;
};

// 1) npm init -y
let r = run('npm', ['init', '-y']);
console.log('\n-- npm init -y --');
console.log('exit code:', r.status);
if (r.stderr.trim()) console.log('stderr:', r.stderr.trim().slice(0, 400));

// 2) timed install
console.log('\n-- npm install better-sqlite3 (timed) --');
const t0 = performance.now();
r = run('npm', ['install', 'better-sqlite3', '--no-audit', '--no-fund']);
const installSec = ((performance.now() - t0) / 1000).toFixed(1);
const out = (r.stdout || '') + (r.stderr || '');
writeFileSync(join(tmp, 'install-full.log'), out);
console.log('exit code :', r.status);
console.log('duration  :', installSec + 's');
const interesting = out.split(/\r?\n/).filter((l) => /added|prebuild|prebuild-install|node-gyp|falling back|build|error|warn|MSBuild|visual studio/i.test(l));
console.log('-- key install output lines --');
interesting.slice(0, 25).forEach((l) => console.log('  ' + l.trim()));
if (interesting.length > 25) console.log(`  ... (+${interesting.length - 25} more, full log: tmp-bsql/install-full.log)`);
if (r.status !== 0) {
  console.log('-- FAILED, first 30 lines of output --');
  out.split(/\r?\n/).slice(0, 30).forEach((l) => console.log('  ' + l));
  process.exit(1);
}

// 3) measure size
const dirSize = (p) => {
  let total = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const fp = join(p, e.name);
    total += e.isDirectory() ? dirSize(fp) : statSync(fp).size;
  }
  return total;
};
const nmPath = join(tmp, 'node_modules');
const sizeMb = existsSync(nmPath) ? (dirSize(nmPath) / 1024 / 1024).toFixed(1) : 'n/a';
console.log('\nnode_modules size:', sizeMb + ' MB');

// 4) smoke script
const smoke = `
const Database = (await import('better-sqlite3')).default;
const ver = (await import('better-sqlite3/package.json', { with: { type: 'json' } })).default.version;
const db = new Database('smoke.db');
console.log('better-sqlite3 version :', ver);
console.log('sqlite_version         :', db.prepare('SELECT sqlite_version() AS v').get().v);
console.log('WAL switch             :', db.pragma('journal_mode = WAL').journal_mode ?? db.pragma('journal_mode = WAL'));
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL UNIQUE)');
const ins = db.prepare('INSERT INTO t (v) VALUES (?)');
const insertTwo = db.transaction((a, b) => { ins.run(a); ins.run(b); });
insertTwo('x1', 'x2');
console.log('after committed txn    : count=' + db.prepare('SELECT COUNT(*) n FROM t').get().n);
try {
  db.transaction(() => { ins.run('x3'); ins.run('x1'); })(); // UNIQUE violation -> auto rollback
} catch (e) {
  console.log('mid-txn error          :', e.code, String(e.message).slice(0, 60));
}
console.log('after failed txn       : count=' + db.prepare('SELECT COUNT(*) n FROM t').get().n);
console.log('integrity_check        :', db.pragma('integrity_check'));
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log('SMOKE_OK');
`;
writeFileSync(join(tmp, 'smoke-better-sqlite3.mjs'), smoke);
console.log('\n-- node smoke-better-sqlite3.mjs --');
r = spawnSync(process.execPath, ['smoke-better-sqlite3.mjs'], { cwd: tmp, encoding: 'utf8' });
console.log('exit code:', r.status);
console.log('-- stdout --');
console.log((r.stdout || '').trim());
if (r.stderr.trim()) {
  console.log('-- stderr (first 15 lines) --');
  r.stderr.split(/\r?\n/).slice(0, 15).forEach((l) => console.log('  ' + l));
}
process.exitCode = r.status === 0 && r.stdout.includes('SMOKE_OK') ? 0 : 1;
