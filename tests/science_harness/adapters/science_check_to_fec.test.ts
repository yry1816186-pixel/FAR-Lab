// tests/science_harness/adapters/science_check_to_fec.test.ts
//
// scienceCheckToFalsificationSpec 适配器单测（P1-5 Phase 1）。
//   覆盖 5 值 op → 3 值 semantics 投影矩阵 + '==' fail-closed 拒绝 + unit/prediction/falsificationSpec 字段。
//
// 真实依赖：import 真实适配器 + 真实 ScienceCheck/FalsificationSpec 类型。
// 反假绿：每分支独立断言 op→semantics 与字段值，无 expect(true)。
//
// Authority: src/science_harness/adapters/science_check_to_fec.ts 投影契约。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scienceCheckToFalsificationSpec } from '../../../src/science_harness/adapters/science_check_to_fec.ts';
import type { ScienceCheck } from '../../../src/science_harness/types.ts';

function makeCheck(op: ScienceCheck['threshold']['op'], value = 0.8, unit = 'accuracy'): ScienceCheck {
  return {
    id: 'M1_test',
    label: 'test metric',
    primaryMetric: 'accuracy',
    outcome: 'PASS',
    metricValue: value,
    threshold: { op, value, unit },
    detail: 'fixture',
  };
}

test('op ">" → semantics gt（严格大于·无损）', () => {
  const { falsificationSpec, thresholdSpec } = scienceCheckToFalsificationSpec(makeCheck('>'));
  assert.equal(thresholdSpec.semantics, 'gt');
  assert.equal(thresholdSpec.value, 0.8);
  assert.equal(falsificationSpec.thresholdSemantics, 'gt');
});

test('op ">=" → semantics gt（有损折叠·边界等号丢失）', () => {
  const { thresholdSpec } = scienceCheckToFalsificationSpec(makeCheck('>='));
  assert.equal(thresholdSpec.semantics, 'gt');
});

test('op "<" → semantics lt（严格小于·无损）', () => {
  const { thresholdSpec } = scienceCheckToFalsificationSpec(makeCheck('<'));
  assert.equal(thresholdSpec.semantics, 'lt');
});

test('op "<=" → semantics lt（有损折叠·边界等号丢失）', () => {
  const { thresholdSpec } = scienceCheckToFalsificationSpec(makeCheck('<='));
  assert.equal(thresholdSpec.semantics, 'lt');
});

test('op "==" → throw（精确等值无可证伪语义·fail-closed·错误信息含 check id）', () => {
  assert.throws(
    () => scienceCheckToFalsificationSpec(makeCheck('==')),
    /'==' op has no falsifiable semantics|'==' op has no falsification semantics/i,
  );
  assert.throws(
    () => scienceCheckToFalsificationSpec(makeCheck('==')),
    /M1_test/,
  );
});

test('falsificationSpec 字段：metric/falsificationThreshold/prediction 机械合成', () => {
  const { falsificationSpec } = scienceCheckToFalsificationSpec(makeCheck('>', 0.72, 'accuracy'));
  assert.equal(falsificationSpec.metric, 'accuracy');
  assert.equal(falsificationSpec.falsificationThreshold, 0.72);
  assert.equal(falsificationSpec.thresholdSemantics, 'gt');
  assert.match(falsificationSpec.prediction, /accuracy > 0\.72.*accuracy/);
});

test('unit 空字符串 → prediction 不尾随空 unit', () => {
  const check = makeCheck('>', 0.8, '');
  const { falsificationSpec } = scienceCheckToFalsificationSpec(check);
  assert.doesNotMatch(falsificationSpec.prediction, /\s$/);
  assert.match(falsificationSpec.prediction, /^accuracy > 0\.8$/);
});
