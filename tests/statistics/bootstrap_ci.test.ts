/**
 * bootstrap_ci regression tests (T-006/T-044 · 2026-07-24 第 3 轮 CP-9).
 *
 * Verifies the percentile bootstrap CI for the sample mean:
 *   - CI bounds bracket the point estimate (lower ≤ estimate ≤ upper)
 *   - CI width scales sensibly (wider CI for smaller samples, all else equal)
 *   - CI width shrinks as sample size grows (LLN / CLT behaviour)
 *   - 95% CI for a normal-looking sample ≈ analytical t-CI (sanity comparison, not exact match)
 *   - determinism (same seed ⇒ identical output)
 *   - confidence level affects width (90% narrower than 99%)
 *   - fail-closed on empty / single-element / non-finite / invalid options
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { bootstrapMeanPercentileCi } from '../../src/statistics/bootstrap_ci.ts';

// ===== CI brackets the point estimate =====

test('bootstrap: CI brackets the sample mean (lower ≤ estimate ≤ upper)', () => {
  const r = bootstrapMeanPercentileCi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { seed: 42 });
  // estimate = 5.5
  assert.equal(r.estimate, 5.5);
  assert.ok(r.lower <= r.estimate, `lower ${r.lower} must be ≤ estimate ${r.estimate}`);
  assert.ok(r.upper >= r.estimate, `upper ${r.upper} must be ≥ estimate ${r.estimate}`);
  assert.ok(r.lower < r.upper, 'CI must have nonzero width');
});

// ===== CI width shrinks as sample size grows (CLT behaviour) =====

test('bootstrap: CI width shrinks as sample size grows (same underlying distribution)', () => {
  // Identical underlying distribution (uniform 0..10), but different sample sizes.
  // Larger n → tighter CI (standard error ~ σ/√n).
  const small = bootstrapMeanPercentileCi([2, 4, 6, 8], { seed: 1, iterations: 5000 });
  const large = bootstrapMeanPercentileCi(
    Array.from({ length: 200 }, (_, i) => (i * 17) % 10), // pseudo-uniform 0..9
    { seed: 1, iterations: 5000 },
  );
  const smallWidth = small.upper - small.lower;
  const largeWidth = large.upper - large.lower;
  assert.ok(
    largeWidth < smallWidth,
    `expected larger-n CI narrower (large=${largeWidth}, small=${smallWidth})`,
  );
});

// ===== determinism =====

test('bootstrap: determinism — same seed ⇒ identical CI bounds', () => {
  const sample = [1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8];
  const r1 = bootstrapMeanPercentileCi(sample, { seed: 99, iterations: 2000 });
  const r2 = bootstrapMeanPercentileCi(sample, { seed: 99, iterations: 2000 });
  assert.equal(r1.lower, r2.lower);
  assert.equal(r1.upper, r2.upper);
  assert.equal(r1.estimate, r2.estimate);
});

test('bootstrap: different seeds → slightly different bounds (Monte Carlo noise)', () => {
  const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const bounds = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = bootstrapMeanPercentileCi(sample, { seed, iterations: 500 });
    bounds.add(`${r.lower.toFixed(4)}-${r.upper.toFixed(4)}`);
  }
  assert.ok(bounds.size >= 2, 'different seeds should produce at least 2 distinct CI bound pairs');
});

// ===== confidence level affects width =====

test('bootstrap: 90% CI is narrower than 99% CI (same sample + seed)', () => {
  const sample = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
  const ci90 = bootstrapMeanPercentileCi(sample, { seed: 7, iterations: 5000, confidenceLevel: 0.90 });
  const ci99 = bootstrapMeanPercentileCi(sample, { seed: 7, iterations: 5000, confidenceLevel: 0.99 });
  const w90 = ci90.upper - ci90.lower;
  const w99 = ci99.upper - ci99.lower;
  assert.ok(w99 > w90, `99% CI (${w99}) should be wider than 90% CI (${w90})`);
});

test('bootstrap: confidenceLevel is echoed back in result', () => {
  const r = bootstrapMeanPercentileCi([1, 2, 3, 4, 5], { seed: 1, confidenceLevel: 0.80 });
  assert.equal(r.confidenceLevel, 0.80);
});

// ===== default iterations + default confidenceLevel =====

test('bootstrap: defaults applied (iterations=9999, confidenceLevel=0.95)', () => {
  const r = bootstrapMeanPercentileCi([1, 2, 3, 4, 5], { seed: 42 });
  assert.equal(r.iterations, 9999);
  assert.equal(r.confidenceLevel, 0.95);
});

// ===== sanity: bootstrap mean CI ≈ analytical normal CI for normal-ish data =====

test('bootstrap: 95% CI for moderate sample ≈ analytical normal-approximation CI (±20%)', () => {
  // For a reasonably-sized sample from a non-pathological distribution, the bootstrap percentile
  // CI should be in the same ballpark as the analytical x̄ ± z·(s/√n) CI.
  // Sample: 20 observations mean=50.5, sd≈14.5
  const sample = [
    30, 35, 40, 42, 45, 48, 50, 52, 55, 58,
    60, 62, 65, 68, 70, 72, 75, 78, 80, 85,
  ];
  const n = sample.length;
  const xBar = sample.reduce((a, b) => a + b, 0) / n;
  const variance = sample.reduce((s, x) => s + (x - xBar) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  // z_0.975 ≈ 1.96
  const analyticalLower = xBar - 1.96 * se;
  const analyticalUpper = xBar + 1.96 * se;
  const analyticalWidth = analyticalUpper - analyticalLower;

  const boot = bootstrapMeanPercentileCi(sample, { seed: 42, iterations: 9999 });
  const bootWidth = boot.upper - boot.lower;
  // Bootstrap width within 20% of analytical (Monte Carlo + percentile-method error budget)
  const ratio = bootWidth / analyticalWidth;
  assert.ok(
    ratio > 0.80 && ratio < 1.20,
    `bootstrap width ${bootWidth} should be within 20% of analytical ${analyticalWidth} (ratio=${ratio.toFixed(3)})`,
  );
  // Bootstrap bounds should also be close to analytical
  assert.ok(
    Math.abs(boot.lower - analyticalLower) < 0.30 * analyticalWidth,
    `bootstrap lower ${boot.lower} vs analytical ${analyticalLower}`,
  );
  assert.ok(
    Math.abs(boot.upper - analyticalUpper) < 0.30 * analyticalWidth,
    `bootstrap upper ${boot.upper} vs analytical ${analyticalUpper}`,
  );
});

// ===== symmetric sample → symmetric CI =====

test('bootstrap: symmetric sample → CI roughly symmetric around estimate', () => {
  // Symmetric sample around 5: {0,1,2,3,4,5,6,7,8,9,10} → mean=5
  const sample = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const r = bootstrapMeanPercentileCi(sample, { seed: 123, iterations: 5000 });
  assert.ok(Math.abs(r.estimate - 5) < 1e-12);
  const lowerGap = r.estimate - r.lower;
  const upperGap = r.upper - r.estimate;
  // Symmetric distribution ⇒ lower gap ≈ upper gap (within 25% — bootstrap noise)
  const ratio = lowerGap / upperGap;
  assert.ok(
    ratio > 0.75 && ratio < 1.33,
    `expected roughly symmetric CI (lower gap=${lowerGap}, upper gap=${upperGap}, ratio=${ratio.toFixed(3)})`,
  );
});

// ===== fail-closed on invalid input =====

test('bootstrap: fail-closed on empty sample', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([], { seed: 1 }),
    /expected at least 1 observation/,
  );
});

test('bootstrap: fail-closed on single-element sample (CI meaningless)', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([5], { seed: 1 }),
    /must contain at least 2 observations/,
  );
});

test('bootstrap: fail-closed on non-finite value', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([1, NaN, 3], { seed: 1 }),
    /expected a finite number, got NaN/,
  );
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, Infinity], { seed: 1 }),
    /expected a finite number, got Infinity/,
  );
});

test('bootstrap: fail-closed on non-integer seed', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1.5 }),
    /options\.seed must be a safe integer/,
  );
});

test('bootstrap: fail-closed on iterations < 2 (need ≥2 points for a percentile)', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1, iterations: 1 }),
    /options\.iterations must be a safe integer ≥ 2/,
  );
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1, iterations: 0 }),
    /options\.iterations must be a safe integer ≥ 2/,
  );
});

test('bootstrap: fail-closed on confidenceLevel outside (0,1)', () => {
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1, confidenceLevel: 0 }),
    /options\.confidenceLevel must be in \(0, 1\)/,
  );
  assert.throws(
    () => bootstrapMeanPercentileCi([1, 2, 3], { seed: 1, confidenceLevel: 1.5 }),
    /options\.confidenceLevel must be in \(0, 1\)/,
  );
});

// ===== extreme samples (negative + mixed signs) =====

test('bootstrap: negative-valued sample → CI works correctly', () => {
  const sample = [-10, -8, -6, -4, -2, 0, 2, 4];
  const r = bootstrapMeanPercentileCi(sample, { seed: 11, iterations: 2000 });
  assert.equal(r.estimate, -3);
  assert.ok(r.lower <= r.estimate);
  assert.ok(r.upper >= r.estimate);
});
