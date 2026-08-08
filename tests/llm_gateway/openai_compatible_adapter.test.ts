// tests/llm_gateway/openai_compatible_adapter.test.ts
// OpenAI 兼容统一适配器测试（mock clientFactory，零网络）。
// 覆盖：配置校验 / 正常调用 / fallback 链 / 全链失败显式报错 / json_schema 透传 / 失败可见。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatClient } from '../../src/llm_gateway/adapters/openai_compatible/index.ts';
import { createOpenAICompatibleAdapter } from '../../src/llm_gateway/adapters/openai_compatible/index.ts';

/** 构造一个记录调用历史的 mock client。 */
function makeMockClient(records: Array<{ model: string; payload: Record<string, unknown> }>, failModels?: Set<string>): ChatClient {
  return {
    chat: {
      completions: {
        async create(payload: Record<string, unknown>) {
          records.push({ model: String(payload.model), payload });
          const model = String(payload.model);
          if (failModels?.has(model)) {
            throw new Error(`mock 503 for ${model}`);
          }
          return {
            id: `mock-${model}`,
            choices: [{ message: { content: `content-from-${model}` } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          };
        },
      },
    },
  };
}

const REQ = {
  messages: [{ role: 'user' as const, content: 'hello' }],
  temperature: 0.2,
  maxTokens: 100,
};

test('config validation rejects missing baseURL/envVar/defaultModel', () => {
  assert.throws(() =>
    createOpenAICompatibleAdapter({ profile: 'x', baseURL: '', envVar: 'K', defaultModel: 'm' }),
  );
  assert.throws(() =>
    createOpenAICompatibleAdapter({ profile: 'x', baseURL: 'http://x/v1', envVar: '', defaultModel: 'm' }),
  );
  assert.throws(() =>
    createOpenAICompatibleAdapter({ profile: 'x', baseURL: 'http://x/v1', envVar: 'K', defaultModel: '' }),
  );
});

test('happy path returns content + credential with correct model', async () => {
  const records: Array<{ model: string; payload: Record<string, unknown> }> = [];
  const adapter = createOpenAICompatibleAdapter({
    profile: 'openai_compatible_test',
    baseURL: 'http://mock/v1',
    envVar: 'MOCK_KEY',
    defaultModel: 'default-model',
    clientFactory: () => makeMockClient(records),
  });
  process.env.MOCK_KEY = 'sk-test';

  const resp = await adapter.call(REQ);
  assert.equal(resp.content, 'content-from-default-model');
  assert.equal(resp.credential.modelId, 'default-model');
  assert.equal(resp.credential.providerProfile, 'openai_compatible_test');
  assert.equal(resp.credential.tokenUsage.totalTokens, 15);
  assert.equal(resp.credential.adapterMeta?.usedFallbackModel, null);
  assert.equal(records.length, 1);
  const call0 = records[0];
  assert.ok(call0, 'first call recorded');
  assert.equal(call0.model, 'default-model');
  assert.equal(call0.payload.temperature, 0.2);
  assert.equal(call0.payload.max_tokens, 100);

  delete process.env.MOCK_KEY;
});

test('fallback chain: default fails → backup used, degradation recorded', async () => {
  const records: Array<{ model: string; payload: Record<string, unknown> }> = [];
  const adapter = createOpenAICompatibleAdapter({
    profile: 'openai_compatible_test',
    baseURL: 'http://mock/v1',
    envVar: 'MOCK_KEY',
    defaultModel: 'a-model',
    fallbackModels: ['b-model'],
    clientFactory: () => makeMockClient(records, new Set(['a-model'])),
  });
  process.env.MOCK_KEY = 'sk-test';

  const resp = await adapter.call(REQ);
  assert.equal(resp.content, 'content-from-b-model');
  assert.equal(resp.credential.modelId, 'b-model');
  assert.equal(resp.credential.adapterMeta?.usedFallbackModel, 'b-model');
  assert.equal(records.length, 2);
  const callA = records[0];
  const callB = records[1];
  assert.ok(callA && callB, 'both calls recorded');
  assert.equal(callA.model, 'a-model');
  assert.equal(callB.model, 'b-model');

  delete process.env.MOCK_KEY;
});

test('all models fail → explicit error, never silent empty content', async () => {
  const records: Array<{ model: string; payload: Record<string, unknown> }> = [];
  const adapter = createOpenAICompatibleAdapter({
    profile: 'openai_compatible_test',
    baseURL: 'http://mock/v1',
    envVar: 'MOCK_KEY',
    defaultModel: 'a-model',
    fallbackModels: ['b-model'],
    clientFactory: () => makeMockClient(records, new Set(['a-model', 'b-model'])),
  });
  process.env.MOCK_KEY = 'sk-test';

  await assert.rejects(async () => adapter.call(REQ), /all 2 model\(s\) failed/);
  assert.equal(records.length, 2);

  delete process.env.MOCK_KEY;
});

test('json_schema response format is passed through as response_format', async () => {
  const records: Array<{ model: string; payload: Record<string, unknown> }> = [];
  const adapter = createOpenAICompatibleAdapter({
    profile: 'openai_compatible_test',
    baseURL: 'http://mock/v1',
    envVar: 'MOCK_KEY',
    defaultModel: 'default-model',
    clientFactory: () => makeMockClient(records),
  });
  process.env.MOCK_KEY = 'sk-test';

  const schema = { name: 'verdict', schema: { type: 'object', properties: { v: { type: 'string' } } }, strict: true };
  await adapter.call({ ...REQ, responseFormat: 'json_schema', jsonSchema: schema });

  const firstCall = records[0];
  assert.ok(firstCall, 'first call recorded');
  const payload = firstCall.payload;
  assert.deepEqual(payload.response_format, {
    type: 'json_schema',
    json_schema: { name: 'verdict', schema: schema.schema, strict: true },
  });
  // 结构化输出 → capability = structured
  const resp2 = await adapter.call({ ...REQ, responseFormat: 'json_schema', jsonSchema: schema });
  assert.equal(resp2.credential.capability, 'structured');

  delete process.env.MOCK_KEY;
});
