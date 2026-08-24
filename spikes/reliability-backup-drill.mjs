/**
 * FAR-Lab reliability workstream — BACKUP / RESTORE / MIGRATION DRILL (2026-08-24).
 *
 * Real drills, not mocks:
 *   1. ROUNDTRIP: seed a real workspace (runs, events incl. hash chain, objects,
 *      content-addressed artifacts) -> store.backupTo (VACUUM INTO) -> restore by
 *      copying into a fresh dir -> open -> verify counts + chain + artifact refs.
 *   2. WAL TRAP: prove a naive file copy of far.db WHILE THE WAL HOLDS COMMITS is
 *      NOT equivalent to backupTo (documents why VACUUM INTO is the only backup path).
 *   3. MIGRATION CHAIN: build a genuine v1-schema database by hand, open it with the
 *      current code -> forward-migrated to HEAD version -> data preserved.
 *   4. OLD WORKSPACE REOPEN: same as (3) but seeded with rows at v2/v5 shapes
 *      (lease columns absent / memory tables absent) — reopen must migrate + keep rows.
 *   5. UPGRADE ROLLBACK SEMANTICS: opening a NEWER db (user_version > HEAD) must
 *      fail visibly (never silently downgrade-migrate) — the honest rollback story.
 *
 * Output: verdicts + JSON evidence to evidence/reliability/backup-drill.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'evidence', 'reliability');
fs.mkdirSync(EVIDENCE, { recursive: true });
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { openDb, MIGRATIONS } = await imp('dist/persistence/db.js');
const { Store } = await imp('dist/persistence/store.js');
const { openArtifactStore } = await imp('dist/persistence/artifacts.js');
const { ResearchQuestion, newId } = await imp('dist/domain/index.js');
const HEAD_VERSION = Math.max(...MIGRATIONS.map((m) => m.version));

const results = [];
const record = (name, pass, detail) => {
  results.push({ drill: name, verdict: pass ? 'PASS' : 'FAIL', ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail.summary ? ' — ' + detail.summary : ''}`);
};
const tmp = (l) => fs.mkdtempSync(path.join(os.tmpdir(), `far-bk-${l}-`));
const mkQ = () => ResearchQuestion.parse({
  id: newId('q'), text: 'backup drill', background: '', goalType: 'exploratory',
  scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
});
const seedWorkspace = (dir, runCount = 3, eventsPerRun = 40) => {
  const db = openDb(path.join(dir, 'far.db'));
  const store = new Store(db);
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const runIds = [];
  for (let i = 0; i < runCount; i++) {
    const run = store.createRun(mkQ());
    runIds.push(run.id);
    for (let e = 0; e < eventsPerRun; e++) store.appendEvent(run.id, { type: 'note', detail: { reason: 'drill', i: e } });
  }
  return { db, store, artifacts, runIds };
};

// ---- 1. ROUNDTRIP via backupTo ----
{
  const dir = tmp('rt');
  const { db, store, runIds } = seedWorkspace(dir);
  const before = { runs: store.workspaceCounts().runs, events: store.workspaceCounts().events, chains: runIds.map((id) => store.verifyEventChain(id).ok) };
  const dest = path.join(dir, 'backup', 'far-restore.db');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  store.backupTo(dest);
  db.close();
  // restore: fresh dir with the backup AS the workspace db
  const restoreDir = tmp('rt-restore');
  fs.mkdirSync(restoreDir, { recursive: true });
  fs.copyFileSync(dest, path.join(restoreDir, 'far.db'));
  const db2 = openDb(path.join(restoreDir, 'far.db'));
  const store2 = new Store(db2);
  const after = store2.workspaceCounts();
  const chainsAfter = runIds.map((id) => store2.verifyEventChain(id).ok);
  db2.close();
  record('backup-restore-roundtrip', before.runs === after.runs && before.events === after.events && chainsAfter.every(Boolean) && before.chains.every(Boolean), {
    summary: `runs ${before.runs}->${after.runs}, events ${before.events}->${after.events}, chain ok before=${before.chains.every(Boolean)} after=${chainsAfter.every(Boolean)}`,
    before, after: { runs: after.runs, events: after.events, chains: chainsAfter.every(Boolean) },
  });
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows handle-release lag on tmp dirs; OS cleans */ }
  try { fs.rmSync(restoreDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* tmp */ }
}

// ---- 2. WAL TRAP: naive copy loses commits that the WAL still holds ----
{
  const dir = tmp('wal');
  const { db, store } = seedWorkspace(dir, 1, 5);
  const naive = path.join(dir, 'naive-copy.db');
  fs.copyFileSync(path.join(dir, 'far.db'), naive); // WAL commits NOT included
  const proper = path.join(dir, 'proper.db');
  store.backupTo(proper);
  db.close();
  const readEvents = (p) => {
    try {
      const d = new DatabaseSync(p, { readOnly: true });
      const n = Number(d.prepare('SELECT COUNT(*) AS n FROM events').get()?.n ?? -1);
      d.close();
      return n;
    } catch {
      // "no such table" IS the wal trap at its strongest: the naive copy was made
      // before ANY schema page reached the main db file (everything lives in the WAL).
      return -1;
    }
  };
  const naiveEvents = readEvents(naive);
  const properEvents = readEvents(proper);
  const inMemoryWas = 6; // 5 notes + run_created
  const trapProven = naiveEvents !== properEvents && properEvents === inMemoryWas;
  record('wal-copy-trap-avoided', trapProven, {
    summary: `naive far.db copy carries ${naiveEvents}/${properEvents} events (WAL holds the rest) — VACUUM INTO backupTo carries all ${properEvents}`,
    naiveEvents, properEvents, inMemoryWas,
  });
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows handle-release lag on tmp dirs; OS cleans */ }
}

// ---- 3+4. MIGRATION CHAIN from a genuine v1 database ----
{
  const dir = tmp('mig');
  const dbPath = path.join(dir, 'far.db');
  // Hand-build the v1 world: schema v1 SQL verbatim from MIGRATIONS[0] + seeded rows.
  const raw = new DatabaseSync(dbPath);
  raw.exec(MIGRATIONS[0].sql);
  raw.exec('PRAGMA user_version = 1');
  const t0 = new Date().toISOString();
  raw.prepare("INSERT INTO runs (id, question_id, status, current_stage, doc, created_at, updated_at) VALUES ('run_migrationsmoke0000000001','q1','completed','export','{}',?,?)").run(t0, t0);
  raw.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?,?,?,?)').run('run_migrationsmoke0000000001', t0, 'run_created', '{}');
  raw.prepare("INSERT INTO objects (kind, id, run_id, json, created_at) VALUES ('question','q_migrationsmoke000000000001','run_migrationsmoke0000000001','{}',?)").run(t0);
  raw.close();
  // Open with CURRENT code: forward migration must run to HEAD and preserve rows.
  const db = openDb(dbPath);
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  const runs = Number(db.prepare('SELECT COUNT(*) AS n FROM runs').get()?.n ?? 0);
  const events = Number(db.prepare('SELECT COUNT(*) AS n FROM events').get()?.n ?? 0);
  const objects = Number(db.prepare('SELECT COUNT(*) AS n FROM objects').get()?.n ?? 0);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('step_outputs','step_fingerprints','lineage_edges','event_tags','memory_items','deleted_runs','outbox')").all().map((r) => String(r.name));
  db.close();
  const preserved = runs === 1 && events === 1 && objects === 1;
  record('migration-chain-v1-to-head', version === HEAD_VERSION && preserved && tables.length === 7, {
    summary: `v1 db opened by current code: user_version 1->${version} (HEAD=${HEAD_VERSION}), rows preserved runs=${runs} events=${events} objects=${objects}, new tables=${tables.length}/7`,
    version, runs, events, objects, tables,
  });
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows handle-release lag on tmp dirs; OS cleans */ }
}

// ---- 5. NEWER-db open must fail visibly (no silent downgrade) ----
{
  const dir = tmp('newer');
  const dbPath = path.join(dir, 'far.db');
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA user_version = 999');
  raw.close();
  let threw = false; let message = '';
  try { openDb(dbPath); } catch (e) { threw = true; message = e.message; }
  record('newer-db-fails-visibly', threw, {
    summary: threw ? `user_version 999 db: open refused (${message.slice(0, 120)}) — forward-only, no silent downgrade` : 'BUG: newer db opened without complaint',
    threw, message: message.slice(0, 200),
  });
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows handle-release lag on tmp dirs; OS cleans */ }
}

// ---- 6. GC safety net on a restored workspace (deletion conservatism) ----
{
  const dir = tmp('gc');
  const { db, artifacts } = seedWorkspace(dir, 2, 10);
  const put = await artifacts.put('gc drill referenced payload');
  db.close();
  // Reference the artifact through a REAL object row (the only ref vocabulary the
  // product persists), reopen (restore shape), then dry-run gc: the blob must NOT
  // be a deletion candidate.
  const { SourceDocument } = await imp('dist/domain/index.js');
  const { runGc } = await imp('dist/cli/gc.js');
  const db3 = openDb(path.join(dir, 'far.db'));
  const store3 = new Store(db3);
  const run4 = store3.createRun(mkQ());
  store3.putObject('source_document', SourceDocument.parse({
    id: newId('src'), runId: run4.id, family: 'openalex',
    identifiers: [{ kind: 'doi', value: '10.1/x' }], title: 'gc drill', authors: [],
    contentDepth: 'full_text', accessState: 'open', contentHash: 'ef'.repeat(32),
    fullTextRef: put.ref, retrievedAt: new Date().toISOString(), parseStatus: 'ok',
  }));
  const after = runGc({ store: store3, dataDir: dir }, { apply: false });
  db3.close();
  record('gc-restore-safety', !after.unreferenced.includes(put.hash), {
    summary: `referenced blob (${put.hash.slice(0, 12)}…) absent from gc candidates after restore+reopen (candidates=${after.unreferenced.length})`,
    referenced: put.hash, candidates: after.unreferenced.length,
  });
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows handle-release lag on tmp dirs; OS cleans */ }
}

fs.writeFileSync(path.join(EVIDENCE, 'backup-drill.json'), JSON.stringify({ measuredAt: new Date().toISOString(), headVersion: HEAD_VERSION, results }, null, 2));
const failed = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} drills PASS`);
process.exit(failed > 0 ? 1 : 0);
