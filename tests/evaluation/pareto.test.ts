// tests/evaluation/pareto.test.ts
// EVAL-PARETO-001：支配关系/前沿、同条件成本核算门、缓存披露、敏感性分析、
// 改进声称门（被支配点不得称改进；前沿点不得称无条件改进）。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  costAccountingCheck,
  frontierSensitivity,
  improvementClaimGate,
  paretoDominates,
  paretoFrontier,
} from '../../src/evaluation/pareto.ts';
import type { ParetoCandidate } from '../../src/evaluation/pareto.ts';

const COND = 'node22-win11-32g';

function c(id: string, quality: number, costUsd: number, latencyMs: number, energyKwh: number = 1.0): ParetoCandidate {
  return { id, quality, costUsd, latencyMs, energyKwh, condition: COND, cacheUsed: false };
}

test('EVAL-PARETO-001: 支配关系四象限（严格优/等价/被支配/不可比）+ 前沿成员与被支配映射', () => {
  const base = c('base', 0.8, 1.0, 500);
  // 全轴更便宜且质量不低 → 支配 base
  const cheaper = c('cheaper', 0.8, 0.6, 400);
  // 质量更高但更贵 → 不支配也不被支配（前沿点）
  const better = c('better', 0.9, 2.0, 700);
  assert.equal(paretoDominates(cheaper, base), true);
  assert.equal(paretoDominates(base, cheaper), false);
  assert.equal(paretoDominates(better, base), false);
  assert.equal(paretoDominates(base, better), false);
  // 全等价（epsilon 内）→ 无严格优 → 不支配（支配需要至少一轴严格优）
  const twin = c('twin', 0.8, 1.0, 500);
  assert.equal(paretoDominates(twin, base), false);
  // 轴缺失 → 不可比（缺数据不得推定优势）
  const { energyKwh: _omit, ...rest } = c('noenergy', 0.95, 0.1, 100);
  void _omit;
  const noEnergy: ParetoCandidate = rest;
  assert.equal(paretoDominates(noEnergy, base), false);

  const report = paretoFrontier([base, cheaper, better]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.comparedAxes, ['costUsd', 'latencyMs', 'energyKwh']);
  assert.deepEqual(report.frontier.map((f) => f.id), ['better', 'cheaper']);
  const domBase = report.dominated.find((d) => d.id === 'base');
  assert.deepEqual(domBase?.dominatedBy, ['cheaper']);
});

test('EVAL-PARETO-001: 轴覆盖不完整 → 排除轴如实列出；全缺 → 前沿未定义 fail-closed', () => {
  const a = c('a', 0.8, 1.0, 500);
  const { energyKwh: _omit, ...partialRest } = c('partial', 0.7, 0.5, 300);
  void _omit;
  const report = paretoFrontier([a, partialRest]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.comparedAxes, ['costUsd', 'latencyMs']);
  assert.deepEqual(report.excludedAxes, ['energyKwh']);

  // 全候选零成本轴 → 纯质量排序不是 Pareto 分析
  const qualityOnly: ParetoCandidate[] = [
    { id: 'x', quality: 0.9, condition: COND, cacheUsed: false },
    { id: 'y', quality: 0.8, condition: COND, cacheUsed: false },
  ];
  assert.equal(paretoFrontier(qualityOnly).ok, false);
  assert.equal(paretoFrontier([]).ok, false);
});

test('EVAL-PARETO-001: 同条件成本核算门（混条件拒绝）+ 缓存混排披露标记', () => {
  const same = costAccountingCheck([c('a', 0.8, 1, 500), c('b', 0.9, 2, 700)]);
  assert.equal(same.ok, true);
  assert.deepEqual(same.conditions, [COND]);
  assert.equal(same.cacheMixed, false);

  const mixed = costAccountingCheck([
    c('a', 0.8, 1, 500),
    { ...c('b', 0.9, 2, 700), condition: 'gpu-h100-batch16' },
  ]);
  assert.equal(mixed.ok, false);
  assert.match(mixed.reason, /cross-condition comparison blocked/);

  // 缓存混排：ok 但必须披露（cacheMixed=true 是披露义务信号，不静默）
  const cacheMixed = costAccountingCheck([
    c('cold', 0.8, 1, 500),
    { ...c('warm', 0.8, 0.1, 50), cacheUsed: true },
  ]);
  assert.equal(cacheMixed.ok, true);
  assert.equal(cacheMixed.cacheMixed, true);
  const allCached = costAccountingCheck([
    { ...c('w1', 0.8, 0.1, 50), cacheUsed: true },
    { ...c('w2', 0.9, 0.2, 60), cacheUsed: true },
  ]);
  assert.equal(allCached.cacheMixed, false, '全缓存同口径不触发披露');
});

test('EVAL-PARETO-001: 敏感性分析——远离边界点全档稳定 / 贴邻点（0.012 质量差）稳定性下降', () => {
  // 扰动语义：只扰动被评估候选自身的质量（该点测量不确定性的传导）。
  const candidates = [
    c('baseline', 0.8, 1.0, 500),
    c('new', 0.812, 1.0, 500),
    c('cheap', 0.5, 0.2, 100),
  ];
  const sens = frontierSensitivity(candidates, [-0.02, -0.01, 0.01, 0.02]);
  const byId = new Map(sens.map((s) => [s.id, s]));
  // cheap：成本轴独占低位，任意质量扰动不可被支配 → 全档稳定
  assert.equal(byId.get('cheap')?.stability, 1);
  // baseline(0.8) vs new(0.812)：档位 ≤+0.01 时仍低于 new 且成本相等 → 被支配；
  // +0.02 时 0.82>0.812 反超 → 回到前沿。边界贴邻 → 成员资格脆弱（如实暴露）
  const baselineFlags = byId.get('baseline')?.onFrontierPerDelta;
  assert.deepEqual(baselineFlags, [false, false, false, true]);
  assert.equal(byId.get('baseline')?.stability, 0.25);
  // new 同理在 -0.02 档跌破 baseline → [F,T,T,T]
  assert.deepEqual(byId.get('new')?.onFrontierPerDelta, [false, true, true, true]);
  assert.equal(byId.get('new')?.stability, 0.75);
  // 逐档位输出长度与 deltas 一致
  assert.equal(byId.get('new')?.onFrontierPerDelta.length, 4);
});

test('EVAL-PARETO-001: 改进声称门——被支配点拒绝/前沿点只能条件声称/混条件与未知 id 拒绝', () => {
  const candidates = [
    c('old', 0.8, 1.0, 500),
    c('new-cheap', 0.8, 0.6, 400),
    c('new-better', 0.9, 2.0, 700),
  ];
  // 被支配：old 被 new-cheap 支配 → 不得称改进
  const dominatedClaim = improvementClaimGate('old', candidates);
  assert.equal(dominatedClaim.ok, false);
  assert.match(dominatedClaim.reason, /dominated by new-cheap/);
  // 前沿点：只能「记录条件下 Pareto 最优」，禁止无条件改进话术
  const frontierClaim = improvementClaimGate('new-cheap', candidates);
  assert.equal(frontierClaim.ok, true);
  assert.match(frontierClaim.conditionalClaim, /Pareto-optimal under recorded condition/);
  assert.match(frontierClaim.conditionalClaim, /NOT an unconditional improvement/);
  // 混条件 → 门直接失效拒绝
  const crossCond = [...candidates, { ...c('gpu', 0.95, 3, 800), condition: 'h100' }];
  assert.equal(improvementClaimGate('gpu', crossCond).ok, false);
  // 未知 id → 拒绝
  assert.equal(improvementClaimGate('ghost', candidates).ok, false);
  // 质量升但成本不可持续：更高更贵点在前沿（权衡点），声称必须带条件
  const tradeoff = improvementClaimGate('new-better', candidates);
  assert.equal(tradeoff.ok, true);
  assert.match(tradeoff.conditionalClaim, /costUsd/);
});
