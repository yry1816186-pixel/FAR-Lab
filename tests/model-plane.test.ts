import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { StructuredCallRequest } from '../src/shared/ports.js';
import {
  capabilitiesForModel, isQwenFamily, listRegistry, negotiateStructuredOutput,
} from '../src/model-plane/capabilities.js';
import {
  routeCall, candidate, TASK_CLASSES, type RouteCandidate, type RoutingDecision,
} from '../src/model-plane/routing.js';
import { createModelPlane } from '../src/model-plane/plane.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { createDashScopeProvider } from '../src/providers/dashscope.js';

/**
 * Model-plane tests — all offline/deterministic (no-live-API directive 2026-08-23).
 * fetch doubles are fixtures; no real keys.
 */

const stubRoute = (name: string, modelId: string, liveReady = false, providerName?: string): RouteCandidate => ({
  name,
  provider: { name, liveReady, structuredCall: async () => { throw new Error('not called'); } },
  modelId,
  ...(providerName !== undefined ? { providerName } : {}),
  ...(capabilitiesForModel(providerName ?? name, modelId) !== undefined ? { capabilities: capabilitiesForModel(providerName ?? name, modelId)! } : {}),
});

// ---------------------------------------------------------------------------
// capability registry
// ---------------------------------------------------------------------------

describe('capability registry', () => {
  it('resolves curated qwen entries with verified structured-output tiers', () => {
    const plus = capabilitiesForModel('dashscope', 'qwen3.7-plus');
    expect(plus?.structuredOutput).toBe('json_schema_strict');
    const max = capabilitiesForModel('dashscope', 'qwen3.8-max');
    expect(max?.structuredOutput).toBe('json_schema_strict');
    expect(max?.vision).toBe(true);
    const flash = capabilitiesForModel('dashscope', 'qwen3.7-flash');
    expect(flash?.structuredOutput).toBe('json_object');
    // alias resolution: dated snapshot ids resolve to their family entry
    expect(capabilitiesForModel('dashscope', 'qwen3.7-plus-2026-05-26')).toBe(plus);
  });

  it('returns undefined for unknown models — capabilities never guessed', () => {
    expect(capabilitiesForModel('dashscope', 'totally-unknown-model')).toBeUndefined();
    expect(capabilitiesForModel('some-provider', 'qwen3.7-plus')).toBeUndefined();
  });

  it('custom routes resolve bare qwen ids (Bailian-configured custom endpoints)', () => {
    expect(capabilitiesForModel('custom:mcfg_x', 'qwen3.8-max')?.structuredOutput).toBe('json_schema_strict');
  });

  it('every curated entry carries source refs; prices are reference-only CNY for bailian', () => {
    for (const entry of listRegistry()) {
      expect(entry.sourceRefs.length).toBeGreaterThan(0);
      expect(entry.sourceRefs[0]!.retrievedAt).toBe('2026-08-24');
    }
    const qwen = capabilitiesForModel('dashscope', 'qwen3.8-max')!.priceRef!;
    expect(qwen.currency).toBe('CNY');
  });

  it('qwen-family predicate matches qwen ids and rejects non-qwen', () => {
    expect(isQwenFamily('qwen3.7-plus')).toBe(true);
    expect(isQwenFamily('qwen-plus-2025-12-01')).toBe(true);
    expect(isQwenFamily('glm-4.6')).toBe(false);
    expect(isQwenFamily('deepseek-chat')).toBe(false);
  });

  it('negotiation: strict json_schema only for verified models WITH projectable schema', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };
    expect(negotiateStructuredOutput(capabilitiesForModel('dashscope', 'qwen3.7-plus'), schema))
      .toEqual({ mode: 'json_schema_strict', schema });
    // flash: no strict capability → json_object even with a schema in hand
    expect(negotiateStructuredOutput(capabilitiesForModel('dashscope', 'qwen3.7-flash'), schema).mode).toBe('json_object');
    // capable model but unprojectable schema (records/unknowns) → degrade, never 400
    expect(negotiateStructuredOutput(capabilitiesForModel('dashscope', 'qwen3.8-max'), undefined).mode).toBe('json_object');
  });
});

// ---------------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------------

describe('task-class routing', () => {
  const routes = [
    stubRoute('qwen-max', 'qwen3.8-max', false, 'dashscope'),
    stubRoute('qwen-flash', 'qwen3.7-flash', false, 'dashscope'),
    stubRoute('qwen-vl', 'qwen3-vl-plus', false, 'dashscope'),
    stubRoute('glm', 'glm-4.6', false, 'zai'),
    stubRoute('mystery', 'mystery-model'),
  ];

  it('deterministic: identical inputs → identical decision (100 runs)', () => {
    const first = routeCall('high_quality_reasoning', routes);
    for (let i = 0; i < 100; i += 1) {
      expect(routeCall('high_quality_reasoning', routes)).toEqual(first);
    }
    expect(first.selectedRoute).toBe('qwen-max'); // deep latency class wins reasoning
  });

  it('cheap extraction prefers the fast tier', () => {
    expect(routeCall('cheap_extraction', routes).selectedRoute).toBe('qwen-flash');
  });

  it('vision routes ONLY to verified vision models; unknown-capability routes are rejected for vision', () => {
    const d = routeCall('vision', routes);
    expect(d.selectedRoute).toBe('qwen-vl');
    const rejected = d.candidates.filter((c) => !c.accepted);
    expect(rejected.some((c) => c.name === 'mystery' && c.reason.includes('capabilities-unverified'))).toBe(true);
    expect(rejected.some((c) => c.name === 'glm' && c.reason === 'no-vision-capability')).toBe(true);
  });

  it('long_context gates on verified context windows and estimated input size', () => {
    const d = routeCall('long_context', routes, { mode: 'default' }, { estimatedInputTokens: 900_000 });
    const over = d.candidates.find((c) => c.name === 'qwen-max');
    // 900k > 75% of the verified 1M window: context-pruned with a visible reason.
    expect(over?.accepted).toBe(false);
    expect(over?.reason).toContain('context-overflow');
  });

  it('competition policy: qwen-family via bailian/dashscope ONLY; glm rejected with visible reason', () => {
    const d = routeCall('high_quality_reasoning', routes, { mode: 'competition' });
    expect(d.selectedRoute).toBe('qwen-max');
    const glm = d.candidates.find((c) => c.name === 'glm')!;
    expect(glm.accepted).toBe(false);
    expect(glm.reason).toContain('competition-policy');
  });

  it('deepseek ban enforced in every mode, even by override', () => {
    const withDeepseek = [...routes, stubRoute('deepseek', 'deepseek-chat')];
    const d = routeCall('conversation', withDeepseek);
    expect(d.candidates.find((c) => c.name === 'deepseek')!.reason).toContain('banned');
    expect(() =>
      routeCall('conversation', withDeepseek, { mode: 'default', overrides: { conversation: 'deepseek' } }),
    ).toThrow(/banned|rejected/i);
  });

  it('override wins among ACCEPTED routes and is recorded via selectedVia', () => {
    const d = routeCall('high_quality_reasoning', routes, { mode: 'default', overrides: { high_quality_reasoning: 'glm' } });
    expect(d.selectedRoute).toBe('glm');
    expect(d.selectedVia).toBe('override');
  });

  it('override on an unknown route name fails visible', () => {
    expect(() =>
      routeCall('ranking', routes, { mode: 'default', overrides: { ranking: 'no-such-route' } }),
    ).toThrow(/no such route/);
  });

  it('duplicate route keys are rejected — keys must be unique', () => {
    expect(() => routeCall('ranking', [stubRoute('dup', 'a'), stubRoute('dup', 'b')])).toThrow(/unique/);
  });

  it('budget-aware: USD-priced route pruned when estimate exceeds remaining (reference pricing only)', () => {
    const usdRoute: RouteCandidate = {
      name: 'usd-expensive',
      provider: stubRoute('x', 'y').provider,
      modelId: 'gpt-hypothetical',
      capabilities: {
        ...capabilitiesForModel('zai', 'glm-4.6')!,
        priceRef: { currency: 'USD', inputPerMTok: 500, outputPerMTok: 500, url: 'x' },
      },
    };
    const d = routeCall('conversation', [usdRoute, ...routes], { mode: 'default' }, { remainingUsd: 0.01, estimatedInputTokens: 8_000 });
    const expensive = d.candidates.find((c) => c.name === 'usd-expensive')!;
    expect(expensive.accepted).toBe(false);
    expect(expensive.reason).toContain('over-remaining-budget');
  });

  it('no eligible route → selectedRoute null with full rejection list', () => {
    const d = routeCall('embedding', routes);
    expect(d.selectedRoute).toBeNull();
    expect(d.candidates.every((c) => !c.accepted)).toBe(true);
  });

  it('every verdict carries a reason — observability contract', () => {
    for (const cls of TASK_CLASSES) {
      const d = routeCall(cls, routes);
      for (const c of d.candidates) expect(c.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// plane facade
// ---------------------------------------------------------------------------

describe('model plane facade', () => {
  const schema = z.object({ answer: z.string() });
  const REQ: StructuredCallRequest = {
    task: 'test-call', systemPrompt: 'sys', userPayload: { q: 1 }, outputKind: 'json', purpose: 'plane-test',
  };

  it('routes per task class, stamps receipt.routing, returns the decision', async () => {
    const decisions: RoutingDecision[] = [];
    const stub = createTestStubProvider([{ rawOutput: '{"answer":"ok"}', forPurpose: 'plane-test' }]);
    const plane = createModelPlane({
      candidates: [candidate('dashscope', stub, 'qwen3.7-flash'), candidate('zai', stub, 'glm-4.6')],
      events: { onDecision: (d) => decisions.push(d) },
    });
    const { result, decision } = await plane.call('cheap_extraction', REQ, (raw) => schema.safeParse(raw).success ? (raw as { answer: string }) : new Error('bad'));
    expect(result.ok).toBe(true);
    expect(result.receipt.routing).toEqual({ taskClass: 'cheap_extraction', route: 'dashscope', selectedVia: 'capability-score' });
    expect(decision.selectedRoute).toBe('dashscope'); // fast tier wins cheap extraction
    expect(decisions).toHaveLength(1);
  });

  it('no eligible route → fail-visible provider_error carrying every rejection reason', async () => {
    const stub = createTestStubProvider([]);
    const plane = createModelPlane({ candidates: [candidate('dashscope', stub, 'qwen3.7-flash')] });
    const { result, decision } = await plane.call('vision', REQ, () => new Error('unreached'));
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('provider_error');
    expect(result.error?.message).toContain('no-vision-capability');
    expect(decision.selectedRoute).toBeNull();
  });

  it('providerFor pins a task class and stamps routing on the inner result', async () => {
    const stub = createTestStubProvider([{ rawOutput: '{"answer":"pinned"}', forPurpose: 'plane-test' }]);
    const plane = createModelPlane({ candidates: [candidate('zai', stub, 'glm-4.6')] });
    const provider = plane.providerFor('conversation');
    expect(provider.name).toBe('model-plane:conversation');
    const res = await provider.structuredCall(REQ, (raw) => schema.safeParse(raw).success ? (raw as { answer: string }) : new Error('bad'));
    expect(res.ok).toBe(true);
    expect(res.receipt.routing).toEqual({ taskClass: 'conversation', route: 'zai', selectedVia: 'only-route' });
  });

  it('inner provider failure passes through unmodified (no fabrication, no silent swap)', async () => {
    const stub = createTestStubProvider([{ fail: { kind: 'quota_exceeded', message: 'ceiling' }, forPurpose: 'plane-test' }]);
    const plane = createModelPlane({ candidates: [candidate('zai', stub, 'glm-4.6')] });
    const { result } = await plane.call('conversation', REQ, () => new Error('unreached'));
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('quota_exceeded');
    expect(result.receipt.provider).toBe('test-stub'); // inner receipt identity preserved
    expect(result.receipt.routing?.route).toBe('zai');
  });
});

// ---------------------------------------------------------------------------
// dashscope capability-driven structured-output negotiation (offline, fetch double)
// ---------------------------------------------------------------------------

describe('dashscope registry-driven negotiation', () => {
  const projectableReq = (): StructuredCallRequest => ({
    task: 't', systemPrompt: 's', userPayload: { a: 1 }, outputKind: 'json', purpose: 'negotiation-test',
    jsonSchema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false },
    maxTokens: 512,
  });

  it('qwen3.7-plus (strict-capable): response_format=json_schema on the wire, max_tokens stripped', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { status: 200 });
    }) as typeof fetch;
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key', model: 'qwen3.7-plus', fetchImpl });
    const res = await provider.structuredCall(projectableReq(), (raw) => z.object({ a: z.number() }).safeParse(raw).success ? (raw as { a: number }) : new Error('bad'));
    expect(res.ok).toBe(true);
    const body = bodies[0] as { response_format?: { type: string }; max_tokens?: number; tools?: unknown };
    expect(body.response_format?.type).toBe('json_schema');
    expect(body.max_tokens).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(res.receipt.params?.structuredOutput).toBe('json_schema_strict');
    expect(res.receipt.params?.maxTokens).toBeUndefined(); // stripped → never sent → not echoed
  });

  it('qwen3.7-flash (NOT strict-capable): stays on json_object exactly as before', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }],
        usage: {},
      }), { status: 200 });
    }) as typeof fetch;
    const provider = createDashScopeProvider({ apiKey: 'test-fixture-key', model: 'qwen3.7-flash', fetchImpl });
    const res = await provider.structuredCall(projectableReq(), (raw) => z.object({ a: z.number() }).safeParse(raw).success ? (raw as { a: number }) : new Error('bad'));
    expect(res.ok).toBe(true);
    const body = bodies[0] as { response_format?: { type: string }; max_tokens?: number };
    expect(body.response_format?.type).toBe('json_object');
    expect(body.max_tokens).toBeUndefined();
    expect(res.receipt.params?.structuredOutput).toBe('json_object');
  });
});
