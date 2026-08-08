/**
 * T-019 · P0-4 统一故障转移（2026-08-07 落地）。
 *
 * 验证 createResilientGateway：
 *   1. 原始 provider 成功 → 直接返回·无降级。
 *   2. 原始失败（可重试）→ 沿 fallbackOrder 降级到下一 provider·onFallback 通知。
 *   3. 全部候选失败 → 显式抛最后错误（fail-closed·绝不静默）。
 *   4. 不可重试错误（非网络类）→ 立即抛出·不降级。
 *   5. maxAttempts 截断候选数·未注册的 fallback 被跳过。
 *
 * Authority: src/llm_gateway/resilient_gateway.ts + gateway.ts。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createResilientGateway } from '../../src/llm_gateway/resilient_gateway.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';
import type { ProviderProfile } from '../../src/llm_gateway/types.ts';


// ---------- helpers ----------

function fixtureResponse(profile: string): LlmResponse {
  return {
    credential: {
      providerProfile: profile as ProviderProfile,
      providerRequestId: null,
      modelId: 'test-model',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content: `ok:${profile}`,
    raw: { replayed: true, messageCount: 2 },
  };
}

function createStubGateway(
  behavior: Readonly<Record<string, () => Promise<LlmResponse> | never>>,
): LlmGateway {
  const adapters = new Set<string>(Object.keys(behavior));
  return {
    register: () => {},
    callLlm: async (profile: ProviderProfile) => {
      const fn = behavior[profile];
      if (fn === undefined) {
        throw new Error(`stub: no behavior for profile ${profile}`);
      }
      return await fn();
    },
    registeredProfiles: () => [...adapters] as readonly ProviderProfile[],
  };
}

function retryableError(message: string): Error {
  const err = new Error(message);
  err.name = 'FetchError'; // 网络类（可重试）
  return err;
}

function nonRetryableError(message: string): Error {
  const err = new Error(message);
  err.name = 'STAGE_SCHEMA_INVALID'; // 契约类（不可重试）
  return err;
}

function makeRequest(): LlmRequest {
  return { messages: [{ role: 'user', content: 'x' }] };
}


// ---------- tests ----------

test('T-019 故障转移：原始 provider 成功 → 直接返回·无降级·无通知', async () => {
  const gateway = createStubGateway({
    provider_a: async () => fixtureResponse('provider_a'),
    provider_b: async () => fixtureResponse('provider_b'),
  });
  let fallbackCalls = 0;
  const resilient = createResilientGateway(gateway, {
    fallbackOrder: ['provider_b' as ProviderProfile],
    onFallback: () => {
      fallbackCalls += 1;
    },
  });

  const res = await resilient.callLlm('provider_a' as ProviderProfile, makeRequest());
  assert.equal(res.content, 'ok:provider_a');
  assert.equal(fallbackCalls, 0, '成功路径不得触发降级');
});

test('T-019 故障转移：可重试失败 → 降级到 fallback·onFallback 带 from/to/attempt', async () => {
  let providerACalls = 0;
  const gateway = createStubGateway({
    provider_a: async () => {
      providerACalls += 1;
      throw retryableError('upstream 500');
    },
    provider_b: async () => fixtureResponse('provider_b'),
  });
  const fallbacks: Array<{ from: string; to: string; attempt: number }> = [];
  const resilient = createResilientGateway(gateway, {
    fallbackOrder: ['provider_b' as ProviderProfile],
    onFallback: (from, to, attempt) => {
      fallbacks.push({ from, to: String(to), attempt });
    },
  });

  const res = await resilient.callLlm('provider_a' as ProviderProfile, makeRequest());
  assert.equal(res.content, 'ok:provider_b', '降级到 provider_b 成功');
  assert.equal(providerACalls, 1);
  assert.equal(fallbacks.length, 1, '降级须有通知');
  assert.equal(fallbacks[0]?.from, 'provider_a');
  assert.equal(fallbacks[0]?.to, 'provider_b');
  assert.equal(fallbacks[0]?.attempt, 1);
});

test('T-019 故障转移：全部候选失败 → 显式抛最后错误（fail-closed·绝不静默）', async () => {
  const gateway = createStubGateway({
    provider_a: async () => {
      throw retryableError('a down');
    },
    provider_b: async () => {
      throw retryableError('b down');
    },
  });
  const resilient = createResilientGateway(gateway, {
    fallbackOrder: ['provider_b' as ProviderProfile],
  });

  await assert.rejects(
    () => resilient.callLlm('provider_a' as ProviderProfile, makeRequest()),
    /b down/,
  );
});

test('T-019 故障转移：不可重试错误 → 立即抛出·不做降级', async () => {
  let providerBCalls = 0;
  const gateway = createStubGateway({
    provider_a: async () => {
      throw nonRetryableError('contract violation');
    },
    provider_b: async () => {
      providerBCalls += 1;
      return fixtureResponse('provider_b');
    },
  });
  let fallbackCalls = 0;
  const resilient = createResilientGateway(gateway, {
    fallbackOrder: ['provider_b' as ProviderProfile],
    onFallback: () => {
      fallbackCalls += 1;
    },
  });

  await assert.rejects(
    () => resilient.callLlm('provider_a' as ProviderProfile, makeRequest()),
    /contract violation/,
  );
  assert.equal(providerBCalls, 0, '契约错误不得触发降级');
  assert.equal(fallbackCalls, 0);
});

test('T-019 故障转移：HTTP 5xx 可重试·4xx 不重试', async () => {
  const fivexx = new Error('upstream 503');
  Object.assign(fivexx, { statusCode: 503 });
  const fourxx = new Error('bad request 400');
  Object.assign(fourxx, { statusCode: 400 });

  const g1 = createStubGateway({
    provider_a: async () => {
      throw fivexx;
    },
    provider_b: async () => fixtureResponse('provider_b'),
  });
  const r1 = createResilientGateway(g1, { fallbackOrder: ['provider_b' as ProviderProfile] });
  assert.equal((await r1.callLlm('provider_a' as ProviderProfile, makeRequest())).content, 'ok:provider_b', '5xx 应降级');

  const g2 = createStubGateway({
    provider_a: async () => {
      throw fourxx;
    },
    provider_b: async () => fixtureResponse('provider_b'),
  });
  const r2 = createResilientGateway(g2, { fallbackOrder: ['provider_b' as ProviderProfile] });
  await assert.rejects(() => r2.callLlm('provider_a' as ProviderProfile, makeRequest()), /bad request/);
});

test('T-019 故障转移：maxAttempts 截断候选·未注册 fallback 被跳过', async () => {
  // provider_b 未注册（behavior 无 provider_b）→ 应被跳过；maxAttempts=1 → 只试 provider_a
  const gateway = createStubGateway({
    provider_a: async () => {
      throw retryableError('a down');
    },
  });
  const resilient = createResilientGateway(gateway, {
    fallbackOrder: ['provider_b' as ProviderProfile],
    maxAttempts: 1,
  });
  await assert.rejects(() => resilient.callLlm('provider_a' as ProviderProfile, makeRequest()), /a down/);
});

test('T-019 故障转移：与 createLlmGateway 组合（真实注册路径）', async () => {
  const inner = createLlmGateway();
  let providerBCalls = 0;
  inner.register({
    profile: 'provider_a' as ProviderProfile,
    call: async () => {
      throw retryableError('a down');
    },
  });
  inner.register({
    profile: 'provider_b' as ProviderProfile,
    call: async () => {
      providerBCalls += 1;
      return fixtureResponse('provider_b');
    },
  });

  const resilient = createResilientGateway(inner, {
    fallbackOrder: ['provider_b' as ProviderProfile],
  });
  const res = await resilient.callLlm('provider_a' as ProviderProfile, makeRequest());
  assert.equal(res.content, 'ok:provider_b');
  assert.equal(providerBCalls, 1);
});
