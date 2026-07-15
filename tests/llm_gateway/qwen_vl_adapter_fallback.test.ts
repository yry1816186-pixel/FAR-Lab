/**
 * Qwen-VL adapter fallback chain 单元测试（caller 注入·离线·镜像 qwen_adapter_fallback.test.ts）。
 *
 * 覆盖 VL adapter (qwen_vl_adapter.ts) 的三条降级分支：
 *   1. 链路耗尽：两档全 429 → throws RETRY_EXHAUSTED + NO_QWEN_FAMILY_AVAILABLE_REASON
 *   2. fatal 错误：400 → throws BailianHttpError（无 fallback·F11）
 *   3. 降级成功：primary transport-fail → backup ok → adapterMeta.degradedFrom 留痕
 *
 * 与 fallback_real_http.test.ts（真实本地 HTTP server）互补：本文件用 createChatCompletion
 * caller 注入确定性控制每个 target 成败，覆盖 real-HTTP proof 不便构造的 exhaust/fatal 边界。
 *
 * 零容忍合规：无 any / @ts-ignore / 改期望掩盖实现 / 双重断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';

import { createQwenVlAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts';
import type { QwenVlChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts';
import { QWEN_VL_MODELS } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/types.ts';
import {
  BailianHttpError,
  BailianRateLimitError,
} from '../../src/llm_gateway/fallback_chain/index.ts';
import { NO_QWEN_FAMILY_AVAILABLE_REASON } from '../../src/llm_gateway/adapters/aliyun_qwen/fallback_config.ts';

type OpenAiChatCompletion = OpenAI.ChatCompletion;

class APIConnectionError extends Error {
  constructor() {
    super('Connection error.');
    this.name = 'Error';
    this.cause = new Error(
      'FetchError: Client network socket disconnected before secure TLS connection was established',
    );
  }
}

const SAMPLE_BASE64_1x1_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function makeCompletion(modelId: string, content: string): OpenAiChatCompletion {
  return {
    id: `chatcmpl-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content, refusal: null },
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  } as OpenAiChatCompletion;
}

const VISION_INPUT = {
  imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
  mimeType: 'image/png',
  prompt: '结构化描述这张图',
};

// ===== §1 链路耗尽：两档全 429 → RETRY_EXHAUSTED =====

test('qwen_vl_adapter: all targets 429 → chainExhausted → throws RETRY_EXHAUSTED', async () => {
  const attempts: string[] = [];
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    createChatCompletion: async (request: QwenVlChatCompletionRequest) => {
      attempts.push(request.modelId);
      throw new BailianRateLimitError(null, `req-${request.modelId}`);
    },
  });

  await assert.rejects(
    () => adapter.interpret(VISION_INPUT),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'must be Error');
      assert.equal((err as { code?: unknown }).code, 'RETRY_EXHAUSTED');
      assert.equal((err as { reason?: unknown }).reason, NO_QWEN_FAMILY_AVAILABLE_REASON);
      return true;
    },
  );
  assert.equal(attempts.length, QWEN_VL_MODELS.length);
  assert.deepEqual(attempts, [...QWEN_VL_MODELS]);
});

// ===== §2 fatal 错误：400 → BailianHttpError（无 fallback·F11 绝不静默换） =====

test('qwen_vl_adapter: fatal 400 on primary → throws BailianHttpError (no fallback)', async () => {
  const attempts: string[] = [];
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    createChatCompletion: async (request: QwenVlChatCompletionRequest) => {
      attempts.push(request.modelId);
      throw new BailianHttpError(400, null, 'bad request');
    },
  });

  await assert.rejects(
    () => adapter.interpret(VISION_INPUT),
    (err: unknown) => {
      assert.ok(err instanceof BailianHttpError, 'must be BailianHttpError');
      assert.equal((err as BailianHttpError).status, 400);
      return true;
    },
  );
  // fatal 立即终止整链——只 primary 被试，backup 未触达（F11: 绝不静默换）
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0], 'qwen-vl-max');
});

// ===== §3 降级成功：primary transport-fail → backup ok → adapterMeta.degradedFrom 留痕 =====

test('qwen_vl_adapter: primary network error → backup success → degradedFrom recorded in adapterMeta', async () => {
  const attempts: string[] = [];
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    modelId: 'qwen-vl-max',
    createChatCompletion: async (request: QwenVlChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === 'qwen-vl-max') {
        // OpenAI SDK APIConnectionError（transport·status=undefined）→ classifySdkTransportError 识别为 network → 触发 fallback（05 §9.2）
        throw new APIConnectionError();
      }
      return makeCompletion(request.modelId, '{"claim":"backup ok"}');
    },
  });

  const result = await adapter.interpret(VISION_INPUT);

  assert.equal(attempts[0], 'qwen-vl-max');
  assert.equal(attempts.at(-1), 'qwen-vl-plus');
  assert.equal(result.credential.modelId, 'qwen-vl-plus');
  assert.equal(result.credential.adapterMeta?.qwenVlModel, 'qwen-vl-plus');
  assert.equal(
    result.credential.adapterMeta?.degradedFrom,
    'qwen-vl-max',
    'successful fallback must record degradedFrom (P1-2 落 degraded_from · F11 留痕)',
  );
  assert.equal(
    typeof result.credential.adapterMeta?.degradationSummary,
    'string',
    'degradationSummary must be present after fallback',
  );
});

// ===== §4 happy path：primary success → no degradation, no degradedFrom =====

test('qwen_vl_adapter: primary success → no fallback, no degradedFrom', async () => {
  const attempts: string[] = [];
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    createChatCompletion: async (request: QwenVlChatCompletionRequest) => {
      attempts.push(request.modelId);
      return makeCompletion(request.modelId, '{"claim":"primary ok"}');
    },
  });

  const result = await adapter.interpret(VISION_INPUT);

  assert.equal(attempts.length, 1);
  assert.equal(result.credential.adapterMeta?.qwenVlModel, 'qwen-vl-max');
  assert.equal(
    result.credential.adapterMeta?.degradedFrom,
    undefined,
    'no degradation → degradedFrom must be absent (exactOptionalPropertyTypes)',
  );
});
