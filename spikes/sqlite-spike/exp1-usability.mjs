// exp1: node:sqlite availability on current Node, without any flag.
// Spawns a FRESH node child (so import-time warnings are fully captured on stderr),
// imports node:sqlite, runs an in-memory smoke query, and reports stderr verbatim.
import { spawnSync } from 'node:child_process';

const childScript = `
const m = await import('node:sqlite');
console.log('typeof DatabaseSync =', typeof m.DatabaseSync);
const db = new m.DatabaseSync(':memory:');
console.log('sqlite_version =', db.prepare('SELECT sqlite_version() AS v').get().v);
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
db.prepare('INSERT INTO t (val) VALUES (?)').run('hello-farlab');
console.log('smoke select =', JSON.stringify(db.prepare('SELECT * FROM t').all()));
db.close();
console.log('SMOKE_OK');
`;

console.log('[exp1] node:sqlite usability (no flag)');
console.log('node version :', process.version);
console.log('node execPath :', process.execPath);
console.log('command      : node --input-type=module -e "<import node:sqlite; smoke>"');

const r = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
  encoding: 'utf8',
});

console.log('exit code    :', r.status);
console.log('--- child stdout ---');
console.log(r.stdout.trim());
console.log('--- child stderr (verbatim) ---');
console.log(r.stderr.trim() || '(empty)');

const warnMatch = r.stderr.match(/.*[Ww]arning.*/g);
console.log('--- analysis ---');
console.log('warning lines detected :', warnMatch ? warnMatch.length : 0);
if (warnMatch) warnMatch.forEach((l) => console.log('  >', l.trim()));
const smokeOk = r.status === 0 && r.stdout.includes('SMOKE_OK');
console.log('smoke result           :', smokeOk ? 'PASS' : 'FAIL');

if (!smokeOk) process.exitCode = 1;
