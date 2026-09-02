/**
 * Backend performance gate (FA-PRF-02): real-path percentile measurements with
 * hard thresholds for CI. The spike (spikes/reliability-perf.mjs, 2026-08-24)
 * measured means once; this gate repeats every operation, reports p50/p95/p99
 * and enforces per-metric p95 ceilings in --ci mode.
 *
 * Threshold provenance: first local baseline 2026-09-02 (evidence/reliability/
 * perf.json: cold-start 141-254ms, listEvents 123ms, events pagination 139ms,
 * chain verify 65ms) times ~4-10x hosted-runner headroom. PROVISIONAL: tighten
 * against hosted p95s once the CI job has recorded a few runs — the artifact
 * (evidence/reliability/perf-gate.json) is committed to the run log for that.
 *
 * Usage: node scripts/perf-gate.mjs [--ci] [--samples N]
 * Exit:   0 ok / 1 threshold breach (--ci) or measurement failure.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

/** Nearest-rank percentile of a non-empty sample array. Pure, unit-tested. */
export const percentileOf = (sortedSamples, p) => {
  if (!Array.isArray(sortedSamples) || sortedSamples.length === 0) {
    throw new Error('percentileOf: empty sample');
  }
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sortedSamples.length), 1), sortedSamples.length);
  return sortedSamples[rank - 1];
};

/** p95 must not exceed the threshold; every threshold is explicit (no default pass). Pure, unit-tested. */
export const breachesOf = (metrics, thresholds) =>
  metrics
    .filter((m) => !Number.isFinite(m.p95))
    .map((m) => `${m.name}: invalid p95 measurement (${String(m.p95)})`)
    .concat(metrics
      .filter((m) => Number.isFinite(m.p95))
      .filter((m) => thresholds[m.name] === undefined)
      .map((m) => `${m.name}: no threshold entry`))
    .concat(metrics
      .filter((m) => Number.isFinite(m.p95) && thresholds[m.name] !== undefined)
      .filter((m) => m.p95 > thresholds[m.name])
      .map((m) => `${m.name}: p95 ${m.p95}ms > ${thresholds[m.name]}ms`));

export const THRESHOLDS_MS = Object.freeze({
  'cli-cold-start': 3000,
  'createApp': 1000,
  'api-server-start': 500,
  'api-get-runs': 500,
  'api-get-run-heavy': 500,
  'api-events-pagination': 1500,
  'api-health-lazy-verify': 1000,
  'store-list-events-15k': 1500,
  'store-verify-chain-15k': 1500,
  'kernel-turns-batch': 1000,
});

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const CI = process.argv.includes('--ci');
  const samplesIdx = process.argv.indexOf('--samples');
  const SAMPLES = samplesIdx >= 0 ? Math.max(3, Number(process.argv[samplesIdx + 1])) : 12;
  const COLD_STARTS = Math.max(2, Math.round(SAMPLES / 2));
  const ROOT = process.cwd();
  const EVIDENCE = path.join(ROOT, 'evidence', 'reliability');
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
  const { openDb } = await imp('dist/persistence/db.js');
  const { Store } = await imp('dist/persistence/store.js');
  const { createApp } = await imp('dist/app/composition.js');
  const { createApiServer } = await imp('dist/server/api.js');
  const { ResearchQuestion, newId } = await imp('dist/domain/index.js');

  const timed = async (fn) => {
    const s = performance.now();
    await fn();
    return Math.round(performance.now() - s);
  };
  const sample = async (name, fn, count) => {
    const raw = [];
    for (let i = 0; i < count; i += 1) raw.push(await timed(fn));
    raw.sort((a, b) => a - b);
    return {
      name,
      n: raw.length,
      p50: percentileOf(raw, 50),
      p95: percentileOf(raw, 95),
      p99: percentileOf(raw, 99),
      max: raw[raw.length - 1],
    };
  };

  // ---- 1. CLI cold start (fresh processes) ----
  const cold = [];
  for (let i = 0; i < COLD_STARTS; i += 1) {
    cold.push(await timed(() => new Promise((res) => {
      const p = spawn(process.execPath, ['dist/cli/main.js', 'runs', '--json'], { cwd: ROOT, stdio: 'ignore' });
      p.on('exit', res);
    })));
  }
  cold.sort((a, b) => a - b);
  const coldMetric = { name: 'cli-cold-start', n: cold.length, p50: percentileOf(cold, 50), p95: percentileOf(cold, 95), p99: percentileOf(cold, 99), max: cold[cold.length - 1] };

  // ---- workspace with a heavy run (same shape as the spike) ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-perf-gate-'));
  let runId;
  {
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const run = store.createRun(ResearchQuestion.parse({
      id: newId('q'), text: 'perf gate heavy run', background: '', goalType: 'exploratory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    }));
    for (let i = 0; i < 15_000; i += 1) store.appendEvent(run.id, { type: 'note', detail: { reason: 'perf-gate', i } });
    runId = run.id;
    db.close();
  }

  const metrics = [coldMetric];
  metrics.push(await sample('createApp', async () => {
    const a = await createApp({ dataDir: dir });
    a.close();
  }, SAMPLES));

  const app = await createApp({ dataDir: dir });
  const api = createApiServer(app, { port: 0, automations: { enabled: false }, watchdogIntervalMs: 0 });
  try {
    const port = await api.start();
    const base = `http://127.0.0.1:${port}`;
    const get = async (p) => { const r = await fetch(`${base}${p}`); await r.arrayBuffer(); };
    metrics.push(await sample('api-server-start', async () => {
      const a = createApiServer(app, { port: 0, automations: { enabled: false }, watchdogIntervalMs: 0 });
      await a.start();
      await a.stop();
    }, Math.min(SAMPLES, 6)));
    metrics.push(await sample('api-get-runs', () => get('/api/v1/runs'), SAMPLES));
    metrics.push(await sample('api-get-run-heavy', () => get(`/api/v1/runs/${runId}`), SAMPLES));
    metrics.push(await sample('api-events-pagination', () => get(`/api/v1/runs/${runId}/events?afterSeq=14990`), SAMPLES));
    metrics.push(await sample('api-health-lazy-verify', () => get('/api/v1/health'), Math.min(SAMPLES, 6)));
  } finally {
    await api.stop();
  }

  // ---- store plane + kernel machinery (fresh connection, not through HTTP) ----
  {
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    metrics.push(await sample('store-list-events-15k', async () => { void store.listEvents(runId).length; }, SAMPLES));
    metrics.push(await sample('store-verify-chain-15k', () => { void store.verifyEventChain(runId).ok; }, Math.min(SAMPLES, 6)));
    db.close();
  }
  {
    const { runAgentLoop } = await imp('dist/agent/loop.js');
    const { ToolRegistry } = await imp('dist/agent/tool.js');
    const { PermissionEngine } = await imp('dist/agent/permissions.js');
    const { SessionTelemetry } = await imp('dist/agent/telemetry.js');
    const { createTestStubProvider } = await imp('dist/providers/test-stub.js');
    // 6-turn machinery per session: the first five finish attempts fail the
    // literal schema (bounded reask loop), the sixth passes — this exercises
    // turn bookkeeping, transcript growth and event emission per turn.
    const steps = Array.from({ length: 6 }, (_, k) => ({
      rawOutput: JSON.stringify({ action: 'finish', reason: `attempt ${k}`, result: { answer: k === 5 ? 'ok' : `no-${k}` } }),
    }));
    const schema = z.object({ answer: z.literal('ok') });
    metrics.push(await sample('kernel-turns-batch', async () => {
      for (let i = 0; i < 3; i += 1) {
        await runAgentLoop(
          { capability: 'perf-gate', systemPrompt: 's', task: 't', maxTurns: 6, resultSchema: schema },
          { provider: createTestStubProvider(steps), tools: new ToolRegistry(), permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }), sessionId: 'ags_perfgate00000000000aaaa', purpose: 'perf-gate', emit: () => {}, recordReceipt: () => {}, telemetry: new SessionTelemetry() },
        ).catch(() => {});
      }
    }, Math.min(SAMPLES, 6)));
  }

  const breaches = breachesOf(metrics, THRESHOLDS_MS);
  const artifact = {
    measuredAt: new Date().toISOString(),
    ci: CI,
    samples: SAMPLES,
    thresholds: THRESHOLDS_MS,
    metrics,
    breaches,
    verdict: breaches.length === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(path.join(EVIDENCE, 'perf-gate.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  for (const m of metrics) console.log(`${String(m.p95).padStart(6)}ms p95  ${m.name} (p50 ${m.p50} p99 ${m.p99} max ${m.max})`);
  if (breaches.length > 0) {
    for (const b of breaches) console.error(`PERF-GATE BREACH: ${b}`);
    process.exit(1);
  }
  console.log(`PERF-GATE ${CI ? 'CI ' : ''}PASS (thresholds p95; artifact evidence/reliability/perf-gate.json)`);
  app.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows handle-lag on the sqlite file — OS temp cleanup covers the dir.
  }
}
