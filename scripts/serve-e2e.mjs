#!/usr/bin/env node
/**
 * E2E server launcher (HX §19): boots the REAL product (root dist + web/dist)
 * on a scratch workspace + fixed port, with a deterministic OFFLINE model
 * config pre-created and activated, so the suite needs no keys or network.
 * Print the URL for Playwright's webServer.url probe and stay in foreground.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Repo root derived from THIS file's location (scripts/ under root) — cwd varies
// between Playwright's webServer (web/) and direct invocation.
const cwd = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = mkdtempSync(join(tmpdir(), 'farlab-e2e-'));
const PORT = process.env.FARLAB_E2E_PORT ?? '3198';
const env = {
  ...process.env,
  FARLAB_DATA_DIR: dataDir,
  PORT,
  FARLAB_AUTOMATIONS: 'off',
};
const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd, env, stdio: 'inherit' });

const HEALTH = `http://127.0.0.1:${PORT}/api/v1/health`;
const ready = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(HEALTH);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
})();

if (!ready) {
  console.error(`serve-e2e: server never became healthy at ${HEALTH}`);
  child.kill('SIGTERM');
  process.exit(3);
}

// Deterministic offline route, created + activated once per suite run.
const cfg = await fetch(`http://127.0.0.1:${PORT}/api/v1/model-configs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    label: '离线开发路由（E2E）',
    wire: 'offline',
    baseUrl: 'https://offline.farlab.invalid/v1',
    modelId: 'farlab-offline-deterministic',
    apiKey: '',
    fallbackConfigIds: [],
  }),
}).then((r) => r.json());
await fetch(`http://127.0.0.1:${PORT}/api/v1/model-configs/active`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: cfg.config.id }),
});

console.log(`serve-e2e: ready at ${HEALTH} (offline route ${cfg.config.id})`);

// Windows: child.kill('SIGTERM') terminates ONLY the direct child — the
// serve.mjs process tree can survive Playwright's teardown, leaving a stale
// listener on PORT that a later run then REUSES with a wrong cwd (API-only,
// static 404s). taskkill /T kills the tree; POSIX keeps SIGTERM.
const killTree = () => {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
};
const cleanup = () => {
  killTree();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* windows locks; tmp survives */ }
};
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('exit', () => { killTree(); });
child.on('exit', (code) => { process.exit(code ?? 0); });
