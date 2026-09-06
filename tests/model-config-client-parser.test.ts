import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelConfig, listModelConfigs, updateModelConfig } from '../web/src/api/endpoints.js';

const config = {
  id: 'mcfg_responses',
  label: 'Responses gateway',
  wire: 'openai_responses',
  baseUrl: 'https://gateway.example/v1',
  modelId: 'configured-model',
  apiKeySet: true,
  apiKeyMasked: '***',
  active: true,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const capabilities = {
  fallbackConfigIds: ['mcfg_first', 'mcfg_second'],
  pricing: { inputUsdPerMTok: 1.5, outputUsdPerMTok: 4.75 },
  reasoning: { style: 'reasoning_effort', defaultGear: 'high' },
};

const respondWith = (body: unknown): void => {
  vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => Response.json(body)));
};

afterEach(() => vi.unstubAllGlobals());

describe('model configuration client parsing', () => {
  it('preserves Responses configs, fallback order, prices and reasoning in the list', async () => {
    respondWith({ configs: [{ ...config, ...capabilities, apiKey: 'test-only-secret' }], activeModelConfigId: config.id });
    const result = await listModelConfigs();
    expect(result.configs).toEqual([{ ...config, ...capabilities }]);
    expect(result.configs[0]).not.toHaveProperty('apiKey');
    expect(result.activeModelConfigId).toBe(config.id);
  });

  it('preserves capability fields after creation and update', async () => {
    respondWith({ config: { ...config, ...capabilities } });
    const input = {
      label: config.label,
      wire: 'openai_responses' as const,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      apiKey: 'test-only-secret',
    };
    expect(await createModelConfig(input)).toEqual({ ...config, ...capabilities });
    expect(await updateModelConfig(config.id, input)).toEqual({ ...config, ...capabilities });
  });

  it('preserves undeclared capabilities as absent and accepts zero pricing', async () => {
    respondWith({ configs: [config, { ...config, pricing: { inputUsdPerMTok: 0, outputUsdPerMTok: 0 }, fallbackConfigIds: [] }] });
    const result = await listModelConfigs();
    expect(result.configs[0]).toEqual(config);
    expect(result.configs[0]).not.toHaveProperty('reasoning');
    expect(result.configs[0]).not.toHaveProperty('pricing');
    expect(result.configs[1]?.pricing).toEqual({ inputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    expect(result.configs[1]?.fallbackConfigIds).toEqual([]);
  });

  it.each([
    { wire: 'unsupported_protocol' },
    { fallbackConfigIds: 'mcfg_first' },
    { fallbackConfigIds: ['mcfg_first', 7] },
    { fallbackConfigIds: [''] },
    { pricing: null },
    { pricing: { inputUsdPerMTok: -1, outputUsdPerMTok: 2 } },
    { pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 'unknown' } },
    { reasoning: null },
    { reasoning: { style: 'unknown', defaultGear: 'high' } },
    { reasoning: { style: 'reasoning_effort', defaultGear: 'unsupported' } },
  ])('rejects malformed capability fields rather than silently discarding them: %j', async (invalid) => {
    respondWith({ configs: [{ ...config, ...invalid }] });
    await expect(listModelConfigs()).rejects.toMatchObject({ code: 'unexpected_schema', retryable: false });
  });
});
