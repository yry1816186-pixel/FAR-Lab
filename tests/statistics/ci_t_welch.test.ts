// tests/statistics/ci_t_welch.test.ts
// Tests for the t-based and Welch-based confidence intervals (K8 fix).
//
// Why this file exists: meanConfidenceInterval / differenceInMeansConfidenceInterval
// both used the normal z-approximation, which produces systematically too-narrow
// intervals for small samples (the typical psychology / clinical case). The new
// t-based functions (meanConfidenceIntervalT, differenceInMeansConfidenceIntervalWelch)
// use the exact t-distribution and are strictly wider for small n.
//
// Verification strategy:
//   1. t-CI is strictly wider than z-CI for small n (the correctness motivation)
//   2. t-CI matches a hand-computed value using studentTQuantile directly
//   3. t-CI converges to z-CI as n → ∞ (large-sample equivalence)
//   4. Welch CI matches the Welch t-test df (CI/p-value distributional consistency)
//   5. fail-closed input validation
//   6. estimate bracketing + standardError invariants

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  meanConfidenceInterval,
  meanConfidenceIntervalT,
  differenceInMeansConfidenceInterval,
  differenceInMeansConfidenceIntervalWelch,
} from '../../src/statistics/ci.ts';
import { studentTQuantile } from '../../src/statistics/t_distribution.ts';
import { normalQuantile } from '../../src/statistics/p_value.ts';
import { sampleMean, sampleStandardDeviation } from '../../src/statistics/effect_size.ts';

describe('meanConfidenceIntervalT: t-CI is wider than z-CI for small n', () => {
  // Small-sample case (n=5): t(4) 0.975 critical = 2.7764 vs z 0.975 = 1.96.
  // The t-CI must be strictly wider — this is the entire reason for the K8 fix.
  const smallSample = [1.2, 2.3, 1.8, 2.9, 2.1];

  it('t-CI half-width > z-CI half-width for n=5', () => {
    const zCI = meanConfidenceInterval(smallSample, 0.95);
    const tCI = meanConfidenceIntervalT(smallSample, 0.95);
    const zHalf = (zCI.upper - zCI.lower) / 2;
    const tHalf = (tCI.upper - tCI.lower) / 2;
    assert.ok(
      tHalf > zHalf,
      `t-CI half-width (${tHalf}) must exceed z-CI half-width (${zHalf}) for n=5`,
    );
    // Quantitative: ratio should be t_{0.975,4} / z_{0.975} = 2.7764 / 1.9600 ≈ 1.4167
    const ratio = tHalf / zHalf;
    assert.ok(
      Math.abs(ratio - 2.7764382987 / 1.959963985) < 1e-3,
      `ratio ${ratio} should match t_crit/z_crit`,
    );
  });

  it('both CIs share the same estimate and standardError (only the critical value differs)', () => {
    const zCI = meanConfidenceInterval(smallSample, 0.95);
    const tCI = meanConfidenceIntervalT(smallSample, 0.95);
    assert.equal(zCI.estimate, tCI.estimate);
    assert.equal(zCI.standardError, tCI.standardError);
    assert.equal(zCI.confidenceLevel, tCI.confidenceLevel);
  });

  it('t-CI brackets the estimate (lower < est < upper)', () => {
    const tCI = meanConfidenceIntervalT(smallSample, 0.95);
    assert.ok(tCI.lower < tCI.estimate && tCI.estimate < tCI.upper);
  });

  it('matches a hand-computed value using studentTQuantile(df=4) directly', () => {
    const n = smallSample.length;
    const mean = sampleMean(smallSample);
    const se = sampleStandardDeviation(smallSample) / Math.sqrt(n);
    const tCrit = studentTQuantile(0.975, n - 1);
    const expectedLower = mean - tCrit * se;
    const expectedUpper = mean + tCrit * se;
    const tCI = meanConfidenceIntervalT(smallSample, 0.95);
    assert.ok(Math.abs(tCI.lower - expectedLower) < 1e-9);
    assert.ok(Math.abs(tCI.upper - expectedUpper) < 1e-9);
  });

  it('converges to z-CI as n grows large (df → ∞)', () => {
    // With n=2000 the t and z intervals should agree to ~1e-3 relative.
    const large = Array.from({ length: 2000 }, (_, i) => 1 + 0.01 * Math.sin(i));
    const zCI = meanConfidenceInterval(large, 0.95);
    const tCI = meanConfidenceIntervalT(large, 0.95);
    const zHalf = (zCI.upper - zCI.lower) / 2;
    const tHalf = (tCI.upper - tCI.lower) / 2;
    assert.ok(
      Math.abs(tHalf - zHalf) / zHalf < 1e-3,
      `large-n: t-CI should match z-CI, got t=${tHalf} z=${zHalf}`,
    );
  });
});

describe('differenceInMeansConfidenceIntervalWelch: wider than z for small samples', () => {
  // Two small samples with unequal sizes / variances (triggers fractional Welch df).
  const left = [10.1, 10.4, 9.8, 10.2, 10.5];
  const right = [12.3, 12.0, 12.5, 11.8];

  it('Welch CI half-width > z-CI half-width for small n1, n2', () => {
    const zCI = differenceInMeansConfidenceInterval(left, right, 0.95);
    const wCI = differenceInMeansConfidenceIntervalWelch(left, right, 0.95);
    const zHalf = (zCI.upper - zCI.lower) / 2;
    const wHalf = (wCI.upper - wCI.lower) / 2;
    assert.ok(
      wHalf > zHalf,
      `Welch half-width (${wHalf}) must exceed z half-width (${zHalf}) for small samples`,
    );
  });

  it('both share the same estimate and standardError (only critical value differs)', () => {
    const zCI = differenceInMeansConfidenceInterval(left, right, 0.95);
    const wCI = differenceInMeansConfidenceIntervalWelch(left, right, 0.95);
    assert.equal(zCI.estimate, wCI.estimate);
    assert.equal(zCI.standardError, wCI.standardError);
  });

  it('Welch CI brackets the estimate', () => {
    const wCI = differenceInMeansConfidenceIntervalWelch(left, right, 0.95);
    assert.ok(wCI.lower < wCI.estimate && wCI.estimate < wCI.upper);
  });

  it('matches hand-computed Welch df and t-critical value', () => {
    const n1 = left.length;
    const n2 = right.length;
    const v1 = sampleStandardDeviation(left) ** 2;
    const v2 = sampleStandardDeviation(right) ** 2;
    const term1 = v1 / n1;
    const term2 = v2 / n2;
    const welchDf = (term1 + term2) ** 2 / (term1 ** 2 / (n1 - 1) + term2 ** 2 / (n2 - 1));
    const tCrit = studentTQuantile(0.975, welchDf);
    const se = Math.sqrt(term1 + term2);
    const est = sampleMean(left) - sampleMean(right);

    const wCI = differenceInMeansConfidenceIntervalWelch(left, right, 0.95);
    assert.ok(Math.abs(wCI.lower - (est - tCrit * se)) < 1e-9);
    assert.ok(Math.abs(wCI.upper - (est + tCrit * se)) < 1e-9);
  });

  it('Welch critical value is strictly greater than the z critical value (heavier t tails)', () => {
    // Indirect but precise: the t/Welch CI margin = t_crit * se; the z CI margin = z_crit * se.
    // Since both share se, ratio of half-widths = ratio of critical values.
    const zCI = differenceInMeansConfidenceInterval(left, right, 0.95);
    const wCI = differenceInMeansConfidenceIntervalWelch(left, right, 0.95);
    const zCrit = (zCI.upper - zCI.lower) / 2 / zCI.standardError;
    const wCrit = (wCI.upper - wCI.lower) / 2 / wCI.standardError;
    assert.ok(wCrit > zCrit, `Welch crit (${wCrit}) must exceed z crit (${zCrit})`);
    // And the z critical value must match normalQuantile(0.975).
    assert.ok(Math.abs(zCrit - normalQuantile(0.975)) < 1e-9);
  });
});

describe('meanConfidenceIntervalT / differenceInMeansConfidenceIntervalWelch: fail-closed', () => {
  it('rejects samples with fewer than 2 observations', () => {
    assert.throws(
      () => meanConfidenceIntervalT([1]),
      /meanConfidenceIntervalT: sample must contain at least two observations/,
    );
    assert.throws(
      () => meanConfidenceIntervalT([]),
      /meanConfidenceIntervalT: sample must contain at least two observations/,
    );
    assert.throws(
      () => differenceInMeansConfidenceIntervalWelch([1], [1, 2, 3]),
      /differenceInMeansConfidenceIntervalWelch: both samples need at least two observations/,
    );
    assert.throws(
      () => differenceInMeansConfidenceIntervalWelch([1, 2], [3]),
      /differenceInMeansConfidenceIntervalWelch: both samples need at least two observations/,
    );
  });

  it('rejects confidenceLevel outside (0, 1)', () => {
    assert.throws(
      () => meanConfidenceIntervalT([1, 2, 3], 0),
      /confidenceLevel: expected a value strictly between 0 and 1/,
    );
    assert.throws(
      () => meanConfidenceIntervalT([1, 2, 3], 1.5),
      /confidenceLevel: expected a value strictly between 0 and 1/,
    );
    assert.throws(
      () => differenceInMeansConfidenceIntervalWelch([1, 2], [3, 4], -0.1),
      /confidenceLevel: expected a value strictly between 0 and 1/,
    );
    assert.throws(
      () => differenceInMeansConfidenceIntervalWelch([1, 2], [3, 4], Number.NaN),
      /confidenceLevel: expected a finite number/,
    );
  });
});
