/**
 * repro_anchor —— LLM 调用环境锚测试（DIGEST G3 闭合·2026-08-06）。
 *
 * 验证 computeLlmEnvironmentAnchor / createLlmEnvironmentAnchorProvider：
 *   1. 确定性：同输入 → 同 64-hex（跨调用·进程内）；
 *   2. 敏感度：任一环境分量变化（模型快照/活跃模型/node 版本/git sha）→ 锚变化；
 *   3. 规范形：输入模型列表乱序 → 排序后锚一致（与 canonical 基线一致）；
 *   4. 非占位：输出 ≠ '0'*64（G3 红线：非伪造非占位）；
 *   5. provider 适配：同 run 内多次调用返回同一锚（环境锚与单次响应无关）。
 *
 * Authority: src/llm_gateway/repro_anchor.ts（G3 闭合文档化裁决）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeLlmEnvironmentAnchor,
  createLlmEnvironmentAnchorProvider,
} from '../../src/llm_gateway/repro_anchor.ts';
import type { LlmEnvironmentAnchorInput } from '../../src/llm_gateway/repro_anchor.ts';

function baseInput(overrides: Partial<LlmEnvironmentAnchorInput> = {}): LlmEnvironmentAnchorInput {
  return {
    modelSnapshot: 'qwen3.7-max-2026-05-20',
    activeModelIds: ['competition_aliyun_qwen'],
    nodeVersion: 'v24.14.0',
    gitCommitSha: 'a'.repeat(40),
    ...overrides,
  };
}

test('环境锚：确定性（同输入 → 同 64-hex）', () => {
  const h1 = computeLlmEnvironmentAnchor(baseInput());
  const h2 = computeLlmEnvironmentAnchor(baseInput());
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('环境锚：模型快照变化 → 锚变化', () => {
  const a = computeLlmEnvironmentAnchor(baseInput());
  const b = computeLlmEnvironmentAnchor(baseInput({ modelSnapshot: 'qwen3.7-max-2026-06-01' }));
  assert.notEqual(a, b);
});

test('环境锚：活跃模型列表变化 → 锚变化', () => {
  const a = computeLlmEnvironmentAnchor(baseInput());
  const b = computeLlmEnvironmentAnchor(baseInput({ activeModelIds: ['competition_aliyun_qwen', 'offline_replay'] }));
  assert.notEqual(a, b);
});

test('环境锚：node 版本变化 → 锚变化', () => {
  const a = computeLlmEnvironmentAnchor(baseInput());
  const b = computeLlmEnvironmentAnchor(baseInput({ nodeVersion: 'v22.21.1' }));
  assert.notEqual(a, b);
});

test('环境锚：git sha 变化 → 锚变化', () => {
  const a = computeLlmEnvironmentAnchor(baseInput());
  const b = computeLlmEnvironmentAnchor(baseInput({ gitCommitSha: 'b'.repeat(40) }));
  assert.notEqual(a, b);
});

test('环境锚：模型列表乱序 → 排序后锚一致（canonical 规范形）', () => {
  const a = computeLlmEnvironmentAnchor(baseInput({ activeModelIds: ['b-profile', 'a-profile', 'c-profile'] }));
  const b = computeLlmEnvironmentAnchor(baseInput({ activeModelIds: ['c-profile', 'a-profile', 'b-profile'] }));
  assert.equal(a, b, '列表须排序后哈希（跨调用顺序无关）');
});

test('环境锚：非占位（≠ 0*64·G3 红线·禁伪造）', () => {
  const h = computeLlmEnvironmentAnchor(baseInput());
  assert.notEqual(h, '0'.repeat(64), '环境锚须是真实环境指纹·禁占位 hash');
});

test('环境锚 provider：同 run 多次调用返回同一锚（与单次响应无关）', () => {
  const provider = createLlmEnvironmentAnchorProvider(baseInput());
  const r1 = provider();
  const r2 = provider();
  const r3 = provider();
  assert.equal(r1, r2);
  assert.equal(r2, r3);
  assert.match(r1, /^[0-9a-f]{64}$/);
});
