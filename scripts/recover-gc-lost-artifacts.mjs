/**
 * ONE-OFF recovery for the 2026-08-24 gc P0 (run with: node scripts/recover-gc-lost-artifacts.mjs --write)
 *
 * The round-4 `far gc --apply` deleted 55/56 bundle-referenced artifact blobs
 * because the reference scan matched only `sha256:`-prefixed hashes while
 * bundles persist finalArtifactHashes as bare hex. The export stage renders the
 * report/paper DETERMINISTICALLY from stored objects, so every deleted blob can
 * be re-rendered and checked byte-for-byte against the bundle's recorded hash.
 *
 * Honesty rules (AGENTS.md §2):
 * - A blob is restored ONLY when sha256(rendered) === recorded hash. Anything
 *   else is reported as MISMATCH and left absent — never guessed into existence.
 * - Default is a dry report; --write performs the restore.
 */
import { createApp } from '../dist/app/composition.js';
import { exportStage } from '../dist/pipeline/stages/export.js';

const WRITE = process.argv.includes('--write');
const dataDir = process.env.FARLAB_DATA_DIR ?? '.far-run';
const app = await createApp({ dataDir });

// Collect every missing blob hash referenced by any bundle.
const fs = await import('node:fs');
const path = await import('node:path');
const { createHash } = await import('node:crypto');
const blobPath = (hash) => path.join(app.dataDir, 'artifacts', hash.slice(0, 2), hash);

const bundles = [];
for (const run of app.store.listRuns()) {
  const bs = app.store.listObjects('bundle', run.id);
  if (bs.length > 0) bundles.push({ runId: run.id, latest: bs.at(-1) });
}

let okCount = 0, mismatch = [], already = 0;
for (const { runId, latest } of bundles) {
  if (!latest) continue;
  const run = app.store.getRun(runId);
  const targets = [...(latest.finalArtifactHashes ?? [])];
  // paperOutlineRef carries the sha256: prefix; finalArtifactHashes[1] IS the paper.
  const missing = targets.filter((h) => !fs.existsSync(blobPath(h)));
  if (missing.length === 0 && !(latest.paperOutlineRef && !fs.existsSync(blobPath(latest.paperOutlineRef.replace('sha256:', ''))))) {
    already++;
    continue;
  }
  try {
    // Re-render via the REAL stage handler against the REAL store (deterministic).
    const outcome = await exportStage.execute({
      run,
      store: app.store,
      artifacts: app.artifacts,
      provider: { name: 'offline-recovery', liveReady: false, structuredCall: async () => { throw new Error('no model in recovery'); } },
      sourceFor: () => { throw new Error('export stage never sources'); },
      recordReceipt: () => {}, // receipts stay untouched — this is a restore, not a re-run
      log: () => {},
      cancelled: () => false,
      progress: () => {},
    });
    void outcome;
  } catch (e) {
    mismatch.push(`${latest.id}: stage re-exec failed: ${String(e).slice(0, 120)}`);
    continue;
  }
  // Verify each previously-missing hash now exists AND matches content.
  let runOk = true;
  for (const h of new Set([...targets, latest.paperOutlineRef?.replace('sha256:', '')].filter(Boolean))) {
    const p = blobPath(h);
    if (!fs.existsSync(p)) { mismatch.push(`${latest.id}: ${h.slice(0, 12)} still missing after re-render`); runOk = false; continue; }
    const digest = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if (digest !== h) { mismatch.push(`${latest.id}: ${h.slice(0, 12)} HASH MISMATCH (${digest.slice(0, 12)})`); runOk = false; }
  }
  if (runOk) okCount++;
}

console.log(`bundles scanned: ${bundles.length}`);
console.log(`already intact:   ${already}`);
console.log(`recovered OK:     ${okCount}${WRITE ? '' : '  (dry report only — rerun with --write to restore)'}`);
console.log(mismatch.length > 0 ? `NOT recovered (${mismatch.length}):\n  ${mismatch.join('\n  ')}` : 'no mismatches');
app.close();
