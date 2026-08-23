import { describe, expect, it } from 'vitest';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import { createCustomProvider } from '../src/providers/custom.js';
import { reasoningBodyFields, computeRequestHash } from '../src/providers/http.js';
import type { ModelProviderConfig, ReasoningGear } from '../src/domain/model-config.js';

/**
 * *** TEST FIXTURES ONLY ***
 * Wire-shape tests for the reasoning-gear emission: a request carrying
 * `reasoning` gets the dialect-correct body fields; a request without one gets
 * ZERO reasoning fields (exact legacy wire shape). No network, no secrets.
 */

const REQ: StructuredCallRequest = {
  task: 'Generate one falsifiable hypothesis',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'rag', year: 2026 },
  outputKind: 'json',
  purpose: 'unit-test',
};

const parseAny = (raw: unknown): unknown => raw;

const config = (overrides: Partial<ModelProviderConfig> = {}): ModelProviderConfig => ({
  id: 'mcfg_testfixture0000000000aaa',
  label: 'My custom route',
  wire: 'openai',
  baseUrl: 'https://example-invalid.test/v1',
  modelId: 'fixture-model',
  apiKey: 'test-fixture-key-1234',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const chatOk = (content: string) =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-test-fixture',
      object: 'chat.completion',
      model: 'fixture-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const anthropicOk = (content: string) =>
  new Response(
    JSON.stringify({
      id: 'msg_test-fixture',
      model: 'fixture-model',
      role: 'assistant',
      content: [{ type: 'text', text: content }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 11, output_tokens: 7 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const recorderFetch = (impl: (call: { url: string; init: RequestInit }) => Promise<Response>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return impl({ url, init });
  };
  return { fetchImpl, calls };
};

const bodyOf = (call: { init: RequestInit }): Record<string, unknown> => JSON.parse(String(call.init.body)) as Record<string, unknown>;

describe('reasoningBodyFields (single owner of the dialect map)', () => {
  it('reasoning_effort emits {reasoning_effort} on the openai wire', () => {
    expect(reasoningBodyFields('openai', { style: 'reasoning_effort', gear: 'high' })).toEqual({
      reasoning_effort: 'high',
    });
  });

  it('enable_thinking emits Qwen3 dialect fields with the mapped budget', () => {
    expect(reasoningBodyFields('openai', { style: 'enable_thinking', gear: 'low' })).toEqual({
      enable_thinking: true,
      thinking_budget: 8192,
    });
  });

  it('thinking_budget emits the Anthropic-Messages thinking parameter', () => {
    expect(reasoningBodyFields('anthropic', { style: 'thinking_budget', gear: 'medium' })).toEqual({
      thinking: { type: 'enabled', budget_tokens: 16384 },
    });
  });

  it('style/wire mismatch returns no fields (defense in depth behind schema validation)', () => {
    expect(reasoningBodyFields('anthropic', { style: 'reasoning_effort', gear: 'low' })).toEqual({});
    expect(reasoningBodyFields('openai', { style: 'thinking_budget', gear: 'low' })).toEqual({});
  });
});

describe('transport emission via createCustomProvider', () => {
  it('openai wire + reasoning_effort: effort rides the chat/completions body', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    const res = await provider.structuredCall({ ...REQ, reasoning: { style: 'reasoning_effort', gear: 'medium' } }, parseAny);
    expect(res.ok).toBe(true);
    const body = bodyOf(calls[0]!);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.enable_thinking).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it('openai wire + enable_thinking: Qwen dialect fields ride the body', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    await provider.structuredCall({ ...REQ, reasoning: { style: 'enable_thinking', gear: 'high' } }, parseAny);
    const body = bodyOf(calls[0]!);
    expect(body.enable_thinking).toBe(true);
    expect(body.thinking_budget).toBe(32768);
  });

  it('anthropic wire + thinking_budget: thinking parameter rides the messages body; temperature untouched', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => anthropicOk('{"ok":true}'));
    const provider = createCustomProvider(config({ wire: 'anthropic' }), { fetchImpl });
    const res = await provider.structuredCall({ ...REQ, reasoning: { style: 'thinking_budget', gear: 'low' } }, parseAny);
    expect(res.ok).toBe(true);
    const body = bodyOf(calls[0]!);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
  });

  it('NO reasoning on the request: zero reasoning fields on either wire (legacy shape)', async () => {
    const openaiRun = recorderFetch(async () => chatOk('{"ok":true}'));
    await createCustomProvider(config(), { fetchImpl: openaiRun.fetchImpl }).structuredCall(REQ, parseAny);
    const oBody = bodyOf(openaiRun.calls[0]!);
    expect(oBody.reasoning_effort).toBeUndefined();
    expect(oBody.enable_thinking).toBeUndefined();
    expect(oBody.thinking_budget).toBeUndefined();

    const anthRun = recorderFetch(async () => anthropicOk('{"ok":true}'));
    await createCustomProvider(config({ wire: 'anthropic' }), { fetchImpl: anthRun.fetchImpl }).structuredCall(REQ, parseAny);
    const aBody = bodyOf(anthRun.calls[0]!);
    expect(aBody.thinking).toBeUndefined();
  });

  it('receipt records the served reasoning gear (provenance/reproducibility)', async () => {
    const { fetchImpl } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    const res = await provider.structuredCall({ ...REQ, reasoning: { style: 'reasoning_effort', gear: 'high' } }, parseAny);
    expect(res.ok).toBe(true);
    expect((res.receipt as { reasoningGear?: ReasoningGear }).reasoningGear).toBe('high');
  });

  it('request hash changes when the gear changes (identical otherwise)', () => {
    const lowHash = computeRequestHash({ ...REQ, reasoning: { style: 'reasoning_effort', gear: 'low' } });
    const highHash = computeRequestHash({ ...REQ, reasoning: { style: 'reasoning_effort', gear: 'high' } });
    const againLowHash = computeRequestHash({ ...REQ, reasoning: { style: 'reasoning_effort', gear: 'low' } });
    expect(lowHash).not.toBe(highHash);
    expect(lowHash).toBe(againLowHash);
  });
});
