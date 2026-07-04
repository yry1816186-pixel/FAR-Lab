import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';

import { createQwenVlAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts';
import type { QwenVlChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts';

const SAMPLE_BASE64_1x1_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function completion(modelId: string, content: string): OpenAI.ChatCompletion {
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
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
  };
}

test('real_429穿透_fallback_chain', async () => {
  const attempts: string[] = [];
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    modelId: 'qwen-vl-max',
    createChatCompletion: async (request: QwenVlChatCompletionRequest) => {
      attempts.push(request.modelId);
      if (request.modelId === 'qwen-vl-max') {
        throw Object.assign(new Error('quota exhausted'), { status: 429 });
      }
      return completion(request.modelId, '{"claim":"backup vision ok"}');
    },
  });

  const result = await adapter.interpret({
    imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
    mimeType: 'image/png',
    prompt: '结构化描述这张图',
  });

  assert.deepEqual(attempts, ['qwen-vl-max', 'qwen-vl-plus']);
  assert.equal(result.credential.modelId, 'qwen-vl-plus');
  assert.equal(result.credential.adapterMeta?.qwenVlModel, 'qwen-vl-plus');
  assert.equal(result.interpretation, '{"claim":"backup vision ok"}');
});
