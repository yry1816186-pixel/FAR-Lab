import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

// *** TEST-ONLY *** model-config CRUD/active/test HTTP surface over the real kernel
// (real Store/SQLite in a throwaway temp dir, empty scripted provider so no live model
// call can happen; the connectivity-test endpoint's network layer is intercepted by
// stubbing global fetch — 'test-fixture-key-*' values are inert non-secrets).

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

const executor = (runId: string): Promise<unknown> => Promise.resolve(app.store.getRun(runId));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-api-modelcfg-'));
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Json = Record<string, unknown>;

const request = async (method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Json | null; text: string }> => {
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
  return { status: res.status, body: parsed, text };
};

const validBody = (overrides: Record<string, unknown> = {}) => ({
  label: 'My GLM route',
  wire: 'openai',
  baseUrl: 'https://example-invalid.test/v1',
  modelId: 'some-model',
  apiKey: 'test-fixture-key-abcd',
  ...overrides,
});

const configOf = (body: Json | null): Json => {
  if (body === null || typeof body !== 'object') throw new Error('expected a body');
  const config = (body as Record<string, unknown>).config;
  if (config === undefined || typeof config !== 'object') throw new Error('expected config in body');
  return config as Json;
};

// ---- CRUD --------------------------------------------------------------------

describe('/api/v1/model-configs CRUD', () => {
  it('starts empty with the env default surfaced and no secrets', async () => {
    const { status, body } = await request('GET', '/api/v1/model-configs');
    expect(status).toBe(200);
    expect(body?.configs).toEqual([]);
    expect(body?.activeModelConfigId).toBeNull();
    expect(body?.envDefault).toMatchObject({ name: 'zai' });
    expect(body?.text ?? JSON.stringify(body)).not.toContain('test-fixture-key');
  });

  it('creates a config (201) and NEVER echoes the plaintext key', async () => {
    const { status, body, text } = await request('POST', '/api/v1/model-configs', validBody());
    expect(status).toBe(201);
    const config = configOf(body);
    expect(config.label).toBe('My GLM route');
    expect(config.wire).toBe('openai');
    expect(config.apiKeyMasked).toBe('••••abcd');
    expect(config.apiKeySet).toBe(true);
    expect(config.active).toBe(false);
    expect(text).not.toContain('test-fixture-key-abcd');
  });

  it('rejects invalid payloads with validation errors', async () => {
    expect((await request('POST', '/api/v1/model-configs', validBody({ baseUrl: 'not a url' }))).status).toBe(400);
    expect((await request('POST', '/api/v1/model-configs', validBody({ wire: 'grpc' }))).status).toBe(400);
    expect((await request('POST', '/api/v1/model-configs', validBody({ label: '' }))).status).toBe(400);
  });

  it('update: absent apiKey keeps the stored key; present apiKey replaces it; label/wire validated', async () => {
    const created = configOf((await request('POST', '/api/v1/model-configs', validBody())).body);
    const id = created.id as string;

    const kept = configOf((await request('PUT', `/api/v1/model-configs/${id}`, { label: 'Renamed' })).body);
    expect(kept.label).toBe('Renamed');
    expect(kept.apiKeyMasked).toBe('••••abcd'); // key preserved

    const replaced = configOf((await request('PUT', `/api/v1/model-configs/${id}`, { apiKey: 'test-fixture-key-wxyz' })).body);
    expect(replaced.apiKeyMasked).toBe('••••wxyz');

    expect((await request('PUT', `/api/v1/model-configs/${id}`, { wire: 'grpc' })).status).toBe(400);
    expect((await request('PUT', `/api/v1/model-configs/mcfg_nosuch0000000000000000`, validBody())).status).toBe(404);
  });

  it('GET single by id; 404 + validation on bad ids', async () => {
    const created = configOf((await request('POST', '/api/v1/model-configs', validBody())).body);
    const got = configOf((await request('GET', `/api/v1/model-configs/${created.id}`)).body);
    expect(got.id).toBe(created.id);
    expect((await request('GET', '/api/v1/model-configs/not-an-id')).status).toBe(400);
    expect((await request('GET', '/api/v1/model-configs/mcfg_nosuch0000000000000000')).status).toBe(404);
  });

  it('delete removes the config; deleting the active default clears it', async () => {
    const created = configOf((await request('POST', '/api/v1/model-configs', validBody())).body);
    const id = created.id as string;
    expect((await request('PUT', '/api/v1/model-configs/active', { id })).status).toBe(200);
    expect((await request('DELETE', `/api/v1/model-configs/${id}`)).status).toBe(200);
    expect((await request('DELETE', `/api/v1/model-configs/${id}`)).status).toBe(404);
    const list = (await request('GET', '/api/v1/model-configs')).body;
    expect(list?.activeModelConfigId).toBeNull();
  });
});

// ---- active default ------------------------------------------------------------

describe('/api/v1/model-configs/active', () => {
  it('sets and clears the global default; rejects unknown ids and bad shapes', async () => {
    const a = configOf((await request('POST', '/api/v1/model-configs', validBody({ label: 'A' }))).body);
    const b = configOf((await request('POST', '/api/v1/model-configs', validBody({ label: 'B' }))).body);

    expect((await request('PUT', '/api/v1/model-configs/active', { id: a.id })).status).toBe(200);
    let list = (await request('GET', '/api/v1/model-configs')).body;
    expect(list?.activeModelConfigId).toBe(a.id);
    const aAgain = (list?.configs as Json[]).find((c) => c.id === a.id);
    expect(aAgain?.active).toBe(true);

    expect((await request('PUT', '/api/v1/model-configs/active', { id: b.id })).status).toBe(200);
    list = (await request('GET', '/api/v1/model-configs')).body;
    expect(list?.activeModelConfigId).toBe(b.id);

    expect((await request('PUT', '/api/v1/model-configs/active', { id: null })).status).toBe(200);
    list = (await request('GET', '/api/v1/model-configs')).body;
    expect(list?.activeModelConfigId).toBeNull();

    expect((await request('PUT', '/api/v1/model-configs/active', { id: 'mcfg_nosuch0000000000000000' })).status).toBe(404);
    expect((await request('PUT', '/api/v1/model-configs/active', { id: 'garbage' })).status).toBe(400);
    expect((await request('PUT', '/api/v1/model-configs/active', {})).status).toBe(400);

    expect((await request('PUT', '/api/v1/model-configs/active', { id: 'mcfg_nosuch0000000000000000' })).status).toBe(404);
    expect((await request('PUT', '/api/v1/model-configs/active', { id: 'garbage' })).status).toBe(400);
    expect((await request('PUT', '/api/v1/model-configs/active', {})).status).toBe(400);
  });
});

// ---- connectivity test ----------------------------------------------------------

describe('POST /api/v1/model-configs/test', () => {
  const chatOk = () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test-fixture',
        object: 'chat.completion',
        model: 'some-model',
        choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  /**
   * The API server and this test share one process/one global fetch: the stub must
   * pass through loopback API calls (our request helper) and only intercept the
   * model-endpoint calls the server originates.
   */
  const stubModelFetch = (serve: (url: string, init?: RequestInit) => Promise<Response>): void => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', ((url: unknown, init?: RequestInit) => {
      const u = String(url);
      return u.startsWith(base) ? realFetch(u, init) : serve(u, init);
    }) as typeof fetch);
  };

  it('tests an unsaved draft (openai wire) and reports ok with latency', async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    stubModelFetch((url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, auth: headers.authorization });
      return Promise.resolve(chatOk());
    });
    const { status, body } = await request('POST', '/api/v1/model-configs/test', validBody());
    expect(status).toBe(200);
    expect(body?.ok).toBe(true);
    expect(body?.modelId).toBe('some-model');
    expect(typeof body?.latencyMs).toBe('number');
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('https://example-invalid.test/v1/chat/completions');
    expect(calls[0]!.auth).toBe('Bearer test-fixture-key-abcd');
  });

  it('tests a stored config without the client resending its key', async () => {
    const stored = configOf((await request('POST', '/api/v1/model-configs', validBody())).body);
    const calls: { auth: string | undefined }[] = [];
    stubModelFetch((_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ auth: headers.authorization });
      return Promise.resolve(chatOk());
    });
    const { status, body } = await request('POST', '/api/v1/model-configs/test', { configId: stored.id });
    expect(status).toBe(200);
    expect(body?.ok).toBe(true);
    expect(calls[0]?.auth).toBe('Bearer test-fixture-key-abcd'); // server supplied the stored key
  });

  it('surfaces provider auth failures with the classified error', async () => {
    stubModelFetch(async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    const { status, body } = await request('POST', '/api/v1/model-configs/test', validBody());
    expect(status).toBe(200); // the probe ran; the ROUTE is what failed
    expect(body?.ok).toBe(false);
    expect((body?.error as Json)?.kind).toBe('auth_error');
  });

  it('fail-closed drafts (empty key) report auth_error without any network call', async () => {
    const modelCalls: string[] = [];
    stubModelFetch((url) => {
      modelCalls.push(url);
      return Promise.resolve(chatOk());
    });
    const { status, body } = await request('POST', '/api/v1/model-configs/test', validBody({ apiKey: '' }));
    expect(status).toBe(200);
    expect(body?.ok).toBe(false);
    expect((body?.error as Json)?.kind).toBe('auth_error');
    expect(modelCalls).toEqual([]);
  });

  it('validates the draft shape before probing', async () => {
    expect((await request('POST', '/api/v1/model-configs/test', validBody({ baseUrl: 'nope' }))).status).toBe(400);
    expect((await request('POST', '/api/v1/model-configs/test', { configId: 'mcfg_nosuch0000000000000000' })).status).toBe(404);
  });
});

// ---- run binding ----------------------------------------------------------------

describe('POST /api/v1/runs providerConfigId', () => {
  it('binds a valid config to the created run; rejects malformed and unknown ids', async () => {
    const stored = configOf((await request('POST', '/api/v1/model-configs', validBody())).body);
    const ok = await request('POST', '/api/v1/runs', { text: 'Why do models hallucinate?', providerConfigId: stored.id });
    expect(ok.status).toBe(202);
    const runId = (ok.body?.runId as string) ?? '';
    expect(app.store.getRun(runId)?.providerConfigId).toBe(stored.id);

    expect((await request('POST', '/api/v1/runs', { text: 'q2', providerConfigId: 'garbage' })).status).toBe(400);
    const unknown = await request('POST', '/api/v1/runs', { text: 'q3', providerConfigId: 'mcfg_nosuch0000000000000000' });
    expect(unknown.status).toBe(404);
    // plain create still works without the field (env chain remains the default)
    const plain = await request('POST', '/api/v1/runs', { text: 'q4' });
    expect(plain.status).toBe(202);
    expect(app.store.getRun((plain.body?.runId as string) ?? '')?.providerConfigId).toBeUndefined();
  });
});
