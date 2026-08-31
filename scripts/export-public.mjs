/**
 * Public-release exporter (Wave-G WP1 proposal §3, D-070).
 *
 * Copies the allowlisted public view of this workspace into
 * build/public-release/farlab-public-<shortsha>/ and VERIFIES the copy is
 * self-sufficient across the root, Web, TUI, Python and desktop source legs.
 * The workspace itself is never modified; no history is grafted (internal
 * commits must not leak into the public repo's history).
 *
 * Gates (refuse to export):
 *   - no LICENSE at root, or LICENSE is not the adjudicated Apache-2.0 text
 *   - dirty Git state (content must be attributable to the recorded commit)
 *
 * Usage: node scripts/export-public.mjs [--skip-verify]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain=v1', '--untracked-files=all');
if (dirty.length > 0) {
  console.error(`FATAL: public export requires a clean Git tree so provenance names the exact content.\n${dirty}`);
  process.exit(1);
}
const sha = git('rev-parse', '--short', 'HEAD');
const fullSha = git('rev-parse', 'HEAD');
const committedAt = git('show', '-s', '--format=%cI', 'HEAD');
const tracked = git('ls-files').split('\n').filter(Boolean);
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
const provenance = {
  schema: 'farlab.public-export-provenance.v1',
  sourceCommit: fullSha,
  sourceCommittedAt: committedAt,
  license: 'Apache-2.0',
  exportPolicy: 'zcode-harness/public-release-manifest.json',
  verificationContract: [
    'root:typecheck+build+lint+test',
    'web:typecheck+production-build+bundle-budget',
    'tui:test+npm-pack-dry-run',
    'python:uv-sync-locked+import-smoke',
    'desktop:npm-ci+cargo-metadata-locked',
  ],
};
writeFileSync(join(outDir, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);
writeFileSync(join(outDir, 'PROVENANCE.md'), `# Public Release Provenance

- Source commit: \`${fullSha}\`
- Source committed at: ${committedAt}
- License: Apache-2.0 (user adjudication 2026-08-22)
- Excluded by decision (D-069/D-070): eval/results/** (live run data), project-spec/COMPETITION.md,
  research/** + evidence/** + .control/** + spikes/** (workspace fact system), internal root docs.
- This tree was produced by scripts/export-public.mjs from the FULL workspace above; the public
  repository starts a fresh history at this snapshot (no internal commits are grafted).
- Verification contract inside this copy: root typecheck/build/lint/test; Web
  production build and bundle gate; TUI tests and package dry run; locked
  Python environment and import smoke; desktop npm lock and Cargo metadata.
  See exporter stdout for the result of this invocation.
`);

console.log(`exported ${shipped.length} files (${(bytes / 1024).toFixed(0)} KiB) -> ${relative(ROOT, outDir)}`);
console.log(`excluded by manifest: ${skippedExcluded.length} tracked files`);

// ---- verification: the copy must be self-sufficient ----
if (process.argv.includes('--skip-verify')) {
  console.log('verification SKIPPED (--skip-verify) — export is UNVERIFIED');
  process.exit(0);
}
const executable = (name) => process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name;
const verificationEnv = {
  ...process.env,
  // The Web leg consumes onnxruntime-web. onnxruntime-node's optional Linux
  // CUDA provider is neither shipped nor exercised, and its install-time NuGet
  // download would make a source-only verification depend on a huge GPU blob.
  ONNXRUNTIME_NODE_INSTALL: 'skip',
};
const run = (cwd, command, args) => {
  console.log(`> (${relative(outDir, cwd) || '.'}) ${command} ${args.join(' ')}`);
  execFileSync(executable(command), args, { cwd, stdio: 'inherit', env: verificationEnv });
};
const generatedNames = new Set([...MANIFEST.copyFilters, '.git', '.venv', '__pycache__', '.pytest_cache']);
const pruneGenerated = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && generatedNames.has(entry.name)) {
      rmSync(path, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      pruneGenerated(path);
    }
  }
};
try {
  const webDir = join(outDir, 'web');
  const tuiDir = join(outDir, 'packages', 'tui');
  const desktopDir = join(outDir, 'desktop');
  const rustDir = join(desktopDir, 'src-tauri');

  // A source archive intentionally has no parent repository metadata, while
  // the endgame inventory tests exercise real Git semantics. Create a throwaway
  // repository around the exact copied tree, then remove it in `finally` so it
  // can neither leak history nor affect the release bytes.
  run(outDir, 'git', ['init', '-q', '--initial-branch', 'verification']);
  run(outDir, 'git', ['add', '--all']);
  execFileSync('git', [
    '-c', 'user.name=FAR-Lab Release Verifier',
    '-c', 'user.email=release-verifier@example.invalid',
    'commit', '-qm', 'verification snapshot',
  ], {
    cwd: outDir,
    stdio: 'inherit',
    env: {
      ...verificationEnv,
      GIT_AUTHOR_DATE: committedAt,
      GIT_COMMITTER_DATE: committedAt,
    },
  });

  run(outDir, 'uv', ['sync', '--locked', '--project', 'experiment-runtime']);
  run(outDir, 'uv', ['run', '--project', 'experiment-runtime', 'python', '-c', 'import farlab_experiment_runtime, numpy']);
  run(outDir, 'npm', ['ci', '--no-audit', '--no-fund']);
  // Root Vitest imports Web source modules, so the copy needs Web dependencies
  // before the root suite just like the hosted verify job does.
  run(webDir, 'npm', ['ci', '--no-audit', '--no-fund']);
  run(outDir, 'npm', ['run', 'typecheck']);
  // build BEFORE test: several eval scripts (and their tests) import ../dist — the
  // workspace convention is build-first (dist-freshness discipline), and a fresh copy
  // has no dist until this step runs.
  run(outDir, 'npm', ['run', 'build']);
  run(outDir, 'npm', ['run', 'lint']);
  run(outDir, 'npm', ['test']);

  run(webDir, 'npm', ['run', 'build']);

  run(tuiDir, 'npm', ['ci', '--no-audit', '--no-fund']);
  run(tuiDir, 'npm', ['test']);
  run(tuiDir, 'npm', ['pack', '--dry-run']);

  run(desktopDir, 'npm', ['ci', '--no-audit', '--no-fund']);
  run(rustDir, 'cargo', ['metadata', '--locked', '--format-version', '1', '--no-deps']);

  console.log(`\nEXPORT VERIFIED: ${shipped.length} files; root, Web, TUI, Python and desktop source contracts green in-copy`);
} catch (error) {
  console.error('\nEXPORT VERIFICATION FAILED — the public tree is NOT self-sufficient; fix before publishing.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  // The release is a source snapshot. Verification products must never leak
  // into it or make archive bytes depend on local caches/platform binaries.
  pruneGenerated(outDir);
}
