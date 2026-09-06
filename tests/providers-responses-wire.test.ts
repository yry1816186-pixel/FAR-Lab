import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ModelProviderConfig, PRODUCT_WIRE_PROTOCOLS } from '../src/domain/model-config.js';
import { newId } from '../src/domain/ids.js';
import { createCustomProvider } from '../src/providers/custom.js';
import { createUniversalProvider } from '../src/providers/universal.js';
import { canonicalSha256 } from '../src/shared/crypto.js';
import type { StructuredCallRequest, StructuredOutputEvent } from '../src/shared/ports.js';

const REQUEST: StructuredCallRequest = {
  task: 'Return an answer', userPayload: { question: 'fixture' }, purpose: 'responses-contract', outputKind: 'json',
};
const RAW = '{"answer":"evidence"}';
const parseAnswer = (raw: unknown): { answer: string } | Error => {
  if (typeof raw !== 'object' || raw === null || !('answer' in raw) || typeof raw.answer !== 'string') return new Error('answer string required');
  return { answer: raw.answer };
};
const config = () => ModelProviderConfig.parse({
  id: newId('mcfg'), label: 'Responses fixture', wire: 'openai_responses', modelId: 'fixture-model',
  baseUrl: 'https://gateway.test/v1', apiKey: 'test-fixture-key', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
const responseBody = (text = RAW): Record<string, unknown> => ({
  id: 'resp_fixture', object: 'response', status: 'completed', model: 'fixture-served',
  output: [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'private summary' }] },
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] },
  ],
  usage: { input_tokens: 9, output_tokens: 7, total_tokens: 16, input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 2 } },
});
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const frame = (body: unknown) => `data: ${JSON.stringify(body)}\r\n\r\n`;
const streamResponse = (frames: unknown[]) => {
  const bytes = new TextEncoder().encode(frames.map(frame).join(''));
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
};

beforeEach(() => vi.stubEnv('FARLAB_MIN_CALL_INTERVAL_MS', '0'));
afterEach(() => vi.unstubAllEnvs());

describe('OpenAI Responses wire contracts (fixture transport)', () => {
  it('admits Responses with reasoning effort but rejects incompatible dialects', () => {
    expect(PRODUCT_WIRE_PROTOCOLS).toContain('openai_responses');
    expect(ModelProviderConfig.safeParse({ ...config(), reasoning: { style: 'reasoning_effort', defaultGear: 'high' } }).success).toBe(true);
    expect(ModelProviderConfig.safeParse({ ...config(), reasoning: { style: 'enable_thinking', defaultGear: 'high' } }).success).toBe(false);
  });

  it.each(['responseJsonSchema', 'jsonSchema'] as const)('sends %s using native text.format, without provider storage', async (schemaKey) => {
    const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
    const fetchImpl = vi.fn(async () => jsonResponse(responseBody()));
    const provider = createCustomProvider(config(), { fetchImpl });
    const result = await provider.structuredCall({ ...REQUEST, [schemaKey]: schema, maxTokens: 512, reasoning: { style: 'reasoning_effort', gear: 'high' } }, parseAnswer);
    const [url, init] = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    const body = JSON.parse(String(init.body));
    expect(url).toBe('https://gateway.test/v1/responses');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-fixture-key');
    expect(body).toMatchObject({ model: 'fixture-model', store: false, max_output_tokens: 512, reasoning: { effort: 'high' }, text: { format: { type: 'json_schema', name: 'respond', strict: true, schema } } });
    expect(body.input.map((message: { role: string }) => message.role)).toEqual(['system', 'user']);
    for (const field of ['messages', 'response_format', 'max_tokens', 'reasoning_effort', 'tools', 'previous_response_id']) expect(body).not.toHaveProperty(field);
    expect(result.data).toEqual({ answer: 'evidence' });
    expect(result.thinking).toBe('private summary');
    expect(result.receipt).toMatchObject({ modelVersion: 'fixture-served', outputHash: canonicalSha256(RAW), finishReason: 'stop', params: { structuredOutput: 'json_schema_strict' }, usage: { promptTokens: 9, completionTokens: 7, totalTokens: 16, cachedInputTokens: 3, reasoningTokens: 2 } });
  });

  it('supports the universal environment route and explicit JSON mode', async () => {
    vi.stubEnv('FARLAB_UNIVERSAL_WIRE', 'openai_responses');
    vi.stubEnv('FARLAB_UNIVERSAL_BASE_URL', 'https://gateway.test/v1');
    vi.stubEnv('FARLAB_UNIVERSAL_MODEL', 'fixture-model');
    vi.stubEnv('FARLAB_UNIVERSAL_API_KEY', 'test-fixture-key');
    let body: Record<string, unknown> = {};
    const provider = createUniversalProvider({ fetchImpl: async (_url, init) => { body = JSON.parse(String(init.body)); return jsonResponse(responseBody()); } });
    expect(provider.liveReady).toBe(true);
    const result = await provider.structuredCall(REQUEST, parseAnswer);
    expect(body.text).toEqual({ format: { type: 'json_object' } });
    expect(result.ok).toBe(true);
  });

  it('streams only output text, never duplicates the terminal output or exposes reasoning', async () => {
    const events: StructuredOutputEvent[] = [];
    const provider = createCustomProvider(config(), { fetchImpl: async (_url, init) => {
      expect(JSON.parse(String(init.body)).stream).toBe(true);
      return streamResponse([
        { type: 'response.created', response: { status: 'in_progress' } },
        { type: 'response.reasoning_summary_text.delta', delta: 'private summary' },
        { type: 'response.output_text.delta', delta: RAW.slice(0, 8) },
        { type: 'response.output_text.delta', delta: RAW.slice(8) },
        { type: 'response.completed', response: responseBody() },
      ]);
    } });
    const result = await provider.structuredCall({ ...REQUEST, onOutput: event => events.push(event) }, parseAnswer);
    expect(result.ok).toBe(true);
    expect(events.filter(event => event.type === 'delta').map(event => event.text).join('')).toBe(RAW);
    expect(result.receipt.usage.totalTokens).toBe(16);
    expect(events.at(-1)).toEqual({ type: 'attempt_completed' });
  });

  it('does not accept valid JSON from a stream that lacks a terminal event', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([{ type: 'response.output_text.delta', delta: RAW }]));
    const result = await createCustomProvider(config(), { fetchImpl, sleep: async () => {} })
      .structuredCall({ ...REQUEST, onOutput: () => {} }, parseAnswer);
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.error?.message).toContain('before a terminal event');
  });

  it.each(['response.failed', 'response.incomplete'])('rejects a %s event carrying a completed payload', async (type) => {
    const fetchImpl = vi.fn(async () => streamResponse([{ type, response: responseBody() }]));
    const result = await createCustomProvider(config(), { fetchImpl, sleep: async () => {} })
      .structuredCall({ ...REQUEST, onOutput: () => {} }, parseAnswer);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('terminal event disagrees');
  });

  it('fails visibly on a matching failed terminal event after valid output deltas', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([
      { type: 'response.output_text.delta', delta: RAW },
      { type: 'response.failed', response: { ...responseBody(), status: 'failed', error: { code: 'invalid_prompt', message: 'invalid input' } } },
    ]));
    const result = await createCustomProvider(config(), { fetchImpl, sleep: async () => {} })
      .structuredCall({ ...REQUEST, onOutput: () => {} }, parseAnswer);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('status failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['refusal', 'tool', 'failed', 'queued', 'content_filter', 'empty', 'malformed'])('fails visibly for %s output without corrective laundering', async (kind) => {
    const body = responseBody();
    if (kind === 'refusal') body.output = [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'declined' }] }];
    if (kind === 'tool') body.output = [{ type: 'function_call', name: 'unrequested', arguments: RAW }];
    if (kind === 'failed') { body.status = 'failed'; body.error = { code: 'invalid_prompt', message: 'invalid input' }; }
    if (kind === 'queued') body.status = 'queued';
    if (kind === 'content_filter') { body.status = 'incomplete'; body.incomplete_details = { reason: 'content_filter' }; }
    if (kind === 'empty') body.output = [];
    const fetchImpl = vi.fn(async () => kind === 'malformed' ? new Response('not JSON') : jsonResponse(body));
    const result = await createCustomProvider(config(), { fetchImpl }).structuredCall(REQUEST, parseAnswer);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('provider_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-asks invalid schema output using the Responses input contract', async () => {
    const bodies: Array<{ input: Array<{ content: string }> }> = [];
    const provider = createCustomProvider(config(), { fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return jsonResponse(responseBody(bodies.length === 1 ? '{"wrong":true}' : RAW));
    } });
    const result = await provider.structuredCall(REQUEST, parseAnswer);
    expect(result.data).toEqual({ answer: 'evidence' });
    expect(result.receipt.correctiveReasks).toBe(1);
    expect(bodies[1]!.input.at(-1)!.content).toContain('answer string required');
  });

  it('never repairs token-truncated JSON into a fabricated success', async () => {
    const body = { ...responseBody('{"answer":"evidence"'), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const result = await createCustomProvider(config(), { fetchImpl }).structuredCall(REQUEST, parseAnswer);
    expect(result.ok).toBe(false);
    expect(result.receipt.finishReason).toBe('length');
    expect(result.receipt.usage.totalTokens).toBe(16);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([401, 429])('preserves HTTP %i classification and retry limits', async (status) => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"fixture error"}}', { status, headers: { 'retry-after-ms': '0' } }));
    const result = await createCustomProvider(config(), { fetchImpl, sleep: async () => {} }).structuredCall(REQUEST, parseAnswer);
    expect(result.error?.kind).toBe(status === 401 ? 'auth_error' : 'rate_limited');
    expect(fetchImpl).toHaveBeenCalledTimes(status === 401 ? 1 : 3);
  });

  it('fails closed before dispatch for absent credentials or pre-cancellation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(responseBody()));
    const missing = await createCustomProvider({ ...config(), apiKey: '' }, { fetchImpl }).structuredCall(REQUEST, parseAnswer);
    expect(missing.error?.kind).toBe('auth_error');
    const cancelled = await createCustomProvider(config(), { fetchImpl }).structuredCall({ ...REQUEST, signal: AbortSignal.abort() }, parseAnswer);
    expect(cancelled.error?.retryable).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('OpenAI Responses real loopback transport (no external provider)', () => {
  it('receives and validates a Responses request over HTTP', async () => {
    let requestedPath = '';
    let requestBody = '';
    const server = createServer(async (request, response) => {
      requestedPath = request.url ?? '';
      for await (const chunk of request) requestBody += String(chunk);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(responseBody()));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('missing port');
      const provider = createCustomProvider({ ...config(), baseUrl: `http://127.0.0.1:${address.port}/v1` });
      const result = await provider.structuredCall(REQUEST, parseAnswer);
      expect(result.data).toEqual({ answer: 'evidence' });
      expect(requestedPath).toBe('/v1/responses');
      expect(JSON.parse(requestBody).store).toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
