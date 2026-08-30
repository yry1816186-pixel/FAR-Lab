/**
 * Zombie-run sweep (recorded follow-up, executed 2026-08-22): runs whose worker process
 * died (session reaping, kills) stay status='running' forever, misrepresenting system
 * state to any reader. This sweep marks runs that are status=running AND whose last
 * update is older than --stale-minutes (default 30) as status='partial', appending a
 * run_status_changed event per run with the reason — state correction with an audit
 * trail, never silent.
 *
 * SAFETY: dry-run by default (prints what would change); --execute applies changes.
 * A run updated within the staleness window is left alone (its worker may be live).
 * Usage: FARLAB_DATA_DIR=<dir> node zcode-harness/scripts/sweep-zombie-runs.mjs [--stale-minutes 30] [--execute]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const DB = resolve(process.env.FARLAB_DATA_DIR ?? resolve(process.cwd(), '.far-run'), 'far.db');
const EXECUTE = process.argv.includes('--execute');
const STALE_MIN = Number(process.argv.find((_, i, a) => a[i - 1] === '--stale-minutes') ?? 30);
const db = new DatabaseSync(DB, EXECUTE ? {} : { readOnly: true });

const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
const zombies = db
  .prepare("SELECT id, current_stage, updated_at FROM runs WHERE status='running' AND updated_at < ?")
  .all(cutoff);
if (zombies.length === 0) {
  console.log(`[sweep] no zombie runs (status=running, updated before ${cutoff})`);
  db.close();
  process.exit(0);
}
for (const z of zombies) {
  console.log(`[sweep] ${z.id} @${z.current_stage} last-update ${z.updated_at} -> partial${EXECUTE ? ' (APPLIED)' : ' (dry-run)'}`);
}
if (EXECUTE) {
  const at = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const z of zombies) {
      db.prepare("UPDATE runs SET status='partial', updated_at=? WHERE id=? AND status='running'").run(at, z.id);
      db.prepare('INSERT INTO events (run_id, at, type, payload) VALUES (?, ?, ?, ?)').run(
        z.id,
        at,
        'run_status_changed',
        JSON.stringify({
          runId: z.id,
          at,
          type: 'run_status_changed',
          detail: {
            from: 'running',
            to: 'partial',
            reason: `zombie sweep: worker process gone, last stage update ${z.updated_at} (${z.current_stage}) is older than the ${STALE_MIN}-minute staleness window; run marked partial to reflect real state`,
          },
        }),
      );
    }
    db.exec('COMMIT');
    console.log(`[sweep] ${zombies.length} run(s) marked partial with audit events (transaction committed)`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[sweep] FAILED, rolled back:', e.message);
    process.exit(1);
  }
} else {
  console.log(`[sweep] dry-run complete; re-run with --execute to apply`);
}
db.close();
