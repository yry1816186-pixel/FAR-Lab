// tests/cli/court_arena_logic.test.ts
// court/arena 检测逻辑单元测试 —— 证明 agreement/attack 检测非平凡（能正确识别 split/BREACHED）。
//
// offline 端到端下 court 必然 unanimous、arena 必然 ROBUST（fixture 固定）。本测试直接验证
// 检测纯函数：给定分歧 verdict 输入，agreement/detectRefuterAttack 能正确分类。证明逻辑非占位。

import { test } from 'node:test';
import assert from 'node:assert';
import { computeAgreement } from '../../src/cli/commands/court.ts';
import { detectRefuterAttack } from '../../src/cli/commands/arena.ts';

test('computeAgreement: 全相同 → unanimous', () => {
  assert.strictEqual(computeAgreement(['CONFIRMED', 'CONFIRMED', 'CONFIRMED']), 'unanimous');
  assert.strictEqual(computeAgreement(['REFUTED']), 'unanimous');
});

test('computeAgreement: 两种 verdict → majority', () => {
  assert.strictEqual(computeAgreement(['CONFIRMED', 'CONFIRMED', 'REFUTED']), 'majority');
  assert.strictEqual(computeAgreement(['CONFIRMED', 'REFUTED']), 'majority');
});

test('computeAgreement: 三种以上 verdict → split', () => {
  assert.strictEqual(
    computeAgreement(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE']),
    'split',
  );
  assert.strictEqual(
    computeAgreement(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'UNTESTED']),
    'split',
  );
});

test('computeAgreement: null verdict（模型错误）参与 distinct', () => {
  // null 与非 null 不同 → majority；双 null → unanimous（都无裁决）
  assert.strictEqual(computeAgreement(['CONFIRMED', null]), 'majority');
  assert.strictEqual(computeAgreement([null, null]), 'unanimous');
});

test('detectRefuterAttack: verdict 不同 → landed', () => {
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'REFUTED'), true);
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'INCONCLUSIVE'), true);
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'UNTESTED'), true);
});

test('detectRefuterAttack: verdict 相同 → held', () => {
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'CONFIRMED'), false);
  assert.strictEqual(detectRefuterAttack('REFUTED', 'REFUTED'), false);
});

test('detectRefuterAttack: 任一 null（无裁决/错误）→ 不算 landed（fail-safe）', () => {
  // refuter 错误（null）不应被误判为"攻击成功"
  assert.strictEqual(detectRefuterAttack('CONFIRMED', null), false);
  assert.strictEqual(detectRefuterAttack(null, 'REFUTED'), false);
  assert.strictEqual(detectRefuterAttack(null, null), false);
});

test('detectRefuterAttack: 五值裁决全组合（边界·DEGRADED_SCOPE）', () => {
  const FIVE = ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'] as const;
  for (const orig of FIVE) {
    for (const ref of FIVE) {
      const landed = detectRefuterAttack(orig, ref);
      assert.strictEqual(landed, orig !== ref, `orig=${orig} ref=${ref}`);
    }
  }
});
