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

// ---- 5. agent-kernel loop overhead (real loop, instant provider) ----
// The stub provider answers without latency, so the measured wall time is the
// kernel machinery per turn: prompt assembly, permission decide, exfil scans
// (secret/canary/size on args + outbound), transcript growth, receipts,
// telemetry, event emit. NOT model latency — that belongs to the provider.
{
  const { z } = await import('zod'); // bare specifier resolves via the repo's node_modules
  const { runAgentLoop } = await imp('dist/agent/loop.js');
  const { ToolRegistry } = await imp('dist/agent/tool.js');
  const { PermissionEngine } = await imp('dist/agent/permissions.js');
  const { SessionTelemetry } = await imp('dist/agent/telemetry.js');
  const { createTestStubProvider } = await imp('dist/providers/test-stub.js');

  const tools = new ToolRegistry().register({
    name: 'echo', description: 'echo', riskClass: 'read',
    inputSchema: z.object({ text: z.string() }),
    async execute(args) { return { ok: true, data: { echo: args } }; },
  });
  const mkDeps = (steps) => ({
    provider: createTestStubProvider(steps),
    tools,
    permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
    sessionId: 'ags_perfsession0000000000aaaa',
    purpose: 'test:perf',
    emit: () => {}, recordReceipt: () => {}, telemetry: new SessionTelemetry(),
  });
  const useTool = JSON.stringify({ action: 'use_tool', tool: 'echo', args: { text: 'perf turn payload '.repeat(8) }, reason: 'progress' });
  const finish = JSON.stringify({ action: 'finish', reason: 'done', result: { answer: 'ok' } });
  const cfgFor = (maxTurns) => ({
    capability: 'perf', systemPrompt: 'perf system prompt '.repeat(20),
    task: 'perf task', maxTurns, resultSchema: z.object({ answer: z.string().min(2) }),
  });
  const stepsFor = (n) => Array.from({ length: n }, (_, i) => ({ rawOutput: i === n - 1 ? finish : useTool }));

  // Short sessions: 20 sessions x 6 turns (5 tool calls + finish).
  const t = Date.now();
  const sessions = 20, turnsPer = 6;
  for (let s = 0; s < sessions; s++) {
    const res = await runAgentLoop(cfgFor(turnsPer), mkDeps(stepsFor(turnsPer)));
    if (res.status !== 'completed') throw new Error(`perf loop session ${s} did not complete: ${res.status}`);
  }
  const shortMs = Date.now() - t;
  log('agent-loop 20 sessions x 6 turns (kernel-only)', shortMs, { detail: `${(shortMs / (sessions * turnsPer)).toFixed(1)}ms per turn machinery (instant provider)` });

  // One long session: 60 turns — per-turn scaling under transcript growth.
  const longN = 60;
  const t2 = Date.now();
  const res2 = await runAgentLoop(cfgFor(longN), mkDeps(stepsFor(longN)));
  if (res2.status !== 'completed') throw new Error(`perf long session did not complete: ${res2.status}`);
  const longMs = Date.now() - t2;
  log('agent-loop single 60-turn session (transcript growth)', longMs, { detail: `${(longMs / longN).toFixed(1)}ms per turn with full transcript in context` });
}

fs.writeFileSync(path.join(EVIDENCE, 'perf.json'), JSON.stringify(out, null, 2));
app.close();
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* tmp */ }
console.log('\nperf profile written to evidence/reliability/perf.json');
