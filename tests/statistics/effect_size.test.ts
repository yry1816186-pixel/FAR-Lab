/**
 * effect_size.test.ts — Hedges' g 校正因子(effect_size.ts)输入守卫 + 已知值。
 *
 * hedgesCorrection(degreesOfFreedom):df<=1 时校正未定义(分母 4df-1≤3·且 Hedges' g
 * 要求 df>1)→ fail-closed 抛错。此前零测覆盖(statistics_math 测 effect size 聚合,
 * 非 hedgesCorrection 守卫)。公式 J(df)=1-3/(4df-1)。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hedgesCorrection, twoSampleEffectSize } from '../../src/statistics/effect_size.ts';

test('hedgesCorrection: df<=1 → fail-closed(校正未定义)', () => {
  for (const df of [0, 1, -1, -100]) {
    assert.throws(
      () => hedgesCorrection(df),
      /degreesOfFreedom must be greater than 1/,
      `df=${df} 须 fail-closed`,
    );
  }
});

test('hedgesCorrection: 非有限数(NaN/Infinity)→ assertFiniteNumber fail-closed', () => {
  for (const df of [NaN, Infinity, -Infinity]) {
    assert.throws(() => hedgesCorrection(df), /degreesOfFreedom/);
  }
});

test('hedgesCorrection: 边界 df=2 合法 + 已知值(公式 J=1-3/(4df-1))', () => {
  // df=2: J = 1 - 3/7 = 4/7 ≈ 0.5714286
  assert.ok(Math.abs(hedgesCorrection(2) - 4 / 7) < 1e-9);
});

test('hedgesCorrection: 已知值 df=10/100(收敛→1)', () => {
  // df=10: J = 1 - 3/39 = 12/13 ≈ 0.9230769
  assert.ok(Math.abs(hedgesCorrection(10) - 12 / 13) < 1e-9);
  // df=100: J = 1 - 3/399 ≈ 0.9924812(大样本→校正→1)
  assert.ok(Math.abs(hedgesCorrection(100) - (1 - 3 / 399)) < 1e-9);
  assert.ok(hedgesCorrection(100) > 0.99, '大样本校正须趋近 1');
});

test('twoSampleEffectSize: 两样本恒定(pooledSd=0)→ fail-closed', () => {
  assert.throws(
    () => twoSampleEffectSize([5, 5, 5], [5, 5, 5]),
    /pooled standard deviation must be non-zero/,
    '恒定样本 pooledSd=0 须 fail-closed(效应量未定义)',
  );
});

test('twoSampleEffectSize: 合法两样本 → 返回 cohensD + hedgesG(回归基线)', () => {
  const result = twoSampleEffectSize([10, 12, 14, 16, 18], [4, 6, 8, 10, 12]);
  assert.ok(typeof result.cohensD === 'number' && Number.isFinite(result.cohensD));
  assert.ok(typeof result.hedgesG === 'number' && Number.isFinite(result.hedgesG));
  // 均值差为正(左>右)→ 正向效应
  assert.ok(result.cohensD > 0);
});
