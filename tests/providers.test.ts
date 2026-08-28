import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { canonicalSha256 } from '../src/shared/crypto.js';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import { zodToStrictJsonSchema, strictSchemaOrUndefined, extractJsonText, repairUnescapedQuotes, backoffDelayMs, parseRetryAfterMs, redactSecrets, RETRY_MAX_BACKOFF_MS } from '../src/providers/http.js';
import { createZaiProvider } from '../src/providers/zai.js';
import { createDashScopeProvider } from '../src/providers/dashscope.js';
import { runOpenAICompatStructuredCall } from '../src/providers/http.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { defaultLiveProvider, getProvider, listProviders, LIVE_PROVIDER_NAMES } from '../src/providers/index.js';

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

const chatOk = (content: string, model = 'qwen-plus') =>
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

/** Anthropic-Messages-shaped 200 (zai wire since the open.bigmodel.cn route switch). */
const anthropicOk = (content: string, model = 'glm-4.6', stopReason = 'end_turn') =>
  new Response(
    JSON.stringify({
      id: 'msg-test-fixture',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: content }],
      stop_reason: stopReason,
      usage: { input_tokens: 11, output_tokens: 7 },
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
// dashscope transport shell — success path, receipt integrity, request shaping
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

describe('extractJsonText repair layer (live strict-FC failure class 2026-08-22)', () => {
  it('repairs unescaped inner quotes inside string values (real failure shape: ex"expected)', () => {
    // captured live: "...epithelial damage could\"expected morphology in culture absent\"..." —
    // the model emitted an unescaped quote mid-string, closing the JSON string early
    const corrupted = '{"candidates": [{"statement": "Fibroblast co-culture models", "mechanism": "methylation model in ex-secreasing + epithelial damage could"expected morphology in culture absent" large H3 lysine repositions fro…"}]}';
    const parsed = extractJsonText(corrupted);
    expect(parsed).not.toBeNull();
    const mechanism = (parsed?.value as { candidates: Array<{ mechanism: string }> }).candidates[0]!.mechanism;
    expect(mechanism).toContain('could"expected morphology');
  });
  it('repairs raw control characters inside strings', () => {
    const corrupted = '{"a": "line1\nline2\ttab"}';
    const parsed = extractJsonText(corrupted);
    expect(parsed?.value).toEqual({ a: 'line1\nline2\ttab' });
  });
  it('never rewrites valid documents (repair runs only after direct parses fail)', () => {
    const valid = '{"text": "ends with quote\\" then comma", "n": 1}';
    expect(extractJsonText(valid)?.value).toEqual({ text: 'ends with quote" then comma', n: 1 });
    // structural closes (quote followed by , } ] :) stay closes under the repair scan
    expect(repairUnescapedQuotes(valid)).toBe(valid);
  });
  it('returns null for unrecoverable garbage (bounded failure preserved)', () => {
    expect(extractJsonText('not json at all {{{')).toBeNull();
  });
});

describe('dashscope transport shell (mock fetch) — the OpenAI-compat core suite', () => {
  // History: src/providers/deepseek.ts was DELETED 2026-08-26 per the then project-wide
  // DeepSeek ban (user directive 2026-08-22; lane-14 red-team F-3), and this suite was
  // re-homed onto the dashscope shell. The module was later RESTORED when the product
  // layer went model-agnostic (providers/index.ts "unbanned 2026-08-26"); the transport
  // suite stays on the dashscope shell (same http.ts core), and competition-mode routing
  // still rejects deepseek (tests/model-plane.test.ts competition-policy assertions).
  it('succeeds with a complete, correctly hashed receipt', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ hypothesis: 'Chunk-level retrieval grounding reduces hallucinated entity spans' });
    expect(res.receipt).toMatchObject({
      provider: 'dashscope',
      modelId: 'qwen-plus',
      modelVersion: 'qwen-plus', // actual served model from response body
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

    // Request shaping: OpenAI-compat endpoint, bearer auth; json_object mode when the
    // request carries no jsonSchema (dashscope strips schemas to its negotiated wire).
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    const auth = calls[0]?.init.headers as Record<string, string>;
    expect(auth.authorization).toBe('Bearer test-fixture-key-dashscope');
    expect(bodyOf(calls[0]!).response_format).toEqual({ type: 'json_object' });
    // No key material anywhere in the result envelope.
    expect(JSON.stringify(res)).not.toContain('test-fixture-key-dashscope');
  });

  it('http core strict-FC: jsonSchema requests ride tools+strict+tool_choice and parse tool_calls arguments (direct core call)', async () => {
    // The deepseek shell was the only jsonSchema pass-through; the machinery lives in
    // http.ts (mode 'strict_tools') and stays locked here against the bare core.
    const toolCallBody = JSON.stringify({
      model: 'qwen-plus',
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
    const res = await runOpenAICompatStructuredCall(
      { providerName: 'core-test', baseUrl: 'https://unit.test/v1', apiKey: 'test-fixture-key-core', modelId: 'm', executionMode: 'test' },
      { ...REQ, jsonSchema: { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false } },
      parseHypothesis,
      { fetchImpl },
    );
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ hypothesis: 'Chunk-level retrieval grounding reduces hallucinated entity spans' });
    expect(res.receipt.finishReason).toBe('tool_calls');
    const body = bodyOf(calls[0]!);
    expect(body.response_format).toBeUndefined();
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'respond', strict: true, description: 'Respond with the structured output for this task.', parameters: { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false } } },
    ]);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'respond' } });
  });

  it('passes through temperature and demands JSON-only in the system message', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    await provider.structuredCall({ ...REQ, temperature: 0.2 }, parseHypothesis);
    const body = bodyOf(calls[0]!);
    expect(body.temperature).toBe(0.2);
    // max_tokens: dashscope strips it on the structured route (W7-F3, asserted in its adapter suite); no provider asserts passthrough anymore since the deepseek shell was removed.
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('ONLY a single valid JSON object');
    expect(messages[1]?.content).toContain(REQ.task);
  });

  it('strips a ```json fence and succeeds on the first attempt', async () => {
    const fenced = '```json\n' + RAW_OK + '\n```';
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(fenced))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
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
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
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
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(lastUserContent(calls[1]!)).toContain('"hypothesis" must be a non-empty string');
  });

  it('fails as invalid_output after 3 corrective re-asks — the 4th attempt never happens (D-034 policy)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOk('still not json')),
      () => Promise.resolve(chatOk('again not json')),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('invalid_output');
    expect(res.error?.retryable).toBe(false);
    expect(calls.length).toBe(4); // 1 attempt + 3 corrective re-asks, never more
    expect(sleeps).toEqual([]); // invalid_output re-asks do not consume backoff sleeps
    expect(res.receipt.outputHash).toBe(canonicalSha256('again not json')); // last raw output
    expect(String(res.error?.message)).toContain('3 corrective re-asks');
  });

  it('recovers on a later corrective re-ask (independent-sample corruption, ~20% class)', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOk('corrupted first sample')),
      () => Promise.resolve(chatOk('corrupted second sample')),
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(3); // succeeded on the 2nd re-ask within the 3-re-ask budget
  });
});

// ---------------------------------------------------------------------------
// W7-F2 truncation discipline: finish_reason=length gets no engine completion
// and a concise-completion re-ask; completed truncation never passes silently
// ---------------------------------------------------------------------------

const chatOkFinish = (content: string, finishReason: string, model = 'qwen-plus') =>
  chatOkRaw(JSON.stringify({
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  }));

describe('truncation discipline (W7-F2, finish_reason=length)', () => {
  it('truncated output is NOT engine-completed — it goes to a TRUNCATED-specific re-ask', async () => {
    const truncated = '{"hypothesis": "partial hypothesis text that the model never fin'; // engine would close-quote+brace
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOkFinish(truncated, 'length')),
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2); // the truncated completion was never accepted as-is
    expect(lastUserContent(calls[1]!)).toContain('TRUNCATED');
    expect(lastUserContent(calls[1]!)).toContain('COMPLETE JSON');
  });

  it('truncated output that is nevertheless complete valid JSON is accepted without a re-ask', async () => {
    // trailing whitespace hit the token limit after the document closed — the doc is whole
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOkFinish(RAW_OK, 'length'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(res.receipt.finishReason).toBe('length');
  });

  it('same corrupted shape WITHOUT truncation confirmation IS engine-repaired (gate is truncation-specific)', async () => {
    const truncatedShape = '{"hypothesis": "partial text that looks truncated but was not flagged'; // finish_reason=stop
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOkFinish(truncatedShape, 'stop'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true); // engine completed the un-flagged structural omission
    expect(calls.length).toBe(1);
    expect(res.data.hypothesis).toContain('partial text that looks truncated');
  });

  it('ABSENT finish_reason (provider does not report it) falls through to the full repair chain — disclosed default', async () => {
    // Some OpenAI-compatible endpoints omit finish_reason. The truncation gate keys on
    // the transport's own truncation signal; without it the repair layers stay armed
    // (W7 audit P2-2 disclosure: an actually-truncated doc could be engine-completed
    // here; all FAR-Lab registered providers report finish_reason — D-030 41/41).
    const raw = JSON.stringify({
      model: 'qwen-plus',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"hypothesis": "unflagged structural omission' }, finish_reason: undefined }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    });
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOkRaw(raw))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(res.data.hypothesis).toContain('unflagged structural omission');
  });

  it('truncation re-asks stay within the same 3-re-ask budget and fail visibly as invalid_output', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(chatOkFinish('{"hypothesis": "cut short', 'length')),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('invalid_output');
    expect(calls.length).toBe(4); // 1 + 3 re-asks
    expect(String(res.error?.message)).toContain('truncated at token limit');
  });
});

// ---------------------------------------------------------------------------
// transport failures: classification + bounded retry
// ---------------------------------------------------------------------------

describe('transport failure classification and retry budget', () => {
  it('classifies 429 as rate_limited, retries at most twice with the 20s/30s RPM spacing (W4-F1 + 2026-08-28 live)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const rateLimited = () =>
      Promise.resolve(httpError(429, { error: { message: 'Too many requests', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }));
    const { fetchImpl, calls } = recorderFetch([rateLimited, rateLimited, rateLimited, rateLimited]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);

    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('rate_limited');
    expect(res.error?.retryable).toBe(true);
    expect(res.error?.httpStatus).toBe(429);
    expect(calls.length).toBe(3); // initial + 2 retries = hard cap
    // random()=0.5 → jitter factor exactly 1.0: 20s then 40s capped at the 30s max —
    // wide enough to straddle a minute-scale account RPM window (observed as
    // bigmodel code 1302 while build_evidence batches claim extractions).
    expect(sleeps).toEqual([20_000, 30_000]);
    expect(res.error?.message).toContain('retry budget of 2 exhausted');
    // W4-F1 observability: the receipt records consumed retries
    expect(res.receipt.transportRetries).toBe(2);
    expect(res.receipt.correctiveReasks).toBe(0);
  });

  it('honors server Retry-After seconds over the exponential curve (W4-F1)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const withRetryAfter = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: 'slow down', code: 'rate_limit' } }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '7' } },
        ),
      );
    const { fetchImpl, calls } = recorderFetch([withRetryAfter, withRetryAfter, withRetryAfter]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(calls.length).toBe(3);
    expect(sleeps).toEqual([7_000, 7_000]);
  });

  it('caps an absurd server Retry-After at the 30s maximum (W4-F1)', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const withRetryAfter = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: 'slow down', code: 'rate_limit' } }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after-ms': '600000' } },
        ),
      );
    const { fetchImpl } = recorderFetch([withRetryAfter, withRetryAfter, withRetryAfter]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(sleeps).toEqual([30_000, 30_000]);
  });

  it('redacts credential-shaped text echoed in provider error bodies before persistence (W4-F3)', async () => {
    const { sleep } = sleepRecorder();
    const leaking = () =>
      Promise.resolve(
        httpError(429, { error: { message: 'rejected for key sk-abc123def456ghi789jklmn and api_key = "z9y8x7w6v5u4t3s2r1q0"', code: 'rate_limit' } }),
      );
    const { fetchImpl, calls } = recorderFetch([leaking, leaking, leaking]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(calls.length).toBe(3);
    expect(res.error?.message).not.toContain('sk-abc123def456ghi789jklmn');
    expect(res.error?.message).not.toContain('z9y8x7w6v5u4t3s2r1q0');
    expect(res.error?.message).toContain('[REDACTED_SECRET]');
  });

  it('recovers when a 429 is followed by a good response', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(429, { error: { message: 'slow down', code: 'rate_limit' } })),
      () => Promise.resolve(chatOk(RAW_OK)),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([20_000]); // RPM spacing curve
    expect(res.receipt.transportRetries).toBe(1);
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
      () => Promise.resolve(anthropicOk(RAW_OK)),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  // 529 = origin overloaded (Cloudflare convention; observed live on glm-4.7-flash
  // 2026-08-28 as code 1305 访问量过大) — transient by nature, retried like 5xx.
  it('retries HTTP 529 overload and recovers', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(529, { error: { code: '1305', message: '该模型当前访问量过大，请您稍后再试' } })),
      () => Promise.resolve(anthropicOk(RAW_OK)),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([15_000]); // overload spacing: 15s, not the standard 1s
  });

  // 429 code 1302 = account-level RPM throttle (observed live on glm-4.7-flash
  // 2026-08-28 while build_evidence batches claim extractions) — minute-scale
  // window, so the retry spacing must straddle it like the 529 window does.
  it('retries HTTP 429 account-RPM throttling with wide spacing', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const { fetchImpl, calls } = recorderFetch([
      () => Promise.resolve(httpError(429, { error: { code: '1302', message: '您的账户已达到速率限制，请您控制请求频率' } })),
      () => Promise.resolve(anthropicOk(RAW_OK)),
    ]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([20_000]); // RPM spacing: 20s, not the standard 1s curve
  });

  it('pacing: FARLAB_MIN_CALL_INTERVAL_MS delays a back-to-back call to the same provider', async () => {
    const prev = process.env.FARLAB_MIN_CALL_INTERVAL_MS;
    process.env.FARLAB_MIN_CALL_INTERVAL_MS = '5000';
    const { __resetPacerForTests } = await import('../src/providers/http.js');
    __resetPacerForTests();
    try {
      const { sleep, sleeps } = sleepRecorder();
      const first = recorderFetch([() => Promise.resolve(anthropicOk(RAW_OK))]);
      const second = recorderFetch([() => Promise.resolve(anthropicOk(RAW_OK))]);
      const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl: first.fetchImpl, sleep, random: () => 0.5 });
      const p2 = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl: second.fetchImpl, sleep, random: () => 0.5 });
      await provider.structuredCall(REQ, parseHypothesis);
      await p2.structuredCall(REQ, parseHypothesis);
      // First call fires immediately; the second waits (interval minus the real
      // milliseconds elapsed between the two calls) before its fetch.
      expect(sleeps.length).toBe(1);
      expect(sleeps[0]).toBeGreaterThan(4_000);
      expect(sleeps[0]).toBeLessThanOrEqual(5_000);
    } finally {
      if (prev === undefined) delete process.env.FARLAB_MIN_CALL_INTERVAL_MS;
      else process.env.FARLAB_MIN_CALL_INTERVAL_MS = prev;
      __resetPacerForTests();
    }
  });

  it('does NOT retry permanent 4xx (400 invalid model)', async () => {
    const { fetchImpl, calls } = recorderFetch([
      () =>
        Promise.resolve(
          httpError(400, { error: { message: 'The supported API model names are …', type: 'invalid_request_error', code: 'invalid_request_error' } }),
        ),
    ]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.httpStatus).toBe(400);
    expect(calls.length).toBe(1);
  });

  it('retries network-level transport failures within the bounded budget (overnight-run discipline, 2026-08-29)', async () => {
    const networkError = Object.assign(new Error('fetch failed'), { name: 'TypeError' });
    const { fetchImpl, calls } = recorderFetch([() => Promise.reject(networkError), () => Promise.reject(networkError), () => Promise.reject(networkError), () => Promise.reject(networkError)]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('provider_error');
    expect((res.error?.message ?? '')).toContain('network-level');
    // 1 initial + MAX_TRANSPORT_RETRIES(2) = 3 attempts, then fails visibly
    expect(calls.length).toBe(3);
  });

  it('a transient network blip recovers on retry (one reset then a valid answer)', async () => {
    const networkError = Object.assign(new Error('socket hang up'), { name: 'Error' });
    const { fetchImpl, calls } = recorderFetch([() => Promise.reject(networkError), () => Promise.resolve(chatOk(RAW_OK))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep: async () => {} });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls.length).toBe(2);
  });

  it('classifies a malformed HTTP 200 (no content) as provider_error, no retry', async () => {
    const malformed = new Response(JSON.stringify({ id: 'x', choices: [] }), { status: 200 });
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(malformed)]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
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
    const provider = createDashScopeProvider({ apiKey: '', fetchImpl }); // explicit empty -> liveReady false
    expect(provider.liveReady).toBe(false);
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('auth_error');
    expect(res.error?.retryable).toBe(false);
    expect(res.error?.message).toContain('DASHSCOPE_API_KEY');
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
    const provider = createDashScopeProvider({
      apiKey: 'test-fixture-key-dashscope',
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

  it('FARLAB_TOTAL_BUDGET_MS overrides the budget with min/max clamps', async () => {
    const { totalBudgetFromEnv, DEFAULT_TOTAL_TIMEOUT_MS } = await import('../src/providers/http.js');
    const prev = process.env.FARLAB_TOTAL_BUDGET_MS;
    try {
      process.env.FARLAB_TOTAL_BUDGET_MS = '300000';
      expect(totalBudgetFromEnv()).toBe(300_000);
      process.env.FARLAB_TOTAL_BUDGET_MS = '5000'; // below the 30s floor
      expect(totalBudgetFromEnv()).toBe(30_000);
      process.env.FARLAB_TOTAL_BUDGET_MS = '999999999'; // above the 600s ceiling
      expect(totalBudgetFromEnv()).toBe(600_000);
      process.env.FARLAB_TOTAL_BUDGET_MS = 'not-a-number'; // garbage -> default
      expect(totalBudgetFromEnv()).toBe(DEFAULT_TOTAL_TIMEOUT_MS);
      delete process.env.FARLAB_TOTAL_BUDGET_MS;
      expect(totalBudgetFromEnv()).toBe(DEFAULT_TOTAL_TIMEOUT_MS);
    } finally {
      if (prev !== undefined) process.env.FARLAB_TOTAL_BUDGET_MS = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// zai adapter specifics
// ---------------------------------------------------------------------------

describe('zai adapter (mock fetch)', () => {
  it('targets the open.bigmodel.cn Anthropic-Messages endpoint with the glm default model', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(anthropicOk(RAW_OK, 'glm-4.6'))]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl });
    expect(provider.modelId).toBe('glm-4.6');
    expect(provider.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages');
    expect(bodyOf(calls[0]!).model).toBe('glm-4.6');
    expect(typeof bodyOf(calls[0]!).system).toBe('string'); // system is top-level on this wire
    expect(res.receipt.modelVersion).toBe('glm-4.6');
    expect(res.receipt.provider).toBe('zai');
  });

  it('honors the FARLAB_ZAI_MODEL environment override', async () => {
    vi.stubEnv('FARLAB_ZAI_MODEL', 'glm-5');
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(anthropicOk(RAW_OK, 'glm-5'))]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl });
    expect(provider.modelId).toBe('glm-5');
    await provider.structuredCall(REQ, parseHypothesis);
    expect(bodyOf(calls[0]!).model).toBe('glm-5');
  });

  it('strips strict-FC tool payloads (audit P1-3): no tools/response_format exist on the Anthropic wire — the system suffix carries the contract', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(anthropicOk(RAW_OK, 'glm-4.6'))]);
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
    expect(body.response_format).toBeUndefined();
    expect(String(body.system)).toContain('JSON'); // contract rides the system param
  });
});

// ---------------------------------------------------------------------------
// dashscope (Bailian) adapter — submission-mandated Qwen route (B-QWEN-LIVE-ROUTE)
// ---------------------------------------------------------------------------

describe('dashscope adapter (mock fetch)', () => {
  it('strips max_tokens on the structured-output route (W7-F3: official Bailian doc warns max_tokens truncates structured output into invalid JSON)', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'qwen-plus'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    await provider.structuredCall({ ...REQ, maxTokens: 8192 }, parseHypothesis);
    const body = bodyOf(calls[0]!);
    expect(body.max_tokens).toBeUndefined();
    // (max_tokens passthrough no longer has a shell; the core keeps the field when present)
  });

  it('targets the compatible-mode/v1 endpoint with the qwen-plus default model', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'qwen-plus'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    expect(provider.modelId).toBe('qwen-plus');
    expect(provider.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(res.receipt.provider).toBe('dashscope');
    expect(res.receipt.modelVersion).toBe('qwen-plus');
  });

  it('honors the FARLAB_DASHSCOPE_MODEL environment override', async () => {
    vi.stubEnv('FARLAB_DASHSCOPE_MODEL', 'qwen-max');
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'qwen-max'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    expect(provider.modelId).toBe('qwen-max');
    await provider.structuredCall(REQ, parseHypothesis);
    expect(bodyOf(calls[0]!).model).toBe('qwen-max');
  });

  it('honors the FARLAB_DASHSCOPE_BASE_URL override (intl endpoint, registry-informed)', async () => {
    vi.stubEnv('FARLAB_DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'qwen-plus'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    expect(provider.baseUrl).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
    await provider.structuredCall(REQ, parseHypothesis);
    expect(calls[0]?.url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  it('strips strict-FC tool payloads (same capability decision as zai) and fails closed without a key', async () => {
    const { fetchImpl, calls } = recorderFetch([() => Promise.resolve(chatOk(RAW_OK, 'qwen-plus'))]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl });
    const reqWithSchema: StructuredCallRequest = { ...REQ, jsonSchema: { type: 'object', properties: { hypothesis: { type: 'string' } }, required: ['hypothesis'], additionalProperties: false } };
    const res = await provider.structuredCall(reqWithSchema, parseHypothesis);
    expect(res.ok).toBe(true);
    const body = bodyOf(calls[0]!);
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toEqual({ type: 'json_object' });
    // fail-closed: no key -> no network, no fabricated output
    const bare = createDashScopeProvider({ fetchImpl });
    expect(bare.liveReady).toBe(false);
    const closed = await bare.structuredCall(REQ, parseHypothesis);
    expect(closed.ok).toBe(false);
    expect(calls.length).toBe(1); // no extra network call from the closed provider
  });

  it('is registered as a live provider selectable via FARLAB_MODEL_PROVIDER', () => {
    expect(LIVE_PROVIDER_NAMES).toContain('dashscope');
    const names = listProviders().map((p) => p.name);
    expect(names).toContain('dashscope');
    const byName = getProvider('dashscope');
    expect(byName?.name).toBe('dashscope');
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
  it('resolves known providers — open set incl. deepseek + universal (user directive 2026-08-26)', () => {
    expect(getProvider('deepseek')?.name).toBe('deepseek'); // unbanned: model-agnostic product
    expect(getProvider('zai')?.name).toBe('zai');
    expect(getProvider('dashscope')?.name).toBe('dashscope');
    expect(getProvider('universal')?.name).toBe('universal');
    expect(getProvider('test-stub')?.name).toBe('test-stub');
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('defaults to zai and honors FARLAB_MODEL_PROVIDER across the open live set', () => {
    expect(defaultLiveProvider().name).toBe('zai');
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'dashscope');
    expect(defaultLiveProvider().name).toBe('dashscope');
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'deepseek');
    expect(defaultLiveProvider().name).toBe('deepseek'); // unbanned live route (liveReady per env key)
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'universal');
    expect(defaultLiveProvider().name).toBe('universal'); // any-endpoint env route
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'test-stub');
    expect(() => defaultLiveProvider()).toThrow(/does not name a live provider/);
    vi.stubEnv('FARLAB_MODEL_PROVIDER', 'openai');
    expect(() => defaultLiveProvider()).toThrow(/does not name a live provider/); // not a builtin convenience name
    vi.unstubAllEnvs();
  });

  it('lists providers with kind and sanitized metadata (env var names, never values)', () => {
    const infos = listProviders();
    expect(infos.map((i) => i.name)).toEqual(['zai', 'dashscope', 'deepseek', 'universal', 'test-stub']);
    expect(infos.map((i) => i.kind)).toEqual(['live', 'live', 'live', 'live', 'test']); // no 'archived' kind anymore
    const zai = infos[0]!;
    expect(zai.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic'); // Anthropic wire (D-058)
    const universal = infos[3]!;
    expect(universal.baseUrl).toBe('(unset)'); // FARLAB_UNIVERSAL_BASE_URL absent in test env
    expect(JSON.stringify(infos)).not.toMatch(/sk-[A-Za-z0-9]{8,}/); // no key material
  });
});

describe('W4-F1 retry timing policy (source-fused: deepseek-harness llm-retry + opencode retry.ts)', () => {
  it('exponential base 1s·2^(n-1) with symmetric ±25% multiplicative jitter', () => {
    // random=0 → factor 0.75; random=0.5 → exactly 1.0; random=1 → factor 1.25
    expect(backoffDelayMs(1, undefined, () => 0)).toBe(750);
    expect(backoffDelayMs(1, undefined, () => 0.5)).toBe(1_000);
    expect(backoffDelayMs(1, undefined, () => 1)).toBe(1_250);
    expect(backoffDelayMs(2, undefined, () => 0.5)).toBe(2_000);
    expect(backoffDelayMs(3, undefined, () => 0.5)).toBe(4_000);
  });

  it('caps every delay at RETRY_MAX_BACKOFF_MS (30s)', () => {
    expect(backoffDelayMs(20, undefined, () => 1)).toBe(RETRY_MAX_BACKOFF_MS);
    expect(backoffDelayMs(1, 999_999, () => 0.5)).toBe(RETRY_MAX_BACKOFF_MS);
  });

  it('server Retry-After beats the exponential curve when parseable', () => {
    expect(backoffDelayMs(1, 7_000, () => 0)).toBe(7_000);
    expect(backoffDelayMs(5, 250, () => 1)).toBe(250);
  });

  it('parseRetryAfterMs: retry-after-ms wins, then numeric seconds, then HTTP-date; absent → undefined', () => {
    const headersOf = (entries: Record<string, string>) => ({
      get: (name: string) => entries[name.toLowerCase()] ?? null,
    });
    expect(parseRetryAfterMs(headersOf({ 'retry-after-ms': '1500' }))).toBe(1_500);
    expect(parseRetryAfterMs(headersOf({ 'retry-after': '7' }))).toBe(7_000);
    expect(parseRetryAfterMs(headersOf({ 'retry-after': '2.5' }))).toBe(2_500);
    const future = new Date(Date.now() + 8_000).toUTCString();
    const dated = parseRetryAfterMs(headersOf({ 'retry-after': future }));
    expect(dated).not.toBeUndefined();
    expect(dated!).toBeGreaterThan(7_000);
    expect(dated!).toBeLessThanOrEqual(8_000);
    // a date already in the past retries promptly (0), never negative
    expect(parseRetryAfterMs(headersOf({ 'retry-after': new Date(Date.now() - 60_000).toUTCString() }))).toBe(0);
    expect(parseRetryAfterMs(headersOf({}))).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs(headersOf({ 'retry-after': 'garbage' }))).toBeUndefined();
  });
});

describe('W4-F3 credential redaction (source-fused: openai/codex secrets sanitizer, Apache-2.0)', () => {
  it('redacts OpenAI-style keys, AWS access keys, bearer tokens and secret assignments', () => {
    expect(redactSecrets('key sk-abc123def456ghi789jklmn leaked')).toBe('key [REDACTED_SECRET] leaked');
    expect(redactSecrets('aws AKIAIOSFODNN7EXAMPLE used')).toBe('aws [REDACTED_SECRET] used');
    expect(redactSecrets('Authorization: Bearer abcdef1234567890abcdef sent'))
      .toBe('Authorization: Bearer [REDACTED_SECRET] sent');
    expect(redactSecrets('api_key = "z9y8x7w6v5u4t3s2r1q0"')).toBe('api_key = "[REDACTED_SECRET]"');
    expect(redactSecrets('password: hunter2hunter2')).toBe('password: [REDACTED_SECRET]');
  });

  it('leaves ordinary prose and short tokens untouched', () => {
    const prose = 'deepseek: HTTP 429 code rate_limit: Too many requests (retry budget of 2 exhausted)';
    expect(redactSecrets(prose)).toBe(prose);
    expect(redactSecrets('task sk-short')).toBe('task sk-short'); // below 20 chars — not credential-shaped
  });

  it('redacts hyphenated modern key shapes (sk-proj-…) beyond the codex upstream pattern', () => {
    expect(redactSecrets('leak sk-proj-AbCdEf1234567890GhIjKlMnOpQrStUv'))
      .toBe('leak [REDACTED_SECRET]');
  });

  it('redacts BEFORE the 300-char window truncates — no key-prefix fragment survives (W4 audit P3)', async () => {
    const { sleep } = sleepRecorder();
    // key spans chars 276..305: the OLD truncate-first path leaked a full 24-char usable
    // fragment past the 300 window; redact-first replaces the whole key with the marker
    // which lands inside the window.
    const padding = 'x'.repeat(275);
    const straddling = () =>
      Promise.resolve(httpError(429, { error: { message: `${padding} sk-abc123def456ghi789jklmn`, code: 'rate_limit' } }));
    const { fetchImpl } = recorderFetch([straddling, straddling, straddling]);
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key-dashscope', fetchImpl, sleep, random: () => 0.5 });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.message).not.toMatch(/sk-[A-Za-z0-9-]{8,}/); // no key fragment of any size
    expect(res.error?.message).toContain('[REDACTED_SECRET]');
  });

  it('quota classification keeps its semantics on raw text — "Insufficient balance" survives redaction intact', async () => {
    const { sleep, sleeps } = sleepRecorder();
    const quota = () =>
      Promise.resolve(
        httpError(429, { error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } }),
      );
    const { fetchImpl, calls } = recorderFetch([quota]);
    const provider = createZaiProvider({ apiKey: 'test-fixture-key-zai', fetchImpl, sleep });
    const res = await provider.structuredCall(REQ, parseHypothesis);
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe('quota_exceeded');
    expect(res.error?.message).toContain('Insufficient balance or no resource package');
    expect(calls.length).toBe(1);
    expect(sleeps).toEqual([]);
  });
});
