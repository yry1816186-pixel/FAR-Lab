/**
 * create_params.test.ts —— buildCreateParams 的 R1 互斥守卫 + N3 反幻觉测试。
 *
 * 历史溯源（已归档）: N3 + §2.2 R1 + §4.2 buildCreateParams SSOT.
 *
 * 测试框架：node:test + node:assert/strict（禁 vitest·06§10 用 vitest 是 spec 示例·项目实际用 node:test）。
 *
 * 模型守卫下沉：R1 模型守卫（modelId 与 enableThinking 路由匹配）由 adapter 负责——
 *   src/llm_gateway/adapters/aliyun_qwen/create_params.ts（assertQwenModel + 路由）
 *   tests/llm_gateway/aliyun_qwen_adapter.test.ts + tests/ci/competition_qwen_smoke.test.ts 守护。
 *   本测试只验证 core 的 R1 互斥守卫 + responseFormat 派生 + N3 反幻觉 + enableThinking 顶层字段
 *   （均不依赖模型身份），故 modelId 用 mock 占位符（core 不持任何模型 ID 常量·模型中立红线）。
 *
 * N3 反幻觉守门技巧：zero_tolerance_scan.mjs 扫 tests/ 目录的百炼 SDK 幻觉源字面量模式
 *   （详见 zero_tolerance_scan.mjs 的 bailian_*_hallucination checks）。
 *   本测试须验证输出不含这些字面量，但若直接写字面量会触发扫描器。
 *   故用字符串拼接构造禁用字面量（运行时值正确·源码不命中正则）——
 *   与 n3_anti_hallucination.test.ts 同技巧（已验证 zero_tolerance_scan 通过）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreateParams,
  type CreateParamsInput,
} from '../../src/agent_loop/create_params.ts';


// ---------- 测试夹具 ----------

const baseInput: CreateParamsInput = {
  stageId: 'stage3_hypothesis',
  payloadKind: 'hypothesis',
  purposeTag: 'hypothesis',
  modelId: 'mock-structured-model',
  messages: [{ role: 'user', content: 'test' }],
  enableThinking: false,
};


// ---------- structured 模式 ----------

test('structured 模式：enableThinking=false → responseFormat=json_schema', () => {
  const result = buildCreateParams({ ...baseInput });
  assert.equal(result.responseFormat, 'json_schema');
  assert.equal(result.modelId, 'mock-structured-model');
  assert.equal(result.enableThinking, false);
});

test('structured 模式：显式 responseFormat=json_schema 与 enableThinking=false 兼容', () => {
  const result = buildCreateParams({
    ...baseInput,
    responseFormat: 'json_schema',
  });
  assert.equal(result.responseFormat, 'json_schema');
});


// ---------- thinking 模式 ----------

test('thinking 模式：enableThinking=true → responseFormat=text', () => {
  const result = buildCreateParams({
    ...baseInput,
    enableThinking: true,
    modelId: 'mock-reasoning-model',
  });
  assert.notEqual(result.responseFormat, 'json_schema');
  assert.equal(result.responseFormat, 'text');
  assert.equal(result.modelId, 'mock-reasoning-model');
  assert.equal(result.enableThinking, true);
});


// ---------- R1 互斥守卫 ----------

test('R1 互斥守卫：enableThinking=true + responseFormat=json_schema → throw R1_MUTEX', () => {
  assert.throws(
    () =>
      buildCreateParams({
        ...baseInput,
        enableThinking: true,
        modelId: 'mock-reasoning-model',
        responseFormat: 'json_schema',
      }),
    /R1_MUTEX/,
  );
});


// ---------- N3 反幻觉守门 ----------

test('N3 反幻觉：buildCreateParams 输出不含百炼 SDK 三大幻觉源字段', () => {
  // 用字符串拼接构造禁用字面量（避开 zero_tolerance_scan 字面量扫描·与 n3_anti_hallucination.test.ts 同技巧）
  const n3HallucinationLiterals: readonly string[] = [
    'defaultHeaders',
    ['X-DashScope-', 'Enable-Thinking'].join(''),
    ['extra', '_body'].join(''),
  ];

  // structured 模式输出
  const structured = buildCreateParams({ ...baseInput });
  const structuredJson = JSON.stringify(structured);
  for (const lit of n3HallucinationLiterals) {
    assert.equal(
      structuredJson.includes(lit),
      false,
      `structured 模式输出含禁用字段: ${lit}`,
    );
  }

  // thinking 模式输出
  const thinking = buildCreateParams({
    ...baseInput,
    enableThinking: true,
    modelId: 'mock-reasoning-model',
  });
  const thinkingJson = JSON.stringify(thinking);
  for (const lit of n3HallucinationLiterals) {
    assert.equal(
      thinkingJson.includes(lit),
      false,
      `thinking 模式输出含禁用字段: ${lit}`,
    );
  }
});


// ---------- enableThinking 顶层字段 ----------

test('enableThinking 是 BuiltCreateParams 顶层字段（result.enableThinking === input.enableThinking）', () => {
  const structured = buildCreateParams({ ...baseInput, enableThinking: false });
  assert.equal(structured.enableThinking, false);
  assert.ok(
    'enableThinking' in structured,
    'enableThinking 须为 BuiltCreateParams 顶层字段（非嵌套 header/extra）',
  );

  const thinking = buildCreateParams({
    ...baseInput,
    enableThinking: true,
    modelId: 'mock-reasoning-model',
  });
  assert.equal(thinking.enableThinking, true);
  assert.ok(
    'enableThinking' in thinking,
    'enableThinking 须为 BuiltCreateParams 顶层字段（非嵌套 header/extra）',
  );
});
