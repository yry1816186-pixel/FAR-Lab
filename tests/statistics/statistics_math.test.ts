import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adjustPValues,
  cohensDOneSample,
  meanConfidenceInterval,
  oneSampleZTest,
  sampleMean,
  sampleVariance,
  twoSampleEffectSize,
  twoSampleWelchZTest,
  wilsonScoreInterval,
  zTestPValue,
} from '../../src/statistics/index.ts';

const TOLERANCE = 1e-6;

function assertClose(actual: number, expected: number, tolerance = TOLERANCE): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('p-value utilities compute normal-tail probabilities from statistics', () => {
  assertClose(zTestPValue(1.959963984540054, 'two_sided'), 0.05, 3e-5);

  const result = oneSampleZTest([10, 12, 11, 13], 10, 2, 'greater');
  assertClose(result.statistic, 1.5);
  assertClose(result.standardError, 1);
  assertClose(result.pValue, 0.06680723, 2e-6);
});

test('effect-size utilities compute sample variance and standardized effects', () => {
  const sample = [2, 4, 4, 4, 5, 5, 7, 9] as const;
  assertClose(sampleMean(sample), 5);
  assertClose(sampleVariance(sample), 32 / 7);
  assertClose(cohensDOneSample(sample, 5), 0);

  const effect = twoSampleEffectSize([4, 5, 6, 7], [1, 2, 3, 4]);
  assertClose(effect.differenceInMeans, 3);
  assertClose(effect.pooledStandardDeviation, Math.sqrt(5 / 3));
  assertClose(effect.cohensD, 3 / Math.sqrt(5 / 3));
  assert.ok(effect.hedgesG < effect.cohensD);
});

test('confidence intervals are estimated from sample standard errors', () => {
  const interval = meanConfidenceInterval([10, 12, 14, 16], 0.95);
  assertClose(interval.estimate, 13);
  assertClose(interval.standardError, Math.sqrt(20 / 3) / 2);
  assertClose(interval.lower, 10.469697, 2e-5);
  assertClose(interval.upper, 15.530303, 2e-5);

  const wilson = wilsonScoreInterval(8, 10, 0.95);
  assert.equal(wilson.estimate, 0.8);
  assert.ok(wilson.lower < 0.8 && wilson.upper > 0.8);
  assert.ok(wilson.lower >= 0 && wilson.upper <= 1);
});

test('multiple-testing corrections preserve original order with monotonic adjusted p-values', () => {
  const bonferroni = adjustPValues([0.01, 0.04, 0.03], 'bonferroni', 0.05);
  assert.deepEqual(
    bonferroni.map((entry) => entry.adjustedPValue),
    [0.03, 0.12, 0.09],
  );

  const holm = adjustPValues([0.01, 0.04, 0.03], 'holm', 0.05);
  assert.deepEqual(
    holm.map((entry) => entry.adjustedPValue),
    [0.03, 0.06, 0.06],
  );

  const bh = adjustPValues([0.01, 0.04, 0.03], 'bh_fdr', 0.05);
  assert.deepEqual(
    bh.map((entry) => entry.adjustedPValue),
    [0.03, 0.04, 0.04],
  );
  assert.deepEqual(
    bh.map((entry) => entry.rejected),
    [true, true, true],
  );
});

test('twoSampleWelchZTest: n<2 前置守卫 fail-closed + 清晰定位（哪个样本不足）', () => {
  // 回归：旧实现对 n<2 会深入 sampleStandardDeviation 抛泛化的 "values must contain at least 2 observations"，
  // 对 (left, right) 双样本调用者指代不明。修复为函数顶前置守卫，消息含函数名 + 哪个样本。
  assert.throws(
    () => twoSampleWelchZTest([1], [1, 2, 3]),
    /twoSampleWelchZTest: left sample must contain at least 2 observations/,
    'left n<2 → 清晰消息（含函数名 + left）',
  );
  assert.throws(
    () => twoSampleWelchZTest([1, 2, 3], [1]),
    /twoSampleWelchZTest: right sample must contain at least 2 observations/,
    'right n<2 → 清晰消息（含函数名 + right）',
  );
  assert.throws(
    () => twoSampleWelchZTest([], [1, 2]),
    /twoSampleWelchZTest: left sample must contain at least 2 observations/,
    'left 空 → 同一前置守卫',
  );
  // 正常 n>=2 路径仍工作（回归保护）
  const ok = twoSampleWelchZTest([1, 2, 3, 4], [2, 3, 4, 5]);
  assert.ok(Number.isFinite(ok.statistic), 'n>=2 正常路径仍返回有限 z 统计量');
  assert.ok(ok.pValue >= 0 && ok.pValue <= 1, 'pValue 在 [0,1]');
});
