import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { createDashScopeProvider } from '../src/providers/dashscope.js';
import { createZaiProvider } from '../src/providers/zai.js';
import { ConversationSchema } from '../src/domain/index.js';

/**
 * Thinking display (S4, extensibility lane): the model's reasoning text must
 * flow the REAL chain — wire parsing (reasoning_content / thinking blocks),
 * provider result, kernel event, conversation message persistence. Provider
 * parsing runs against scripted HTTP bodies through the real transport core;
 * the conversation path runs the real API server + kernel loop.
 */

const finishTurn = (over: Record<string, unknown> = {}): StubStep => ({
  rawOutput: JSON.stringify({
    action: 'finish',
    reason: 'scripted finish',
    result: {
      reply: '回复内容',
      clarifyingQuestions: [],
      candidates: [],
      readyToConverge: false,
      ...over,
    },
  }),
});

const PARSE_HYPOTHESIS = (raw: unknown): { hypothesis: string } | Error => {
  const r = raw as { hypothesis?: unknown };
  if (typeof r?.hypothesis !== 'string' || r.hypothesis.length === 0) return new Error('bad');
  return { hypothesis: r.hypothesis };
};

const chatBody = (message: Record<string, unknown>): Response =>
  new Response(JSON.stringify({
    id: 'chatcmpl-thinking-test',
    object: 'chat.completion',
    model: 'qwen-plus',
    choices: [{ index: 0, message, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('provider wire parsing (openai-compat reasoning_content)', () => {
  it('captures reasoning_content onto the result', async () => {
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-dashscope',
      fetchImpl: async () => chatBody({ role: 'assistant', content: '{"hypothesis":"H"}', reasoning_content: '先排除混杂因素，再考虑因果方向。' }),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.ok).toBe(true);
    expect(r.thinking).toContain('排除混杂因素');
  });

  it('accepts the message.reasoning gateway variant', async () => {
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-dashscope',
      fetchImpl: async () => chatBody({ role: 'assistant', content: '{"hypothesis":"H"}', reasoning: 'gateway-style reasoning' }),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.ok).toBe(true);
    expect(r.thinking).toBe('gateway-style reasoning');
  });

  it('caps oversized reasoning at 8000 chars with a truncation marker', async () => {
    const huge = '思'.repeat(9000);
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-dashscope',
      fetchImpl: async () => chatBody({ role: 'assistant', content: '{"hypothesis":"H"}', reasoning_content: huge }),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.thinking?.length).toBeLessThanOrEqual(8100);
    expect(r.thinking).toContain('truncated');
  });

  it('stays absent when the wire carries no reasoning', async () => {
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-dashscope',
      fetchImpl: async () => chatBody({ role: 'assistant', content: '{"hypothesis":"H"}' }),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.thinking).toBeUndefined();
  });
});

describe('provider wire parsing (anthropic thinking blocks)', () => {
  const anthropicBody = (blocks: unknown[]): Response =>
    new Response(JSON.stringify({
      id: 'msg-thinking-test',
      type: 'message',
      role: 'assistant',
      model: 'glm-4.6',
      content: blocks,
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('captures thinking blocks alongside the answer text', async () => {
    const provider = createZaiProvider({
      apiKey: 'test-fixture-key-zai',
      fetchImpl: async () => anthropicBody([
        { type: 'thinking', thinking: '考虑两种竞争机制，分别找判别证据。' },
        { type: 'text', text: '{"hypothesis":"H"}' },
      ]),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.ok).toBe(true);
    expect(r.thinking).toContain('竞争机制');
  });

  it('thinking-only bodies still classify as invalid_output (D-082 preserved)', async () => {
    const provider = createZaiProvider({
      apiKey: 'test-fixture-key-zai',
      fetchImpl: async () => anthropicBody([{ type: 'thinking', thinking: '只思考未作答' }]),
    });
    const r = await provider.structuredCall({ task: 't', userPayload: {}, outputKind: 'json', purpose: 'p' }, PARSE_HYPOTHESIS);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error) expect(r.error.kind).toBe('invalid_output');
  });
});

describe('conversation persistence (kernel loop → message.thinking)', () => {
  let tmp: string;
  let app: App;
  let api: ApiServer;
  let base: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-thinking-'));
    const steps: StubStep[] = [
      { thinking: '第一步推理：先查看工作区状态。', rawOutput: JSON.stringify({ action: 'use_tool', tool: 'list_runs', args: { limit: 5 }, reason: 'scripted' }) },
      finishTurn(),
    ];
    app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider(steps) });
    api = createApiServer(app, {
      port: 0,
      executor: (runId) => Promise.resolve(app.store.getRun(runId)),
      staticRoot: path.join(tmp, 'no-web-dist'),
    });
    base = `http://127.0.0.1:${await api.start()}`;
  });

  afterAll(async () => {
    await api.stop();
    app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('a turn with model reasoning persists thinking on the agent message', async () => {
    const created = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '思考过程测试' }),
    });
    const convId = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const posted = await fetch(`${base}/api/v1/conversations/${convId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '工作区里有什么？' }),
    });
    expect(posted.status).toBe(200);
    const conv = ConversationSchema.parse(((await (await fetch(`${base}/api/v1/conversations/${convId}`)).json()) as { conversation: unknown }).conversation);
    const agentMsg = [...conv.messages].reverse().find((m) => m.role === 'agent');
    expect(agentMsg).toBeDefined();
    expect(agentMsg?.thinking).toContain('第一步推理');
    expect(agentMsg?.toolTrace?.some((t) => t.tool === 'list_runs')).toBe(true);
  }, 30_000);
});
