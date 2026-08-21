import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { canonicalSha256 } from '../src/shared/crypto.js';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import { zodToStrictJsonSchema, strictSchemaOrUndefined } from '../src/providers/http.js';
import { createDeepSeekProvider } from '../src/providers/deepseek.js';
import { createZaiProvider } from '../src/providers/zai.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { defaultLiveProvider, getProvider, listProviders } from '../src/providers/index.js';

/**
 * *** TEST FIXTURES ONLY ***
 * All fetch/sleep calls below are mocks; no real network, no real API keys
 * ('test-fixture-key-*' values are inert non-secret strings). Assertions are behavioral:
 * classification, retry budgets, receipt hashes, fail-closed semantics.
 */

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const REQ: StructuredCallRequest = {
  task: 'Generate one falsifiable hypothesis',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'retrieval-augmented generation', year: 2026 },
  outputKind: 'json',
  purpose: 'unit-test',
};

interface HypothesisOut {
  hypothesis: string;
}

const parseHypothesis = (raw: unknown): HypothesisOut | Error => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return new Error('output must be a JSON object');
  }
  const hypothesis = (raw as Record<string, unknown>).hypothesis;
  if (typeof hypothesis !== 'string' || hypothesis.length === 0) {
    return new Error('field "hypothesis" must be a non-empty string');
  }
  return { hypothesis };
};

const RAW_OK = '{"hypothesis":"Chunk-level retrieval grounding reduces hallucinated entity spans"}';

type RecordedCall = { url: string; init: RequestInit };

/** Sequential mock fetch: impls[min(index, len-1)] serves each call; all calls recorded. */
const recorderFetch = (impls: Array<(call: RecordedCall, index: number) => Promise<Response>>) => {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const call = { url, init };
    calls.push(call);
    index += 1;
    const impl = impls[Math.min(index - 1, impls.length - 1)];
    if (!impl) throw new Error('mock fetch: no impl');
    return impl(call, index);
  };
  return { fetchImpl, calls };
};

const chatOk = (content: string, model = 'deepseek-v4-flash') =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-test-fixture',
      object: 'chat.completion',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

/** HTTP 200 with a PRE-BUILT body (strict-FC tool_calls shapes differ from content shapes). */
const chatOkRaw = (bodyText: string) =>
  new Response(bodyText, { status: 200, headers: { 'content-type': 'application/json' } });

const httpError = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const neverResolveFetch = (_call: RecordedCall, _index: number): Promise<Response> => {
  throw new Error('unused'); // replaced per-test below where needed
};

const sleepRecorder = () => {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => { sleeps.push(ms); } };
};

const bodyOf = (call: RecordedCall): Record<string, unknown> =>
  JSON.parse(String(call.init.body)) as Record<string, unknown>;

const lastUserContent = (call: RecordedCall): string => {
  const messages = bodyOf(call).messages as Array<{ role: string; content: string }>;
  return messages[messages.length - 1]?.content ?? '';
};

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// deepseek adapter — success path, receipt integrity, request shaping
// ---------------------------------------------------------------------------

describe('zodToStrictJsonSchema (strict-FC subset projection, D-026)', () => {
  it('projects objects as all-required with additionalProperties:false; strings lose min-length', () => {
    const S = z.object({ a: z.string().min(1), b: z.enum(['x', 'y']), c: z.number().int(), d: z.boolean() });
    expect(zodToStrictJsonSchema(S)).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string', enum: ['x', 'y'] }, c: { type: 'integer' }, d: { type: 'boolean' } },
      required: ['a', 'b', 'c', 'd'],
      additionalProperties: false,
    });
  });
  it('optional/defaulted fields become anyOf [inner, null] (nulls map back to absent via tolerance)', () => {
    const S = z.object({ req: z.string(), opt: z.string().optional(), arr: z.array(z.string()).default([]) });
    const j = zodToStrictJsonSchema(S) as { properties: Record<string, unknown> };
    expect(j.properties['opt']).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(j.properties['arr']).toEqual({ anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] });
    expect(j.required).toEqual(['req', 'opt', 'arr']); // strict subset: everything listed
  });
  it('unions become anyOf; refinements/effects are transparent (zod stays the semantic authority)', () => {
    const S = z.object({ u: z.union([z.literal('a'), z.string()]), r: z.string().refine(() => true) });
    const j = zodToStrictJsonSchema(S) as { properties: Record<string, unknown> };
    expect(j.properties['u']).toEqual({ anyOf: [{ type: 'string', enum: ['a'] }, { type: 'string' }] });
    expect(j.properties['r']).toEqual({ type: 'string' });
  });
});

describe('strictSchemaOrUndefined (audit P2-1 fix: unprojectable nodes fall back, never break)', () => {
  it('drops unprojectable union arms — the model is steered to the projectable form (rank dimensions pattern)', () => {
    const S = z.object({
      dims: z.union([
        z.array(z.object({ score: z.number() })),
        z.record(z.string(), z.object({ score: z.number() })),
      ]),
    });
    const j = strictSchemaOrUndefined(S) as { properties: Record<string, unknown> };
    expect(j?.properties['dims']).toEqual({
      anyOf: [{ type: 'array', items: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'], additionalProperties: false } }],
    });
  });
  it('returns undefined for records/unknowns (json_object fallback — live probe: bare {} 400s)', () => {
    expect(strictSchemaOrUndefined(z.record(z.string(), z.unknown()))).toBeUndefined();
    expect(strictSchemaOrUndefined(z.object({ x: z.unknown() }))).toBeUndefined();
    expect(strictSchemaOrUndefined(z.any())).toBeUndefined();
  });
  it('returns undefined for empty objects and non-string literals (endpoint rejects both shapes)', () => {
    expect(strictSchemaOrUndefined(z.object({}))).toBeUndefined();
    expect(strictSchemaOrUndefined(z.object({ n: z.literal(42) }))).toBeUndefined();
    expect(strictSchemaOrUndefined(z.object({ s: z.literal('keep') }))).toEqual({
      type: 'object',
      properties: { s: { type: 'string', enum: ['keep'] } },
      required: ['s'],
      additionalProperties: false,
    });
  });
  it('emitted projections satisfy the endpoint contract (typed nodes, objects have properties, arrays have items)', () => {
    const S = z.object({
      a: z.array(z.object({ b: z.enum(['x', 'y']).optional(), c: z.array(z.string()).default([]) })).default([]),
      d: z.union([z.string(), z.number().int()]).optional(),
    });
    expect(() => strictSchemaOrUndefined(S)).not.toThrow();
    expect(strictSchemaOrUndefined(S)).toBeDefined();
  });
});

describe('deepseek adapter (mock fetch)', () => {
  it('succeeds with a complete, correctly hashed receipt', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ hypothesis: 'Chunk-level retrieval grounding reduces hallucinated entity spans' });
    expect(res.receipt).toMatchObject({
      provider: 'deepseek',
      modelId: 'deepseek-chat', // requested alias...
      modelVersion: 'deepseek-v4-flash', // ...actual served model from response body
      finishReason: 'stop',
      executionMode: 'live',
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    });
    expect(res.receipt.latencyMs).toBeGreaterThanOrEqual(0);
    // Hash contract: requestHash over the sanitized 4-field digest, outputHash over raw output.
    expect(res.receipt.requestHash).toBe(
      canonicalSha256({
        task: REQ.task,
        systemPrompt: REQ.systemPrompt,
        userPayload: REQ.userPayload,
        purpose: REQ.purpose,
      }),
    );
    expect(res.receipt.outputHash).toBe(canonicalSha256(RAW_OK));

    // Request shaping: OpenAI-compat endpoint, bearer auth. Default is the strict-FC beta
    // base URL (D-026); without jsonSchema on the request the body stays json_object mode.
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe('https://api.deepseek.com/beta/chat/completions');
    const auth = calls[0]?.init.headers as Record<string, string>;
    expect(auth.authorization).toBe('Bearer test-fixture-key-ds');
    expect(bodyOf(calls[0]!).response_format).toEqual({ type: 'json_object' });
    // No key material anywhere in the result envelope.
    expect(JSON.stringify(res)).not.toContain('test-fixture-key-ds');
  });

  it('strict mode: requests carrying jsonSchema use tools+strict+tool_choice and parse tool_calls arguments', async () => {
    const toolCallBody = JSON.stringify({
      model: 'deepseek-v4-flash',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            index: 0,
            id: 'call_test',
            type: 'function',
            function: { name: 'respond', arguments: RAW_OK },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    });
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOkRaw(toolCallBody))]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const schema = { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false };
    const res = await provider.structuredCall({ ...REQ, jsonSchema: schema }, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ hypothesis: 'Chunk-level retrieval grounding reduces hallucinated entity spans' });
    expect(res.receipt.finishReason).toBe('tool_calls');
    const body = bodyOf(calls[0]!);
    expect(body.response_format).toBeUndefined();
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'respond', strict: true, description: 'Respond with the structured output for this task.', parameters: schema } },
    ]);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'respond' } });
  });

  it('strictTools=false keeps the stable base URL and strips jsonSchema (mode fixed at construction, no mid-flight switch)', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl, strictTools: false });
    expect(provider.strictTools).toBe(false);
    expect(provider.baseUrl).toBe('https://api.deepseek.com');
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
    await provider.structuredCall({ ...REQ, jsonSchema: schema }, parseHypothesis);
    const body = bodyOf(calls[0]!);
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('passes through temperature/maxTokens and demands JSON-only in the system message', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    await provider.structuredCall({ ...REQ, temperature: 0.2, maxTokens: 800 }, parseHypothesis);
    const body = bodyOf(calls[0]!);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(800);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('ONLY a single valid JSON object');
    expect(messages[1]?.content).toContain(REQ.task);
  });

  it('strips a ```json fence and succeeds on the first attempt', async () => {
    const fenced = '```json\n' + RAW_OK + '\n```';
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(fenced))]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true); // fence stripping is NOT an invalid_output event
    expect(calls.length).toBe(1);
    expect(res.receipt.outputHash).toBe(canonicalSha256(fenced)); // hash of RAW output, pre-strip
  });
});

// ---------------------------------------------------------------------------
// invalid_output: exactly one corrective retry
// ---------------------------------------------------------------------------

describe('invalid_output retry discipline', () => {
  it('retries once with an appended correction and succeeds', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOk('Sorry, I cannot produce JSON.')), // not JSON at all
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(lastUserContent(calls[1]!)).toContain('rejected');
    expect(lastUserContent(calls[1]!)).toContain('corrected JSON object');
  });

  it('also corrective-retries when the JSON parses but fails the caller schema', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOk('{"hypothesis": ""}')), // schema violation: empty string
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(lastUserContent(calls[1]!)).toContain('"hypothesis" must be a non-empty string');
  });

  it('fails as invalid_output after exactly one corrective retry (no third attempt)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOk('still not json')),
      () => Promise.resolve(chatOk('again not json')),
    ]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('invalid_output');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(2); // 1 attempt + 1 corrective retry, never more
    expect(sleeps).toEqual([]); // invalid_output retries do not consume backoff sleeps
    expect(res.receipt.outputHash).toBe(canonicalSha256('again not json')); // last raw output
  });
});

// ---------------------------------------------------------------------------
// transport failures: classification + bounded retry
// ---------------------------------------------------------------------------

describe('transport failure classification and retry budget', () => {
  it('classifies 429 as rate_limited, retries at most twice with 1s/3s backoff', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const rateLimited = () =>
      Promise.resolve(httpError(429, { error: { message: 'Too many requests', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }));
    const { fetchImpl, calls } = recorderFetch([rateLimited, rateLimited, rateLimited, rateLimited]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);

    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('rate_limited');
    expect(res.error?.retryable).toBe(true);
    expect(res.error?.httpStatus).toBe(429);
    expect(calls.length).toBe(3); // initial + 2 retries = hard cap
    expect(sleeps).toEqual([1_000, 3_000]);
    expect(res.error?.message).toContain('retry budget of 2 exhausted');
  });

  it('recovers when a 429 is followed by a good response', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(429, { error: { message: 'slow down', code: 'rate_limit' } })),
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([1_000]);
  });

  it('treats Z.ai 429 + code 1113 as quota_exceeded (NOT retryable rate limiting)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () =>
        Promise.resolve(
          httpError(429, { error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } }),
        ),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('quota_exceeded');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(1); // zero retries — balance walls are not transient
    expect(sleeps).toEqual([]);
  });

  it('retries transient 5xx (500/502/503/504) and recovers', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(500, { error: { message: 'internal error' } })),
      () => Promise.resolve(httpError(503, { error: { message: 'unavailable' } })),
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(3);
    expect(sleeps).toEqual([1_000, 3_000]);
  });

  it('does NOT retry permanent 4xx (400 invalid model)', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () =>
        Promise.resolve(
          httpError(400, { error: { message: 'The supported API model names are …', type: 'invalid_request_error', code: 'invalid_request_error' } }),
        ),
    ]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.httpStatus).toBe(400);
    expect(calls.length).toBe(1);
  });

  it('does NOT retry network-level transport failures (DNS/TCP)', async () => {
    const networkError = Object.assign(new Error('fetch failed'), { name: 'TypeError' });
    const { fetchImpl, calls } = recorderFetch([() => Promise.reject(networkError)]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(1); // W1 discipline: only rate_limited/timeout/transient-5xx retry
  });

  it('classifies a malformed HTTP 200 (no content) as provider_error, no retry', async () => {
    const malformed = new Response(JSON.stringify({ id: 'x', choices: [] }), { status: 200 });
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(malformed)]);
    const provider = createDeepSeekProvider({ apiKey: 'test-fixture-key-ds', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// auth: fail-closed
// ---------------------------------------------------------------------------

describe('auth fail-closed', () => {
  it('returns auth_error without any network call when the key is absent', async () => {
    const { fetchImpl, calls } = recorderFetch([neverResolveFetch]);
    const provider = createDeepSeekProvider({ apiKey: '', fetchImpl }); // explicit empty -> liveReady false
    expect(provider.liveReady).toBe(false);
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.message).toContain('DEEPSEEK_API_KEY');
    expect(calls.length).toBe(0); // zero fetch calls: fail closed means fail BEFORE the wire
    expect(res.receipt.requestHash).toBe(
      canonicalSha256({ task: REQ.task, systemPrompt: REQ.systemPrompt, userPayload: REQ.userPayload, purpose: REQ.purpose }),
    );
    expect(res.receipt.executionMode).toBe('live');
  });

  it('classifies HTTP 401 as auth_error and does not retry', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(401, { error: { message: 'Authentication Fails', code: 'invalid_request_error' } })),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai-bad', fetchImpl });
    expect(provider.liveReady).toBe(true); // key present (readiness != validity)
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// timeout
// ---------------------------------------------------------------------------

describe('total-deadline timeout', () => {
  it('aborts a hanging request and classifies it as timeout', async () => {
    let callCount = 0;
    const hangingFetch = (_url: string, init: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        callCount += 1;
        init.signal?.addEventListener('abort', () => {
          const e = new Error('This operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    const provider = createDeepSeekProvider({
      apiKey: 'test-fixture-key-ds',
      fetchImpl: hangingFetch,
      sleep: async () => {}, // no real waiting
      totalTimeoutMs: 80,
    });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('timeout');
    expect(res.error?.retryable).toBe(true);
    // First abort consumes (almost) the whole budget; at most one extra attempt can start.
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(callCount).toBeLessThanOrEqual(2);
    expect(res.receipt.latencyMs).toBeGreaterThanOrEqual(70); // real elapsed time, not fabricated
  });
});

// ---------------------------------------------------------------------------
// zai adapter specifics
// ---------------------------------------------------------------------------

describe('zai adapter (mock fetch)', () => {
  it('targets the paas/v4 endpoint with the glm default model', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'glm-4.6'))]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl });
    expect(provider.modelId).toBe('glm-4.6');
    expect(provider.baseUrl).toBe('https://api.z.ai/api/paas/v4');
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(bodyOf(calls[0]!).model).toBe('glm-4.6');
    expect(res.receipt.modelVersion).toBe('glm-4.6');
    expect(res.receipt.provider).toBe('zai');
  });

  it('honors the FARLAB_ZAI_MODEL environment override', async () => {
    vi.stubEnv('FARLAB_ZAI_MODEL', 'glm-5');
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'glm-5'))]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl });
    expect(provider.modelId).toBe('glm-5');
    await provider.structuredCall(REQ, parseHypothesis);
    expect(bodyOf(calls[0]!).model).toBe('glm-5');
  });

  it('strips strict-FC tool payloads (audit P1-3): jsonSchema requests stay on json_object', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'glm-4.6'))]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl });
    const reqWithSchema: StructuredCallRequest = {
      ...REQ,
      jsonSchema: { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false },
    };
    const res = await provider.structuredCall(reqWithSchema, parseHypothesis);
    expect(res.ok).toBe(true);
    const body = bodyOf(calls[0]!);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

// ---------------------------------------------------------------------------
// TEST-ONLY stub
// ---------------------------------------------------------------------------

describe('TEST-ONLY stub provider', () => {
  it('executes scripted success with executionMode=test and correct hashes', async () => {
    const stub = createTestStubProvider([{ rawOutput: RAW_OK, delayMs: 5 }], { sleep: async () => {} });
    expect(stub.liveReady).toBe(false);
    const res = await stub.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ hypothesis: 'Chunk-level retrieval grounding reduces hallucinated entity spans' });
    expect(res.receipt.executionMode).toBe('test');
    expect(res.receipt.provider).toBe('test-stub');
    expect(res.receipt.outputHash).toBe(canonicalSha256(RAW_OK));
    expect(res.receipt.requestHash).toBe(
      canonicalSha256({ task: REQ.task, systemPrompt: REQ.systemPrompt, userPayload: REQ.userPayload, purpose: REQ.purpose }),
    );
  });

  it('executes scripted failure injection verbatim', async () => {
    const stub = createTestStubProvider([
      { fail: { kind: 'rate_limited', message: 'scripted 429', httpStatus: 429 } },
    ]);
    const res = await stub.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('rate_limited');
    expect(res.error?.httpStatus).toBe(429);
    expect(res.error?.message).toContain('TEST-ONLY stub');
    expect(res.receipt.executionMode).toBe('test');
  });

  it('reports invalid_output for scripted non-JSON rawOutput', async () => {
    const stub = createTestStubProvider([{ rawOutput: 'not json' }]);
    const res = await stub.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('invalid_output');
  });

  it('throws loudly when the script is exhausted (test-authoring bug)', async () => {
    const stub = createTestStubProvider([]);
    await expect(stub.structuredCall(REQ, parseHypothesis)).rejects.toThrow(/script exhausted/);
  });
});

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

describe('provider registry', () => {
  it('resolves known providers and returns undefined for unknown names', () => {
    expect(getProvider('deepseek')?.name).toBe('deepseek');
    expect(getProvider('zai')?.name).toBe('zai');
    expect(getProvider('test-stub')?.name).toBe('test-stub');
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('defaults to deepseek and honors FARLAB_MODEL_PROVIDER for live providers only', () => {
    expect(defaultLiveProvider().name).toBe('deepseek');
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'zai');
    expect(defaultLiveProvider().name).toBe('zai');
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'test-stub');
    expect(() => defaultLiveProvider()).toThrow(/does not name a live provider/);
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'openai');
    expect(() => defaultLiveProvider()).toThrow(/does not name a live provider/);
  });

  it('lists providers with kind and sanitized metadata (env var names, never values)', () => {
    const infos = listProviders();
    expect(infos.map((i) => i.name)).toEqual(['deepseek', 'zai', 'test-stub']);
    expect(infos.map((i) => i.kind)).toEqual(['live', 'live', 'test']);
    const deepseek = infos[0]!;
    expect(deepseek.modelId).toBe('deepseek-chat');
    expect(deepseek.baseUrl).toBe('https://api.deepseek.com/beta'); // strict-FC default (D-026)
    expect(deepseek.apiKeyEnvVar).toBe('DEEPSEEK_API_KEY');
    expect(JSON.stringify(infos)).not.toMatch(/sk-[A-Za-z0-9]{8,}/); // no key material
  });
});
