/**
 * dev.mjs — one-command full-stack dev runner: API on :3000 + frontend vite on :5173.
 *
 * Design constraints (zero new dependencies, cross-platform win32 + POSIX):
 *   1. child_process.spawn both processes; stdout/stderr are piped through a
 *      readline interface so every line is prefixed [api] / [web] (attributable
 *      output — two interleaved raw streams are unreadable). stdin is inherited
 *      so interactive tooling keeps working.
 *   2. .env (if present) is parsed KEY=VALUE and loaded into the API child env.
 *      Existing environment variables win (dotenv semantics); values are NEVER
 *      printed — only the count of loaded keys is reported.
 *   3. SIGINT/SIGTERM are forwarded to both children (on Windows kill() with
 *      these signals force-terminates the child; the console also delivers
 *      Ctrl+C to the whole process group, so both paths converge).
 *   4. Exit policy: when either child exits non-zero → kill the other and exit 1.
 *      When a child exits zero on its own → stop the sibling (a half-down stack
 *      is not a dev session) and exit 0. A kill initiated by this runner never
 *      counts as a failure.
 *
 * Usage: pnpm dev   (package.json "dev": "node scripts/dev.mjs")
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'http://localhost:3000';
const WEB_URL = 'http://localhost:5173';

/** Parse .env KEY=VALUE lines. Never logs values. Returns entries not already set in `base`. */
function loadDotEnvOverrides(envPath, base) {
  if (!existsSync(envPath)) return {};
  const overrides = {};
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const assignment = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eq = assignment.indexOf('=');
    if (eq <= 0) continue; // missing key or missing '=' — skip silently (best-effort loader)
    const key = assignment.slice(0, eq).trim();
    const value = assignment.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key in base || key in overrides) continue; // real env wins; first .env occurrence wins
    overrides[key] = value;
  }
  return overrides;
}

/** Pipe a child's stdout/stderr through readline with a per-line [label] prefix. */
function prefixOutput(child, label) {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream === null) continue;
    const target = stream === child.stdout ? process.stdout : process.stderr;
    createInterface({ input: stream }).on('line', (line) => {
      target.write(`[${label}] ${line}\n`);
    });
  }
}

// ---------------------------------------------------------------------------
// Child processes
// ---------------------------------------------------------------------------

const dotenvOverrides = loadDotEnvOverrides(join(ROOT, '.env'), process.env);
const apiEnv = { ...dotenvOverrides, ...process.env }; // process.env wins (see loadDotEnvOverrides)

const api = spawn(process.execPath, [join(ROOT, 'src/cli/far.ts'), 'api'], {
  cwd: ROOT,
  env: apiEnv,
  stdio: ['inherit', 'pipe', 'pipe'],
});
prefixOutput(api, 'api');

// Prefer spawning vite's bin directly (no npm/pnpm shell wrapper → no orphan
// process trees on Windows kill). Fall back to `pnpm --dir frontend run dev`
// when the local vite bin is absent (e.g. exotic installs).
//
// Host/port forwarding: preview hosts (and humans) pass `-- --port N --host H`
// or set PORT/HOST env; forward both to the vite child so the web surface
// listens where the caller expects. The API child keeps :3000 (vite proxy
// targets it) and receives no forwarded args.
const forwardedArgs = process.argv.slice(2);
const hasArg = (name) => forwardedArgs.some((a) => a === name || a.startsWith(`${name}=`));
if (!hasArg('--port') && /^\d+$/.test(process.env.PORT ?? '')) {
  forwardedArgs.push('--port', process.env.PORT);
}
if (!hasArg('--host') && typeof process.env.HOST === 'string' && process.env.HOST.length > 0) {
  forwardedArgs.push('--host', process.env.HOST);
}
const viteBin = join(ROOT, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
let web;
if (existsSync(viteBin)) {
  web = spawn(process.execPath, [viteBin, ...forwardedArgs], {
    cwd: join(ROOT, 'frontend'),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
} else {
  web = spawn('pnpm', ['--dir', join(ROOT, 'frontend'), 'run', 'dev', '--', ...forwardedArgs], {
    cwd: ROOT,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32', // pnpm is pnpm.cmd on Windows
  });
}
prefixOutput(web, 'web');

// ---------------------------------------------------------------------------
// Lifecycle: banner, signal forwarding, exit policy
// ---------------------------------------------------------------------------

const exitSeen = new Map(); // label -> { code, spontaneous }
const killedByUs = new Set();
let finishing = false;

console.log('FAR-Lab dev — full-stack development session');
console.log(`  API : ${API_URL}  (node src/cli/far.ts api)`);
console.log(`  Web : ${WEB_URL}  (vite)`);
if (forwardedArgs.length > 0) {
  console.log(`  Web args forwarded to vite: ${forwardedArgs.join(' ')}`);
}
console.log('  Ctrl+C stops both.');
if (Object.keys(dotenvOverrides).length > 0) {
  console.log(`  .env: loaded ${Object.keys(dotenvOverrides).length} key(s) into the API env (values never printed).`);
}

function stopAll(reason) {
  if (finishing) return;
  finishing = true;
  if (reason !== undefined) console.log(`[dev] ${reason}`);
  for (const [label, child] of [['api', api], ['web', web]]) {
    if (!exitSeen.has(label)) {
      killedByUs.add(label);
      try {
        child.kill('SIGTERM');
      } catch {
        // already gone — its 'exit' handler will fire or has fired
      }
    }
  }
}

function finish() {
  if (exitSeen.size < 2) return;
  let spontaneousFailure = false;
  for (const [label, seen] of exitSeen) {
    if (!killedByUs.has(label) && seen.code !== 0) {
      spontaneousFailure = true;
      console.error(`[dev] '${label}' exited with code ${seen.code}`);
    }
  }
  process.exit(spontaneousFailure ? 1 : 0);
}

function onChildExit(label) {
  return (code) => {
    const spontaneous = !finishing;
    exitSeen.set(label, { code: code ?? 0, spontaneous });
    if (spontaneous && !killedByUs.has(label)) {
      if (code !== 0) {
        stopAll(`'${label}' exited with code ${code} — stopping the other process`);
      } else {
        stopAll(`'${label}' exited — stopping the other process (a half-down stack is not useful)`);
      }
    }
    finish();
  };
}

api.on('exit', onChildExit('api'));
web.on('exit', onChildExit('web'));
api.on('error', (err) => {
  console.error(`[dev] failed to start API child: ${err.message}`);
  process.exit(1);
});
web.on('error', (err) => {
  console.error(`[dev] failed to start web child: ${err.message}`);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAll(`received ${signal} — stopping both children`);
  });
}
