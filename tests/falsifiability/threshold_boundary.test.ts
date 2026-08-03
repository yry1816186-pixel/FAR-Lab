// tests/falsifiability/threshold_boundary.test.ts
//
// 阈值边界特征测试（executable spec for boundaryPolicy = INCLUSIVE · 决策 D13）。
//
// 背景：
//   threshold_semantics.ts 的 evaluateThreshold 对 gt 用 `>=`、lt 用 `<=`（INCLUSIVE）。
//   DEBT-12（2026-08-01 偿还）按 Popper 删除精确等值 eq/ne——「精确等值无可证伪语义」。
//   边界点 metric === threshold 即精确等值，是不可证伪的约定点；engine 取 inclusive convention
//   （给 claimant 留疑），与 DEBT-12 推理一致。本测试把该隐式行为编码为可执行 spec，
//   使任何静默语义变更（如误改 strict `>`）被立即检出。
//
// 覆盖：
//   1. gt 边界：metric === value → supportsClaim=true（INCLUSIVE）
//   2. lt 边界：metric === value → supportsClaim=true（INCLUSIVE）
//   3. range 边界：metric === lower 或 === upper → supportsClaim=true（INCLUSIVE·双端）
//   4. 边界经 decideVerdict：单证据命中边界 → CONFIRMED（证明 inclusive 传播到裁决）
//   5. 边界附近：metric 略低于 gt value → refutesClaim（确认 > 边界方向正确）
//   6. 非有限 metric / 缺 value → fail-closed 抛错（边界语义不影响输入校验）
//
// Authority: AGENTS.md §7（trust-kernel）+ DEBT-12（Popper eq/ne 删除）+ 决策 D13（boundaryPolicy=INCLUSIVE）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateThreshold, makeVerdict } from '../../src/falsifiability/index.ts';
import type { ThresholdSpec, FalsificationSpec, SourceAnchor } from '../../src/falsifiability/index.ts';

const GT_SPEC: ThresholdSpec = { semantics: 'gt', value: 0.85 };
const LT_SPEC: ThresholdSpec = { semantics: 'lt', value: 0.3 };
const RANGE_SPEC: ThresholdSpec = { semantics: 'range', lower: 0.4, upper: 0.6 };

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

test('gt_boundary_inclusive: metric === value → supportsClaim=true (boundaryPolicy INCLUSIVE)', () => {
  const ev = evaluateThreshold(0.85, GT_SPEC);
  assert.equal(ev.supportsClaim, true, 'gt: metric===value 时 supportsClaim=true (inclusive)');
  assert.equal(ev.refutesClaim, false);
});

test('gt_just_above: metric 略高于 value → supportsClaim=true', () => {
  const ev = evaluateThreshold(0.8500001, GT_SPEC);
  assert.equal(ev.supportsClaim, true);
  assert.equal(ev.refutesClaim, false);
});

test('gt_just_below: metric 略低于 value → refutesClaim=true (方向正确)', () => {
  const ev = evaluateThreshold(0.8499999, GT_SPEC);
  assert.equal(ev.supportsClaim, false);
  assert.equal(ev.refutesClaim, true, 'gt: metric < value 时 refutesClaim=true');
});

test('lt_boundary_inclusive: metric === value → supportsClaim=true', () => {
  const ev = evaluateThreshold(0.3, LT_SPEC);
  assert.equal(ev.supportsClaim, true, 'lt: metric===value 时 supportsClaim=true (inclusive)');
  assert.equal(ev.refutesClaim, false);
});

test('lt_just_above: metric 略高于 value → refutesClaim=true (方向正确)', () => {
  const ev = evaluateThreshold(0.3000001, LT_SPEC);
  assert.equal(ev.supportsClaim, false);
  assert.equal(ev.refutesClaim, true, 'lt: metric > value 时 refutesClaim=true');
});

test('range_boundary_lower_inclusive: metric === lower → supportsClaim=true', () => {
  const ev = evaluateThreshold(0.4, RANGE_SPEC);
  assert.equal(ev.supportsClaim, true, 'range: metric===lower 时 supportsClaim=true (inclusive)');
});

test('range_boundary_upper_inclusive: metric === upper → supportsClaim=true', () => {
  const ev = evaluateThreshold(0.6, RANGE_SPEC);
  assert.equal(ev.supportsClaim, true, 'range: metric===upper 时 supportsClaim=true (inclusive)');
});

test('range_outside_below: metric < lower → refutesClaim=true', () => {
  const ev = evaluateThreshold(0.39, RANGE_SPEC);
  assert.equal(ev.refutesClaim, true);
});

test('range_outside_above: metric > upper → refutesClaim=true', () => {
  const ev = evaluateThreshold(0.61, RANGE_SPEC);
  assert.equal(ev.refutesClaim, true);
});

test('boundary_propagates_to_verdict_CONFIRMED: 单证据命中 gt 边界 → makeVerdict 返回 CONFIRMED', () => {
  // 关键传播验证：evaluateThreshold 的 inclusive 语义经 decideVerdict 传播为 CONFIRMED。
  // 这证明边界 inclusivity 影响最终裁决（受保护状态），故任何语义变更须迁移。
  const falsificationSpec: FalsificationSpec = {
    prediction: 'accuracy strictly greater than 0.85',
    metric: 'accuracy',
    falsificationThreshold: 0.85,
    thresholdSemantics: 'gt',
  };
  const result = makeVerdict({
    claim: 'adapter A accuracy > 0.85',
    evidences: [
      {
        claim: 'eval run 1',
        metricValue: 0.85, // 恰好命中边界
        supportsClaim: false, // 会被 evaluateThreshold 重算覆盖
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor: SOURCE_ANCHOR,
      },
    ],
    falsificationSpec,
    thresholdSpec: GT_SPEC,
  });
  assert.equal(
    result.verdict,
    'CONFIRMED',
    'gt 边界 metric===value → inclusive → CONFIRMED (executable spec: 任何改 strict 须更新此断言+迁移)',
  );
});

test('boundary_below_refutes_to_verdict_REFUTED: 单证据略低于 gt 边界 → REFUTED', () => {
  const falsificationSpec: FalsificationSpec = {
    prediction: 'accuracy strictly greater than 0.85',
    metric: 'accuracy',
    falsificationThreshold: 0.85,
    thresholdSemantics: 'gt',
  };
  const result = makeVerdict({
    claim: 'adapter A accuracy > 0.85',
    evidences: [
      {
        claim: 'eval run 1',
        metricValue: 0.84,
        supportsClaim: false,
        refutesClaim: true,
        scopeNarrowerThanClaim: false,
        sourceAnchor: SOURCE_ANCHOR,
      },
    ],
    falsificationSpec,
    thresholdSpec: GT_SPEC,
  });
  assert.equal(result.verdict, 'REFUTED', 'gt: metric < value → REFUTED');
});

test('non_finite_metric_fail_closed: NaN/Infinity metric → 抛错（边界语义不影响输入校验）', () => {
  assert.throws(() => evaluateThreshold(NaN, GT_SPEC), /must be finite/);
  assert.throws(() => evaluateThreshold(Infinity, GT_SPEC), /must be finite/);
  assert.throws(() => evaluateThreshold(-Infinity, GT_SPEC), /must be finite/);
});

test('missing_value_fail_closed: gt/lt 缺 value → 抛错', () => {
  assert.throws(
    () => evaluateThreshold(0.5, { semantics: 'gt' } as ThresholdSpec),
    /requires finite value/,
  );
  assert.throws(
    () => evaluateThreshold(0.5, { semantics: 'lt' } as ThresholdSpec),
    /requires finite value/,
  );
});
