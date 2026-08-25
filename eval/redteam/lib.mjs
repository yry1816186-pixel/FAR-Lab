/**
 * Shared infrastructure for the R2-14 red-team probe suite (lane: independent
 * evaluation, benchmarking & red team). All probes import from here; every path
 * resolves from import.meta.url so probes are immune to cwd drift.
 *
 * Probes are EVALUATION code only: they boot the REAL compiled product (dist/)
 * against throwaway workspaces and the REAL runtime database (read-only copy).
 * They never construct a parallel engine and never patch production behavior.
 *
 * Result envelope (every probe emits one):
 *   { probe, verdict: 'PASS'|'FAIL'|'ADVISORY'|'BLOCKED-live',
 *     summary, findings: [{severity, id, detail, evidence?}], meta: {...} }
 * Exit code: 1 when verdict === 'FAIL', else 0 (ADVISORY findings stay visible
 * in the scorecard and the lane report — they are never silently dropped).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS_DIR = path.join(ROOT, 'eval', 'results', 'r2-14');
/** Read-only copy of the primary workspace's real runtime DB (never written). */
export const INPUT_DB = path.join(ROOT, 'eval', 'results', 'r2-14-inputs', 'far.db');

export const distImport = (rel) => import(pathToFileURL(path.join(ROOT, 'dist', rel)).href);

export const writeResult = (name, payload) => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
};

export const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/**
 * Boot the REAL API server: real kernel (composition), real SQLite store in a
 * throwaway workspace, model calls answered by the documented test stub (which
 * fails loudly on unexpected calls — no accidental live routes, no fake success).
 * Mirrors the boot contract proven by tests/api.test.ts.
 */
export const bootApiServer = async () => {
  const { createApp } = await distImport('app/composition.js');
  const { createApiServer } = await distImport('server/api.js');
  const { createTestStubProvider } = await distImport('providers/test-stub.js');
  const dataDir = tempDir('r14-api-');
  const app = await createApp({
    dataDir,
    providerOverride: createTestStubProvider([]),
  });
  const api = createApiServer(app, {
    port: 0,
    executor: () => Promise.resolve(null), // documented test seam (ApiServerOptions.executor)
    staticRoot: path.join(dataDir, 'no-web-dist'),
  });
  const port = await api.start();
  return {
    app,
    base: `http://127.0.0.1:${port}`,
    dataDir,
    close: async () => {
      await api.stop();
      app.close();
    },
  };
};

const ZERO_WIDTH = new Set(['\u200b', '\u200c', '\u200d', '\ufeff']);

/** Normalization for verbatim-quote containment checks (whitespace/case only — never lenient rewording). */
export const normalizeText = (s) =>
  Array.from(String(s ?? ''))
    .filter((ch) => !ZERO_WIDTH.has(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const finish = (name, payload) => {
  const file = writeResult(name, payload);
  const failed = payload.verdict === 'FAIL';
  console.log(`[${name}] ${payload.verdict} — ${payload.summary}`);
  for (const f of payload.findings ?? []) {
    console.log(`  ${f.severity} ${f.id}: ${f.detail}`);
  }
  console.log(`  -> ${file}`);
  process.exitCode = failed ? 1 : 0;
};
