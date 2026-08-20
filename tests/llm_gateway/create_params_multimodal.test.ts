// tests/llm_gateway/create_params_multimodal.test.ts
//
// 多模态边界契约（figure_extraction 栅格腿的网关半边，2026-08-21）：
//   - LlmMessage 形态：content 恒为文本视图，图像是可选 imageParts 附加字段（仅 user）
//   - imageParts + response_format → ImageJsonSchemaConflictError（fail-closed：
//     否则 buildCreateParams 静默重路由 STRUCTURED_SAFE_MODEL 文本模型并丢图像）
//   - imageParts 无 response_format → 正常构建（模型不换、附件透传）
//   - 纯文本行为零回归（response_format → STRUCTURED_SAFE_MODEL 路由保留）
//   - adapter 组装：user+imageParts → OpenAI content 数组；system+imageParts → fail-closed
//
// 事实锚：百炼 VL 模型不支持 JSON Schema 结构化输出（2026-08-21 官方文档亲读，
// 详注 errors.ts ImageJsonSchemaConflictError）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreateParams,
  hasImageContent,
  type AliyunQwenChatMessage,
} from '../../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import { ImageJsonSchemaConflictError } from '../../src/llm_gateway/adapters/aliyun_qwen/errors.ts';
import { STRUCTURED_SAFE_MODEL } from '../../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';
import {
  createQwenAdapter,
  type QwenChatCompletionRequest,
} from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts';
import type { LlmRequest } from '../../src/llm_gateway/types.ts';

const IMAGE_URL = 'data:image/png;base64,aGVsbG8=';

const IMAGE_MESSAGE: AliyunQwenChatMessage = {
  role: 'user',
  content: 'Read this figure.',
  imageParts: [{ url: IMAGE_URL }],
};

const TEXT_MESSAGE: AliyunQwenChatMessage = { role: 'user', content: 'plain text stage' };

test('create_params: imageParts + response_format → fail-closed（不静默丢图）', () => {
  assert.throws(
    () =>
      buildCreateParams('qwen3-vl-plus', [IMAGE_MESSAGE], {
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'figure_extraction', schema: { type: 'object' } },
        },
      }),
    (err: Error) => {
      assert.ok(err instanceof ImageJsonSchemaConflictError);
      assert.match(err.message, /VL models do not support JSON Schema/);
      return true;
    },
  );
});

test('create_params: imageParts 无 response_format → 正常构建，模型不换、附件透传', () => {
  const params = buildCreateParams('qwen3-vl-plus', [IMAGE_MESSAGE], { temperature: 0 });
  assert.equal(params.model, 'qwen3-vl-plus');
  assert.equal(params.messages[0]!.content, 'Read this figure.');
  assert.deepEqual([...params.messages[0]!.imageParts!], [{ url: IMAGE_URL }]);
});

test('create_params: 纯文本 + response_format → STRUCTURED_SAFE_MODEL 路由保留（零回归）', () => {
  const params = buildCreateParams('qwen3.7-max-2026-05-20', [TEXT_MESSAGE], {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 's', schema: { type: 'object' } },
    },
  });
  assert.equal(params.model, STRUCTURED_SAFE_MODEL);
  assert.equal(params.messages[0]!.content, 'plain text stage');
});

test('create_params: hasImageContent 探测（含图/无附件/空数组）', () => {
  assert.equal(hasImageContent([IMAGE_MESSAGE]), true);
  assert.equal(hasImageContent([TEXT_MESSAGE]), false);
  assert.equal(
    hasImageContent([{ role: 'user', content: 'declared but empty', imageParts: [] }]),
    false,
  );
});

test('qwen_adapter 组装：user+imageParts → OpenAI 多模态 content 数组', async () => {
  // toOpenAiMessages 是模块私有——经 call() 间接验证：注入 createChatCompletion
  // 捕获最终 wire 请求（不触网）。捕获按 QwenChatCompletionRequest 正规类型化，
  // 断言逐级收窄（zero_tolerance_scan 禁双重断言遮蔽类型现实）。
  const captured: QwenChatCompletionRequest[] = [];
  const adapter = createQwenAdapter({
    createChatCompletion: async (req) => {
      captured.push(req);
      return {
        id: 'captured',
        object: 'chat.completion',
        created: 0,
        model: req.modelId,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{}' },
            finish_reason: 'stop',
          },
        ],
      } as never;
    },
  });
  const request: LlmRequest = {
    messages: [
      { role: 'user', content: 'Read this figure.', imageParts: [{ url: IMAGE_URL }] },
    ],
    temperature: 0,
  };
  await adapter.call(request);
  const wireMsg = captured[0]!.messages[0]!;
  assert.equal(wireMsg.role, 'user');
  if (typeof wireMsg.content === 'string') {
    assert.fail('expected multimodal array content on the wire');
  }
  const first = wireMsg.content[0]!;
  const second = wireMsg.content[1]!;
  assert.equal(first.type, 'text');
  if (first.type === 'text') assert.equal(first.text, 'Read this figure.');
  assert.equal(second.type, 'image_url');
  if (second.type === 'image_url') assert.deepEqual(second.image_url, { url: IMAGE_URL });
});
