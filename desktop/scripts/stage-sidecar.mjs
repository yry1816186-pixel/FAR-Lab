/**
 * Stage the desktop backend sidecar (Wave A: packaged-app slice).
 *
 * Produces desktop/sidecar/ — a self-contained backend payload with the exact
 * layout serve.mjs expects relative to its CWD:
 *
 *   sidecar/package.json      minimal manifest (runtime dep set is exactly zod)
 *   sidecar/node_modules/zod  the only production dependency of the root build
 *   sidecar/dist/             compiled engine (npm run build, D-031-fresh)
 *   sidecar/web/dist/         compiled workbench
 *   sidecar/scripts/serve.mjs the launcher the Rust shell spawns
 *
 * The system Node runtime stays external (the fatal dialog already names it);
 * the Python experiment runtime is NOT staged — experiments need the host
 * interpreter, same boundary as the source-tree mode (BUILD_SCOPE.md).
 *
 * Usage: node scripts/stage-sidecar.mjs [--check]
 *   --check  verify the staged tree is fresh (exit 1 on drift) — for CI gates.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const desktopDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..');
const stage = join(desktopDir, 'sidecar');

const fail = (msg) => { console.error(`stage-sidecar: ${msg}`); process.exit(1); };

// D-031 parity: never stage a stale build.
const { staleDistFiles } = await import(pathToFileURL(join(repoRoot, 'dist/cli/dist-freshness.js')).href);
const stale = staleDistFiles(repoRoot);
if (stale.length > 0) {
  fail(`root dist is stale (${stale.slice(0, 3).join(', ')}${stale.length > 3 ? ' …' : ''}) — run npm run build first (D-031).`);
}
if (!existsSync(join(repoRoot, 'web/dist/index.html'))) {
  fail('web/dist is missing — run the web build first.');
}

const rootPkg = JSON.parse((await import('node:fs')).readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const zodVersion = rootPkg.dependencies?.zod;
if (typeof zodVersion !== 'string') fail('root package.json has no zod runtime dependency — staging contract broken.');

const dirSize = (dir) => {
  let total = 0;
  const visit = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) visit(full);
      else total += statSync(full).size;
    }
  };
  visit(dir);
  return total;
};

if (process.argv.includes('--check')) {
  const required = ['dist/cli/main.js', 'web/dist/index.html', 'scripts/serve.mjs', 'node_modules/zod/package.json', 'package.json'];
  for (const rel of required) if (!existsSync(join(stage, rel))) fail(`staged sidecar incomplete: ${rel} missing`);
  // Freshness: every staged dist file must be at least as new as its source.
  let drift = 0;
  const compareTrees = (srcDir, dstDir) => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const src = join(srcDir, entry.name);
      const dst = join(dstDir, entry.name);
      if (entry.isDirectory()) { compareTrees(src, dst); continue; }
      if (!existsSync(dst)) { drift += 1; continue; }
      if (statSync(src).mtimeMs > statSync(dst).mtimeMs + 2000) drift += 1;
    }
  };
  compareTrees(join(repoRoot, 'dist'), join(stage, 'dist'));
  compareTrees(join(repoRoot, 'web/dist'), join(stage, 'web/dist'));
  if (drift > 0) fail(`staged sidecar drifted from source builds (${drift} files) — restage.`);
  console.log(`stage-sidecar: check PASS (${(dirSize(stage) / 1e6).toFixed(1)} MB staged)`);
  process.exit(0);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

cpSync(join(repoRoot, 'dist'), join(stage, 'dist'), { recursive: true });
mkdirSync(join(stage, 'web'), { recursive: true });
cpSync(join(repoRoot, 'web/dist'), join(stage, 'web/dist'), { recursive: true });
mkdirSync(join(stage, 'scripts'), { recursive: true });
cpSync(join(repoRoot, 'scripts/serve.mjs'), join(stage, 'scripts/serve.mjs'));
mkdirSync(join(stage, 'node_modules'), { recursive: true });
cpSync(join(repoRoot, 'node_modules/zod'), join(stage, 'node_modules/zod'), {
  recursive: true,
  filter: (src) => !src.includes(`${'node_modules'}${'/'}zod${'/'}node_modules`),
});

writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name: 'far-lab-desktop-sidecar',
  version: rootPkg.version,
  private: true,
  description: 'Packaged backend payload for the FAR-Lab desktop shell (system Node spawns serve.mjs from this root)',
  type: 'module',
  dependencies: { zod: zodVersion },
}, undefined, 2) + '\n');

// Smoke the staged server once (random port, health probe, kill). The smoke
// server's workspace goes to a THROWAWAY dir: letting it create .far-run inside
// the stage both pollutes the payload and races dirSize() — SQLite deletes the
// -wal asynchronously after the kill while the walk below stats it (live CI
// ENOENT on .far-run/far.db-wal).
const port = 33000 + Math.floor(Math.random() * 2000);
const { mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const smokeDataDir = mkdtempSync(join(tmpdir(), 'far-sidecar-smoke-'));
const smoke = (await import('node:child_process')).spawnSync(process.execPath, ['--input-type=module', '-e',
  `const { spawn } = await import('node:child_process');
   const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ${JSON.stringify(stage)}, env: { ...process.env, PORT: '${port}', FARLAB_DATA_DIR: ${JSON.stringify(smokeDataDir)} }, stdio: 'ignore' });
   const deadline = Date.now() + 20000;
   while (Date.now() < deadline) {
     try { const r = await fetch('http://127.0.0.1:${port}/api/v1/health'); if (r.ok) { child.kill(); process.exit(0); } } catch {}
     await new Promise((r) => setTimeout(r, 400));
   }
   child.kill(); process.exit(1);`], { encoding: 'utf8' });
rmSync(smokeDataDir, { recursive: true, force: true });
if (smoke.status !== 0) fail(`staged server smoke failed (status ${String(smoke.status)}): ${(smoke.stderr ?? '').slice(0, 300)}`);

console.log(`stage-sidecar: staged ${(dirSize(stage) / 1e6).toFixed(1)} MB to desktop/sidecar/ (smoke: health OK on port ${port})`);
