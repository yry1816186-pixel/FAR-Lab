/**
 * retry_policy.test.ts —— withRetry 退避策略 + MAX_TOKENS_TABLE 测试。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §7.3（withRetry）+ §7.4（MAX_TOKENS_TABLE）.
 *
 * 测试框架：node:test + node:assert/strict（禁 vitest）。
 *
 * 设计要点：
 *   - 退避测试用 baseDelayMs=1（指数 1ms/2ms/4ms）·避免真实 1s 退避拖慢测试。
 *   - 错误对象用 { status: number }（与 retry_policy.ts 的 isTransient/hasStatus 对齐）。
 *   - type guard getStatus 从 unknown 安全提取 status（禁 as 强转结构·与 retry_policy.ts hasStatus 同风格）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TOKENS_TABLE,
  withRetry,
} from '../../src/agent_loop/retry_policy.ts';


// ---------- type guard：从 unknown 安全提取 status ----------

/**
 * 从 unknown 错误对象安全提取 status 数值（type guard 收窄·禁 as 强转结构）。
 *
 * 与 retry_policy.ts 的 hasStatus 同风格（单层 as 在 type guard 上下文·零容忍不触）。
 */
function getStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) {
    return undefined;
  }
  const status = (err as { status: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}


// ---------- withRetry 429 重试 ----------

test('withRetry 429 重试：第一次抛 {status:429}·第二次返回 ok → 结果 ok·调用 2 次', async () => {
  let calls = 0;
  const fn = async (): Promise<string> => {
    calls++;
    if (calls === 1) {
      throw { status: 429 };
    }
    return 'ok';
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});


// ---------- withRetry 503 重试 ----------

test('withRetry 503 重试：第一次抛 {status:503}·第二次返回 ok → 结果 ok', async () => {
  let calls = 0;
  const fn = async (): Promise<string> => {
    calls++;
    if (calls === 1) {
      throw { status: 503 };
    }
    return 'ok';
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});


// ---------- withRetry 400 立即 fatal ----------

test('withRetry 400 立即 fatal：抛 {status:400} → 立即抛出（不重试）·调用 1 次', async () => {
  let calls = 0;
  const fn = async (): Promise<string> => {
    calls++;
    throw { status: 400 };
  };

  await assert.rejects(
    withRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
    (err: unknown) => getStatus(err) === 400,
  );
  assert.equal(calls, 1);
});


// ---------- withRetry 401/403/404/500/502 立即 fatal ----------

for (const status of [401, 403, 404, 500, 502]) {
  test(`withRetry ${status} 立即 fatal（不重试·调用 1 次）`, async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      throw { status };
    };

    await assert.rejects(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
      (err: unknown) => getStatus(err) === status,
    );
    assert.equal(calls, 1);
  });
}


// ---------- withRetry maxRetries 耗尽 ----------

test('withRetry maxRetries 耗尽：总是抛 {status:429}·maxRetries=2 → 调用 3 次（1+2）后抛原错误', async () => {
  let calls = 0;
  const fn = async (): Promise<string> => {
    calls++;
    throw { status: 429 };
  };

  // 循环内 attempt === maxRetries 时已 throw 原错误（非 RETRY_EXHAUSTED）
  await assert.rejects(
    withRetry(fn, { maxRetries: 2, baseDelayMs: 1 }),
    (err: unknown) => getStatus(err) === 429,
  );
  assert.equal(calls, 3); // 1 次初试 + 2 次重试
});


// ---------- MAX_TOKENS_TABLE 7 键覆盖 ----------

test('MAX_TOKENS_TABLE 覆盖 7 键（含 stage0_dialogue）', () => {
  const keys = Object.keys(MAX_TOKENS_TABLE).sort();
  assert.deepEqual(keys, [
    'stage0_dialogue',
    'stage1_understanding',
    'stage2_integration',
    'stage3_hypothesis',
    'stage4_evidence',
    'stage5_plan',
    'stage6_feedback',
  ]);
});


// ---------- MAX_TOKENS_TABLE 值合理 ----------

test('MAX_TOKENS_TABLE 值合理：stage4_evidence=6000 > stage1_understanding=2000', () => {
  assert.equal(MAX_TOKENS_TABLE.stage4_evidence, 6000);
  assert.equal(MAX_TOKENS_TABLE.stage1_understanding, 2000);
  assert.ok(
    MAX_TOKENS_TABLE.stage4_evidence > MAX_TOKENS_TABLE.stage1_understanding,
    '证据梳理需较长输出（6000 > 2000）',
  );
});
