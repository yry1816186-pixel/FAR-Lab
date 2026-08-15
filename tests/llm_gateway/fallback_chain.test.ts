/**
 * FallbackChain 测试套件（§8.2/§9 + §5）。
 *
 * 测试策略：caller 注入——确定性 mock 按 modelId 抛特定错误，离线全测：
 *   1. 触发矩阵（error_classifier）：timeout/network/429/5xx → fallback；4xx/config/unknown → fatal
 *   2. 链路遍历（executeFallbackChain）：成功/降级/耗尽/致命终止
 *   3. 诚实铁律（F11）：每次 swap 留痕 degradationSummary + attempts[]
 *   4. D3 红线（引擎通用机制）：命中 invalidatesD3 target → invalidatesD3=true（生产 chain 已删 deepseek·evo-01）
 *   5. 链配置（COMPETITION_FALLBACK_CHAIN · evo-01）：3 元素 Qwen-only + exhaust reason
 *
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderError,
  BailianHttpError,
  BailianTimeoutError,
  BailianNetworkError,
  BailianRateLimitError,
  shouldFallback,
  executeFallbackChain,
  type FallbackCaller,
  type FallbackModelTarget,
} from '../../src/llm_gateway/fallback_chain/index.ts';
import { NonQwenModelError } from '../../src/llm_gateway/adapters/aliyun_qwen/errors.ts';
import {
  COMPETITION_FALLBACK_CHAIN,
  COMPETITION_PRIMARY_MODEL_ID,
  NO_QWEN_FAMILY_AVAILABLE_REASON,
} from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';

// ---------------------------------------------------------------------------
// 确定性 caller 工厂：按 modelId → 行为（成功 data | 抛错）
// ---------------------------------------------------------------------------

interface CallerBehavior {
  readonly data?: string;
  readonly error?: unknown;
  readonly requestId?: string | null;
}

function makeCaller(behaviors: Record<string, CallerBehavior>): FallbackCaller<string> {
  return async (target) => {
    const beh = behaviors[target.modelId];
    if (beh === undefined) {
      throw new Error(`test caller: no behavior for ${target.modelId}`);
    }
    if (beh.error !== undefined) {
      throw beh.error;
    }
    return { data: beh.data ?? `response-from-${target.modelId}`, dashscopeRequestId: beh.requestId ?? null };
  };
}

const CHAIN: readonly FallbackModelTarget[] = [
  { modelId: 'primary', role: 'primary' },
  { modelId: 'backup_1', role: 'backup_1' },
  { modelId: 'backup_2', role: 'backup_2' },
  { modelId: 'last_resort', role: 'last_resort', invalidatesD3: true },
];

// ===========================================================================
// 1. 触发矩阵（error_classifier · §9.2）
// ===========================================================================

test('classifier: BailianTimeoutError → fallback (timeout)', () => {
  const r = shouldFallback(new BailianTimeoutError());
  assert.equal(r.fallback, true);
  assert.equal(r.triggerSignal, 'timeout');
});

test('classifier: BailianNetworkError → fallback (network)', () => {
  const r = shouldFallback(new BailianNetworkError('ECONNRESET'));
  assert.equal(r.fallback, true);
  assert.equal(r.triggerSignal, 'network');
});

test('classifier: BailianRateLimitError → fallback (http_429)', () => {
  const r = shouldFallback(new BailianRateLimitError(5000, 'req-abc'));
  assert.equal(r.fallback, true);
  assert.equal(r.triggerSignal, 'http_429');
});

test('classifier: BailianHttpError 500/502/503 → fallback', () => {
  for (const status of [500, 502, 503, 504]) {
    const r = shouldFallback(new BailianHttpError(status, null));
    assert.equal(r.fallback, true, `${status} should fallback`);
    assert.equal(r.triggerSignal, `http_${status}`);
  }
});

test('classifier: BailianHttpError 400/401/403/404/422 → fatal (no fallback)', () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const r = shouldFallback(new BailianHttpError(status, null));
    assert.equal(r.fallback, false, `${status} should NOT fallback`);
    assert.equal(r.triggerSignal, `http_${status}`);
  }
});

test('classifier: duck-type error with numeric status → status matrix', () => {
  // openai SDK 原生错误（非 BailianHttpError 实例但带 .status）兼容。
  const err500 = Object.assign(new Error('upstream 500'), { status: 500 });
  assert.equal(shouldFallback(err500).fallback, true);
  const err400 = Object.assign(new Error('bad request'), { status: 400 });
  assert.equal(shouldFallback(err400).fallback, false);
});

test('classifier: OpenAI SDK APIConnectionError with status undefined → fallback (network)', () => {
  class APIConnectionError extends Error {
    constructor() {
      super('Connection error.');
      this.name = 'Error';
      this.cause = new Error(
        'FetchError: Client network socket disconnected before secure TLS connection was established',
      );
    }
  }

  const r = shouldFallback(new APIConnectionError());
  assert.equal(r.fallback, true);
  assert.equal(r.triggerSignal, 'network');
});

test('classifier: OpenAI SDK APIConnectionTimeoutError with status undefined → fallback (timeout)', () => {
  class APIConnectionTimeoutError extends Error {
    constructor() {
      super('Request timed out.');
      this.name = 'Error';
      this.cause = Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' });
    }
  }

  const r = shouldFallback(new APIConnectionTimeoutError());
  assert.equal(r.fallback, true);
  assert.equal(r.triggerSignal, 'timeout');
});

test('classifier: NonQwenModelError (config error) → fatal', () => {
  const r = shouldFallback(new NonQwenModelError('gpt-4'));
  assert.equal(r.fallback, false);
  assert.equal(r.triggerSignal, 'unknown_or_config');
});

test('classifier: plain Error (unknown) → fatal (F11: never silently switch)', () => {
  const r = shouldFallback(new Error('something exploded'));
  assert.equal(r.fallback, false);
  assert.equal(r.triggerSignal, 'unknown_or_config');
});

// ===========================================================================
// 2. 链路遍历（executeFallbackChain）
// ===========================================================================

test('chain: primary success → no degradation', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({ primary: { data: 'ok' } }),
  );
  assert.equal(result.data, 'ok');
  assert.equal(result.succeededModelId, 'primary');
  assert.equal(result.degradedFrom, null);
  assert.equal(result.degradationCount, 0);
  assert.equal(result.chainExhausted, false);
  assert.equal(result.fatalEncountered, false);
  assert.equal(result.invalidatesD3, false);
  assert.equal(result.degradationSummary, null);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]!.outcome, 'success');
});

test('chain: primary 429 → backup success → degraded (1 swap)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianRateLimitError(null, 'req-1') },
      backup_1: { data: 'ok-backup' },
    }),
  );
  assert.equal(result.data, 'ok-backup');
  assert.equal(result.succeededModelId, 'backup_1');
  assert.equal(result.degradedFrom, 'primary');
  assert.equal(result.degradationCount, 1);
  assert.equal(result.chainExhausted, false);
  assert.equal(result.fatalEncountered, false);
  assert.ok(result.degradationSummary?.includes('primary'));
  assert.ok(result.degradationSummary?.includes('backup_1'));
  assert.ok(result.degradationSummary?.includes('http_429'));
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]!.outcome, 'fallback');
  assert.equal(result.attempts[0]!.triggerSignal, 'http_429');
  assert.equal(result.attempts[0]!.dashscopeRequestId, 'req-1');
  assert.equal(result.attempts[1]!.outcome, 'success');
});

test('chain: primary 500 → backup timeout → backup_2 success (2 swaps)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(500, null) },
      backup_1: { error: new BailianTimeoutError() },
      backup_2: { data: 'ok-2' },
    }),
  );
  assert.equal(result.succeededModelId, 'backup_2');
  assert.equal(result.degradationCount, 2);
  assert.equal(result.degradedFrom, 'primary');
  assert.ok(result.degradationSummary?.includes('http_500'));
  assert.ok(result.degradationSummary?.includes('timeout'));
  assert.equal(result.attempts.length, 3);
});

test('chain: all fallback, none success → chainExhausted (data=null)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(503, null) },
      backup_1: { error: new BailianNetworkError('ECONNRESET') },
      backup_2: { error: new BailianTimeoutError() },
      last_resort: { error: new BailianHttpError(502, null) },
    }),
  );
  assert.equal(result.data, null);
  assert.equal(result.succeededModelId, null);
  assert.equal(result.chainExhausted, true);
  assert.equal(result.fatalEncountered, false);
  assert.equal(result.attempts.length, 4);
  for (const a of result.attempts) {
    assert.equal(a.outcome, 'fallback');
  }
  assert.ok(result.degradationSummary?.includes('NO_SUCCESS'));
});

test('chain: 4xx on primary → fatalEncountered, NO further attempts (F11)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(400, 'req-bad') },
      // backup_1 永不应被调用（400 致命·立即终止整链）。
      backup_1: { error: new Error('should not be called') },
    }),
  );
  assert.equal(result.data, null);
  assert.equal(result.fatalEncountered, true);
  assert.equal(result.chainExhausted, false);
  assert.equal(result.attempts.length, 1); // 只 primary 被尝试
  assert.equal(result.attempts[0]!.outcome, 'fatal');
  assert.equal(result.attempts[0]!.triggerSignal, 'http_400');
});

test('chain: NonQwenModelError on backup → fatal terminates (config error not retried via swap)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(500, null) }, // fallback to backup_1
      backup_1: { error: new NonQwenModelError('rogue-model') }, // config error → fatal
    }),
  );
  assert.equal(result.fatalEncountered, true);
  assert.equal(result.data, null);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[1]!.outcome, 'fatal');
  assert.equal(result.attempts[1]!.modelId, 'backup_1');
});

// ===========================================================================
// 3. D3 红线（§5）
// ===========================================================================

test('engine: success via invalidatesD3 target (last_resort fixture) → invalidatesD3=true (evo-01·引擎机制保留)', async () => {
  // evo-01 诚实标注：本测试用本地 CHAIN fixture（含 last_resort invalidatesD3）测引擎通用机制。
  // V1 生产 COMPETITION_FALLBACK_CHAIN 已删 deepseek（3 元素 Qwen-only·24 §5），无 invalidatesD3 target；
  // 引擎 invalidatesD3 字段保留为防御性机制（未来若引入非国产基座仍触发·见 fallback_chain/types.ts）。
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(503, null) },
      backup_1: { error: new BailianTimeoutError() },
      backup_2: { error: new BailianNetworkError('down') },
      last_resort: { data: 'non-domestic-ok' },
    }),
  );
  assert.equal(result.succeededModelId, 'last_resort');
  assert.equal(result.invalidatesD3, true);
  assert.equal(result.degradationCount, 3);
  assert.ok(result.degradationSummary?.includes('last_resort'));
});

test('chain: success via domestic model → invalidatesD3=false', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({ backup_1: { data: 'ok' } }),
  );
  assert.equal(result.invalidatesD3, false);
});

// ===========================================================================
// 4. 诚实铁律（F11）：绝不绝不静默换
// ===========================================================================

test('F11: every swap records trigger+reason in attempts[] (no silent switch)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({
      primary: { error: new BailianHttpError(502, null) },
      backup_1: { data: 'ok' },
    }),
  );
  // 每个非成功 attempt 必有 triggerSignal + reason（禁留空）。
  const failed = result.attempts.filter((a) => a.outcome !== 'success');
  assert.equal(failed.length, 1);
  assert.ok(failed[0]!.triggerSignal !== null);
  assert.ok(failed[0]!.reason !== null);
  // degradationSummary 必非空（每次降级都标注）。
  assert.ok(result.degradationSummary !== null);
});

test('F11: degradationSummary null when NO swap occurred (honest: no overclaim)', async () => {
  const result = await executeFallbackChain(
    CHAIN,
    makeCaller({ primary: { data: 'ok' } }),
  );
  assert.equal(result.degradationSummary, null);
  assert.equal(result.degradedFrom, null);
});

// ===========================================================================
// 5. 链配置（COMPETITION_FALLBACK_CHAIN · §5）
// ===========================================================================

test('COMPETITION_FALLBACK_CHAIN: 3 elements Qwen-only per §5 (evo-01)', () => {
  // evo-01：4 元素含 deepseek → 3 元素 Qwen-only（24 §5 2026-06 删 deepseek·02 §C2）。
  assert.equal(COMPETITION_FALLBACK_CHAIN.length, 3);
  assert.equal(COMPETITION_FALLBACK_CHAIN[0]!.modelId, 'qwen3.7-max-2026-05-20');
  assert.equal(COMPETITION_FALLBACK_CHAIN[1]!.modelId, 'qwen3-235b-a22b');
  assert.equal(COMPETITION_FALLBACK_CHAIN[2]!.modelId, 'qwen-plus');
  // 3 元素全国产 Qwen：无一携带 invalidatesD3（绝不切非国产基座）。
  for (const target of COMPETITION_FALLBACK_CHAIN) {
    assert.notEqual(target.invalidatesD3, true, `${target.modelId} must not invalidate D3`);
  }
});

test('COMPETITION_FALLBACK_CHAIN: no deepseek element (D3 红线·02 §C2·evo-01)', () => {
  // evo-01：deepseek 第4档已删（24 §5·31 §10.2）。生产链禁含 deepseek。
  for (const target of COMPETITION_FALLBACK_CHAIN) {
    assert.doesNotMatch(target.modelId, /deepseek/i, 'production chain must not contain deepseek');
  }
});

test('NO_QWEN_FAMILY_AVAILABLE_REASON: chain exhaust → verdict UNTESTED reason (24 §5)', () => {
  // evo-01：三档全失败 caller 落 verdict=UNTESTED + 此 reason（绝不切非国产基座）。
  assert.equal(NO_QWEN_FAMILY_AVAILABLE_REASON, 'no_qwen_family_available');
});

test('COMPETITION_PRIMARY_MODEL_ID matches chain head', () => {
  assert.equal(COMPETITION_PRIMARY_MODEL_ID, 'qwen3.7-max-2026-05-20');
  assert.equal(COMPETITION_PRIMARY_MODEL_ID, COMPETITION_FALLBACK_CHAIN[0]!.modelId);
});

test('empty chain throws (config error: degradedFrom undefined)', async () => {
  await assert.rejects(
    () => executeFallbackChain([], makeCaller({})),
    /empty chain/,
  );
});

// ===========================================================================
// 6. 错误层级（spec F-05-18）
// ===========================================================================

test('error hierarchy: BailianRateLimitError extends BailianHttpError(429)', () => {
  const e = new BailianRateLimitError(1000, 'req-x');
  assert.ok(e instanceof BailianHttpError);
  assert.ok(e instanceof ProviderError);
  assert.equal(e.status, 429);
  assert.equal(e.retryAfterMs, 1000);
  assert.equal(e.dashscopeRequestId, 'req-x');
});

test('error hierarchy: BailianTimeoutError / NetworkError are ProviderError', () => {
  assert.ok(new BailianTimeoutError() instanceof ProviderError);
  assert.ok(new BailianNetworkError() instanceof ProviderError);
});
