/**
 * Lane-07 manuscript / reproducibility-package exporter (thin dist entry).
 *
 * Assembles the on-disk export contract from a stored run + its reproducibility
 * bundle: paper (md + pandoc docx/jats/html when available), report, bibliography,
 * deterministic figures/tables, bundle.json, MANIFEST.json (sha256), RO-Crate 1.1
 * descriptor and README with verification instructions. Byte-deterministic per
 * bundle; missing pandoc or missing formats are reported honestly, never faked.
 *
 * Usage:
 *   node scripts/export-manuscript.mjs <run-id> [--out dir] [--formats docx,jats,html]
 *                                     [--data-dir dir] [--no-pandoc] [--json]
 * Requires a fresh dist build (`npm run build`) — imports the compiled engine.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_PACKAGE = join(ROOT, 'dist', 'report', 'package.js');
const DIST_APP = join(ROOT, 'dist', 'app', 'composition.js');
if (!existsSync(DIST_PACKAGE) || !existsSync(DIST_APP)) {
  console.error('FATAL: dist build missing (dist/report/package.js) — run `npm run build` first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const runId = args.find((a) => !a.startsWith('--'));
if (runId === undefined) {
  console.error('Usage: node scripts/export-manuscript.mjs <run-id> [--out dir] [--formats docx,jats,html] [--data-dir dir] [--no-pandoc] [--json]');
  process.exit(2);
}
const outDir = arg('out') ?? join('.far-run', 'exports', `${runId}-package`);
const dataDir = arg('data-dir') ?? '.far-run';
const formats = arg('formats')?.split(',').map((s) => s.trim()).filter(Boolean);
const asJson = args.includes('--json');

const { createApp } = await import(pathToFileURL(DIST_APP).href);
const { buildReproducibilityPackage } = await import(pathToFileURL(DIST_PACKAGE).href);

const app = await createApp({ dataDir });
try {
  const result = await buildReproducibilityPackage(
    { store: app.store, artifacts: app.artifacts },
    runId,
    {
      outDir,
      ...(formats !== undefined ? { formats } : {}),
      ...(args.includes('--no-pandoc') ? { pandoc: null } : {}),
    },
  );
  if (asJson) {
    console.log(JSON.stringify({
      dir: result.dir,
      bundleId: result.bundleId,
      runId: result.runId,
      files: result.files.map((f) => f.path),
      paperIncluded: result.paperIncluded,
      pandoc: result.pandoc,
      citations: result.citations,
    }, null, 2));
  } else {
    console.log(`package written: ${result.dir}`);
    console.log(`bundle ${result.bundleId} · ${result.files.length} files · paper ${result.paperIncluded ? 'included' : 'ABSENT (pre-BP3 bundle)'}`);
    if (result.citations !== null) {
      console.log(`citations: ${result.citations.citedKeys.length} cited inline, ${result.citations.unresolved.length} unresolved, ${result.citations.uncited.length} uncited bibliography entries`);
    }
    if (result.pandoc.version !== null) console.log(`pandoc v${result.pandoc.version}: produced [${result.pandoc.produced.join(', ')}]`);
    for (const u of result.pandoc.unavailable) console.log(`  unavailable: ${u.format} — ${u.reason}`);
  }
} finally {
  app.close();
}
