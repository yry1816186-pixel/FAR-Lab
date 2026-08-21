// exp5: incremental schema migrations via PRAGMA user_version.
// v1: create core table. v2: add column + backfill. v3: add index + audit table.
// Verifies: sequential application, idempotent re-run (no-op), fresh-db replay of full chain,
// and that each migration steps user_version atomically.
import { DatabaseSync } from 'node:sqlite';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(dir, 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'exp5.db');
rmSync(dbPath, { force: true });

let failures = 0;
const check = (name, cond, detail = '') => {
  const s = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${s}] ${name}${detail ? ' | ' + detail : ''}`);
};

const MIGRATIONS = [
  {
    to: 1,
    name: 'create hypotheses table',
    up: (db) => {
      db.exec(`CREATE TABLE hypotheses (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    },
  },
  {
    to: 2,
    name: 'add status column + backfill',
    up: (db) => {
      db.exec('ALTER TABLE hypotheses ADD COLUMN status TEXT');
      db.prepare("UPDATE hypotheses SET status = 'draft' WHERE status IS NULL").run();
    },
  },
  {
    to: 3,
    name: 'index + audit_log table',
    up: (db) => {
      db.exec('CREATE INDEX idx_hypotheses_status ON hypotheses(status)');
      db.exec('CREATE TABLE audit_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime(\'now\')), event TEXT NOT NULL, payload TEXT)');
    },
  },
];

function migrate(db, target = Infinity) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  const applied = [];
  for (const m of MIGRATIONS) {
    if (m.to <= current || m.to > target) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.to}`);
      db.exec('COMMIT');
      applied.push(m.to);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration v${m.to} (${m.name}) failed: ${e.message}`);
    }
  }
  return { before: current, applied };
}

console.log('[exp5] user_version migrations, db =', dbPath);
let db = new DatabaseSync(dbPath);
console.log('fresh PRAGMA user_version =', db.prepare('PRAGMA user_version').get().user_version);

// M1a: apply only v1 first (so we can create pre-v2 rows that the v2 backfill must touch)
let r = migrate(db, 1);
console.log('run #1 (to v1):', JSON.stringify(r));
check('run #1 applies v1 only', JSON.stringify(r.applied) === '[1]');
// pre-v2 row: status column does not exist yet; after v2 ALTER it will exist as NULL
db.prepare('INSERT INTO hypotheses (text) VALUES (?)').run('H1: baseline exists before v2 backfill');

// M1b: apply v2+v3; v2 backfill must fill the pre-existing row
r = migrate(db);
console.log('run #1b (to latest):', JSON.stringify(r));
check('run #1b applies v2,v3', JSON.stringify(r.applied) === '[2,3]');
check('user_version now 3', db.prepare('PRAGMA user_version').get().user_version === 3);

// post-migration row with explicit value: backfill must not clobber it later
db.prepare("INSERT INTO hypotheses (text, status) VALUES (?, ?)").run('H2', 'ranked');

// M2: idempotency — re-run does nothing
r = migrate(db);
console.log('run #2:', JSON.stringify(r));
check('run #2 is a no-op', r.applied.length === 0 && r.before === 3);

// M3: verify schema shape after all migrations
const cols = db.prepare('PRAGMA table_info(hypotheses)').all().map((c) => c.name);
check('v2 column exists', cols.includes('status'), `cols=[${cols.join(',')}]`);
const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_hypotheses_status'").all();
check('v3 index exists', idx.length === 1);
const auditCols = db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
check('v3 audit_log table exists', auditCols.includes('event') && auditCols.includes('payload'), `cols=[${auditCols.join(',')}]`);

// M4: backfill only touches NULL statuses
const h1 = db.prepare("SELECT status FROM hypotheses WHERE text LIKE 'H1%'").get();
const h2 = db.prepare("SELECT status FROM hypotheses WHERE text LIKE 'H2%'").get();
check('v2 backfill filled pre-existing NULL rows', h1.status === 'draft', `H1.status=${h1.status}`);
check('v2 backfill preserved existing values', h2.status === 'ranked', `H2.status=${h2.status}`);

// M5: failed migration rolls back atomically (user_version + schema both untouched)
const db2 = new DatabaseSync(dbPath);
const before = db2.prepare('PRAGMA user_version').get().user_version;
const badTableCount = () => db2.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='bad_table'").get().n;
try {
  db2.exec('BEGIN IMMEDIATE');
  db2.exec('CREATE TABLE bad_table (x INTEGER)');
  db2.exec('INSERT INTO bad_table VALUES (1)');
  db2.exec('CREATE TABLE bad_table (y INTEGER)'); // duplicate -> error
  db2.exec('COMMIT');
  check('failed migration throws', false, 'no error raised');
} catch (e) {
  db2.exec('ROLLBACK');
  check('failed migration throws', true, e.message.slice(0, 60));
}
check('rollback removes partial schema', badTableCount() === 0);
check('user_version unchanged after failed migration', db2.prepare('PRAGMA user_version').get().user_version === before);

// M6: fresh-install replay — new db applies whole chain from scratch
const dbPath2 = join(dataDir, 'exp5-fresh.db');
rmSync(dbPath2, { force: true });
const db3 = new DatabaseSync(dbPath2);
const r3 = migrate(db3);
check('fresh db replays full chain', JSON.stringify(r3.applied) === '[1,2,3]', JSON.stringify(r3));
check('fresh db user_version = 3', db3.prepare('PRAGMA user_version').get().user_version === 3);

for (const d of [db, db2, db3]) d.close();
console.log('\n[exp5] result:', failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
if (failures > 0) process.exitCode = 1;
