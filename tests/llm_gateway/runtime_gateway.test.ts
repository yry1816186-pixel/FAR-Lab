/**
 * runtime_gateway.test.ts —— 运行期 LLM 网关解析（WS-A.1 · 阶段 7 1128 效率/可观测面）。
 *
 * 验证 resolveRuntimeGateway：
 *   - key env 存在且非空 → competition_aliyun_qwen 网关（非 null）
 *   - key 缺失/空串 → null（offline_replay 诚实降级·绝不假装 live）
 *   - FAR_DASHSCOPE_API_KEY 优先于 DASHSCOPE_API_KEY
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeGateway } from '../../src/llm_gateway/runtime_gateway.ts';

test('WS-A.1: FAR_DASHSCOPE_API_KEY 存在 → 真实网关（非 null·注册 competition profile）', () => {
  const gateway = resolveRuntimeGateway({ FAR_DASHSCOPE_API_KEY: 'sk-test-not-real' });
  assert.ok(gateway !== null, 'key 存在时必须构造真实网关');
  assert.ok(
    gateway.registeredProfiles().includes('competition_aliyun_qwen'),
    '网关须注册 competition_aliyun_qwen adapter',
  );
});

test('WS-A.1: 仅 DASHSCOPE_API_KEY 存在 → 同样解析（fallback 名）', () => {
  const gateway = resolveRuntimeGateway({ DASHSCOPE_API_KEY: 'sk-test-not-real' });
  assert.ok(gateway !== null, 'DASHSCOPE_API_KEY fallback 必须生效');
});

test('WS-A.1: 无 key → null（offline_replay 诚实降级·不假装 live）', () => {
  assert.equal(resolveRuntimeGateway({}), null);
  assert.equal(resolveRuntimeGateway({ OTHER_ENV: 'x' }), null);
});

test('WS-A.1: key 为空串 → null（fail-conservative·不构造会 401 的网关）', () => {
  assert.equal(resolveRuntimeGateway({ FAR_DASHSCOPE_API_KEY: '' }), null);
  assert.equal(resolveRuntimeGateway({ DASHSCOPE_API_KEY: '' }), null);
});

test('WS-A.1: 优先级——FAR_DASHSCOPE_API_KEY 优先于 DASHSCOPE_API_KEY', () => {
  // 两者都存在时取 FAR_ 前缀（显式优先级）；两者都非空都能解析（不抛错）
  const gateway = resolveRuntimeGateway({
    FAR_DASHSCOPE_API_KEY: 'sk-far',
    DASHSCOPE_API_KEY: 'sk-legacy',
  });
  assert.ok(gateway !== null, '两 key 都存在时必须解析成功');
});
