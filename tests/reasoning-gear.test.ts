import { describe, expect, it } from 'vitest';
import {
  ModelProviderConfig,
  ProviderWireProtocol,
  ReasoningStyle,
  ReasoningGear,
  reasoningBudgetTokens,
} from '../src/domain/model-config.js';

/**
 * *** TEST FIXTURES ONLY ***
 * Schema-boundary tests for the per-config REASONING CAPABILITY declaration:
 * the researcher declares which thinking-parameter dialect their endpoint speaks
 * (any OpenAI/Anthropic-compatible route worldwide incl. local runtimes) and its
 * default effort gear. No network, no secrets.
 */

const validConfig = (overrides: Record<string, unknown> = {}) => ({
  id: 'mcfg_testfixture0000000000aaa',
  label: 'My reasoning route',
  wire: 'openai',
  baseUrl: 'https://example-invalid.test/v1',
  modelId: 'some-model',
  apiKey: 'test-fixture-key-abcd',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Reasoning capability declaration (config-level)', () => {
  it('style enum accepts exactly the three supported dialects', () => {
    expect(ReasoningStyle.parse('reasoning_effort')).toBe('reasoning_effort');
    expect(ReasoningStyle.parse('enable_thinking')).toBe('enable_thinking');
    expect(ReasoningStyle.parse('thinking_budget')).toBe('thinking_budget');
    expect(ReasoningStyle.safeParse('temperature').success).toBe(false);
  });

  it('gear enum accepts low|medium|high only', () => {
    for (const g of ['low', 'medium', 'high'] as const) {
      expect(ReasoningGear.parse(g)).toBe(g);
    }
    expect(ReasoningGear.safeParse('ultra').success).toBe(false);
    expect(ReasoningGear.safeParse('').success).toBe(false);
  });

  it('a config WITHOUT a reasoning declaration parses unchanged (zero behavior change)', () => {
    const parsed = ModelProviderConfig.parse(validConfig());
    expect(parsed.reasoning).toBeUndefined();
  });

  it('accepts a full declaration on both wires', () => {
    for (const wire of ['openai', 'anthropic'] as const) {
      const parsed = ModelProviderConfig.parse(
        validConfig({ wire, reasoning: { style: wire === 'openai' ? 'reasoning_effort' : 'thinking_budget', defaultGear: 'medium' } }),
      );
      expect(parsed.reasoning).toEqual({
        style: wire === 'openai' ? 'reasoning_effort' : 'thinking_budget',
        defaultGear: 'medium',
      });
    }
  });

  it('rejects an unknown style and an unknown default gear', () => {
    expect(ModelProviderConfig.safeParse(validConfig({ reasoning: { style: 'bogus', defaultGear: 'low' } })).success).toBe(false);
    expect(ModelProviderConfig.safeParse(validConfig({ reasoning: { style: 'reasoning_effort', defaultGear: 'maximum' } })).success).toBe(false);
  });

  it('enforces style↔wire compatibility: budget dialects cannot ride the wrong wire', () => {
    // enable_thinking is an OpenAI-wire dialect (Qwen3 chat/completions extensions)
    expect(
      ModelProviderConfig.safeParse(validConfig({ wire: 'anthropic', reasoning: { style: 'enable_thinking', defaultGear: 'low' } })).success,
    ).toBe(false);
    // thinking_budget is the Anthropic-Messages dialect
    expect(
      ModelProviderConfig.safeParse(validConfig({ wire: 'openai', reasoning: { style: 'thinking_budget', defaultGear: 'high' } })).success,
    ).toBe(false);
    // reasoning_effort is OpenAI-wire only in this product's dialect map
    expect(
      ModelProviderConfig.safeParse(validConfig({ wire: 'anthropic', reasoning: { style: 'reasoning_effort', defaultGear: 'high' } })).success,
    ).toBe(false);
  });

  it('reasoningBudgetTokens is the single owner of the gear→budget map', () => {
    expect(reasoningBudgetTokens('low')).toBe(8192);
    expect(reasoningBudgetTokens('medium')).toBe(16384);
    expect(reasoningBudgetTokens('high')).toBe(32768);
  });

  it('ProviderWireProtocol still rejects junk (regression guard)', () => {
    expect(ProviderWireProtocol.safeParse('grpc').success).toBe(false);
  });
});
