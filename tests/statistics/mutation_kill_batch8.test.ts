/**
 * statistics 域 mutation 补杀（2026-08-20 批次 8）。
 *
 * multiple_testing 43.8% / ci 25.0% / effect_size 50% 存活的输入验证边界用例：
 * alpha 与 p 值的闭开区间语义、显著性等号边界（p === alpha 须拒绝 H0·统计惯例）、
 * 最小合法样本量直通、零标准差 fail-closed。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adjustPValues } from '../../src/statistics/multiple_testing.ts';
import {
  meanConfidenceInterval,
  meanConfidenceIntervalT,
  differenceInMeansConfidenceInterval,
  differenceInMeansConfidenceIntervalWelch,
} from '../../src/statistics/ci.ts';
import { cohensDOneSample, sampleVariance } from '../../src/statistics/effect_size.ts';

// ===== multiple_testing：alpha / p 值验证边界 =====

test('mutation 补杀: alpha=0 / alpha=1 / NaN 精确拒绝（开区间 (0,1) 语义）', () => {
  assert.throws(() => adjustPValues([0.03], 'bonferroni', 0), /strictly between 0 and 1, got 0/,
    'alpha=0 恰在边界必须拒绝（<=0 → <0 变异会放行零显著性水平）');
  assert.throws(() => adjustPValues([0.03], 'bonferroni', 1), /strictly between 0 and 1, got 1/,
    'alpha=1 恰在边界必须拒绝（>=1 → >1 变异会放行必然显著水平）');
  assert.throws(() => adjustPValues([0.03], 'bonferroni', Number.NaN), /strictly between 0 and 1, got NaN/,
    'NaN alpha 必须拒绝（||→&& 变异会放行 NaN 落入恒 false 比较）');
});

test('mutation 补杀: p=0 / p=1 合法（闭区间 [0,1] 语义·与 alpha 开区间对照）', () => {
  const withZero = adjustPValues([0, 0.5], 'bonferroni', 0.05);
  assert.ok(Array.isArray(withZero) && withZero.length === 2, 'p=0 是合法边界（< 0 → <= 0 变异会误拒）');
  const withOne = adjustPValues([1, 0.5], 'bonferroni', 0.05);
  assert.ok(Array.isArray(withOne) && withOne.length === 2, 'p=1 是合法边界（> 1 → >= 1 变异会误拒）');
});

test('mutation 补杀: adjusted p === alpha 拒绝 H0（<= 含等号·显著性边界）', () => {
  // bonferroni 单检验：adjusted = min(0.05*1, 1) = 0.05 === alpha → rejected 必须为 true
  //（p 恰等 alpha 的边界按 ≤ 语义拒绝原假设——统计惯例）。
  const [adj] = adjustPValues([0.05], 'bonferroni', 0.05);
  assert.ok(adj !== undefined, '前置：单检验返回');
  assert.equal(adj.rejected, true, 'adjusted p === alpha → 拒绝（<= → < 变异会漏判边界显著）');
});

// ===== ci：最小合法样本量 n=2 直通 =====

test('mutation 补杀: 四个 CI 函数 n=2 合法（length < 2 含等号边界）', () => {
  const z = meanConfidenceInterval([1, 2], 0.95);
  assert.ok(z.lower < z.upper, 'z-CI n=2 不得拒绝');
  const t = meanConfidenceIntervalT([1, 2], 0.95);
  assert.ok(t.lower < t.upper, 't-CI n=2 不得拒绝');
  const pooled = differenceInMeansConfidenceInterval([1, 2], [3, 4], 0.95);
  assert.ok(pooled.lower < pooled.upper, 'pooled diff-CI n=2/2 不得拒绝');
  const welch = differenceInMeansConfidenceIntervalWelch([1, 2], [5, 8], 0.95);
  assert.ok(welch.lower < welch.upper, 'Welch diff-CI n=2/2 不得拒绝');
});

// ===== effect_size：零标准差 + 最小样本量 =====

test('mutation 补杀: cohensDOneSample 零标准差 fail-closed（sd === 0 位点）', () => {
  // 全同样本 sd=0：原版显式 throw（除零不可静默）；变异 !==0 会走 0/0=NaN 返回。
  assert.throws(() => cohensDOneSample([3, 3, 3], 3), /standard deviation must be non-zero/,
    'sd=0 须显式拒绝（=== → !== 变异会返回 NaN 效应量）');
});

test('mutation 补杀: sampleVariance n=2 恰为最小合法量（minimumLength 含等号）', () => {
  const v = sampleVariance([1, 2]);
  assert.equal(v, 0.5, 'n=2 方差合法且正确（<min → <=min 变异会误拒最小样本）');
});
