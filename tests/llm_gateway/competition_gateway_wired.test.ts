/**
 * competition_gateway 生产接线测试。
 *
 * 真实依赖：createCompetitionQwenGateway → createLlmGateway → createQwenAdapter → executeFallbackChain。
 * 测试在 createChatCompletion 注入层 mock（per-target 成败）——NOT FakeBackend，executeFallbackChain 本身真实编排。
 *
 * G1 闭合证据（DIGEST.md §8 G1「createQwenAdapter 从未被生产代码构造」）：
 *   1. 工厂构造的 gateway 注册 competition_aliyun_qwen profile（adapter 真实构造·非 offline_replay）
 *   2. 经 gateway.callLlm（生产 dispatch 路径·非直调 adapter.call）驱动真实 executeFallbackChain：
 *      primary 429 → fallback backup_1 success → degradedFrom=primary 落 credential.adapterMeta
 *
 * 无付费 API：createChatCompletion 注入控制每 target 成败，真 SDK 路径（production）省略此注入。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';

import { createCompetitionQwenGateway } from '../../src/llm_gateway/competition_gateway.ts';
import { COMPETITION_PRIMARY_MODEL_ID } from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';
import type { QwenChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';

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

// duck-type 兼容 error_classifier（openai SDK 原生 429 带 status）。
function openaiSdkError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

test('createCompetitionQwenGateway: constructs gateway registering competition_aliyun_qwen (G1 · adapter 真实构造)', () => {
  const gateway = createCompetitionQwenGateway({ apiKey: 'test-key' });
  assert.deepEqual(
    [...gateway.registeredProfiles()],
    ['competition_aliyun_qwen'],
    'factory gateway must register the competition adapter (G1: production-reachable adapter construction)',
  );
});

test('createCompetitionQwenGateway: 429 on primary → gateway.callLlm drives real executeFallbackChain → fallback backup + degradedFrom', async () => {
  const attempts: string[] = [];
  const gateway = createCompetitionQwenGateway({
    apiKey: 'test-key',
    backoff: async () => {}, // instant — avoid real backoff waits in tests
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === COMPETITION_PRIMARY_MODEL_ID) {
        throw openaiSdkError(429, 'quota exhausted');
      }
      return makeCompletion(request.modelId, 'response-from-backup');
    },
  });

  // 生产 dispatch 路径：gateway.callLlm(profile, request) → adapter.call → executeFallbackChain。
  const response = await gateway.callLlm('competition_aliyun_qwen', {
    messages: [{ role: 'user', content: 'hello' }],
  });

  // 新契约（2026-08-14 内层重试）：primary 同模型 3 次尝试后降级 backup_1。
  assert.equal(attempts.length, 4);
  assert.deepEqual(attempts.slice(0, 3), [
    COMPETITION_PRIMARY_MODEL_ID,
    COMPETITION_PRIMARY_MODEL_ID,
    COMPETITION_PRIMARY_MODEL_ID,
  ]);
  assert.equal(attempts[3], 'qwen3-235b-a22b');
  // 响应来自 backup_1。
  assert.equal(response.credential.modelId, 'qwen3-235b-a22b');
  assert.equal(response.content, 'response-from-backup');
  // 降级留痕进 credential.adapterMeta（429 穿透 fallback chain · 落 degraded_from）。
  assert.equal(response.credential.adapterMeta?.degradedFrom, COMPETITION_PRIMARY_MODEL_ID);
  assert.equal(response.credential.adapterMeta?.degradationCount, 1);
});

test('createCompetitionQwenGateway: chain exhausted (三档全 429) → callLlm surfaces RETRY_EXHAUSTED (D3 红线·绝不切非国产基座)', async () => {
  const gateway = createCompetitionQwenGateway({
    apiKey: 'test-key',
    backoff: async () => {}, // instant — avoid real backoff waits in tests
    createChatCompletion: async () => {
      throw openaiSdkError(429, 'all models rate-limited');
    },
  });

  await assert.rejects(
    () => gateway.callLlm('competition_aliyun_qwen', { messages: [{ role: 'user', content: 'hello' }] }),
    (err: unknown) => {
      const code = (err as { code?: unknown }).code;
      return code === 'RETRY_EXHAUSTED';
    },
    'all-Qwen-429 must surface RETRY_EXHAUSTED (never silently swap to non-Qwen base · D3 red line)',
  );
});
