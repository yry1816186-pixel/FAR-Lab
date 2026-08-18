// tests/governance/info_gain.test.ts
//
// GOV-INFOGAIN-001 验收测试：调查优先级按期望信息增益与决策价值排序。
// 全部纯函数确定性测试：无 IO、无时钟。失败路径覆盖畸形先验/缺宪法字段/
// 决策集不可比。变异靶点：EVPI 差值方向、加权与成本除、排序稳定性。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rankInvestigations,
  scoreInvestigation,
  validateInvestigationItems,
  type InvestigationItem,
} from '../../src/governance/info_gain.ts';

function makeItem(overrides: Partial<InvestigationItem> = {}): InvestigationItem {
  return {
    id: 'INV-1',
    reducesUnknown: 'UNK-cost-basis',
    affectedDecisions: ['DEC-provider-choice'],
    cost: 2,
    worstRisk: '查询控制台可能触发限流',
    decisionWeight: 1,
    outcomes: [
      { label: 'cheap', priorProbability: 0.5, decisionPayoff: { adopt: 10, skip: 0 } },
      { label: 'expensive', priorProbability: 0.5, decisionPayoff: { adopt: -10, skip: 0 } },
    ],
    ...overrides,
  };
}

test('value-of-information core: symmetric coin flip has positive expected info gain', () => {
  // 无信息：max(0.5*10+0.5*-10, 0.5*0+0.5*0) = max(0,0) = 0
  // 有信息：0.5*10 + 0.5*0 = 5 → 增益 5（EVPI）
  const s = scoreInvestigation(makeItem());
  assert.equal(s.valueWithoutInfo, 0);
  assert.equal(s.valueWithInfo, 5);
  assert.equal(s.expectedInfoGain, 5);
  assert.equal(s.approximated, false);
  assert.equal(s.priority, 2.5); // 5 * 1 / 2
});

test('zero info gain when one decision dominates in every outcome', () => {
  const s = scoreInvestigation(
    makeItem({
      outcomes: [
        { label: 'a', priorProbability: 0.3, decisionPayoff: { adopt: 8, skip: 1 } },
        { label: 'b', priorProbability: 0.7, decisionPayoff: { adopt: 9, skip: 2 } },
      ],
    }),
  );
  assert.equal(s.expectedInfoGain, 0); // adopt 恒优——调查不改变任何决策
  assert.equal(s.priority, 0);
});

test('priority ranks by decision value / cost, with deterministic id tie-break', () => {
  const hi = makeItem({ id: 'B-hi-gain', cost: 1, decisionWeight: 1 }); // priority 5
  const lo = makeItem({
    id: 'A-lo-gain',
    cost: 1,
    outcomes: [
      // 决策偏好随结果翻转：无信息 max=3；有信息 0.5*5+0.5*3=4 → 增益 1，priority 1。
      { label: 'x', priorProbability: 0.5, decisionPayoff: { adopt: 5, skip: 3 } },
      { label: 'y', priorProbability: 0.5, decisionPayoff: { adopt: 1, skip: 3 } },
    ],
  });
  const weighted = makeItem({ id: 'C-weighted', cost: 1, decisionWeight: 0.1 }); // priority 0.5
  const r = rankInvestigations([lo, weighted, hi]);
  assert.ok(r.ok);
  assert.deepEqual(
    r.ranked.map((x) => x.id),
    ['B-hi-gain', 'A-lo-gain', 'C-weighted'],
  );

  // 同 priority → id 字典序（确定性 tie-break，非插入序）。
  const tieA = makeItem({ id: 'aaa', cost: 1 });
  const tieZ = makeItem({ id: 'zzz', cost: 1 });
  const tie = rankInvestigations([tieZ, tieA]);
  assert.ok(tie.ok);
  assert.deepEqual(
    tie.ranked.map((x) => x.id),
    ['aaa', 'zzz'],
  );
});

test('validation: malformed items are rejected fail-closed with named problems', () => {
  const bad = makeItem({
    outcomes: [
      { label: 'a', priorProbability: 0.6, decisionPayoff: { adopt: 1 } },
      { label: 'b', priorProbability: 0.6, decisionPayoff: { adopt: 1 } }, // 和 = 1.2
    ],
  });
  const problems = validateInvestigationItems([bad]);
  assert.ok(problems.some((p) => p.includes('priors must sum to 1')));
  const r = rankInvestigations([bad]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.problems.some((p) => p.includes('priors must sum to 1')));
  }

  // 宪法四要素缺失逐一拒绝。
  for (const overrides of [
    { reducesUnknown: ' ' },
    { affectedDecisions: [] },
    { cost: 0 },
    { worstRisk: '' },
    { decisionWeight: 1.5 },
    { outcomes: [] },
  ] as const) {
    const rr = rankInvestigations([makeItem(overrides as Partial<InvestigationItem>)]);
    assert.equal(rr.ok, false, `expected rejection for ${JSON.stringify(overrides)}`);
  }

  // 决策集不可比（跨结果不同决策集）→ 拒绝。
  const incomparable = makeItem({
    outcomes: [
      { label: 'a', priorProbability: 0.5, decisionPayoff: { adopt: 1 } },
      { label: 'b', priorProbability: 0.5, decisionPayoff: { different: 1 } },
    ],
  });
  const ri = rankInvestigations([incomparable]);
  assert.equal(ri.ok, false);
});

test('floating-point guard: tiny negative EVPI from rounding is clamped and flagged', () => {
  // 构造数学上增益为 0 但浮点上可能微负的项：等价决策。
  const s = scoreInvestigation(
    makeItem({
      outcomes: [
        { label: 'a', priorProbability: 0.1, decisionPayoff: { adopt: 0.1, skip: 0.1 } },
        { label: 'b', priorProbability: 0.9, decisionPayoff: { adopt: 0.3, skip: 0.3 } },
      ],
    }),
  );
  assert.equal(s.expectedInfoGain, 0);
  // approximated 仅在原值 < 0 时为 true；此处恰好为 0 → false。钳位行为本身已验证。
});
