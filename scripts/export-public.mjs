/**
 * Public-release exporter (Wave-G WP1 proposal §3, D-070).
 *
 * Copies the allowlisted public view of this workspace into
 * build/public-release/farlab-public-<shortsha>/ and VERIFIES the copy is
 * self-sufficient (typecheck + lint + test + build inside it, fresh deps).
 * The workspace itself is never modified; no history is grafted (internal
 * commits must not leak into the public repo's history).
 *
 * Gates (refuse to export):
 *   - no LICENSE at root, or LICENSE is not the adjudicated Apache-2.0 text
 *
 * Usage: node scripts/export-public.mjs [--skip-verify]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'zcode-harness/public-release-manifest.json'), 'utf8'));
const OUT_ROOT = join(ROOT, 'build/public-release');

// ---- gate: LICENSE must exist and be the Apache-2.0 canonical text ----
const licensePath = join(ROOT, 'LICENSE');
if (!existsSync(licensePath)) {
  console.error('FATAL: no LICENSE at repo root — the public export refuses to run unlicensed.');
  process.exit(1);
}
const licenseHead = readFileSync(licensePath, 'utf8').slice(0, 200);
if (!licenseHead.includes('Apache License') || !licenseHead.includes('Version 2.0')) {
  console.error('FATAL: LICENSE is not the Apache-2.0 text (adjudicated D-070).');
  process.exit(1);
}

// ---- path matching (gitignore-style prefix globs, exclude wins) ----
const matches = (path, pattern) => {
  const p = pattern.replace(/\*\*$/, '');
  return path === pattern || path.startsWith(p) || path.startsWith(pattern.replace(/\/\*\*$/, '/') );
};
const isExcluded = (path) => MANIFEST.exclude.some((pat) => matches(path, pat));
const isIncluded = (path) => MANIFEST.include.some((pat) => matches(path, pat));
const isFilteredDir = (name) => MANIFEST.copyFilters.includes(name);

// ---- staged copy: walk tracked files (git ls-files keeps us honest about what ships) ----
const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const shipped = [];
const skippedExcluded = [];
for (const f of tracked) {
  if (isExcluded(f)) { skippedExcluded.push(f); continue; }
  if (!isIncluded(f)) continue;
  if (f.split('/').some(isFilteredDir)) continue;
  shipped.push(f);
}
// untracked-but-required files (LICENSE/NOTICE were just created; manifest itself)
for (const extra of ['LICENSE', 'NOTICE']) {
  if (!shipped.includes(extra) && existsSync(join(ROOT, extra))) shipped.push(extra);
}

const outDir = join(OUT_ROOT, `farlab-public-${sha}`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let bytes = 0;
for (const f of shipped) {
  const src = join(ROOT, f);
  const dst = join(outDir, f);
  mkdirSync(resolve(dst, '..'), { recursive: true });
  cpSync(src, dst);
  bytes += statSync(src).size;
}

// ---- PROVENANCE ----
writeFileSync(join(outDir, 'PROVENANCE.md'), `# Public Release Provenance

- Source commit: \`${execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()}\`
- Exported: ${new Date().toISOString()}
- License: Apache-2.0 (user adjudication 2026-08-22)
- Excluded by decision (D-069/D-070): eval/results/** (live run data), project-spec/COMPETITION.md,
  research/** + evidence/** + .control/** + spikes/** (workspace fact system), internal root docs.
- This tree was produced by scripts/export-public.mjs from the FULL workspace above; the public
  repository starts a fresh history at this snapshot (no internal commits are grafted).
- Verification run inside this copy: see exporter stdout (typecheck/lint/test/build).
`);

console.log(`exported ${shipped.length} files (${(bytes / 1024).toFixed(0)} KiB) -> ${relative(ROOT, outDir)}`);
console.log(`excluded by manifest: ${skippedExcluded.length} tracked files`);

// ---- verification: the copy must be self-sufficient ----
if (process.argv.includes('--skip-verify')) {
  console.log('verification SKIPPED (--skip-verify) — export is UNVERIFIED');
  process.exit(0);
}
const run = (cmd) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: outDir, stdio: 'inherit' });
};
try {
  run('npm ci --no-audit --no-fund');
  run('npm run typecheck');
  // build BEFORE test: several eval scripts (and their tests) import ../dist — the
  // workspace convention is build-first (dist-freshness discipline), and a fresh copy
  // has no dist until this step runs.
  run('npm run build');
  run('npm run lint');
  run('npm test');
  console.log(`\nEXPORT VERIFIED: ${shipped.length} files, self-sufficient (typecheck+build+lint+test green in-copy)`);
} catch {
  console.error('\nEXPORT VERIFICATION FAILED — the public tree is NOT self-sufficient; fix before publishing.');
  process.exit(1);
}
