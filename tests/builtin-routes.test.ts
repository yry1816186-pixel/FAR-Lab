import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { writeBuiltinOverrides, BUILTIN_DEFAULT_PROVIDER_META_KEY, resolveBuiltinProvider } from '../src/providers/builtin-overrides.js';
import { aggregateRunUsage } from '../src/app/usage-ledger.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { newId, ProvenanceReceipt, ResearchQuestion } from '../src/domain/index.js';

/**
 * Built-in env routes (zai/dashscope) product layer: UI-declared modelId override,
 * list pricing, default-route switch + the cost ledger following the declared
 * pricing. All offline/deterministic (HTTP surface over the real kernel in a
 * throwaway temp dir; ledger from in-memory receipts; no live call can happen —
 * provider is an empty scripted stub).
 */

// Pin the env chain so default-route assertions are independent of the host shell.
const SAVED_ENV_PROVIDER = process.env.FARLAB_MODEL_PROVIDER;

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  delete process.env.FARLAB_MODEL_PROVIDER; // deterministic env default: 'zai'
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-builtin-routes-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // no live route; empty script fails loudly if called
  });
  api = createApiServer(app, { port: 0, executor, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  if (SAVED_ENV_PROVIDER !== undefined) process.env.FARLAB_MODEL_PROVIDER = SAVED_ENV_PROVIDER;
});

type Json = Record<string, unknown>;

const request = async (method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Json | null }> => {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: Json | null;
  try {
    parsed = text.length > 0 ? (JSON.parse(text) as Json) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
};

type RouteView = {
  name: string; kind: string; liveReady: boolean; baseUrl: string; apiKeyEnvVar: string;
  envModelId: string; effectiveModelId: string;
  pricing?: { inputUsdPerMTok: number; outputUsdPerMTok: number } | null;
  isBuiltinDefault: boolean;
};

const routesOf = (body: Json | null): RouteView[] => (body?.routes as unknown as RouteView[]) ?? [];

describe('GET /model-configs/builtin-routes', () => {
  it('lists live routes (open set, no archived kind), no overrides initially', async () => {
    const { status, body } = await request('GET', '/api/v1/model-configs/builtin-routes');
    expect(status).toBe(200);
    const names = routesOf(body).map((r) => r.name);
    expect(names).toContain('zai');
    expect(names).toContain('dashscope');
    expect(names).toContain('deepseek'); // unbanned 2026-08-26: editable live route
    expect(names).toContain('universal'); // any-endpoint env route
    expect(routesOf(body).every((r) => r.kind === 'live')).toBe(true);
    const deepseek = routesOf(body).find((r) => r.name === 'deepseek')!;
    expect(deepseek.kind).toBe('live');
    expect(body?.defaultSource).toBe('env');
    const defaults = routesOf(body).filter((r) => r.isBuiltinDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.name).toBe('zai'); // pinned env (FARLAB_MODEL_PROVIDER deleted in beforeAll)
    for (const r of routesOf(body).filter((x) => x.kind === 'live')) {
      expect(r.effectiveModelId).toBe(r.envModelId); // no override yet
    }
  });
});

describe('PUT /model-configs/builtin-routes/:name', () => {
  it('overrides the modelId (effective changes, env baseline does not) and clears with null', async () => {
    const put = await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { modelId: 'glm-test-override' });
    expect(put.status).toBe(200);
    const zai = routesOf(put.body).find((r) => r.name === 'zai')!;
    expect(zai.effectiveModelId).toBe('glm-test-override');
    expect(zai.envModelId).not.toBe('glm-test-override'); // env view untouched

    const cleared = await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { modelId: null });
    expect(cleared.status).toBe(200);
    const zaiAfter = routesOf(cleared.body).find((r) => r.name === 'zai')!;
    expect(zaiAfter.effectiveModelId).toBe(zaiAfter.envModelId);
  });

  it('declares and clears pricing', async () => {
    const put = await request('PUT', '/api/v1/model-configs/builtin-routes/zai', {
      pricing: { inputUsdPerMTok: 1.5, outputUsdPerMTok: 4.5 },
    });
    expect(put.status).toBe(200);
    expect(routesOf(put.body).find((r) => r.name === 'zai')!.pricing).toEqual({ inputUsdPerMTok: 1.5, outputUsdPerMTok: 4.5 });

    const cleared = await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { pricing: null });
    expect(cleared.status).toBe(200);
    expect(routesOf(cleared.body).find((r) => r.name === 'zai')!.pricing).toBeUndefined();
  });

  it('GET /model-configs/templates serves the worldwide preset catalog over HTTP', async () => {
    const { status, body } = await request('GET', '/api/v1/model-configs/templates');
    expect(status).toBe(200);
    const templates = (body?.templates as Array<{ id: string; wire: string; baseUrl: string }>) ?? [];
    expect(templates.length).toBeGreaterThanOrEqual(18);
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // worldwide coverage over all three wires, gems: gemini-native + Chinese + local
    const byId = new Map(templates.map((t) => [t.id, t]));
    expect(byId.get('google-gemini')?.wire).toBe('gemini');
    expect(byId.get('anthropic')?.wire).toBe('anthropic');
    expect(byId.get('openai')?.wire).toBe('openai');
    for (const id of ['deepseek', 'moonshot', 'zhipu', 'dashscope', 'openrouter', 'ollama']) {
      expect(byId.get(id)).toBeDefined();
    }
  });

  it('rejects unknown routes, bad pricing and non-editable fields', async () => {
    expect((await request('PUT', '/api/v1/model-configs/builtin-routes/deepseek', { modelId: 'deepseek-chat' })).status).toBe(200); // live: editable now
    // restore: leave no deepseek override behind for later suites
    await request('PUT', '/api/v1/model-configs/builtin-routes/deepseek', { modelId: null });
    expect((await request('PUT', '/api/v1/model-configs/builtin-routes/nope', { modelId: 'x' })).status).toBe(400);
    expect((await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { pricing: { inputUsdPerMTok: -1, outputUsdPerMTok: 1 } })).status).toBe(400);
    expect((await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { baseUrl: 'https://evil.test' })).status).toBe(400);
  });
});

describe('PUT /model-configs/builtin-routes (default switch)', () => {
  it('switches the built-in default at runtime; model-configs envDefault follows', async () => {
    const put = await request('PUT', '/api/v1/model-configs/builtin-routes', { name: 'dashscope' });
    expect(put.status).toBe(200);
    expect(put.body?.defaultSource).toBe('ui');
    expect(routesOf(put.body).find((r) => r.name === 'dashscope')!.isBuiltinDefault).toBe(true);
    expect(routesOf(put.body).find((r) => r.name === 'zai')!.isBuiltinDefault).toBe(false);

    // The settings list's env-default line reflects the effective (switched) route.
    const list = await request('GET', '/api/v1/model-configs');
    expect((list.body?.envDefault as { name: string; defaultSource: string })).toMatchObject({ name: 'dashscope', defaultSource: 'ui' });

    // The product-plane default resolves per call (the dynamic wrapper in
    // composition delegates here); the test app pins providerOverride to a stub —
    // an explicit injection that must stay static — so verify the resolver directly.
    expect(resolveBuiltinProvider(app.store).name).toBe('dashscope');

    // restore for later suites in this file
    await request('PUT', '/api/v1/model-configs/builtin-routes', { name: 'zai' });
  });
});

describe('usage ledger follows built-in route pricing', () => {
  it('prices zai receipts from the UI-declared pricing; clearing returns to unknown', async () => {
    // receipt fixture in the local store of the SAME app the API wrote overrides to
    const HASH = 'a'.repeat(64);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = app.store.createRun(q);
    const mkReceipt = (provider: string) =>
      ProvenanceReceipt.parse({
        id: newId('rcp'), runId: run.id, kind: 'model_call', executionMode: 'test', at: new Date().toISOString(),
        stage: 'scope',
        modelCall: {
          provider, modelId: 'glm-4.6', usage: { promptTokens: 500_000, completionTokens: 250_000, totalTokens: 750_000 },
          latencyMs: 5, requestHash: HASH, outputHash: HASH,
        },
      });
    app.store.putObject('receipt', mkReceipt('zai'));

    const unpriced = aggregateRunUsage(app.store, run.id).find((u) => u.provider === 'zai')!;
    expect(unpriced.costUsd).toBeNull();
    expect(unpriced.pricingBasis).toBe('unknown');

    await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 4 } });
    const priced = aggregateRunUsage(app.store, run.id).find((u) => u.provider === 'zai')!;
    expect(priced.costUsd).toBeCloseTo(0.5 * 2 + 0.25 * 4, 6); // $2.00
    expect(priced.pricingBasis).toBe('user-configured');

    await request('PUT', '/api/v1/model-configs/builtin-routes/zai', { pricing: null });
    expect(aggregateRunUsage(app.store, run.id).find((u) => u.provider === 'zai')!.costUsd).toBeNull();
  });
});

describe('builtin-overrides storage invariants', () => {
  it('an all-empty override map removes the meta key (no dead state)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-builtin-store-'));
    const store = new Store(openDb(path.join(dir, 'far.db')));
    writeBuiltinOverrides(store, { zai: { modelId: 'glm-x' } });
    expect(store.getMeta('builtin_route_overrides')).toContain('glm-x');
    writeBuiltinOverrides(store, { zai: {} }); // nothing left -> key removed
    expect(store.getMeta('builtin_route_overrides')).toBeNull();
    expect(store.getMeta(BUILTIN_DEFAULT_PROVIDER_META_KEY)).toBeNull();
    (store as unknown as { db: { close: () => void } }).db.close();
  });
});
