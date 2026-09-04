/**
 * Orphaned-run reaper (operational hygiene, 2026-09-04): a research run stuck in
 * `running` whose executing process died leaves no lease holder and a frozen event
 * log — the dead path observed twice live (crc v4 revive, cdiff probe). Marks such
 * runs `failed` with a factual reason via the REAL Store API (event hash chain and
 * run transitions stay discipline-clean); never touches runs with recent events
 * (an active run keeps appending) and never fabricates a scientific outcome — the
 * honest terminal for an abandoned execution is a failure naming the abandonment.
 *
 * Usage: node scripts/reap-orphans.mjs [--min-stale-min N] [--dry-run]
 *   Default staleness threshold: 120 minutes since the run's last event.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { openDb } from '../dist/persistence/db.js';
import { Store } from '../dist/persistence/store.js';

const ROOT = resolve(import.meta.dirname, '..');
const DB = resolve(ROOT, '.far-run/far.db');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const idx = argv.indexOf('--min-stale-min');
const MIN_STALE = idx >= 0 ? Number(argv[idx + 1]) : 120;
if (!Number.isFinite(MIN_STALE) || MIN_STALE < 10) {
  console.error('FATAL: --min-stale-min must be >= 10 (safety floor)');
  process.exit(2);
}

// read-only pass first (staleness never observed through the writable handle)
const ro = new DatabaseSync(DB, { readOnly: true });
const rows = ro.prepare("SELECT id, doc FROM runs WHERE status IN ('running','created')").all();
const now = Date.now();
const stale = [];
for (const r of rows) {
  const last = ro.prepare('SELECT at FROM events WHERE run_id=? ORDER BY seq DESC LIMIT 1').get(r.id);
  const lastAt = last?.at === null || last?.at === undefined ? null : Date.parse(last.at);
  const staleMin = lastAt === null || Number.isNaN(lastAt) ? Infinity : (now - lastAt) / 60_000;
  if (staleMin >= MIN_STALE) stale.push({ id: r.id, staleMin: Math.round(staleMin), doc: JSON.parse(r.doc) });
}
ro.close();
for (const s of stale) console.log(`[reap] ${s.id}: stale ${s.staleMin} min -> failed${DRY ? ' (dry-run)' : ''}`);
console.log(`[reap] ${stale.length} of ${rows.length} running/created run(s) beyond the ${MIN_STALE}-min staleness floor`);
if (DRY || stale.length === 0) process.exit(0);

const store = new Store(openDb(DB));
for (const s of stale) {
  const doc = store.getRun(s.id);
  if (doc === null || (doc.status !== 'running' && doc.status !== 'created')) continue; // raced terminal — skip
  doc.status = 'failed';
  doc.stages = doc.stages.map((st) => (st.state === 'running' || st.state === 'pending')
    ? { ...st, state: 'failed', error: `orphaned: no events for ${s.staleMin} min; executing process abandoned it` }
    : st);
  store.updateRun(doc);
  store.appendEvent(s.id, { type: 'note', detail: { reason: 'run_reaped_orphaned', staleMinutes: s.staleMin } });
  console.log(`[reap] ${s.id}: marked failed (event chain preserved)`);
}
process.exit(0);
