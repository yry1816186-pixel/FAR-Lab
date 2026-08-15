/**
 * research/export_bundle — portable, hash-pinned research-run bundle.
 *
 * `far research export` freezes a ResearchRun into a third-party-verifiable
 * bundle (directive §3.6 / §14.5):
 *
 *   <bundleDir>/
 *     research-run.json     the frozen run (immutable input)
 *     manifest.json         run identity + per-file sha256 (tamper-detectable)
 *     verify.mjs            standalone integrity checker (node, zero deps)
 *     README.md             what IS and IS NOT independently verifiable
 *
 * Verification boundary (honest, §3.6): the bundle's integrity check and the
 * deterministic recompute (far research verify) cover frozen inputs, content
 * hashes, citation binding, deterministic scorecard dimensions, Pareto front,
 * and primary selection. LLM-generated text is acknowledged as NOT
 * bit-for-bit reproducible — it is frozen inside the bundle, not re-generated.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResearchRun } from './types.ts';

/** Schema version of the export manifest. */
export const RESEARCH_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

/** One entry of the manifest's file table. */
export interface BundleFileEntry {
  readonly path: string;
  readonly sha256: string;
}

/** The export manifest (identity + integrity table). */
export interface ResearchBundleManifest {
  readonly schemaVersion: number;
  readonly runId: string;
  readonly researchRunSchemaVersion: number;
  readonly exportedAt: string;
  readonly gitCommit: string | null;
  readonly runMode: string;
  readonly files: readonly BundleFileEntry[];
}

/** sha256 of a string payload. */
function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** The standalone verify script content (bundled; zero dependencies). */
function verifyScriptSource(): string {
  return `#!/usr/bin/env node
// FAR-Lab research bundle — standalone integrity checker (zero dependencies).
// Verifies every file's sha256 against manifest.json. Tampering with any file
// (including the frozen research-run.json) is detected and reported.
//
// This script checks INTEGRITY only. To recompute the deterministic layer
// (citation binding / scorecard / Pareto / primary selection), run inside the
// FAR-Lab repo:  far research verify <bundleDir-or-run.json>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const dir = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(dir, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error('verify: cannot read manifest.json:', err.message);
  process.exit(1);
}
if (!manifest || !Array.isArray(manifest.files)) {
  console.error('verify: manifest.json is malformed (missing files table)');
  process.exit(1);
}

let failed = 0;
for (const entry of manifest.files) {
  if (entry.path === 'manifest.json') continue; // manifest is the anchor, not self-checked
  try {
    const actual = sha256File(join(dir, entry.path));
    if (actual !== entry.sha256) {
      console.error('TAMPERED  ' + entry.path + ' (stored ' + entry.sha256.slice(0, 12) + '…, actual ' + actual.slice(0, 12) + '…)');
      failed += 1;
    } else {
      console.log('ok        ' + entry.path);
    }
  } catch (err) {
    console.error('MISSING   ' + entry.path + ' (' + err.message + ')');
    failed += 1;
  }
}

console.log('');
console.log('runId     ' + manifest.runId);
console.log('runMode   ' + manifest.runMode);
console.log('exported  ' + manifest.exportedAt);
console.log(failed === 0
  ? 'INTEGRITY PASS — all files match the manifest. (LLM text is frozen, not recomputed; run "far research verify" in the repo for deterministic recompute.)'
  : 'INTEGRITY FAIL — ' + failed + ' file(s) do not match the manifest.');
process.exit(failed === 0 ? 0 : 7);
`;
}

/** Result of an export. */
export interface ResearchExportResult {
  readonly bundleDir: string;
  readonly filesWritten: readonly string[];
  readonly manifestHash: string;
  readonly exportedAt: string;
}

/**
 * Write the frozen research bundle to outputDir.
 *
 * @param run       the ResearchRun to freeze
 * @param outputDir destination directory (created if missing)
 * @param exportedAt optional timestamp (tests inject for determinism)
 */
export function exportResearchBundle(
  run: ResearchRun,
  outputDir: string,
  exportedAt: string = new Date().toISOString(),
): ResearchExportResult {
  mkdirSync(outputDir, { recursive: true });

  const runJson = `${JSON.stringify(run, null, 2)}\n`;
  const readme = `# FAR-Lab Research Bundle

runId:        ${run.runId}
question:     ${run.question}
runMode:      ${run.runMode}
schema:       ResearchRun v${run.schemaVersion} · manifest v${RESEARCH_BUNDLE_MANIFEST_SCHEMA_VERSION}
exportedAt:   ${exportedAt}
gitCommit:    ${run.environment.gitCommit ?? 'n/a'}

## What IS verifiable by a third party

1. **Integrity** — \`node verify.mjs\` re-hashes every file against manifest.json
   (tamper detection, exit 7 on any mismatch).
2. **Deterministic recompute** — inside the FAR-Lab repo:
   \`far research verify research-run.json\` recomputes the corpus rootHash,
   citation binding, deterministic scorecard dimensions, Pareto front, and
   primary-hypothesis selection from the frozen inputs and compares them to the
   stored values (exit 7 on mismatch).

## What is NOT bit-for-bit reproducible (by design, §3.6)

LLM-generated text (hypotheses, critiques, plan, decomposition) is frozen inside
research-run.json — a third party verifies it was not ALTERED, not that a fresh
Qwen call would regenerate identical text. Provider metadata (request ids, token
usage) is recorded per-stage in stageReceipts; fields the provider did not
supply are null (provenanceStatus=partial), never invented.
`;

  const verifyMjs = verifyScriptSource();

  const files: BundleFileEntry[] = [
    { path: 'research-run.json', sha256: sha256Hex(runJson) },
    { path: 'README.md', sha256: sha256Hex(readme) },
    { path: 'verify.mjs', sha256: sha256Hex(verifyMjs) },
  ];
  const manifest: ResearchBundleManifest = {
    schemaVersion: RESEARCH_BUNDLE_MANIFEST_SCHEMA_VERSION,
    runId: run.runId,
    researchRunSchemaVersion: run.schemaVersion,
    exportedAt,
    gitCommit: run.environment.gitCommit,
    runMode: run.runMode,
    files,
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  writeFileSync(join(outputDir, 'research-run.json'), runJson, 'utf8');
  writeFileSync(join(outputDir, 'README.md'), readme, 'utf8');
  writeFileSync(join(outputDir, 'verify.mjs'), verifyMjs, 'utf8');
  writeFileSync(join(outputDir, 'manifest.json'), manifestJson, 'utf8');

  return {
    bundleDir: outputDir,
    filesWritten: ['research-run.json', 'README.md', 'verify.mjs', 'manifest.json'],
    manifestHash: sha256Hex(manifestJson),
    exportedAt,
  };
}

/** Re-export the file-table hashing for the manifest verifier. */
export { sha256Hex as researchBundleSha256 };
