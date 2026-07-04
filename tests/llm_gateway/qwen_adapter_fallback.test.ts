/**
 * aliyun_qwen 文本-only adapter 端到端 fallback 测试（CLAUDE.md §3）。
 *
 * 真实依赖：executeFallbackChain 穿透 DashScope HTTP（spec 24 §5 / 05 §8.2）。
 * 测试在 caller 注入层（createChatCompletion）mock——NOT FakeBackend。
 * executeFallbackChain 本身是真实编排（被测依赖），不 mock。
 *
 * 三条断言（CLAUDE.md §3 端到端 RED→GREEN）：
 *   1. 429 穿透：primary 抛 429 → 自动 fallback 到 backup model 并成功
 *   2. 链路耗尽：三档全 429 → adapter.call() 抛 RETRY_EXHAUSTED
 *   3. fatal 错误：400 → adapter.call() 抛 BailianHttpError
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';

import { createQwenAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import type { QwenChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import {
  COMPETITION_FALLBACK_CHAIN,
  COMPETITION_PRIMARY_MODEL_ID,
  NO_QWEN_FAMILY_AVAILABLE_REASON,
} from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';
import {
  BailianHttpError,
  BailianRateLimitError,
} from '../../src/llm_gateway/fallback_chain/index.ts';

// ===== Fixture：构造合法 OpenAI.ChatCompletion =====

function makeCompletion(modelId: string, content: string): OpenAI.ChatCompletion {
  return {
    id: `chatcmpl-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 5,
      completion_tokens: 3,
      total_tokens: 8,
    },
  };
}

// 模拟 openai SDK 原生 429 错误（带 status，duck-type 兼容 error_classifier）。
function openaiSdkError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

// ===== §1 429 穿透：primary → backup success =====

test('qwen_adapter: 429 on primary → fallback to backup_1 success (no throw)', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === COMPETITION_PRIMARY_MODEL_ID) {
        throw openaiSdkError(429, 'quota exhausted');
      }
      // backup_1 (qwen3-235b-a22b) success
      return makeCompletion(request.modelId, 'response-from-backup');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'hello' }],
  });

  // 验证 fallback 顺序：先试 primary，429 后切 backup_1
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(attempts[1], 'qwen3-235b-a22b');
  // 响应来自 backup_1
  assert.equal(response.credential.modelId, 'qwen3-235b-a22b');
  assert.equal(response.content, 'response-from-backup');
  // 降级留痕：degradedFrom=primary
  assert.equal(response.credential.adapterMeta?.degradedFrom, COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.adapterMeta?.degradationCount, 1);
});

// ===== §2 链路耗尽：三档全 429 → RETRY_EXHAUSTED =====

test('qwen_adapter: all targets 429 → chainExhausted → throws RETRY_EXHAUSTED', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      // 使用 BailianRateLimitError（fallback_chain 的 429 typed error）
      throw new BailianRateLimitError(null, `req-${request.modelId}`);
    },
  });

  await assert.rejects(
    () => adapter.call({ messages: [{ role: 'user', content: 'hi' }] }),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'must be Error');
      const code = (err as { code?: unknown }).code;
      assert.equal(code, 'RETRY_EXHAUSTED', 'error.code must be RETRY_EXHAUSTED');
      // 附带 reason（spec 24 §5 NO_QWEN_FAMILY_AVAILABLE_REASON）
      const reason = (err as { reason?: unknown }).reason;
      assert.equal(reason, NO_QWEN_FAMILY_AVAILABLE_REASON);
      return true;
    },
  );

  // 三档全试过（COMPETITION_FALLBACK_CHAIN.length === 3）
  assert.equal(attempts.length, COMPETITION_FALLBACK_CHAIN.length);
  assert.deepEqual(
    attempts,
    COMPETITION_FALLBACK_CHAIN.map((t) => t.modelId),
  );
});

// ===== §3 fatal 错误：400 → BailianHttpError =====

test('qwen_adapter: fatal 400 on primary → throws BailianHttpError (no fallback)', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      // 400 = client error → fatal per spec 05 §9.2 trigger matrix
      throw new BailianHttpError(400, null, 'bad request');
    },
  });

  await assert.rejects(
    () => adapter.call({ messages: [{ role: 'user', content: 'hi' }] }),
    (err: unknown) => {
      assert.ok(err instanceof BailianHttpError, 'must be BailianHttpError');
      assert.equal((err as BailianHttpError).status, 400);
      return true;
    },
  );

  // fatal 立即终止整链——只 primary 被试，backup 未触达（F11: 绝不静默换）
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0], COMPETITION_PRIMARY_MODEL_ID);
});

// ===== §4 happy path：primary success → no degradation =====

test('qwen_adapter: primary success → no fallback, no degradedFrom', async () => {
  const attempts: string[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      return makeCompletion(request.modelId, 'ok');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0], COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.modelId, COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.providerProfile, 'competition_aliyun_qwen');
  assert.equal(response.credential.capability, 'reasoning');
  // 无降级 → adapterMeta 不应带 degradedFrom
  assert.equal(response.credential.adapterMeta?.degradedFrom, undefined);
  assert.equal(response.content, 'ok');
});
