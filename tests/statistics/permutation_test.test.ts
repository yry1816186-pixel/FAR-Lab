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
