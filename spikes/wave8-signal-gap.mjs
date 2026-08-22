/**
 * Wave-8 construction A: legit worker-signal cadence. Any auto-detector must distinguish
 * "worker dead" from "worker slow" using the age of the last persisted signal (event /
 * receipt / run.updated_at). This measures the OBSERVED max inter-signal gap across all
 * completed runs in the real DB — the floor any safe staleness threshold must exceed.
 * Read-only, deterministic, no model calls.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const DB = resolve(process.cwd(), '.far-run/far.db');
const db = new DatabaseSync(DB, { readOnly: true });

const runs = db.prepare("SELECT id FROM runs WHERE status='completed'").all();
let maxGapMs = 0;
let maxGapRun = '';
const gaps = [];
for (const r of runs) {
  const evs = db.prepare('SELECT at FROM events WHERE run_id=? ORDER BY seq').all(r.id);
  for (let i = 1; i < evs.length; i++) {
    const g = new Date(evs[i].at).getTime() - new Date(evs[i - 1].at).getTime();
    if (g >= 0) gaps.push(g);
    if (g > maxGapMs) { maxGapMs = g; maxGapRun = r.id.slice(0, 16); }
  }
}
gaps.sort((a, b) => a - b);
const pct = (q) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))];
const out = {
  measuredAt: new Date().toISOString(),
  completedRuns: runs.length,
  interSignalGapsMs: {
    n: gaps.length,
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    max: gaps[gaps.length - 1],
    maxRun: maxGapRun,
    maxMinutes: +(maxGapMs / 60000).toFixed(1),
  },
  designImplication: 'a staleness threshold must sit safely above the legit p99/max gap; current manual sweep uses 30min with no liveness heartbeat of its own (updated_at only advances at stage transitions AND on receipts, so mid-stage calls DO heartbeat — but nothing polls)',
};
console.log(JSON.stringify(out, null, 2));
db.close();
