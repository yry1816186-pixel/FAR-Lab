import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreateParams,
  type AliyunQwenJsonSchemaResponseFormat,
} from '../../src/llm_gateway/adapters/aliyun_qwen/create_params.ts';
import { NonQwenModelError, ThinkingJsonSchemaConflictError } from '../../src/llm_gateway/adapters/aliyun_qwen/errors.ts';
import {
  COMPETITION_MODEL_SNAPSHOT,
  STRUCTURED_SAFE_MODEL,
} from '../../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';
import {
  extractRequestId,
  extractRequestIdFromResponseOrData,
  getDataRequestId,
} from '../../src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts';
import { assertQwenModel, isQwenModel } from '../../src/llm_gateway/adapters/aliyun_qwen/qwen_family.ts';

const schemaFormat: AliyunQwenJsonSchemaResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'ping',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
      required: ['ok'],
    },
    strict: true,
  },
};

test('buildCreateParams routes structured output to STRUCTURED_SAFE_MODEL', () => {
  const params = buildCreateParams('qwen3.7-max-2026-05-20', [{ role: 'user', content: 'ping' }], {
    enable_thinking: false,
    response_format: schemaFormat,
  });

  assert.equal(params.model, STRUCTURED_SAFE_MODEL);
  assert.equal(params.enable_thinking, false);
  assert.equal(params.response_format, schemaFormat);
  assert.equal(params.stream, false);
});

test('buildCreateParams routes thinking calls to the competition snapshot and streams', () => {
  const params = buildCreateParams('qwen-max', [{ role: 'user', content: 'think' }], {
    enable_thinking: true,
  });

  assert.equal(params.model, COMPETITION_MODEL_SNAPSHOT);
  assert.equal(params.stream, true);
});

test('buildCreateParams rejects thinking plus json_schema before network calls', () => {
  assert.throws(
    () =>
      buildCreateParams('qwen3.7-max-2026-05-20', [{ role: 'user', content: 'ping' }], {
        enable_thinking: true,
        response_format: schemaFormat,
      }),
    ThinkingJsonSchemaConflictError,
  );
});

test('competition adapter rejects non-Qwen model ids', () => {
  assert.equal(isQwenModel('qwen3.7-max-2026-05-20'), true);
  assert.equal(isQwenModel('gpt-4.1'), false);
  assert.throws(() => assertQwenModel('claude-sonnet'), NonQwenModelError);
});

test('request id extraction prefers x-request-id header', () => {
  const response = { headers: new Headers({ 'x-request-id': ' req-header-1 ' }) };
  assert.equal(extractRequestId(response), 'req-header-1');
  assert.equal(
    extractRequestIdFromResponseOrData(response, { _request_id: 'req-data-1' }),
    'req-header-1',
  );
});

test('request id data fallback is explicit and verified', () => {
  assert.equal(getDataRequestId({ _request_id: ' req-openai ' }), 'req-openai');
  assert.equal(getDataRequestId({ request_id: ' req-body ' }), 'req-body');
  assert.equal(getDataRequestId({ id: ' chatcmpl-local ' }), 'chatcmpl-local');
  assert.equal(getDataRequestId({ _request_id: '   ' }), null);
  assert.equal(getDataRequestId(null), null);
});
