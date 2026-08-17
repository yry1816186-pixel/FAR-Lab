// tests/evidence_quality/conflict_analysis.test.ts
//
// EVID-CONTRADICTION-001 验收四类的检测层测试：
//   (a) 矛盾集 —— evidence_contract.structureContradictions（同文件族已测，此处锁聚合分类映射）
//   (b) Simpson 类分层问题 —— detectStratificationReversal
//   (c) 单位冲突 —— detectUnitConflicts
//   (d) 时间版本冲突 —— detectTemporalConflicts
// 全部确定性纯函数；含失败路径与边界。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHURN_CHAIN_DEPTH,
  MIN_SUBGROUP_N,
  classifyAggregation,
  detectStratificationReversal,
  detectTemporalConflicts,
  detectUnitConflicts,
  type StratificationSubgroup,
  type TemporalVersion,
  type UnitAnnotatedEvidence,
} from '../../src/evidence_quality/conflict_analysis.ts';

// ============================================================
// 聚合四分类（一致/混合/证据不足/不可比较）
// ============================================================

test('aggregation: 四分类确定性映射 + 不可比较优先（fail-closed）', () => {
  assert.equal(classifyAggregation({ directions: ['supports', 'supports'], unitComparable: true, sufficientPower: true }).klass, 'consistent');
  assert.equal(classifyAggregation({ directions: ['supports', 'refutes'], unitComparable: true, sufficientPower: true }).klass, 'mixed');
  assert.equal(classifyAggregation({ directions: ['supports'], unitComparable: true, sufficientPower: false }).klass, 'insufficient');
  assert.equal(classifyAggregation({ directions: ['neutral'], unitComparable: true, sufficientPower: true }).klass, 'insufficient');
  // 单位不可比压倒一切——即使方向一致也不得聚合
  const incomparable = classifyAggregation({ directions: ['supports', 'supports'], unitComparable: false, sufficientPower: true });
  assert.equal(incomparable.klass, 'incomparable');
  assert.match(incomparable.detail, /aggregation blocked/);
});

// ============================================================
// (b) Simpson 类分层
// ============================================================

const SUB: readonly StratificationSubgroup[] = [
  { id: 'hospital-a', estimate: 0.32, n: 120 },
  { id: 'hospital-b', estimate: 0.28, n: 200 },
];

test('simpson: 亚组全正 + 聚合为负 → STRATIFICATION_REVERSAL', () => {
  const findings = detectStratificationReversal({ subgroups: SUB, aggregateEstimate: -0.15 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, 'STRATIFICATION_REVERSAL');
  assert.match(findings[0]!.detail, /Simpson-class/);
});

test('simpson: 亚组与聚合同号 → 无发现（反例不误报）', () => {
  assert.deepEqual(detectStratificationReversal({ subgroups: SUB, aggregateEstimate: 0.3 }), []);
  // 镜像：亚组全负聚合正
  const mirror = detectStratificationReversal({
    subgroups: SUB.map((s) => ({ ...s, estimate: -s.estimate })),
    aggregateEstimate: 0.15,
  });
  assert.equal(mirror[0]!.kind, 'STRATIFICATION_REVERSAL');
});

test('simpson: 亚组间符号冲突 → SUBGROUP_SIGN_CONFLICT（聚合必误导）', () => {
  const findings = detectStratificationReversal({
    subgroups: [
      { id: 'a', estimate: 0.4, n: 100 },
      { id: 'b', estimate: -0.3, n: 150 },
    ],
    aggregateEstimate: 0.05,
  });
  assert.equal(findings[0]!.kind, 'SUBGROUP_SIGN_CONFLICT');
});

test('simpson 边界: 小亚组 n<10 → 判定诚实回退；亚组数<2 → 不适用；零效应不算符号', () => {
  const small = detectStratificationReversal({
    subgroups: [{ id: 'a', estimate: 0.5, n: MIN_SUBGROUP_N - 1 }, { id: 'b', estimate: 0.4, n: 100 }],
    aggregateEstimate: -0.2,
  });
  assert.equal(small[0]!.kind, 'INSUFFICIENT_STRATIFICATION');
  assert.match(small[0]!.detail, /withheld/);

  assert.equal(
    detectStratificationReversal({ subgroups: [{ id: 'a', estimate: 1, n: 50 }], aggregateEstimate: -1 })[0]!.kind,
    'INSUFFICIENT_STRATIFICATION',
  );

  // 零容差：聚合恰为 0 → 不产反转（零号不参与符号判定）
  assert.deepEqual(
    detectStratificationReversal({ subgroups: SUB, aggregateEstimate: 0 }),
    [],
  );
});

// ============================================================
// (c) 单位冲突
// ============================================================

test('units: 同单位可比；异单位无换算 → UNIT_MISMATCH；声明换算 → 归一可比', () => {
  const same: readonly UnitAnnotatedEvidence[] = [
    { testId: 't1', unit: 'accuracy' },
    { testId: 't2', unit: 'accuracy' },
  ];
  const ok = detectUnitConflicts(same);
  assert.equal(ok.comparable, true);
  assert.equal(ok.normalizedUnit, 'accuracy');

  const mixed: readonly UnitAnnotatedEvidence[] = [
    { testId: 't1', unit: 'kg' },
    { testId: 't2', unit: 'lb' },
  ];
  const bad = detectUnitConflicts(mixed);
  assert.equal(bad.comparable, false);
  assert.match(bad.conflicts.join(' '), /unit mismatch/);

  const converted: readonly UnitAnnotatedEvidence[] = [
    { testId: 't1', unit: 'kg' },
    { testId: 't2', unit: 'lb', conversion: { toUnit: 'kg', factor: 0.453592 } },
  ];
  const okConverted = detectUnitConflicts(converted);
  assert.equal(okConverted.comparable, true);
  assert.equal(okConverted.normalizedUnit, 'kg');
});

test('units fail-closed: 单位未声明 → 不可比（单位不明禁止聚合·不得默认可比）', () => {
  const result = detectUnitConflicts([
    { testId: 't1', unit: 'kg' },
    { testId: 't2', unit: null },
  ]);
  assert.equal(result.comparable, false);
  assert.match(result.conflicts.join(' '), /undeclared unit/);
});

// ============================================================
// (d) 时间版本冲突
// ============================================================

test('temporal: 双活跃不同裁决无 supersede 链 → VERSION_AMBIGUITY（禁止静默取最新）', () => {
  const versions: readonly TemporalVersion[] = [
    { id: 'v2023', verdict: 'CONFIRMED', recordedAt: '2023-05-01', supersededBy: null },
    { id: 'v2025', verdict: 'REFUTED', recordedAt: '2025-09-01', supersededBy: null },
  ];
  const findings = detectTemporalConflicts(versions);
  assert.equal(findings.some((f) => f.kind === 'VERSION_AMBIGUITY'), true);
});

test('temporal: 链上 CONFIRMED→REFUTED 翻转 → TEMPORAL_FLIP_RETAINED（历史保留入矛盾集）', () => {
  const versions: readonly TemporalVersion[] = [
    { id: 'v1', verdict: 'CONFIRMED', recordedAt: '2023-05-01', supersededBy: 'v2' },
    { id: 'v2', verdict: 'REFUTED', recordedAt: '2025-09-01', supersededBy: null },
  ];
  const findings = detectTemporalConflicts(versions);
  const flip = findings.find((f) => f.kind === 'TEMPORAL_FLIP_RETAINED');
  assert.ok(flip !== undefined);
  assert.match(flip.detail, /retained in the contradiction set/);
  // 无 AMBIGUITY（v1 已被 supersede，链语义明确）
  assert.equal(findings.some((f) => f.kind === 'VERSION_AMBIGUITY'), false);
});

test('temporal: 链深度超限 → CHURN_RISK；浅链不报（反例）', () => {
  const deep: TemporalVersion[] = [];
  for (let i = 0; i <= CHURN_CHAIN_DEPTH + 1; i += 1) {
    deep.push({
      id: `v${i}`,
      verdict: 'INCONCLUSIVE',
      recordedAt: `2024-0${i + 1}-01`,
      supersededBy: i < CHURN_CHAIN_DEPTH + 1 ? `v${i + 1}` : null,
    });
  }
  assert.equal(detectTemporalConflicts(deep).some((f) => f.kind === 'CHURN_RISK'), true);

  const shallow: readonly TemporalVersion[] = [
    { id: 'v1', verdict: 'CONFIRMED', recordedAt: '2023-05-01', supersededBy: 'v2' },
    { id: 'v2', verdict: 'CONFIRMED', recordedAt: '2024-06-01', supersededBy: null },
  ];
  assert.deepEqual(detectTemporalConflicts(shallow), []);
});

test('temporal: 单活跃版本零发现（平凡路径）', () => {
  assert.deepEqual(
    detectTemporalConflicts([{ id: 'only', verdict: 'INCONCLUSIVE', recordedAt: '2026-01-01', supersededBy: null }]),
    [],
  );
});

// ============================================================
// 确定性
// ============================================================

test('determinism: 三探测器同输入字节等同输出', () => {
  const run = (): string =>
    JSON.stringify({
      strat: detectStratificationReversal({ subgroups: SUB, aggregateEstimate: -0.1 }),
      units: detectUnitConflicts([{ testId: 'a', unit: 'kg' }, { testId: 'b', unit: 's' }]),
      temporal: detectTemporalConflicts([
        { id: 'v1', verdict: 'CONFIRMED', recordedAt: '2023-01-01', supersededBy: null },
        { id: 'v2', verdict: 'REFUTED', recordedAt: '2025-01-01', supersededBy: null },
      ]),
    });
  assert.equal(run(), run());
});
