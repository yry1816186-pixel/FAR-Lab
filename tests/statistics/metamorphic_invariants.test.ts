/**
 * KERNEL-NUMERIC-001 metamorphic relations.
 *
 * These tests do not claim universal numerical correctness. They pin relations
 * that must hold when inputs are reordered or transformed without changing the
 * statistical question. Reference vectors and sensitivity tests remain
 * independent evidence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleMean,
  sampleVariance,
  twoSampleEffectSize,
} from '../../src/statistics/effect_size.ts';
import {
  oneSampleTTest,
  twoSampleWelchTTest,
} from '../../src/statistics/t_distribution.ts';
import { kolmogorovSmirnovTwoSample } from '../../src/statistics/ks_test.ts';
import {
  createMulberry32,
  permutationTestMeanDifference,
} from '../../src/statistics/permutation_test.ts';

const RELATIVE_TOLERANCE = 1e-12;

function assertClose(actual: number, expected: number, label: string): void {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale,
    `${label}: expected ${actual} ≈ ${expected}`,
  );
}

function exactExtremeCountForIntegerSamples(
  first: readonly number[],
  second: readonly number[],
  seed: number,
  iterations: number,
): number {
  const n1 = first.length;
  const n2 = second.length;
  const permutationGroupSize = Math.min(n1, n2);
  // Production canonicalizes exact supplied values so a fixed seed denotes the
  // same allocation stream for the same multisets, independent of row order.
  const pool = [...first, ...second].sort((left, right) => left - right);
  const observedSigned = first.reduce((sum, value) => sum + BigInt(value), 0n) * BigInt(n2)
    - second.reduce((sum, value) => sum + BigInt(value), 0n) * BigInt(n1);
  const observedNumerator = observedSigned < 0n ? -observedSigned : observedSigned;
  const rng = createMulberry32(seed);
  let extremeCount = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      // Independent BigInt formulation of equal-width uint32 rejection buckets.
      // Do not call production drawUniformIndex: this is the arithmetic oracle.
      const width = 1n << 32n;
      const bound = BigInt(i + 1);
      const bucketWidth = width / bound;
      const acceptanceLimit = bucketWidth * bound;
      let sample = BigInt(rng());
      while (sample >= acceptanceLimit) sample = BigInt(rng());
      const j = Number(sample / bucketWidth);
      const temporary = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = temporary;
    }
    let firstSum = 0n;
    let secondSum = 0n;
    for (let i = 0; i < permutationGroupSize; i += 1) firstSum += BigInt(pool[i]!);
    for (let i = permutationGroupSize; i < pool.length; i += 1) secondSum += BigInt(pool[i]!);
    const signed = firstSum * BigInt(pool.length - permutationGroupSize)
      - secondSum * BigInt(permutationGroupSize);
    const numerator = signed < 0n ? -signed : signed;
    if (numerator >= observedNumerator) {
      extremeCount += 1;
    }
  }
  return extremeCount;
}

test('descriptive statistics: permutation and translation preserve their defining relations', () => {
  const sample = [1.25, -2, 4.5, 8.25, 0.5];
  const permuted = [4.5, 0.5, 1.25, 8.25, -2];
  const translated = sample.map((value) => value + 37);
  const scaled = sample.map((value) => value * -3);

  assertClose(sampleMean(permuted), sampleMean(sample), 'mean permutation invariance');
  assertClose(sampleVariance(permuted), sampleVariance(sample), 'variance permutation invariance');
  assertClose(sampleMean(translated), sampleMean(sample) + 37, 'mean translation equivariance');
  assertClose(sampleVariance(translated), sampleVariance(sample), 'variance translation invariance');
  assertClose(sampleVariance(scaled), sampleVariance(sample) * 9, 'variance scale equivariance');
});

test('seeded permutation comparison exposes the supplied-double boundary after decimal translation', () => {
  const first = [-29.8, -10, 25.1, 65.1];
  const second = [-20.5, 64.7, -55.2, 15.8];
  const options = { seed: 2618297466, iterations: 300 };
  const baseline = permutationTestMeanDifference(first, second, options);
  const translated = permutationTestMeanDifference(
    first.map((value) => value + 500),
    second.map((value) => value + 500),
    options,
  );
  const exactTenthsCount = exactExtremeCountForIntegerSamples(
    [-298, -100, 251, 651],
    [-205, 647, -552, 158],
    options.seed,
    options.iterations,
  );

  assert.equal(baseline.extremeCount, exactTenthsCount);
  assert.equal(exactTenthsCount, 226);
  // Adding 500 rounds several inputs to different IEEE-754 dyadic values. An
  // independent Python Fraction(float.as_integer_ratio()) oracle gives 216 for
  // those actually supplied translated doubles, so production must not widen ten
  // genuinely smaller draws into ties merely to manufacture translation equality.
  assert.equal(translated.extremeCount, 216);
  assert.notEqual(translated.pValue, baseline.pValue);
  assertClose(translated.observedStatistic, baseline.observedStatistic, 'reported mean-difference shift');
});

test('seeded two-sided permutation trace is invariant to row order and sample labels', () => {
  // Red-team counterexample: the former Fisher–Yates chain started from caller
  // order, so reversing these rows changed p=.0515 to p=.0469 at the same seed.
  // The exhaustive two-sided result is 6/126; Monte Carlo noise is acceptable,
  // but arbitrary presentation order must not choose which side of 0.05 it lands on.
  const first = [0.75, 1.25, 5.02, 7.57];
  const second = [-7.52, 3.21, -6.92, -3.47, -1.92];
  const options = { seed: 1 };
  const baseline = permutationTestMeanDifference(first, second, options);
  const reordered = permutationTestMeanDifference(
    [...first].reverse(),
    [...second].reverse(),
    options,
  );
  const labelsExchanged = permutationTestMeanDifference(second, first, options);

  assert.deepEqual(reordered, baseline);
  assert.equal(labelsExchanged.extremeCount, baseline.extremeCount);
  assert.equal(labelsExchanged.pValue, baseline.pValue);
  assert.equal(labelsExchanged.observedStatistic, -baseline.observedStatistic);
});

test('permutation exact statistic is row-order invariant at catastrophic-cancellation scale', () => {
  const maximum = Number.MAX_VALUE;
  const first = [maximum, maximum, -maximum];
  const second = [maximum, 0, 1];
  const options = { seed: 0, iterations: 1 };
  const baseline = permutationTestMeanDifference(first, second, options);

  for (const [firstOrder, secondOrder] of [
    [[maximum, -maximum, maximum], [0, 1, maximum]],
    [[-maximum, maximum, maximum], [1, maximum, 0]],
    [[maximum, maximum, -maximum], [maximum, 1, 0]],
  ] as const) {
    assert.deepEqual(
      permutationTestMeanDifference(firstOrder, secondOrder, options),
      baseline,
    );
  }

  const exchanged = permutationTestMeanDifference(second, first, options);
  assert.equal(baseline.observedStatistic, -1 / 3);
  assert.equal(exchanged.observedStatistic, 1 / 3);
  assert.equal(exchanged.extremeCount, baseline.extremeCount);
  assert.equal(exchanged.pValue, baseline.pValue);
});

test('one-sample t: common translation and positive rescaling preserve statistic and p-value', () => {
  const sample = [2.1, 2.8, 3.4, 4.2, 5.5, 6.1];
  const baseline = oneSampleTTest(sample, 3, 'two_sided');
  const translated = oneSampleTTest(sample.map((value) => value + 100), 103, 'two_sided');
  const scaled = oneSampleTTest(sample.map((value) => value * 4), 12, 'two_sided');

  assertClose(translated.statistic, baseline.statistic, 'translation statistic');
  assertClose(translated.pValue, baseline.pValue, 'translation p-value');
  assertClose(scaled.statistic, baseline.statistic, 'positive-scale statistic');
  assertClose(scaled.pValue, baseline.pValue, 'positive-scale p-value');
  assertClose(scaled.standardError, baseline.standardError * 4, 'standard-error scale');
});

test('Welch t and standardized effects: swapping groups flips direction but not two-sided strength', () => {
  const left = [1.2, 2.4, 2.9, 4.8, 7.1];
  const right = [0.5, 1.7, 3.8, 5.2];
  const forward = twoSampleWelchTTest(left, right, 'two_sided');
  const reversed = twoSampleWelchTTest(right, left, 'two_sided');
  const effectForward = twoSampleEffectSize(left, right);
  const effectReversed = twoSampleEffectSize(right, left);

  assertClose(reversed.statistic, -forward.statistic, 'Welch statistic antisymmetry');
  assertClose(reversed.pValue, forward.pValue, 'Welch two-sided p-value symmetry');
  assertClose(reversed.standardError, forward.standardError, 'Welch standard-error symmetry');
  assertClose(effectReversed.cohensD, -effectForward.cohensD, "Cohen's d antisymmetry");
  assertClose(effectReversed.hedgesG, -effectForward.hedgesG, "Hedges' g antisymmetry");
});

test('KS: input order and a strictly increasing affine transform leave D and p unchanged', () => {
  const first = [1, 2, 2, 5, 8, 13, 21, 34];
  const second = [1, 1, 3, 5, 7, 11, 18, 29];
  const baseline = kolmogorovSmirnovTwoSample(first, second);
  const transformed = kolmogorovSmirnovTwoSample(
    [...first].reverse().map((value) => value * 2 + 7),
    [5, 18, 1, 29, 7, 3, 11, 1].map((value) => value * 2 + 7),
  );

  assert.equal(transformed.statistic, baseline.statistic, 'empirical-CDF gap is rank based');
  assert.equal(transformed.pValue, baseline.pValue, 'KS p-value depends only on D and sample sizes');
  assert.deepEqual(transformed.sampleSizes, baseline.sampleSizes);
});

test('seeded permutation test: common translation preserves observed result and replay trace', () => {
  const first = [0.1, 1.2, 7, 11];
  const second = [2, 3.3, 4];
  const options = { seed: 20260817, iterations: 2_000 };
  const baseline = permutationTestMeanDifference(first, second, options);
  const translated = permutationTestMeanDifference(
    first.map((value) => value + 500),
    second.map((value) => value + 500),
    options,
  );
  const translatedReplay = permutationTestMeanDifference(
    first.map((value) => value + 500),
    second.map((value) => value + 500),
    options,
  );

  assertClose(translated.observedStatistic, baseline.observedStatistic, 'permutation observed shift');
  assert.equal(
    baseline.extremeCount,
    exactExtremeCountForIntegerSamples([1, 12, 70, 110], [20, 33, 40], options.seed, options.iterations),
    'floating implementation agrees with an independent exact tenths-integer oracle',
  );
  assert.equal(translated.extremeCount, baseline.extremeCount, 'same seeded null draws stay extreme');
  assert.equal(translated.pValue, baseline.pValue, 'same seeded p-value');
  assert.deepEqual(translatedReplay, translated, 'translated path remains bit-for-bit deterministic');
});
