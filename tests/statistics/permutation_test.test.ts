/**
 * permutation_test regression tests (T-006/T-044 · 2026-07-24 第 3 轮 CP-9).
 *
 * Verifies the two-sample permutation mean-difference test:
 *   - identical samples → T_obs=0, p=1 (no difference detectable)
 *   - fully separated samples → large |T_obs|, p ≈ 1/(iterations+1) (min possible p)
 *   - determinism (same seed + same input ⇒ identical output bit-for-bit)
 *   - different seeds ⇒ different extremeCount (Monte Carlo noise is seed-dependent)
 *   - pValue bounds (0 < p ≤ 1) + Phipson–Smyth +1 correction
 *   - mulberry32 RNG determinism + uint32 output range
 *   - fail-closed on empty / non-finite / invalid seed / invalid iterations
 *
 * Reference values: identical/symmetric cases are hand-derived; the Monte Carlo extremeCount
 * is asserted against determinism (same seed) rather than a fixed expected count.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  permutationTestMeanDifference,
  createMulberry32,
} from '../../src/statistics/permutation_test.ts';

// ===== identical samples: T_obs=0, every permuted |T_k|=0, p = 1 =====

test('permutation: identical samples → observedStatistic=0, pValue=1', () => {
  const r = permutationTestMeanDifference([1, 2, 3], [1, 2, 3], { seed: 42, iterations: 500 });
  assert.equal(r.observedStatistic, 0);
  // All permutations of identical samples give T_k=0, so |T_k|≥|T_obs|=0 always → extremeCount=500.
  // p = (500+1)/(500+1) = 1
  assert.equal(r.extremeCount, 500);
  assert.equal(r.pValue, 1);
});

test('permutation: identical samples of different sizes → still T_obs=0, p=1', () => {
  const r = permutationTestMeanDifference([5, 5, 5], [5, 5], { seed: 1, iterations: 100 });
  assert.equal(r.observedStatistic, 0);
  assert.equal(r.pValue, 1);
});

// ===== fully separated samples: large |T_obs|, p = 1/(iterations+1) (minimum) =====

test('permutation: fully separated samples → small p (only 2 of C(6,3)=20 perms reproduce separation)', () => {
  // [0,0,0] vs [10,10,10]: pool = [0,0,0,10,10,10], n1=3, n2=3, total perms C(6,3)=20.
  // Only 2 perms reproduce |T_k|=10: {0,0,0}+{10,10,10} (original) and {10,10,10}+{0,0,0} (swap).
  // So exact enumeration p = 2/20 = 0.10. Monte Carlo 999 iters should land near 0.10.
  const r = permutationTestMeanDifference([0, 0, 0], [10, 10, 10], { seed: 7, iterations: 999 });
  // observedStatistic = mean(s1) − mean(s2) = 0 − 10 = −10
  assert.equal(r.observedStatistic, -10);
  // Expected p ≈ 0.10 (Monte Carlo: allow [0.04, 0.20] for seed noise)
  assert.ok(r.pValue >= 0.04 && r.pValue <= 0.20,
    `expected p ≈ 0.10 for 2-of-20 separation, got ${r.pValue}`);
  assert.ok(r.pValue > 0);
});

// ===== determinism (same seed + same input ⇒ identical output) =====

test('permutation: determinism — same seed ⇒ identical extremeCount/pValue', () => {
  const s1 = [1.2, 2.3, 3.4, 4.5, 5.6, 6.7];
  const s2 = [2.0, 3.1, 4.2, 5.3, 6.4, 7.5];
  const r1 = permutationTestMeanDifference(s1, s2, { seed: 12345, iterations: 2000 });
  const r2 = permutationTestMeanDifference(s1, s2, { seed: 12345, iterations: 2000 });
  assert.equal(r1.extremeCount, r2.extremeCount);
  assert.equal(r1.pValue, r2.pValue);
  assert.equal(r1.observedStatistic, r2.observedStatistic);
});

test('permutation: frozen end-to-end shuffle reference vector', () => {
  // Locks the private unbiased bounded-index mapping without widening the public API.
  assert.deepEqual(
    permutationTestMeanDifference(
      [0.5, 2, 7, 11],
      [1, 3.5, 4],
      { seed: 20260817, iterations: 37 },
    ),
    {
      observedStatistic: 2.2916666666666665,
      pValue: 21 / 38,
      iterations: 37,
      extremeCount: 20,
      seed: 20260817,
    },
  );
});

test('permutation: different seeds → Monte Carlo noise (extremeCount may differ across seeds)', () => {
  // Different seeds should produce *similar but not necessarily identical* extremeCounts
  // (Monte Carlo variance of order sqrt(iterations)). We assert that at least the outputs
  // are not all identical (which would indicate seed isn't being used).
  const s1 = [1, 2, 3, 4, 5, 6, 7, 8];
  const s2 = [2, 3, 4, 5, 6, 7, 8, 9];
  const counts = new Set<number>();
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = permutationTestMeanDifference(s1, s2, { seed, iterations: 500 });
    counts.add(r.extremeCount);
  }
  // At least two distinct extremeCounts across 5 seeds (noise is real; not all identical).
  assert.ok(counts.size >= 2, `expected seed-dependent Monte Carlo noise, got only ${counts.size} distinct count(s)`);
});

// ===== pValue bounds + Phipson–Smyth +1 correction =====

test('permutation: pValue ∈ (0, 1] always (Phipson–Smyth +1 correction guarantees p > 0)', () => {
  const cases: Array<{ s1: readonly number[]; s2: readonly number[] }> = [
    { s1: [1, 2, 3], s2: [4, 5, 6] },
    { s1: [1, 1, 1], s2: [1, 1, 1] },
    { s1: [10, 20, 30, 40, 50], s2: [15, 25, 35, 45, 55] },
    { s1: [-1, -2, -3], s2: [1, 2, 3] },
  ];
  for (const { s1, s2 } of cases) {
    const r = permutationTestMeanDifference(s1, s2, { seed: 99, iterations: 1000 });
    assert.ok(r.pValue > 0, `p must be > 0 (got ${r.pValue} for s1=${JSON.stringify(s1)}, s2=${JSON.stringify(s2)})`);
    assert.ok(r.pValue <= 1, `p must be ≤ 1 (got ${r.pValue})`);
  }
});

test('permutation: Phipson–Smyth +1 — pValue = (extremeCount+1)/(iterations+1)', () => {
  const r = permutationTestMeanDifference([1, 2, 3, 4, 5], [2, 3, 4, 5, 6], {
    seed: 42,
    iterations: 1000,
  });
  assert.ok(Math.abs(r.pValue - (r.extremeCount + 1) / (r.iterations + 1)) < 1e-12);
});

// ===== observedStatistic correctness =====

test('permutation: observedStatistic = mean(s1) − mean(s2)', () => {
  const r = permutationTestMeanDifference([1, 2, 3, 4], [10, 20, 30, 40], {
    seed: 3,
    iterations: 100,
  });
  // mean([1,2,3,4]) = 2.5; mean([10,20,30,40]) = 25; T_obs = 2.5 − 25 = −22.5
  assert.ok(Math.abs(r.observedStatistic - (-22.5)) < 1e-12);
});

test('permutation: observedStatistic correctly rounds the exact supplied-double mean difference', () => {
  const maximum = Number.MAX_VALUE;
  const result = permutationTestMeanDifference(
    [maximum, maximum, -maximum],
    [maximum, 0, 1],
    { seed: 0, iterations: 1 },
  );

  // Treating the supplied doubles as exact dyadic rationals gives
  // (MAX + MAX - MAX) / 3 - (MAX + 0 + 1) / 3 = -1/3.
  // A floating accumulation path instead loses the unit and can report either
  // zero or a huge spurious residual depending on row order.
  assert.equal(result.observedStatistic, -1 / 3);
});

test('permutation: a representably smaller near-boundary statistic is not widened into a tie', () => {
  // seed=14 puts [10, 8.999999999] in the first group for the sole permutation.
  // Its |T_k| is 4.9999999995, strictly below |T_obs|=5.0000000005 by 1e-9.
  // The exact dyadic implementation must retain strict >= semantics rather than
  // hiding a real ordering behind an arbitrary scale-wide epsilon.
  const result = permutationTestMeanDifference([10, 9], [8.999999999, 0], {
    seed: 14,
    iterations: 1,
  });
  assert.equal(result.extremeCount, 0);
  assert.equal(result.pValue, 0.5);
});

test('permutation: exact-double comparison does not promote ULP-near integer statistics to ties', () => {
  // Independent Python Fraction(float.as_integer_ratio()) oracle with the frozen
  // canonical unbiased shuffle stream gives 27 extreme draws. The former
  // raw-input ULP band widened genuinely smaller statistics into ties.
  const result = permutationTestMeanDifference(
    [9999999999999924, 9999999999999986, 9999999999999968, 9999999999999914],
    [10000000000000088, 10000000000000082, 9999999999999968, 9999999999999940],
    { seed: 2654435761, iterations: 100 },
  );
  assert.equal(result.extremeCount, 27);
  assert.equal(result.pValue, 28 / 101);
});

test('permutation: finite opposite-sign extremes remain valid under exact dyadic arithmetic', () => {
  const maximum = Number.MAX_VALUE;
  const result = permutationTestMeanDifference(
    [maximum, maximum],
    [maximum, -maximum],
    { seed: 9, iterations: 20 },
  );
  assert.equal(result.observedStatistic, maximum);
  assert.equal(Number.isNaN(result.pValue), false);
  assert.equal(result.pValue, 1);
});

test('permutation: unrepresentable observed mean difference fails closed with rescaling guidance', () => {
  const maximum = Number.MAX_VALUE;
  assert.throws(
    () => permutationTestMeanDifference(
      [maximum, maximum],
      [-maximum, -maximum],
      { seed: 1, iterations: 1 },
    ),
    (error: unknown) => error instanceof RangeError
      && /mean difference exceeds the finite IEEE-754 range; rescale inputs/.test(error.message),
  );
});

test('permutation: exact rounding at the finite-overflow boundary is fail-closed only at infinity', () => {
  const maximum = Number.MAX_VALUE;
  const belowHalfUlp = 2 ** 969;
  const halfUlp = 2 ** 970;

  // MAX + 2^969 is one quarter of the conceptual overflow ULP above MAX and
  // therefore rounds back to the largest finite binary64 value.
  assert.equal(
    permutationTestMeanDifference([maximum], [-belowHalfUlp], { seed: 0, iterations: 1 })
      .observedStatistic,
    maximum,
  );
  // MAX + 2^970 is exactly the overflow midpoint. MAX's significand is odd,
  // so ties-to-even selects infinity; the public finite-result contract rejects it.
  assert.throws(
    () => permutationTestMeanDifference([maximum], [-halfUlp], { seed: 0, iterations: 1 }),
    (error: unknown) => error instanceof RangeError
      && /mean difference exceeds the finite IEEE-754 range; rescale inputs/.test(error.message),
  );
});

test('permutation: unrepresentable permuted statistic fails closed instead of emitting a plausible p-value', () => {
  const maximum = Number.MAX_VALUE;
  assert.throws(
    () => permutationTestMeanDifference(
      [maximum, -maximum],
      [maximum, -maximum],
      { seed: 0, iterations: 1 },
    ),
    (error: unknown) => error instanceof RangeError
      && /mean difference exceeds the finite IEEE-754 range; rescale inputs/.test(error.message),
  );
});

test('permutation: zero is canonicalized to +0 and representable subnormals remain finite', () => {
  const zero = permutationTestMeanDifference([-0], [0], { seed: 4, iterations: 5 });
  assert.equal(zero.observedStatistic, 0);
  assert.equal(Object.is(zero.observedStatistic, -0), false);

  const tiny = Number.MIN_VALUE;
  const subnormal = permutationTestMeanDifference(
    [4 * tiny, 8 * tiny],
    [0, 4 * tiny],
    { seed: 4, iterations: 1 },
  );
  assert.equal(subnormal.observedStatistic, 4 * tiny);
  assert.equal(subnormal.extremeCount, 0, 'a zero permuted statistic remains strictly smaller');
  assert.equal(subnormal.pValue, 0.5);

  const halfwayToTiny = permutationTestMeanDifference([tiny, 0], [0], {
    seed: 0,
    iterations: 1,
  });
  assert.equal(halfwayToTiny.observedStatistic, 0, 'halfway underflow ties to even zero');
  assert.equal(Object.is(halfwayToTiny.observedStatistic, -0), false);

  const aboveHalfway = permutationTestMeanDifference([tiny, tiny, 0], [0], {
    seed: 0,
    iterations: 1,
  });
  assert.equal(aboveHalfway.observedStatistic, tiny, 'two-thirds of a subnormal ULP rounds up');
});

test('permutation: normal halfway means use ties-to-even rounding', () => {
  const nextAfterOne = 1 + Number.EPSILON;
  const halfway = permutationTestMeanDifference([1, nextAfterOne], [0], {
    seed: 0,
    iterations: 1,
  });
  assert.equal(halfway.observedStatistic, 1);

  const aboveHalfway = permutationTestMeanDifference([1, nextAfterOne, nextAfterOne], [0], {
    seed: 0,
    iterations: 1,
  });
  assert.equal(aboveHalfway.observedStatistic, nextAfterOne);
});

// ===== mulberry32 RNG determinism =====

test('mulberry32: determinism — same seed ⇒ identical uint32 sequence', () => {
  const rng1 = createMulberry32(2024);
  const rng2 = createMulberry32(2024);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(rng1(), rng2(), `seed-dependent sequence diverged at index ${i}`);
  }
});

test('mulberry32: output is uint32 ∈ [0, 2^32)', () => {
  const rng = createMulberry32(7);
  for (let i = 0; i < 500; i += 1) {
    const v = rng();
    assert.ok(Number.isInteger(v), `expected integer output, got ${v}`);
    assert.ok(v >= 0 && v < 0x100000000, `expected uint32 range, got ${v}`);
  }
});

test('mulberry32: different seeds → different sequences', () => {
  const rng1 = createMulberry32(1);
  const rng2 = createMulberry32(2);
  let anyDiffer = false;
  for (let i = 0; i < 20; i += 1) {
    if (rng1() !== rng2()) {
      anyDiffer = true;
      break;
    }
  }
  assert.ok(anyDiffer, 'different seeds must produce different sequences');
});

test('mulberry32: negative seed coerced to uint32 (same as positive mod 2^32)', () => {
  // -1 mod 2^32 = 0xffffffff = 4294967295
  const rngNeg = createMulberry32(-1);
  const rngPos = createMulberry32(0xffffffff);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(rngNeg(), rngPos());
  }
});

// ===== fail-closed on invalid input =====

test('permutation: fail-closed on empty sample', () => {
  assert.throws(
    () => permutationTestMeanDifference([], [1, 2, 3], { seed: 1 }),
    /sample1: expected at least 1/,
  );
  assert.throws(
    () => permutationTestMeanDifference([1, 2, 3], [], { seed: 1 }),
    /sample2: expected at least 1/,
  );
});

test('permutation: fail-closed on non-finite value (NaN/Infinity)', () => {
  assert.throws(
    () => permutationTestMeanDifference([1, NaN, 3], [1, 2, 3], { seed: 1 }),
    /expected a finite number, got NaN/,
  );
  assert.throws(
    () => permutationTestMeanDifference([1, 2, 3], [Infinity, 2, 3], { seed: 1 }),
    /expected a finite number, got Infinity/,
  );
});

test('permutation: fail-closed on non-integer seed (no ambient RNG)', () => {
  assert.throws(
    () => permutationTestMeanDifference([1, 2], [3, 4], { seed: 1.5 }),
    /options\.seed must be a safe integer/,
  );
  assert.throws(
    () => permutationTestMeanDifference([1, 2], [3, 4], { seed: Number.NaN }),
    /options\.seed must be a safe integer/,
  );
});

test('permutation: fail-closed on non-positive iterations', () => {
  assert.throws(
    () => permutationTestMeanDifference([1, 2], [3, 4], { seed: 1, iterations: 0 }),
    /options\.iterations must be a positive safe integer/,
  );
  assert.throws(
    () => permutationTestMeanDifference([1, 2], [3, 4], { seed: 1, iterations: -5 }),
    /options\.iterations must be a positive safe integer/,
  );
  assert.throws(
    () => permutationTestMeanDifference([1, 2], [3, 4], { seed: 1, iterations: 1.5 }),
    /options\.iterations must be a positive safe integer/,
  );
});

// ===== default iterations (9999) applied when omitted =====

test('permutation: default iterations=9999 when omitted', () => {
  const r = permutationTestMeanDifference([1, 2, 3], [4, 5, 6], { seed: 42 });
  assert.equal(r.iterations, 9999);
});

// ===== regression guard: asymmetric sample sizes =====

test('permutation: asymmetric sample sizes (n1≠n2) produce valid result', () => {
  const r = permutationTestMeanDifference([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [3, 4, 5], {
    seed: 777,
    iterations: 500,
  });
  assert.ok(r.pValue > 0 && r.pValue <= 1);
  assert.equal(r.iterations, 500);
  // mean(s1)=5.5, mean(s2)=4, T_obs = 1.5
  assert.ok(Math.abs(r.observedStatistic - 1.5) < 1e-12);
});
