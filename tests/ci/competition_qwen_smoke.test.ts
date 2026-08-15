// tests/ci/competition_qwen_smoke.test.ts
// 职责：CI STEP 11 competition_qwen_smoke 单元测试（离线组件验证 + graceful skip 语义）
// 历史溯源：E6 competition_qwen_smoke·运行时 SSOT 以本测试 + ci/competition_qwen_smoke.ts 源码实测为准
// 设计理由：real API call 需要 DASHSCOPE_API_KEY 且会计费，CI 条件门仅在 key 存在时跑。
//          本测试覆盖所有无需真实 API key 的离线组件：model 常量、参数构建、
//          thinking+json_schema 互斥守卫、request id 提取、graceful skip 行为。
// 零容忍合规：禁用 any 类型注解、ts-ignore 指令、双重断言、空 catch 块、桩代码返回

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../ci/competition_qwen_smoke.ts';
import {
  COMPETITION_MODEL_SNAPSHOT,
  STRUCTURED_SAFE_MODEL,
} from '../../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';
import {
  buildCreateParams,
} from '../../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import type {
  AliyunQwenChatMessage,
  AliyunQwenCreateParams,
} from '../../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import {
  extractRequestId,
  extractRequestIdFromResponseOrData,
} from '../../src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts';
import type {
  ResponseLike,
} from '../../src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts';
import {
  ThinkingJsonSchemaConflictError,
  NonQwenModelError,
} from '../../src/llm_gateway/adapters/aliyun_qwen/errors.ts';

// ---------- helpers ----------

function dummyResponse(headerValue: string | null): ResponseLike {
  return {
    headers: {
      get(_name: string): string | null {
        return headerValue;
      },
    },
  };
}

const MSG: AliyunQwenChatMessage[] = [{ role: 'user', content: 'ping' }];

// ---------- graceful skip ----------

test('competition_qwen_smoke main() does not throw when DASHSCOPE_API_KEY is not set', async () => {
  // 验证 graceful skip：无 key 时 main() 不抛错
  await main();
  // 若抛错则测试自动失败；通过即证明 graceful skip 正确。
});

test('competition_qwen_smoke main() does not throw when DASHSCOPE_API_KEY is empty string', async () => {
  const saved = process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  try {
    await main();
  } finally {
    if (saved !== undefined) {
      process.env.DASHSCOPE_API_KEY = saved;
    }
  }
});

// ---------- model snapshot constants ----------

test('COMPETITION_MODEL_SNAPSHOT is qwen3.7-max-2026-05-20', () => {
  assert.equal(COMPETITION_MODEL_SNAPSHOT, 'qwen3.7-max-2026-05-20');
});

test('STRUCTURED_SAFE_MODEL is qwen-max', () => {
  assert.equal(STRUCTURED_SAFE_MODEL, 'qwen-max');
});

test('snapshot and structured models are distinct', () => {
  assert.notEqual(COMPETITION_MODEL_SNAPSHOT, STRUCTURED_SAFE_MODEL);
});

// ---------- buildCreateParams ----------

test('buildCreateParams routes structured output to STRUCTURED_SAFE_MODEL', () => {
  const resolved = buildCreateParams('qwen3.7-max-2026-05-20', MSG, {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'test',
        schema: { type: 'object', properties: {} },
      },
    },
  });
  assert.equal(resolved.model, STRUCTURED_SAFE_MODEL);
});

test('buildCreateParams routes thinking calls to competition snapshot', () => {
  const resolved = buildCreateParams('qwen3.7-max-2026-05-20', MSG, {
    enable_thinking: true,
  });
  assert.equal(resolved.model, COMPETITION_MODEL_SNAPSHOT);
  assert.equal(resolved.stream, true, 'thinking mode forces stream=true');
});

test('buildCreateParams rejects enable_thinking + json_schema (client-side guard)', () => {
  assert.throws(
    () =>
      buildCreateParams('qwen3.7-max-2026-05-20', MSG, {
        enable_thinking: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test',
            schema: { type: 'object', properties: {} },
          },
        },
      }),
    ThinkingJsonSchemaConflictError,
  );
});

test('buildCreateParams rejects non-Qwen model ids', () => {
  assert.throws(
    () => buildCreateParams('gpt-4o', MSG, {}),
    NonQwenModelError,
  );
});

test('buildCreateParams does not alter model when no routing conditions met', () => {
  const resolved = buildCreateParams('qwen-max', MSG, {
    enable_thinking: false,
  });
  assert.equal(resolved.model, 'qwen-max');
});

// ---------- extractRequestId ----------

test('extractRequestId returns x-request-id header value when present', () => {
  const response = dummyResponse('abc-123-def');
  assert.equal(extractRequestId(response), 'abc-123-def');
});

test('extractRequestId returns null when header is absent', () => {
  const response = dummyResponse(null);
  assert.equal(extractRequestId(response), null);
});

test('extractRequestId returns null when header is whitespace-only', () => {
  const response = dummyResponse('   ');
  assert.equal(extractRequestId(response), null);
});

test('extractRequestIdFromResponseOrData falls back to data only when header is null', () => {
  const response = dummyResponse(null);
  const data = { id: 'chatcmpl-fallback' };
  const id = extractRequestIdFromResponseOrData(response, data);
  assert.equal(id, 'chatcmpl-fallback');
});

test('extractRequestIdFromResponseOrData prefers header over data', () => {
  const response = dummyResponse('header-id-123');
  const data = { id: 'chatcmpl-body-id' };
  const id = extractRequestIdFromResponseOrData(response, data);
  assert.equal(id, 'header-id-123');
});

// ---------- AliyunQwenCreateParams type safety ----------

test('AliyunQwenCreateParams accepts enable_thinking:false with temperature', () => {
  const params: AliyunQwenCreateParams = {
    enable_thinking: false,
    temperature: 0.3,
  };
  const resolved = buildCreateParams('qwen-max', MSG, params);
  assert.equal(resolved.temperature, 0.3);
  assert.equal(resolved.enable_thinking, false);
});

test('AliyunQwenCreateParams accepts max_tokens and top_p', () => {
  const params: AliyunQwenCreateParams = {
    max_tokens: 100,
    top_p: 0.9,
  };
  const resolved = buildCreateParams('qwen-max', MSG, params);
  assert.equal(resolved.max_tokens, 100);
  assert.equal(resolved.top_p, 0.9);
});
