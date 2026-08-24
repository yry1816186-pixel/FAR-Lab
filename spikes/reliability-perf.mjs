/**
 * FAR-Lab reliability workstream — PERFORMANCE PROFILE (2026-08-24).
 *
 * Real measurements on the real paths (no synthetic benchmarks of internals):
 *   - CLI cold start (node boot + import graph + command dispatch)
 *   - createApp (db open + migrations + composition)
 *   - API server: start, GET /runs, GET /runs/:id on a HEAVY run (15k events),
 *     event pagination (listEventsAfter), health (audit-chain lazy verify)
 *   - SSE first byte on a live-ish run
 * Numbers only; optimization decisions are made in the handoff, not here.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'evidence', 'reliability');
fs.mkdirSync(EVIDENCE, { recursive: true });
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { openDb } = await imp('dist/persistence/db.js');
const { Store } = await imp('dist/persistence/store.js');
const { createApp } = await imp('dist/app/composition.js');
const { createApiServer } = await imp('dist/server/api.js');
const { ResearchQuestion, newId } = await imp('dist/domain/index.js');

const out = { measuredAt: new Date().toISOString(), entries: [] };
const log = (name, ms, extra = {}) => { out.entries.push({ name, ms, ...extra }); console.log(`${ms.toFixed(0).padStart(7)}ms  ${name}${extra.detail ? ' — ' + extra.detail : ''}`); };

// ---- 1. CLI cold start ×3 ----
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  await new Promise((res) => {
    const p = spawn(process.execPath, ['dist/cli/main.js', 'runs', '--json'], { cwd: ROOT, stdio: 'ignore' });
    p.on('exit', res);
  });
  log(`cli-cold-start#${i + 1}`, Date.now() - t);
}

// ---- workspace with a heavy run ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-perf-'));
{
  const db = openDb(path.join(dir, 'far.db'));
  const store = new Store(db);
  const run = store.createRun(ResearchQuestion.parse({
    id: newId('q'), text: 'perf heavy run', background: '', goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  }));
  const t = Date.now();
  for (let i = 0; i < 15_000; i++) store.appendEvent(run.id, { type: 'note', detail: { reason: 'perf', i } });
  log('seed-15k-appendEvent', Date.now() - t, { detail: '15,000 appended events (write throughput context)' });
  globalThis.__perfRunId = run.id;
  db.close();
}

// ---- 2. createApp on that workspace ----
{
  const t = Date.now();
  const app = await createApp({ dataDir: dir });
  log('createApp(open+migrate+compose)', Date.now() - t);
  globalThis.__perfApp = app;
}

// ---- 3. API surface ----
const app = globalThis.__perfApp;
const runId = globalThis.__perfRunId;
{
  const t = Date.now();
  const api = createApiServer(app, { port: 0, automations: { enabled: false }, watchdogIntervalMs: 0 });
  const port = await api.start();
  log('api-server-start', Date.now() - t);
  const base = `http://127.0.0.1:${port}`;
  const timed = async (name, fn) => { const s = Date.now(); const r = await fn(); log(name, Date.now() - s); return r; };
  await timed('GET /api/v1/runs', async () => (await fetch(`${base}/api/v1/runs`)).json());
  await timed('GET /api/v1/runs/:id (15k-event run)', async () => (await fetch(`${base}/api/v1/runs/${runId}`)).json());
  await timed('GET /api/v1/runs/:id/events?afterSeq=14990', async () => (await fetch(`${base}/api/v1/runs/${runId}/events?afterSeq=14990`)).json());
  await timed('GET /api/v1/health (audit-chain lazy verify)', async () => (await fetch(`${base}/api/v1/health`)).json(), { detail: 'first call verifies the 15k-event hash chain' });
  await timed('GET /api/v1/health (cached chain)', async () => (await fetch(`${base}/api/v1/health`)).json());
  // SSE first byte + first event on the heavy run
  await timed('SSE subscribe (open + first bytes)', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/v1/runs/${runId}/events/stream`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    await reader.read(); // ': stream open' comment bytes
    ctrl.abort();
  });
  await api.stop();
}

// ---- 4. direct DB paths on the heavy run ----
{
  const db = openDb(path.join(dir, 'far.db'));
  const store = new Store(db);
  const t = Date.now();
  const all = store.listEvents(runId);
  log('store.listEvents(15k) full read', Date.now() - t, { detail: `${all.length} rows` });
  const t2 = Date.now();
  store.verifyEventChain(runId);
  log('store.verifyEventChain(15k)', Date.now() - t2);
  const t3 = Date.now();
  store.workspaceCounts();
  log('store.workspaceCounts()', Date.now() - t3);
  db.close();
}

fs.writeFileSync(path.join(EVIDENCE, 'perf.json'), JSON.stringify(out, null, 2));
app.close();
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* tmp */ }
console.log('\nperf profile written to evidence/reliability/perf.json');
