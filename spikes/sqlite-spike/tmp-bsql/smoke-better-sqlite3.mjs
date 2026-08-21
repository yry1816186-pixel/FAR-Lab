
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
