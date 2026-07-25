/**
 * ks_test regression tests (T-046 · 2026-07-24 第 3 轮).
 *
 * Verifies the two-sample KS implementation against hand-computed reference values:
 *   - identical samples → D=0, p=1
 *   - fully separated samples → D=1, small p
 *   - partial overlap → D matches hand-computed empirical-CDF gap
 *   - determinism (same input ⇒ same output)
 *   - fail-closed on empty / non-finite input
 *
 * Reference values computed by hand from the empirical-CDF definition (D = sup|F̂₁−F̂₂|);
 * p-value ranges validated against the asymptotic Kolmogorov distribution (Q_KS).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { kolmogorovSmirnovTwoSample } from '../../src/statistics/ks_test.ts';

test('KS: identical samples → D=0, pValue=1 (no distributional difference)', () => {
  const r = kolmogorovSmirnovTwoSample([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  assert.equal(r.statistic, 0);
  assert.equal(r.pValue, 1);
  assert.deepEqual(r.sampleSizes, [5, 5]);
});

test('KS: fully separated samples → D=1 (max CDF gap), small asymptotic p', () => {
  // [1..5] vs [6..10]: cdf1 reaches 1 while cdf2 still 0 ⇒ D=1
  const r = kolmogorovSmirnovTwoSample([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
  assert.equal(r.statistic, 1);
  // n1=n2=5, en≈1.581, λ≈1.77 ⇒ Q_KS ≈ 2·e^(-2λ²) ≈ 2·e^(-6.27) ≈ 0.0038
  assert.ok(r.pValue < 0.01, `expected small p for fully-separated samples, got ${r.pValue}`);
  assert.ok(r.pValue > 0, 'p must be positive');
});

test('KS: partial overlap → D=0.4 (hand-computed empirical-CDF gap)', () => {
  // [1,2,3,4,5] vs [3,4,5,6,7]: max gap |cdf1−cdf2| = 0.4 (at x∈{2..5})
  const r = kolmogorovSmirnovTwoSample([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
  assert.ok(Math.abs(r.statistic - 0.4) < 1e-12, `expected D=0.4, got ${r.statistic}`);
  // moderate separation, small samples ⇒ p in (0,1), not extreme
  assert.ok(r.pValue > 0 && r.pValue < 1, `expected 0<p<1, got ${r.pValue}`);
});

test('KS: larger samples — identical-shift gives D = fraction, p decreasing with n', () => {
  // [0..9] vs [1..10] — one-step shift; D should be 0.1 (the single-CDF-step gap)
  const a = Array.from({ length: 10 }, (_, k) => k);
  const b = a.map((x) => x + 1);
  const r = kolmogorovSmirnovTwoSample(a, b);
  assert.ok(Math.abs(r.statistic - 0.1) < 1e-12, `expected D=0.1, got ${r.statistic}`);
  assert.ok(r.pValue > 0 && r.pValue < 1);
});

test('KS: determinism — same input ⇒ identical output across repeated calls', () => {
  const s1 = [1.1, 2.2, 3.3, 4.4, 5.5, 6.6];
  const s2 = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
  const r1 = kolmogorovSmirnovTwoSample(s1, s2);
  const r2 = kolmogorovSmirnovTwoSample(s1, s2);
  assert.equal(r1.statistic, r2.statistic);
  assert.equal(r1.pValue, r2.pValue);
  assert.equal(r1.effectiveN, r2.effectiveN);
});

test('KS: ties handled correctly (no D inflation from repeated values)', () => {
  // many ties within each sample; D should reflect genuine CDF gap, not tie count
  const r = kolmogorovSmirnovTwoSample([1, 1, 1, 2, 2], [2, 2, 3, 3, 3]);
  // sample1 cdf: at x<1:0, x∈[1,2):3/5=0.6, x≥2:1. sample2: x<2:0, x∈[2,3):2/5=0.4, x≥3:1
  // gaps: at x=1: |0.6−0|=0.6; at x=2: |1−0.4|=0.6; max D=0.6
  assert.ok(Math.abs(r.statistic - 0.6) < 1e-12, `expected D=0.6 with ties, got ${r.statistic}`);
});

test('KS: single-element samples allowed (D ∈ {0,1})', () => {
  // [5] vs [5]: identical ⇒ D=0, p=1
  assert.equal(kolmogorovSmirnovTwoSample([5], [5]).statistic, 0);
  // [5] vs [6]: separated ⇒ D=1
  assert.equal(kolmogorovSmirnovTwoSample([5], [6]).statistic, 1);
});

test('KS: fail-closed on empty sample', () => {
  assert.throws(() => kolmogorovSmirnovTwoSample([], [1, 2, 3]), /sample1: expected at least 1/);
  assert.throws(() => kolmogorovSmirnovTwoSample([1, 2, 3], []), /sample2: expected at least 1/);
});

test('KS: fail-closed on non-finite values (NaN / Infinity)', () => {
  assert.throws(() => kolmogorovSmirnovTwoSample([1, NaN, 3], [1, 2, 3]), /finite number/);
  assert.throws(
    () => kolmogorovSmirnovTwoSample([1, 2, 3], [1, Number.POSITIVE_INFINITY, 3]),
    /finite number/,
  );
});

test('KS: statistic always in [0,1], pValue always in [0,1] (boundary integrity)', () => {
  const cases: Array<[number[], number[]]> = [
    [[1, 2, 3], [4, 5, 6]],
    [[1, 1, 1], [1, 1, 1]],
    [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]],
    [[10], [10]],
    [[0], [100]],
  ];
  for (const [s1, s2] of cases) {
    const r = kolmogorovSmirnovTwoSample(s1, s2);
    assert.ok(r.statistic >= 0 && r.statistic <= 1, `D out of [0,1]: ${r.statistic}`);
    assert.ok(r.pValue >= 0 && r.pValue <= 1, `p out of [0,1]: ${r.pValue}`);
  }
});
