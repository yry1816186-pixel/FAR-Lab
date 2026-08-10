/**
 * p_value.ts 边界与错误路径分支覆盖（Z16 coverage_gate 修复·2026-08-10）。
 *
 * 背景：p_value.ts branch 覆盖 60.71% < 75% 阈值。补：alternative 三分支、
 * normalQuantile 三区间（低尾/中段/高尾）、clamp 边界、全部 fail-closed 断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  erf,
  normalCdf,
  normalSurvival,
  zTestPValue,
  oneSampleZTest,
  twoSampleWelchZTest,
  normalQuantile,
} from '../../src/statistics/p_value.ts';

test('erf: 负 x 分支 + 非有限 fail-closed', () => {
  assert.ok(erf(-1) < 0); // sign = -1 分支
  assert.ok(erf(1) > 0);
  assert.ok(Math.abs(erf(0)) < 1e-9); // erf(0)=0 浮点近似
  assert.throws(() => erf(Number.NaN), /x: expected a finite number/);
});

test('zTestPValue: alternative 三分支', () => {
  const less = zTestPValue(-2, 'less');
  assert.ok(less > 0 && less < 0.5); // 左尾
  const greater = zTestPValue(2, 'greater');
  assert.ok(greater > 0 && greater < 0.5); // 右尾
  const two = zTestPValue(2, 'two_sided');
  assert.ok(two > 0 && two < 1); // 双尾 = 2×右尾
  assert.throws(() => zTestPValue(Number.NaN, 'less'), /zScore: expected a finite number/);
});

test('zTestPValue: clamp 边界（极端 z 值不越界）', () => {
  // z 极大 → survival ≈ 0 → clamp 到 0（value < 0 分支）
  const g = zTestPValue(1e12, 'greater');
  assert.ok(g >= 0 && g < 1e-8); // 浮点近似下趋近 0 而非精确 0
  // z 极小 → cdf ≈ 0 → less 也趋近 0
  const l = zTestPValue(-1e12, 'less');
  assert.ok(l >= 0 && l < 1e-8);
  // 双尾 z=0 → 2×survival(0) = 1（浮点近似 <1）
  const t0 = zTestPValue(0, 'two_sided');
  assert.ok(t0 > 0.999999 && t0 <= 1);
});

test('oneSampleZTest: 空样本 fail-closed + 正常路径', () => {
  assert.throws(
    () => oneSampleZTest([], 0, 1),
    /oneSampleZTest: sample must contain at least one observation/,
  );
  assert.throws(
    () => oneSampleZTest([1, 2], 0, 0),
    /populationStandardDeviation: expected a positive number/,
  );
  const r = oneSampleZTest([10, 12, 14, 16], 13, 2, 'greater');
  assert.ok(Number.isFinite(r.statistic));
  assert.ok(r.pValue >= 0 && r.pValue <= 1);
});

test('twoSampleWelchZTest: 样本不足 / SE=0 / 正常路径', () => {
  assert.throws(
    () => twoSampleWelchZTest([1], [1, 2, 3]),
    /twoSampleWelchZTest: left sample must contain at least 2 observations/,
  );
  assert.throws(
    () => twoSampleWelchZTest([1, 2, 3], [1]),
    /twoSampleWelchZTest: right sample must contain at least 2 observations/,
  );
  // SE=0：两组同均值同方差 → statistic 0/0 防护（等值样本）
  assert.throws(
    () => twoSampleWelchZTest([5, 5, 5], [5, 5, 5]),
    /twoSampleWelchZTest: standard error must be non-zero/,
  );
  const r = twoSampleWelchZTest([1, 2, 3, 4], [5, 6, 7, 8]);
  assert.ok(r.statistic < 0);
  assert.ok(r.pValue > 0 && r.pValue <= 1);
});

test('normalQuantile: 三区间（低尾/中段/高尾）', () => {
  // 中段（0.02425 <= p <= 0.97575）：p=0.5 → q=0 → 0
  assert.equal(normalQuantile(0.5), 0);
  // 低尾（p < 0.02425）：p=0.001 → 负值
  const low = normalQuantile(0.001);
  assert.ok(low < -2);
  // 高尾（p > 0.97575）：p=0.999 → 正值
  const high = normalQuantile(0.999);
  assert.ok(high > 2);
  // 对称性：quantile(p) = -quantile(1-p)
  assert.ok(Math.abs(normalQuantile(0.1) + normalQuantile(0.9)) < 1e-6);
  // 边界值 p=0.02425 走中段分支（<= phigh）
  assert.ok(Number.isFinite(normalQuantile(0.02425)));
  // 概率越界 fail-closed
  assert.throws(() => normalQuantile(0), /probability: expected a probability strictly between 0 and 1/);
  assert.throws(() => normalQuantile(1), /probability: expected a probability strictly between 0 and 1/);
  assert.throws(() => normalQuantile(Number.NaN), /probability: expected a finite number/);
});

test('normalCdf / normalSurvival 对称性 + 有限性', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9);
  assert.ok(normalSurvival(0) > 0.49 && normalSurvival(0) < 0.51);
  assert.ok(Math.abs(normalCdf(1.96) + normalSurvival(1.96) - 1) < 1e-9);
  assert.throws(() => normalCdf(Number.NaN), /x: expected a finite number/);
});
