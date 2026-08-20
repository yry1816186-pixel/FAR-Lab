/**
 * t_distribution.ts 边界与错误路径分支覆盖（Z16 coverage_gate 修复·2026-08-10）。
 *
 * 背景：t_distribution.ts branch 覆盖 65.63% < 75% 阈值。补：incompleteBeta 边界、
 * CF 算法 TINY 保护路径、studentTCdf/TSurvival/TwoSided fail-closed、t 检验 SE=0、
 * alternative 三分支。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  logGamma,
  studentTQuantile,
  incompleteBeta,
  studentTCdf,
  studentTSurvival,
  studentTTwoSidedP,
  oneSampleTTest,
  pairedTTest,
  twoSampleTTest,
  twoSampleWelchTTest,
} from '../../src/statistics/t_distribution.ts';

test('logGamma: 常见值 + 非有限输入行为记录', () => {
  // logGamma(1) = 0, logGamma(2) = 0, logGamma(0.5) ≈ 0.572
  assert.ok(Math.abs(logGamma(1)) < 1e-9);
  assert.ok(Math.abs(logGamma(2)) < 1e-9);
  assert.ok(Math.abs(logGamma(0.5) - 0.57236494) < 1e-4);
  // 既有行为：logGamma 无显式守卫，NaN 输入返回 NaN（记录而非假设抛错）
  assert.ok(Number.isNaN(logGamma(Number.NaN)));
});

test('incompleteBeta: x 越界 / x=0 / x=1 边界', () => {
  assert.throws(() => incompleteBeta(-0.1, 2, 2), /incompleteBeta: x must be in \[0,1\]/);
  assert.throws(() => incompleteBeta(1.5, 2, 2), /incompleteBeta: x must be in \[0,1\]/);
  // x=0 → 0；x=1 → 1（边界分支）
  assert.ok(Math.abs(incompleteBeta(0, 2, 2)) < 1e-9);
  assert.ok(Math.abs(incompleteBeta(1, 2, 2) - 1) < 1e-9);
  // 中值 x=0.5 → 0.5（对称）
  assert.ok(Math.abs(incompleteBeta(0.5, 2, 2) - 0.5) < 1e-4);
  // 非对称参数（触发 CF 循环不同迭代路径）
  assert.ok(incompleteBeta(0.3, 1, 3) > 0 && incompleteBeta(0.3, 1, 3) < 1);
});

test('studentTCdf: t 非有限 / df<=0 fail-closed + 正常值', () => {
  assert.throws(() => studentTCdf(Number.NaN, 10), /studentTCdf: t must be finite/);
  assert.throws(() => studentTCdf(Infinity, 10), /studentTCdf: t must be finite/);
  assert.throws(() => studentTCdf(1, 0), /studentTCdf: df must be positive/);
  assert.throws(() => studentTCdf(1, -1), /studentTCdf: df must be positive/);
  // 正常：df 大时接近正态 cdf(0)=0.5
  assert.ok(Math.abs(studentTCdf(0, 100) - 0.5) < 1e-6);
  assert.ok(studentTCdf(1.96, 100) > 0.97);
  assert.ok(studentTCdf(-1.96, 100) < 0.03);
  // 小 df 走 CF 算法不同路径
  assert.ok(studentTCdf(1, 1) > 0.7 && studentTCdf(1, 1) < 0.9); // t(1) 柯西尾部更厚
});

test('studentTSurvival / studentTTwoSidedP: 一致性', () => {
  const s = studentTSurvival(2, 30);
  assert.ok(s > 0 && s < 0.5);
  assert.ok(Math.abs(studentTSurvival(2, 30) - (1 - studentTCdf(2, 30))) < 1e-9);
  const two = studentTTwoSidedP(2, 30);
  assert.ok(Math.abs(two - 2 * studentTSurvival(2, 30)) < 1e-9);
});

test('oneSampleTTest: SE=0（全等样本）fail-closed + alternative 三分支', () => {
  assert.throws(
    () => oneSampleTTest([5, 5, 5], 0),
    /oneSampleTTest: standard error is zero/,
  );
  assert.throws(
    () => oneSampleTTest([1, 2], Number.NaN),
    /oneSampleTTest: nullMean must be finite/,
  );
  const less = oneSampleTTest([1, 2, 3, 4], 3, 'less');
  assert.ok(less.pValue > 0 && less.pValue <= 0.5);
  const greater = oneSampleTTest([1, 2, 3, 4], 3, 'greater');
  assert.ok(greater.pValue >= 0.5 && greater.pValue < 1);
  const two = oneSampleTTest([1, 2, 3, 4], 3, 'two_sided');
  assert.ok(Math.abs(two.pValue - 2 * Math.min(less.pValue, greater.pValue)) < 1e-9);
});

test('pairedTTest: 长度不匹配 fail-closed + 正常', () => {
  assert.throws(() => pairedTTest([1, 2], [1]), /must have the same length|length/);
  const r = pairedTTest([1, 2, 3, 4], [1.1, 2.2, 3.3, 4.4]);
  assert.ok(Number.isFinite(r.statistic));
  assert.ok(r.pValue > 0 && r.pValue <= 1);
});

test('twoSampleTTest / twoSampleWelchTTest: 样本不足 fail-closed + 正常', () => {
  assert.throws(() => twoSampleTTest([1], [1, 2]), /at least|observations/);
  assert.throws(() => twoSampleWelchTTest([1], [1, 2]), /at least|observations/);
  const a = twoSampleTTest([1, 2, 3, 4], [5, 6, 7, 8]);
  assert.ok(a.pValue > 0 && a.pValue < 0.05); // 均值差显著
  const w = twoSampleWelchTTest([1, 2, 3, 4], [5, 6, 7, 8]);
  assert.ok(w.pValue > 0 && w.pValue < 0.05);
});

// ── 2026-08-20 mutation 补杀（批次 8·t_distribution 62.8% 存活的精确边界用例）──

test('mutation 补杀: quantile p=0 精确拒绝（p <= 0 边界·错误消息绑定 got 0）', () => {
  // p=0 原版直接抛 "got 0"；< 变异会让 p=0 落入对称翻转递归后以 "got 1" 抛出。
  assert.throws(() => studentTQuantile(0, 5), /strictly in \(0,1\), got 0/);
});

test('mutation 补杀: quantile df=0 精确拒绝（df <= 0 边界）', () => {
  // df=0 原版抛 "df must be positive, got 0"；< 变异后 df=0 落入 Newton 迭代不抛此错。
  // 消息前缀锁定 quantile 自身的守卫：变异后 df=0 落入 Newton 首步，被 studentTCdf
  // 的内部守卫以 "studentTCdf: ..." 前缀抛出——函数名即区分点。
  assert.throws(() => studentTQuantile(0.975, 0), /studentTQuantile: df must be positive, got 0/);
});

test('mutation 补杀: incompleteBeta 对称分支选择（x === (a+1)/(a+b+2) 精确中点）', () => {
  // x 用与 kernel 相同的双精度表达式 2/5 构造精确命中中点：原版走对称分支 2
  //（1 - bt*cf/b），变异 <= 走分支 1（bt*cf/a）——非对称 (a,b) 下两分支 bit 级不同。
  assert.equal(incompleteBeta(2 / 5, 1, 2), 0.6400000000000001);
});

test('mutation 补杀: 最小合法样本量 n=2 直通（4 处 length < 2 guard 的含等号边界）', () => {
  // 变异 <=2 会把最小合法样本误判不足而抛错——n=2 是统计检验的合法下界。
  const one = oneSampleTTest([1.0, 2.0], 0);
  assert.ok(Number.isFinite(one.statistic), 'oneSampleTTest n=2 不得拒绝');
  const paired = pairedTTest([1, 2], [3, 5]);
  assert.ok(Number.isFinite(paired.statistic), 'pairedTTest 2 对不得拒绝');
  const two = twoSampleTTest([1, 2], [3, 4]);
  assert.ok(Number.isFinite(two.statistic), 'twoSampleTTest n=2/2 不得拒绝');
  const welch = twoSampleWelchTTest([1, 2], [5, 8]);
  assert.ok(Number.isFinite(welch.statistic), 'twoSampleWelchTTest n=2/2 不得拒绝');
});
