import { describe, it, expect } from 'vitest';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import { createCustomProvider, missingConfigProvider, CUSTOM_PROVIDER_PREFIX } from '../src/providers/custom.js';
import type { ModelProviderConfig } from '../src/domain/model-config.js';

/**
 * *** TEST FIXTURES ONLY ***
 * All fetch calls are mocks; no real network, no real API keys ('test-fixture-key-*'
 * values are inert non-secret strings). Assertions are behavioral: wire shapes,
 * headers, fail-closed semantics, error classification.
 */

const REQ: StructuredCallRequest = {
  task: 'Generate one falsifiable hypothesis',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'retrieval-augmented generation', year: 2026 },
  outputKind: 'json',
  purpose: 'unit-test',
  jsonSchema: { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false },
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
      id: 'msg_test_fixture',
      type: 'message',
      model: 'fixture-model',
      role: 'assistant',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: content }],
      usage: { input_tokens: 11, output_tokens: 7 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

type RecordedCall = { url: string; init: RequestInit };

const recorderFetch = (impl: (call: RecordedCall) => Promise<Response>) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const call = { url, init };
    calls.push(call);
    return impl(call);
  };
  return { fetchImpl, calls };
};

describe('createCustomProvider', () => {
  it('openai wire: POSTs {base}/chat/completions with Bearer auth', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    const res = await provider.structuredCall(REQ, parseAny);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('https://example-invalid.test/v1/chat/completions');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-fixture-key-1234');
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.model).toBe('fixture-model');
    expect(res.receipt.provider).toBe(`${CUSTOM_PROVIDER_PREFIX}mcfg_testfixture0000000000aaa`);
    expect(res.receipt.modelId).toBe('fixture-model');
    expect(res.receipt.executionMode).toBe('live');
  });

  it('anthropic wire: POSTs {base}/v1/messages with x-api-key and strips jsonSchema', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => anthropicOk('{"ok":true}'));
    const provider = createCustomProvider(config({ wire: 'anthropic' }), { fetchImpl });
    const res = await provider.structuredCall(REQ, parseAny);
    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://example-invalid.test/v1/v1/messages');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-fixture-key-1234');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const bodyText = String(calls[0]!.init.body);
    expect(bodyText).not.toContain('json_schema');
    expect(bodyText).not.toContain('response_format');
    // openai wire keeps the strict-FC projection for providers that can enforce it
    const openaiBody = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(openaiBody.system).toBeTypeOf('string');
  });

  it('openai wire keeps jsonSchema in the body (strict-FC tools projection passes through)', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    await provider.structuredCall(REQ, parseAny);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.tools).toBeDefined(); // jsonSchema rides the strict-FC tools transport
    expect(body.response_format).toBeUndefined();
  });

  it('openai wire without jsonSchema uses the json_object transport', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => chatOk('{"ok":true}'));
    const provider = createCustomProvider(config(), { fetchImpl });
    await provider.structuredCall({ ...REQ, jsonSchema: undefined }, parseAny);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('fail-closed with an empty key: auth_error, zero network calls', async () => {
    const { fetchImpl, calls } = recorderFetch(async () => {
      throw new Error('must not be called');
    });
    const provider = createCustomProvider(config({ apiKey: '' }), { fetchImpl });
    expect(provider.liveReady).toBe(false);
    const res = await provider.structuredCall(REQ, parseAny);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('classifies 401 as auth_error with httpStatus', async () => {
    const { fetchImpl } = recorderFetch(async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    const provider = createCustomProvider(config(), { fetchImpl });
    const res = await provider.structuredCall(REQ, parseAny);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.httpStatus).toBe(401);
  });

  it('liveReady reflects key presence', () => {
    expect(createCustomProvider(config()).liveReady).toBe(true);
    expect(createCustomProvider(config({ apiKey: '' })).liveReady).toBe(false);
  });
});

describe('missingConfigProvider', () => {
  it('fails every call closed with auth_error and the dangling id in the provider name', async () => {
    const provider = missingConfigProvider('mcfg_deleted0000000000000000z');
    expect(provider.name).toBe('custom:mcfg_deleted0000000000000000z');
    expect(provider.liveReady).toBe(false);
    const res = await provider.structuredCall(REQ, parseAny);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.message).toContain('deleted while run references it');
  });
});
