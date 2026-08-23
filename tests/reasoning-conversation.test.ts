import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';

/**
 * Reasoning-gear conversation flow — full HTTP contract on a real store. The
 * conversation pins a model_config that DECLARES a reasoning capability; the
 * global fetch is stubbed so the REAL custom-provider transport is exercised
 * end-to-end (gear override -> resolved route -> wire body fields), and every
 * captured request body is asserted. No live route touched (localhost URLs,
 * fixture responses only).
 */

interface RecordedRequest { url: string; init: RequestInit }
const recordedRequests: RecordedRequest[] = [];

const agentActionBody = (): string =>
  JSON.stringify({
    id: 'chatcmpl-fixture',
    object: 'chat.completion',
    model: 'fixture-model',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          action: 'finish',
          reason: 'scripted turn',
          result: {
            reply: '收到。',
            clarifyingQuestions: [],
            candidates: [],
            readyToConverge: false,
          },
        }),
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  });

let tmp: string;
let base: string;
let api: ApiServer;

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlText = typeof url === 'string' ? url : url instanceof Request ? url.url : String(url);
    // Do NOT record the test harness's own calls to the local API server.
    if (!urlText.includes('/api/v1/')) {
      recordedRequests.push({ url: urlText, init: init ?? {} });
    }
    return new Response(agentActionBody(), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-reasoning-'));
  const app = await createApp({ dataDir: tmp });
  api = createApiServer(app, {
    port: 0,
    executor: (runId) => Promise.resolve(app.store.getRun(runId)),
    staticRoot: path.join(tmp, 'no-web-dist'),
  });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(() => {
  api.stop();
  vi.unstubAllGlobals();
});

type JsonBody = Record<string, unknown>;
const json = async (method: string, pathName: string, body?: unknown): Promise<{ status: number; data: JsonBody | null }> => {
  const res = await fetch(`${base}/api/v1${pathName}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text.length > 0 ? JSON.parse(text) as JsonBody : null };
};

/** Insert a model_config through the API, optionally declaring a reasoning style. */
const createConfig = async (overrides: Record<string, unknown> = {}): Promise<string> => {
  const res = await json('POST', '/model-configs', {
    label: 'Reasoning route',
    wire: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    modelId: 'fixture-model',
    apiKey: '',
    ...overrides,
  });
  expect(res.status).toBe(201);
  return (res.data!.config as JsonBody).id as string;
};

const bodiesSince = (n: number): Array<Record<string, unknown>> =>
  recordedRequests.slice(n)
    .filter((r) => r.url.includes('/chat/completions'))
    .map((r) => JSON.parse(String(r.init.body)) as Record<string, unknown>);

describe('conversation reasoning gear (HTTP + real transport, stubbed fetch)', () => {
  it('PUT accepts a declared gear on a conversation pinned to a capable config', async () => {
    const cfgId = await createConfig({ reasoning: { style: 'reasoning_effort', defaultGear: 'medium' } });
    const created = await json('POST', '/conversations', { title: 'gear conv', providerConfigId: cfgId });
    expect(created.status).toBe(201);
    const convId = (created.data!.conversation as JsonBody).id as string;

    const put = await json('PUT', `/conversations/${convId}/reasoning-gear`, { gear: 'high' });
    expect(put.status).toBe(200);
    expect((put.data as JsonBody).reasoningGear).toBe('high');
  });

  it('PUT null clears the override back to the config default', async () => {
    const cfgId = await createConfig({ reasoning: { style: 'reasoning_effort', defaultGear: 'low' } });
    const created = await json('POST', '/conversations', { providerConfigId: cfgId });
    const convId = (created.data!.conversation as JsonBody).id as string;
    expect((await json('PUT', `/conversations/${convId}/reasoning-gear`, { gear: 'high' })).status).toBe(200);
    const cleared = await json('PUT', `/conversations/${convId}/reasoning-gear`, { gear: null });
    expect(cleared.status).toBe(200);
    expect((cleared.data as JsonBody).reasoningGear).toBeNull();
  });

  it('PUT rejects an unknown gear value and a non-capable conversation (validation)', async () => {
    const cfgNoReasoning = await createConfig({});
    const plainConv = (await json('POST', '/conversations', { providerConfigId: cfgNoReasoning })).data!.conversation as JsonBody;
    const badValue = await json('PUT', `/conversations/${plainConv.id as string}/reasoning-gear`, { gear: 'maximum' });
    expect(badValue.status).toBe(400);
    const onPlain = await json('PUT', `/conversations/${plainConv.id as string}/reasoning-gear`, { gear: 'low' });
    expect(onPlain.status).toBe(400);
  });

  it('the effective gear rides EVERY model call of a turn; clearing stops the emission', async () => {
    const cfgId = await createConfig({ reasoning: { style: 'enable_thinking', defaultGear: 'low' } });
    const created = await json('POST', '/conversations', { providerConfigId: cfgId });
    const convId = (created.data!.conversation as JsonBody).id as string;
    await json('PUT', `/conversations/${convId}/reasoning-gear`, { gear: 'high' });

    const mark = recordedRequests.length;
    const sent = await json('POST', `/conversations/${convId}/messages`, { text: '用高思考档回答这个问题' });
    expect(sent.status).toBe(200);
    const bodies = bodiesSince(mark);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.enable_thinking).toBe(true);
      expect(body.thinking_budget).toBe(32768);
      expect(body.reasoning_effort).toBeUndefined();
    }

    // clear -> no thinking fields at all
    await json('PUT', `/conversations/${convId}/reasoning-gear`, { gear: null });
    const mark2 = recordedRequests.length;
    await json('POST', `/conversations/${convId}/messages`, { text: '回到默认档位' });
    const bodies2 = bodiesSince(mark2);
    expect(bodies2.length).toBeGreaterThan(0);
    for (const body of bodies2) {
      expect(body.enable_thinking).toBeUndefined();
      expect(body.thinking_budget).toBeUndefined();
    }
  });

  it('without any override, the config defaultGear applies automatically', async () => {
    const cfgId = await createConfig({ reasoning: { style: 'reasoning_effort', defaultGear: 'medium' } });
    const created = await json('POST', '/conversations', { providerConfigId: cfgId });
    const convId = (created.data!.conversation as JsonBody).id as string;
    const mark = recordedRequests.length;
    await json('POST', `/conversations/${convId}/messages`, { text: '默认档位即可' });
    const bodies = bodiesSince(mark);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.reasoning_effort).toBe('medium');
    }
  });

  it('a conversation on an incapable route sends NO reasoning fields', async () => {
    const cfgPlain = await createConfig({});
    const created = await json('POST', '/conversations', { providerConfigId: cfgPlain });
    const convId = (created.data!.conversation as JsonBody).id as string;
    const mark = recordedRequests.length;
    await json('POST', `/conversations/${convId}/messages`, { text: '普通路由' });
    const bodies = bodiesSince(mark);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
      expect(body.thinking).toBeUndefined();
    }
  });
});
