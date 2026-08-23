import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { STAGE_REASONING_GEAR, stageReasoningGear, clampGearForModel } from '../src/domain/model-config.js';
import { invokeStructured } from '../src/pipeline/llm.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { ModelProvider, StructuredCallRequest } from '../src/shared/ports.js';

// RU-9 GO2 — stage→reasoning effort plane. All offline/deterministic.

describe('stage gear table', () => {
  it('quality-critical stages high, mechanical low, default medium, prefix classes covered', () => {
    expect(STAGE_REASONING_GEAR.retrieve).toBe('high');
    expect(STAGE_REASONING_GEAR.build_evidence).toBe('high');
    expect(STAGE_REASONING_GEAR.rank).toBe('high');
    expect(STAGE_REASONING_GEAR.revise).toBe('high');
    expect(STAGE_REASONING_GEAR.export).toBe('low');
    expect(STAGE_REASONING_GEAR.execute).toBe('low');
    expect(stageReasoningGear('agent:refine')).toBe('medium');
    expect(stageReasoningGear('action:adversarial-question')).toBe('high');
    expect(stageReasoningGear('whatever-else')).toBe('medium');
  });

  it('GLM-5 family clamps medium→high (no medium gear); other models untouched', () => {
    expect(clampGearForModel('medium', 'glm-5.3')).toBe('high');
    expect(clampGearForModel('low', 'glm-5.3')).toBe('low');
    expect(clampGearForModel('high', 'GLM-5-X')).toBe('high');
    expect(clampGearForModel('medium', 'glm-4.6')).toBe('medium');
    expect(clampGearForModel('medium', 'qwen3.7-max')).toBe('medium');
  });
});

describe('invokeStructured derivation', () => {
  const capture = (step: StubStep): { provider: ModelProvider; requests: StructuredCallRequest[] } => {
    const scripted = createTestStubProvider([step]);
    const requests: StructuredCallRequest[] = [];
    const provider: ModelProvider = {
      ...scripted,
      structuredCall: (async (req: StructuredCallRequest, parse: unknown) => {
        requests.push(req);
        return scripted.structuredCall(req, parse as never);
      }) as ModelProvider['structuredCall'],
    };
    return { provider, requests };
  };

  it('route present → derives gear from the stage table with model clamps', async () => {
    const { provider, requests } = capture({ rawOutput: JSON.stringify({ ok: true }) });
    await invokeStructured(
      { provider, recordReceipt: () => {}, reasoningRoute: { style: 'reasoning_effort', defaultGear: 'low', modelId: 'glm-5.3' } },
      { stage: 'retrieve', purpose: 'test', systemPrompt: 's', payload: {}, schema: z.object({ ok: z.boolean() }), temperature: 0 },
    );
    // retrieve → table says high; glm-5.3 clamp leaves high
    expect(requests[0]!.reasoning).toEqual({ style: 'reasoning_effort', gear: 'high' });

    const second = capture({ rawOutput: JSON.stringify({ ok: true }) });
    await invokeStructured(
      { provider: second.provider, recordReceipt: () => {}, reasoningRoute: { style: 'enable_thinking', defaultGear: 'low', modelId: 'glm-5.3' } },
      { stage: 'whatever-else', purpose: 'test', systemPrompt: 's', payload: {}, schema: z.object({ ok: z.boolean() }), temperature: 0 },
    );
    // unknown stage → medium; glm-5.3 clamp RAISES to high (never silently downgrades)
    expect(second.requests[0]!.reasoning).toEqual({ style: 'enable_thinking', gear: 'high' });
  });

  it('no route → zero reasoning fields (exact legacy behavior); explicit call override wins', async () => {
    const legacy = capture({ rawOutput: JSON.stringify({ ok: true }) });
    await invokeStructured(
      { provider: legacy.provider, recordReceipt: () => {} },
      { stage: 'retrieve', purpose: 'test', systemPrompt: 's', payload: {}, schema: z.object({ ok: z.boolean() }), temperature: 0 },
    );
    expect(legacy.requests[0]!.reasoning).toBeUndefined();

    const explicit = capture({ rawOutput: JSON.stringify({ ok: true }) });
    await invokeStructured(
      { provider: explicit.provider, recordReceipt: () => {}, reasoningRoute: { style: 'reasoning_effort', defaultGear: 'high', modelId: 'glm-5.3' } },
      { stage: 'retrieve', purpose: 'test', systemPrompt: 's', payload: {}, schema: z.object({ ok: z.boolean() }), temperature: 0, reasoning: { style: 'reasoning_effort', gear: 'low' } },
    );
    expect(explicit.requests[0]!.reasoning).toEqual({ style: 'reasoning_effort', gear: 'low' });
  });
});
