import { describe, it, expect, afterEach, vi } from 'vitest';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import { ModelProviderConfig, ProviderWireProtocol, type ModelProviderConfig as ModelProviderConfigType } from '../src/domain/model-config.js';
import { createCustomProvider } from '../src/providers/custom.js';
import { createUniversalProvider } from '../src/providers/universal.js';
import { PROVIDER_TEMPLATES, templateById } from '../src/providers/catalog.js';
import { discoverModels, parseGeminiModels } from '../src/providers/discovery.js';
import { reasoningBodyFields } from '../src/providers/http.js';

/**
 * MODEL-AGNOSTIC GATEWAY (user directive 2026-08-26: all models worldwide, all
 * wires, freely configurable). Deterministic offline coverage of:
 *  - the gemini wire end-to-end through the custom provider (URL/headers/body shape,
 *    success parse, usage mapping, truncation mapping, malformed-200 fail-closed);
 *  - the universal env-driven adapter (any endpoint on earth; fail-closed naming
 *    every missing env var);
 *  - the preset provider catalog (schema-validated, worldwide, zero model-id guesses);
 *  - config-schema wire↔reasoning compatibility incl. the gemini thinkingConfig dialect;
 *  - gemini model discovery (URL/headers + v1beta {models:[...]} parse).
 *
 * *** TEST FIXTURES ONLY *** — every fetch is a mock; keys are inert strings.
 */

const REQ: StructuredCallRequest = {
  task: 'Return one hypothesis as JSON',
  systemPrompt: 'You are a careful research assistant.',
  userPayload: { topic: 'graph learning', year: 2026 },
  outputKind: 'json',
  purpose: 'unit-test',
};

const parseInto = (raw: unknown): { hypothesis: string } | Error =>
  raw !== null && typeof raw === 'object' && typeof (raw as Record<string, unknown>).hypothesis === 'string'
    ? { hypothesis: (raw as Record<string, unknown>).hypothesis as string }
    : new Error('must be {hypothesis: string}');

type RecordedCall = { url: string; init: RequestInit };

const recorderFetch = (respond: (call: RecordedCall) => Response | Promise<Response>) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { fetchImpl, calls };
};

const geminiOk = (text: string, opts: { finish?: string; model?: string; usage?: unknown } = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{
        content: { role: 'model', parts: [{ text }] },
        finishReason: opts.finish ?? 'STOP',
      }],
      usageMetadata: opts.usage ?? { promptTokenCount: 13, candidatesTokenCount: 5, totalTokenCount: 18, thoughtsTokenCount: 4 },
      modelVersion: opts.model ?? 'gemini-2.5-pro',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const baseCfg = (wire: ModelProviderConfigType['wire']): ModelProviderConfigType =>
  ModelProviderConfig.parse({
    id: 'mcfg_testgatewayroute0001',
    label: 'test route',
    wire,
    baseUrl: wire === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://endpoint.test/v1',
    modelId: wire === 'gemini' ? 'gemini-2.5-pro' : 'some-model',
    apiKey: 'test-fixture-key',
    fallbackConfigIds: [],
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  });

const bodyOf = (call: RecordedCall): Record<string, unknown> =>
  JSON.parse(String(call.init.body)) as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// gemini wire through the custom provider
// ---------------------------------------------------------------------------

describe('custom provider on the gemini wire', () => {
  it('targets :generateContent with x-goog-api-key, systemInstruction, JSON-mode generationConfig, no model in body', async () => {
    const { fetchImpl, calls } = recorderFetch(() => geminiOk('{"hypothesis":"GNN depth improves ranking"}'));
    const provider = createCustomProvider(baseCfg('gemini'), { fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const result = await provider.structuredCall(REQ, parseInto);
    expect(result.ok).toBe(true);
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-fixture-key');
    expect(headers.authorization).toBeUndefined(); // no OpenAI Bearer on this wire
    const body = bodyOf(call);
    expect(body.model).toBeUndefined(); // model rides the URL, not the body
    expect(Array.isArray(body.contents)).toBe(true);
    expect((body.contents as Array<{ role: string }>)[0]!.role).toBe('user');
    const sys = body.systemInstruction as { parts: Array<{ text: string }> };
    expect(sys.parts[0]!.text).toContain('research assistant');
    const gen = body.generationConfig as Record<string, unknown>;
    expect(gen.responseMimeType).toBe('application/json');
  });

  it('maps usageMetadata + finishReason (MAX_TOKENS→length) + modelVersion into the receipt', async () => {
    const { fetchImpl } = recorderFetch(() => geminiOk('{"hypothesis":"truncated but parseable"}', { finish: 'MAX_TOKENS' }));
    const provider = createCustomProvider(baseCfg('gemini'), { fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const result = await provider.structuredCall(REQ, parseInto);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.receipt.usage).toEqual({ promptTokens: 13, completionTokens: 5, totalTokens: 18, reasoningTokens: 4 });
    expect(result.receipt.finishReason).toBe('length'); // W7-F2 truncation discipline applies
    expect(result.receipt.modelVersion).toBe('gemini-2.5-pro');
  });

  it('sends thinkingConfig.thinkingBudget when the call requests the gemini reasoning dialect', async () => {
    const { fetchImpl, calls } = recorderFetch(() => geminiOk('{"hypothesis":"budgeted thinking"}'));
    const provider = createCustomProvider(baseCfg('gemini'), { fetchImpl, sleep: async () => {}, random: () => 0.5 });
    await provider.structuredCall(
      { ...REQ, reasoning: { style: 'thinking_config', gear: 'high' } },
      parseInto,
    );
    const gen = bodyOf(calls[0]!).generationConfig as { thinkingConfig: { thinkingBudget: number } };
    expect(gen.thinkingConfig.thinkingBudget).toBe(32768); // REASONING_GEAR_BUDGET_TOKENS.high
  });

  it('a non-openai wire strips the strict-FC jsonSchema projection (JSON mode + prompt contract carry the shape)', async () => {
    const { fetchImpl, calls } = recorderFetch(() => geminiOk('{"hypothesis":"schema carried by prompt"}'));
    const provider = createCustomProvider(baseCfg('gemini'), { fetchImpl, sleep: async () => {}, random: () => 0.5 });
    await provider.structuredCall({ ...REQ, jsonSchema: { type: 'object' } }, parseInto);
    const body = bodyOf(calls[0]!);
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('HTTP 200 without extractable text fails closed as provider_error (never an empty success)', async () => {
    const bad = new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [] } }] }), { status: 200 });
    const { fetchImpl } = recorderFetch(() => bad);
    const provider = createCustomProvider(baseCfg('gemini'), { fetchImpl, sleep: async () => {}, random: () => 0.5 });
    const result = await provider.structuredCall(REQ, parseInto);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.kind).toBe('provider_error');
    expect(result.error.message).toContain('no candidates[0].content.parts[].text');
  });
});

// ---------------------------------------------------------------------------
// reasoning dialect map — gemini dialect
// ---------------------------------------------------------------------------

describe('reasoningBodyFields gemini dialect', () => {
  it('thinking_config rides only the gemini wire; other styles never leak onto it', () => {
    expect(reasoningBodyFields('gemini', { style: 'thinking_config', gear: 'low' })).toEqual({ thinkingConfig: { thinkingBudget: 8192 } });
    expect(reasoningBodyFields('openai', { style: 'thinking_config', gear: 'low' })).toEqual({});
    expect(reasoningBodyFields('anthropic', { style: 'thinking_config', gear: 'low' })).toEqual({});
    expect(reasoningBodyFields('gemini', { style: 'reasoning_effort', gear: 'low' })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// universal env adapter — any endpoint on earth
// ---------------------------------------------------------------------------

describe('universal provider (open env route)', () => {
  it('serves any endpoint on all three wires, driven purely by FARLAB_UNIVERSAL_* env', async () => {
    vi.stubEnv('FARLAB_UNIVERSAL_WIRE', 'openai');
    vi.stubEnv('FARLAB_UNIVERSAL_BASE_URL', 'https://api.anyhost.example/v1');
    vi.stubEnv('FARLAB_UNIVERSAL_MODEL', 'their-best-model');
    vi.stubEnv('FARLAB_UNIVERSAL_API_KEY', 'test-fixture-key');
    const { fetchImpl, calls } = recorderFetch(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"hypothesis":"any host"}' } }] }), { status: 200 }),
    );
    const provider = createUniversalProvider({ fetchImpl, sleep: async () => {} });
    expect(provider.liveReady).toBe(true);
    const result = await provider.structuredCall(REQ, parseInto);
    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.anyhost.example/v1/chat/completions');

    // anthropic wire, same adapter
    vi.stubEnv('FARLAB_UNIVERSAL_WIRE', 'anthropic');
    vi.stubEnv('FARLAB_UNIVERSAL_BASE_URL', 'https://other.host');
    const anth = createUniversalProvider({ fetchImpl, sleep: async () => {} });
    await anth.structuredCall(REQ, parseInto);
    expect(calls[1]!.url).toBe('https://other.host/v1/messages');

    // gemini wire, same adapter
    vi.stubEnv('FARLAB_UNIVERSAL_WIRE', 'gemini');
    vi.stubEnv('FARLAB_UNIVERSAL_BASE_URL', 'https://third.host');
    vi.stubEnv('FARLAB_UNIVERSAL_MODEL', 'gemini-2.5-flash');
    const gem = createUniversalProvider({ fetchImpl, sleep: async () => {} });
    await gem.structuredCall(REQ, parseInto);
    expect(calls[2]!.url).toBe('https://third.host/v1beta/models/gemini-2.5-flash:generateContent');
  });

  it('fails closed naming EVERY missing env var — no silent fallback to another route', async () => {
    vi.stubEnv('FARLAB_UNIVERSAL_WIRE', 'openai');
    // BASE_URL / MODEL / API_KEY all unset in this process
    const provider = createUniversalProvider({ fetchImpl: async () => { throw new Error('must not fetch'); }, sleep: async () => {} });
    expect(provider.liveReady).toBe(false);
    const result = await provider.structuredCall(REQ, parseInto);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.kind).toBe('auth_error');
    expect(result.error.message).toContain('FARLAB_UNIVERSAL_BASE_URL');
    expect(result.error.message).toContain('FARLAB_UNIVERSAL_MODEL');
    expect(result.error.message).toContain('FARLAB_UNIVERSAL_API_KEY');
  });
});

// ---------------------------------------------------------------------------
// preset provider catalog — worldwide, honest
// ---------------------------------------------------------------------------

describe('worldwide preset catalog', () => {
  it('is schema-valid, unique, worldwide (international + Chinese + local), gemini-native included', () => {
    expect(PROVIDER_TEMPLATES.length).toBeGreaterThanOrEqual(18);
    const ids = PROVIDER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    for (const t of PROVIDER_TEMPLATES) {
      expect(ProviderWireProtocol.parse(t.wire)).toBe(t.wire);
      expect(t.baseUrl).toMatch(/^https?:\/\//);
    }
    // international labs
    expect(templateById('openai')?.baseUrl).toBe('https://api.openai.com/v1');
    expect(templateById('anthropic')?.wire).toBe('anthropic');
    expect(templateById('google-gemini')?.wire).toBe('gemini');
    expect(templateById('openrouter')).toBeDefined();
    // Chinese providers are equal citizens (not a closed set)
    for (const id of ['deepseek', 'moonshot', 'zhipu', 'dashscope']) {
      expect(templateById(id)).toBeDefined();
    }
    // local runtimes
    expect(templateById('ollama')?.baseUrl).toBe('http://localhost:11434/v1');
  });
});

// ---------------------------------------------------------------------------
// config schema — wire ↔ reasoning compatibility with the gemini dialect
// ---------------------------------------------------------------------------

describe('model config schema (three wires)', () => {
  const valid = (wire: string, style?: string) => {
    const parsed = ModelProviderConfig.safeParse({
      id: 'mcfg_testgatewayschema0001',
      label: 'cfg',
      wire,
      baseUrl: 'https://endpoint.test',
      modelId: 'm',
      apiKey: 'k',
      fallbackConfigIds: [],
      ...(style !== undefined ? { reasoning: { style, defaultGear: 'medium' } } : {}),
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    });
    return parsed.success;
  };
  it('accepts each wire bare and each style on ITS wire; rejects impossible combinations', () => {
    expect(valid('openai')).toBe(true);
    expect(valid('anthropic')).toBe(true);
    expect(valid('gemini')).toBe(true);
    expect(valid('gemini', 'thinking_config')).toBe(true);
    expect(valid('anthropic', 'thinking_budget')).toBe(true);
    expect(valid('openai', 'reasoning_effort')).toBe(true);
    expect(valid('gemini', 'reasoning_effort')).toBe(false); // cross-wire dialect rejected at the boundary
    expect(valid('openai', 'thinking_config')).toBe(false);
    expect(valid('anthropic', 'thinking_config')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gemini model discovery
// ---------------------------------------------------------------------------

describe('gemini model discovery', () => {
  it('GETs /v1beta/models with x-goog-api-key and parses {models:[{name,displayName}]} stripping the models/ prefix', async () => {
    const { fetchImpl, calls } = recorderFetch(() =>
      new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
          { name: 'models/gemini-2.5-flash' },
          { name: 'models/gemini-2.5-pro' }, // duplicate id: deduped
        ],
      }), { status: 200 }),
    );
    const result = await discoverModels(
      { wire: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-fixture-key' },
      fetchImpl,
    );
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-fixture-key');
    expect(result.models.map((m) => m.id)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(result.models.find((m) => m.id === 'gemini-2.5-pro')?.displayName).toBe('Gemini 2.5 Pro');
  });

  it('unexpected body shape throws (fail closed) instead of showing an empty catalog', () => {
    expect(() => parseGeminiModels({ data: [] })).toThrow(/not a \{models:\[\.\.\.\]\}/);
  });
});
