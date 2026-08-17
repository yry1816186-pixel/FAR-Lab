#!/usr/bin/env node
// scripts/make_demo_pack.mjs — 一键离线演示包（ux.offline_demo_pack，T0，day-r13）。
//
// Build (NETWORKED machine, once):
//   node scripts/make_demo_pack.mjs
//     1. stage .far/dist/far-lab-offline-demo-<version>/ — src + schema +
//        package.json + LICENSE/NOTICE/README + RUN-DEMO launchers
//     2. npm install --omit=dev into the stage (prod deps only)
//     3. SMOKE: run `node src/cli/far.ts demo` FROM THE STAGE — the pack only
//        ships if the demo actually passes in it (zero-fake-demo discipline)
//     4. tar.gz the stage → .far/dist/<name>.tgz + SHA256 manifest line
//
// Consumer (OFFLINE): extract, then RUN-DEMO.bat (Windows) / ./run-demo.sh
// (POSIX) — `far demo` runs the real deterministic kernel on 15 golden
// vectors. No network, no credentials, no install step (Node >= 24 required).
//
// Honesty: the demo verdict comes from offline fixtures — the pack demonstrates
// the engineering chain (kernel + tamper-evidence + fail-closed sealing), not
// a scientific conclusion. That framing is printed by `far demo` itself.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const stageName = `far-lab-offline-demo-${pkg.version}`;
const distDir = join(repoRoot, '.far', 'dist');
const stage = join(distDir, stageName);
const tarball = join(distDir, `${stageName}.tgz`);

function fail(msg) {
  console.error(`make_demo_pack: ${msg}`);
  process.exit(1);
}

// Windows EPERM resilience: a lingering handle (AV scan, late process exit)
// can hold the stage dir; retry with backoff before giving up.
function rmSyncRetry(target, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      rmSync(target, { recursive: true, force: true });
      return;
    } catch {
      if (i === attempts - 1) {
        throw new Error(`cannot remove ${target} (locked after ${attempts} attempts — close programs holding it)`);
      }
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},300)']);
    }
  }
}

// 1. Stage the sources (clean first — idempotent rebuilds).
rmSyncRetry(stage);
mkdirSync(stage, { recursive: true });
for (const dir of ['src', 'schema', 'golden_vectors', 'repro']) {
  const from = join(repoRoot, dir);
  if (existsSync(from)) cpSync(from, join(stage, dir), { recursive: true });
}
for (const file of ['package.json', 'LICENSE', 'NOTICE', 'README.md', 'tsconfig.json']) {
  const from = join(repoRoot, file);
  if (existsSync(from)) cpSync(from, join(stage, file));
}

writeFileSync(
  join(stage, 'RUN-DEMO.bat'),
  [
    '@echo off',
    'rem FAR-Lab offline demo — no network, no credentials needed.',
    'node src\\cli\\far.ts demo',
    'if errorlevel 1 ( echo demo FAILED — see output above & exit /b 1 )',
    'echo.',
    'echo Demo passed. Next steps: node src\\cli\\far.ts --help',
  ].join('\r\n') + '\r\n',
  'utf8',
);
writeFileSync(
  join(stage, 'run-demo.sh'),
  [
    '#!/bin/sh',
    '# FAR-Lab offline demo — no network, no credentials needed.',
    'node src/cli/far.ts demo || { echo "demo FAILED — see output above"; exit 1; }',
    'echo',
    'echo "Demo passed. Next steps: node src/cli/far.ts --help"',
  ].join('\n') + '\n',
  { encoding: 'utf8', mode: 0o755 },
);
writeFileSync(
  join(stage, 'OFFLINE-README.md'),
  [
    `# FAR-Lab offline demo pack (${pkg.version})`,
    '',
    'Requirements: Node.js >= 24 on PATH. Nothing else — dependencies are',
    'bundled, no network is used, no API key is needed.',
    '',
    '- Windows: double-click RUN-DEMO.bat (or run it from a terminal)',
    '- macOS/Linux: ./run-demo.sh',
    '',
    'What you will see (all real computation, zero canned output):',
    '1. 15 golden vectors through the deterministic R0-R9 verdict kernel;',
    '2. an end-to-end demo claim: FEC orchestration -> kernel verdict ->',
    '   fail-closed sealing;',
    '3. tamper-detection guidance (far export far-proof / far verify).',
    '',
    'Honesty note: demo verdicts come from offline fixtures. The pack',
    'demonstrates the verification ENGINE, not a scientific conclusion.',
    '',
    `Packed from commit recorded at build time; MIT licensed (see LICENSE).`,
  ].join('\n') + '\n',
  'utf8',
);

// 2. Prod dependencies into the stage (network used HERE, at build time only).
// Scripts stay ENABLED: better-sqlite3's install script fetches the prebuilt
// binding — skipping it ships a pack whose native binding never loads.
console.log(`[pack] installing prod deps into stage…`);
const install = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: stage,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (install.status !== 0) fail(`npm install failed in stage:\n${install.stderr}`);
// Verify the native binding actually loads before smoking the demo.
const binding = spawnSync(process.execPath, ['-e', 'import("better-sqlite3").then(()=>console.log("ok")).catch(e=>{console.error(e.message);process.exit(1)})'], {
  cwd: stage, encoding: 'utf8',
});
if (binding.status !== 0) {
  console.log('[pack] prebuilt binding missing — running node-gyp rebuild in stage');
  const rebuild = spawnSync('npm', ['rebuild', 'better-sqlite3'], { cwd: stage, encoding: 'utf8', shell: process.platform === 'win32' });
  if (rebuild.status !== 0) fail(`better-sqlite3 rebuild failed:\n${rebuild.stderr}`);
}

// 3. SMOKE the demo FROM the stage — the pack ships only if this passes.
console.log('[pack] smoking far demo inside the stage…');
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
writeFileSync(join(stage, 'BUILD.txt'), `version=${pkg.version}\nbuiltFrom=${head || 'unknown'}\nbuiltAt=${new Date().toISOString()}\n`, 'utf8');
const demo = spawnSync(process.execPath, ['src/cli/far.ts', 'demo'], { cwd: stage, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (demo.status !== 0) fail(`stage demo FAILED (pack refused):\n${String(demo.stderr).split('\n').slice(-8).join('\n')}`);
// Content check: the demo must have actually computed verdicts (machine verdict
// + the sealed-downgrade line), not just printed a banner and exited 0.
if (!/Machine verdict/.test(demo.stdout) || !/Sealed conclusion/.test(demo.stdout)) {
  fail('stage demo output lacks verdict lines — refusing to ship an unverified pack');
}
console.log('[pack] stage demo PASSED');

// 4. Tar the stage (POSIX tar — available on Win10+, macOS, Linux). Relative
// paths only: an absolute Windows path (C:\…) is parsed by tar as a remote
// host spec ("Cannot connect to C:").
rmSync(tarball, { force: true });
const tar = spawnSync('tar', ['-czf', `.far/dist/${stageName}.tgz`, '-C', '.far/dist', stageName], { cwd: repoRoot, encoding: 'utf8' });
if (tar.status !== 0) fail(`tar failed: ${tar.stderr}`);
const sha = createHash('sha256').update(readFileSync(tarball)).digest('hex');
const { statSync } = await import('node:fs');
const mb = (statSync(tarball).size / 1024 / 1024).toFixed(1);
writeFileSync(`${tarball}.sha256`, `${sha}  ${stageName}.tgz\n`, 'utf8');
console.log(`[pack] OK`);
console.log(`  ${tarball}`);
console.log(`  sha256=${sha}  size=${mb} MB`);
console.log(`  consumer: tar -xzf ${stageName}.tgz && cd ${stageName} && RUN-DEMO.bat (or ./run-demo.sh)`);
