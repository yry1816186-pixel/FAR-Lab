/**
 * T-020 · P0-4 并发控制/速率限制（2026-08-07 落地）。
 *
 * 验证 createRateLimitedGateway：
 *   1. maxConcurrent=1：并发调用排队串行（不重叠·不丢弃）。
 *   2. 并发上限 N：同时最多 N 个 in-flight。
 *   3. minIntervalMs：相邻调用最小间隔被强制（节流）。
 *   4. 异常路径：调用抛错仍释放并发闸（finally·不泄漏）。
 *
 * Authority: src/llm_gateway/rate_limiter.ts + gateway.ts。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createRateLimitedGateway } from '../../src/llm_gateway/rate_limiter.ts';
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

function makeRequest(): LlmRequest {
  return { messages: [{ role: 'user', content: 'x' }] };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}


// ---------- tests ----------

test('T-020 并发控制：maxConcurrent=1 → 调用严格串行（无重叠）', async () => {
  const inner = createLlmGateway();
  let inFlight = 0;
  let maxObserved = 0;
  let calls = 0;
  inner.register({
    profile: 'p' as ProviderProfile,
    call: async () => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      calls += 1;
      await sleep(30);
      inFlight -= 1;
      return fixtureResponse('p');
    },
  });
  const limited = createRateLimitedGateway(inner, { maxConcurrent: 1 });

  await Promise.all([
    limited.callLlm('p' as ProviderProfile, makeRequest()),
    limited.callLlm('p' as ProviderProfile, makeRequest()),
    limited.callLlm('p' as ProviderProfile, makeRequest()),
  ]);

  assert.equal(calls, 3, '3 次调用全部完成');
  assert.equal(maxObserved, 1, '并发上限 1 → 从不重叠');
});

test('T-020 并发控制：maxConcurrent=2 → 同时最多 2 个 in-flight', async () => {
  const inner = createLlmGateway();
  let inFlight = 0;
  let maxObserved = 0;
  inner.register({
    profile: 'p' as ProviderProfile,
    call: async () => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      await sleep(25);
      inFlight -= 1;
      return fixtureResponse('p');
    },
  });
  const limited = createRateLimitedGateway(inner, { maxConcurrent: 2 });

  await Promise.all([
    limited.callLlm('p' as ProviderProfile, makeRequest()),
    limited.callLlm('p' as ProviderProfile, makeRequest()),
    limited.callLlm('p' as ProviderProfile, makeRequest()),
    limited.callLlm('p' as ProviderProfile, makeRequest()),
  ]);

  assert.ok(maxObserved <= 2, `并发须 ≤2（实测 ${maxObserved}）`);
  assert.equal(maxObserved, 2, '应能利用满并发 2');
});

test('T-020 节流：minIntervalMs 强制相邻调用最小间隔', async () => {
  const inner = createLlmGateway();
  const startTimes: number[] = [];
  inner.register({
    profile: 'p' as ProviderProfile,
    call: async () => {
      startTimes.push(performance.now());
      return fixtureResponse('p');
    },
  });
  const limited = createRateLimitedGateway(inner, { maxConcurrent: 1, minIntervalMs: 50 });

  await limited.callLlm('p' as ProviderProfile, makeRequest());
  await limited.callLlm('p' as ProviderProfile, makeRequest());
  await limited.callLlm('p' as ProviderProfile, makeRequest());

  assert.equal(startTimes.length, 3);
  // 测量容差 1ms：计时点偏移（enforce 内 lastCallAt 记录 vs inner.call 内 startTimes 记录，亚毫秒级 ε）
  // + 单调时钟浮点精度共同决定 gap ∈ [50-ε, ∞)。语义不变：gap < 49 仍失败（真未节流）。
  // 另：minIntervalMs 实现用 performance.now()（单调）——不受系统墙钟回拨影响（防 flaky 根因）。
  const gap1 = (startTimes[1] ?? 0) - (startTimes[0] ?? 0);
  const gap2 = (startTimes[2] ?? 0) - (startTimes[1] ?? 0);
  assert.ok(gap1 >= 49, `gap1=${gap1} 须 ≥50ms（容差 1ms）`);
  assert.ok(gap2 >= 49, `gap2=${gap2} 须 ≥50ms（容差 1ms）`);
});

test('T-020 异常路径：调用抛错仍释放并发闸（finally·不泄漏）', async () => {
  const inner = createLlmGateway();
  let calls = 0;
  inner.register({
    profile: 'p' as ProviderProfile,
    call: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('first call fails');
      }
      return fixtureResponse('p');
    },
  });
  const limited = createRateLimitedGateway(inner, { maxConcurrent: 1 });

  await assert.rejects(() => limited.callLlm('p' as ProviderProfile, makeRequest()), /first call fails/);
  // 闸未泄漏：后续调用可正常执行
  const res = await limited.callLlm('p' as ProviderProfile, makeRequest());
  assert.equal(res.content, 'ok:p');
  assert.equal(calls, 2);
});
// Note: the former T-020 "resilient + rate-limited composition" test was removed
// when resilient_gateway.ts was deleted (unused in production; LLM fallback is
// owned by executeFallbackChain in qwen_adapter). rate_limiter itself is retained
// because the upcoming retrieval layer reuses it for external-API throttling.
