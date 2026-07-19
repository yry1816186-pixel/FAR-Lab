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
