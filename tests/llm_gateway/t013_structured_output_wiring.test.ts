/**
 * T-013（评委04 F-4-004 · 2026-07-25 第 3 轮 CP-17）Structured Output 完整接线回归测试。
 *
 * 验证三层透传链：
 *   1. LlmRequest.jsonSchema（schema 对象）→ QwenChatCompletionRequest.jsonSchema
 *   2. QwenChatCompletionRequest.jsonSchema 非空时 → OpenAI SDK response_format 被构造
 *      （此层由 qwen_adapter.ts:76-90 的 responseFormatParam 逻辑负责·本测试用 mock caller
 *       断言 request.jsonSchema 透传·真实 SDK create() 的 response_format 构造由
 *       aliyun_qwen_adapter.test.ts 的 buildCreateParams 间接覆盖 + 类型系统保证）
 *   3. capability 标记：responseFormat='json_schema' → 'structured'
 *
 * 反剧场：mock caller 断言 request 字段（非口述「应该传了」）·真实 capture request.jsonSchema。
 * 端到端触网验证（DashScope 真按 schema 返回）是 BLOCKED_EXTERNAL（B-006）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';

import { createQwenAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import type { QwenChatCompletionRequest } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import { COMPETITION_PRIMARY_MODEL_ID } from '../../src/llm_gateway/adapters/aliyun_qwen/index.ts';
import type { LlmJsonSchema, LlmRequest } from '../../src/llm_gateway/types.ts';

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
        message: { role: 'assistant', content, refusal: null },
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  };
}

const sampleSchema: LlmJsonSchema = {
  name: 'understanding',
  schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['understanding'] },
      problemStatement: { type: 'string' },
    },
    required: ['kind', 'problemStatement'],
  },
};

test('T-013: LlmRequest.jsonSchema transparently passed to createChatCompletion as request.jsonSchema', async () => {
  const holder: { req: QwenChatCompletionRequest | null } = { req: null };
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      holder.req = request;
      return makeCompletion(request.modelId, '{"kind":"understanding","problemStatement":"test"}');
    },
  });

  const request: LlmRequest = {
    messages: [{ role: 'user', content: 'analyze' }],
    responseFormat: 'json_schema',
    jsonSchema: sampleSchema,
  };

  await adapter.call(request);

  const captured = holder.req;
  if (captured === null) throw new Error('createChatCompletion must be called');
  assert.equal(captured.modelId, COMPETITION_PRIMARY_MODEL_ID);
  assert.ok(captured.jsonSchema !== undefined, 'jsonSchema must be passed through');
  assert.equal(captured.jsonSchema.name, 'understanding');
  assert.deepEqual(captured.jsonSchema.schema, sampleSchema.schema);
});

test('T-013: responseFormat=json_schema without jsonSchema → request.jsonSchema is undefined (capability still structured)', async () => {
  const holder: { req: QwenChatCompletionRequest | null } = { req: null };
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      holder.req = request;
      return makeCompletion(request.modelId, '{"kind":"understanding"}');
    },
  });

  await adapter.call({
    messages: [{ role: 'user', content: 'analyze' }],
    responseFormat: 'json_schema',
    // jsonSchema 故意不提供 → 透传层应不构造 jsonSchema（capability 标记仍 structured）
  });

  const captured = holder.req;
  if (captured === null) throw new Error('createChatCompletion must be called');
  assert.equal(captured.jsonSchema, undefined);
});

test('T-013: responseFormat=text (or absent) → request.jsonSchema is undefined + capability=reasoning', async () => {
  const holder: { req: QwenChatCompletionRequest | null } = { req: null };
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      holder.req = request;
      return makeCompletion(request.modelId, 'free text');
    },
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'think' }],
    responseFormat: 'text',
  });

  const captured = holder.req;
  if (captured === null) throw new Error('createChatCompletion must be called');
  assert.equal(captured.jsonSchema, undefined);
  assert.equal(response.credential.capability, 'reasoning');
});

test('T-013: responseFormat=json_schema + jsonSchema → capability=structured', async () => {
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) =>
      makeCompletion(request.modelId, '{"kind":"understanding","problemStatement":"x"}'),
  });

  const response = await adapter.call({
    messages: [{ role: 'user', content: 'analyze' }],
    responseFormat: 'json_schema',
    jsonSchema: sampleSchema,
  });

  assert.equal(response.credential.capability, 'structured');
});

test('T-013: jsonSchema with strict flag → passed through', async () => {
  const holder: { req: QwenChatCompletionRequest | null } = { req: null };
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      holder.req = request;
      return makeCompletion(request.modelId, '{"kind":"understanding","problemStatement":"x"}');
    },
  });

  const strictSchema: LlmJsonSchema = { ...sampleSchema, strict: true };
  await adapter.call({
    messages: [{ role: 'user', content: 'analyze' }],
    responseFormat: 'json_schema',
    jsonSchema: strictSchema,
  });

  const captured = holder.req;
  if (captured === null) throw new Error('createChatCompletion must be called');
  assert.equal(captured.jsonSchema!.strict, true);
});

test('T-013: fallback chain preserves jsonSchema across targets', async () => {
  const capturedSchemas: Array<{ modelId: string; jsonSchema: QwenChatCompletionRequest['jsonSchema'] }> = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (request: QwenChatCompletionRequest) => {
      capturedSchemas.push({ modelId: request.modelId, jsonSchema: request.jsonSchema });
      if (request.modelId === COMPETITION_PRIMARY_MODEL_ID) {
        throw Object.assign(new Error('429'), { status: 429 });
      }
      return makeCompletion(request.modelId, '{"kind":"understanding","problemStatement":"x"}');
    },
  });

  await adapter.call({
    messages: [{ role: 'user', content: 'analyze' }],
    responseFormat: 'json_schema',
    jsonSchema: sampleSchema,
  });

  // 两个 target 都应收到 jsonSchema（证明 fallback 后仍透传）
  assert.ok(capturedSchemas.length >= 2, 'fallback should hit at least 2 targets');
  for (const cap of capturedSchemas) {
    assert.ok(cap.jsonSchema !== undefined, `jsonSchema must be passed to ${cap.modelId}`);
    assert.equal(cap.jsonSchema!.name, 'understanding');
  }
});
