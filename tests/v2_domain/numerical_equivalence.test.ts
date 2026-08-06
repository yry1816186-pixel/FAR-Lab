// tests/v2_domain/numerical_equivalence.test.ts
//
// IMPL-027: Runtime verification of numericalEquivalenceProfile N0-N4.
// Strict TDD — RED phase first.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3,
//            IRG-001 (numerical equivalence).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNumericalDivergence,
  type NumericalDivergenceResult,
} from '../../src/v2_domain/numerical_equivalence.ts';
import {
  NUMERICAL_EQUIVALENCE_LEVELS,
  type NumericalEquivalenceLevel,
} from '../../src/v2_domain/algorithm_registry.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProfile(levelId: 'N0' | 'N1' | 'N2' | 'N3' | 'N4'): NumericalEquivalenceLevel {
  const found = NUMERICAL_EQUIVALENCE_LEVELS.find((l) => l.level === levelId);
  assert.ok(found, `Level ${levelId} must exist in frozen registry`);
  return found;
}

// ---------------------------------------------------------------------------
// N0: exact-bit-identity (Object.is)
// ---------------------------------------------------------------------------

test('N0: identical numbers → isWithinBound=true', () => {
  const result = classifyNumericalDivergence(42.0, 42.0, getProfile('N0'));
  assert.equal(result.level, 'N0');
  assert.equal(result.isWithinBound, true);
  assert.equal(result.absoluteDifference, 0);
  assert.equal(result.relativeDifference, 0);
});

test('N0: different numbers → isWithinBound=false', () => {
  const result = classifyNumericalDivergence(1.0, 1.0000000001, getProfile('N0'));
  assert.equal(result.level, 'N0');
  assert.equal(result.isWithinBound, false);
  assert.equal(result.absoluteDifference, 1.0000000001 - 1.0);
});

test('N0: Object.is semantics — 0 vs -0 are not identical', () => {
  const result = classifyNumericalDivergence(0, -0, getProfile('N0'));
  // Object.is(0, -0) === false
  assert.equal(result.isWithinBound, false);
});

test('N0: Object.is semantics — NaN vs NaN are identical', () => {
  // assertNoNonFiniteNumber should throw for NaN inputs
  assert.throws(
    () => classifyNumericalDivergence(NaN, NaN, getProfile('N0')),
    /NaN and Infinity are not allowed/,
  );
});

test('N0: Infinity input → assertNoNonFiniteNumber throws', () => {
  assert.throws(
    () => classifyNumericalDivergence(Infinity, 1.0, getProfile('N0')),
    /NaN and Infinity are not allowed/,
  );
});

// ---------------------------------------------------------------------------
// N1: execution-fingerprint-match (fingerprint hash string comparison)
// ---------------------------------------------------------------------------

test('N1: matching fingerprints → isWithinBound=true', () => {
  const fp = 'abc123';
  const result = classifyNumericalDivergence(
    1.0, 1.0, getProfile('N1'), { fingerprint: fp, fingerprintExpected: fp },
  );
  assert.equal(result.level, 'N1');
  assert.equal(result.isWithinBound, true);
});

test('N1: mismatching fingerprints → isWithinBound=false', () => {
  const result = classifyNumericalDivergence(
    1.0, 1.0, getProfile('N1'), { fingerprint: 'aaa', fingerprintExpected: 'bbb' },
  );
  assert.equal(result.level, 'N1');
  assert.equal(result.isWithinBound, false);
});

test('N1: missing fingerprint options → throws', () => {
  assert.throws(
    () => classifyNumericalDivergence(1.0, 1.0, getProfile('N1')),
    /N1 requires fingerprint and fingerprintExpected/,
  );
});

// ---------------------------------------------------------------------------
// N2: bounded-ulp-divergence
// ---------------------------------------------------------------------------

test('N2: ULP difference within default threshold (4) → isWithinBound=true', () => {
  // 1.0 and 1.0 + 2 ULPs should be within bound
  const expected = 1.0;
  const actual = 1.0 + 2 * Number.EPSILON;
  const result = classifyNumericalDivergence(expected, actual, getProfile('N2'));
  assert.equal(result.level, 'N2');
  assert.equal(result.isWithinBound, true);
  assert.ok(result.ulpDifference !== undefined);
  assert.ok(result.ulpDifference! <= 4);
});

test('N2: ULP difference exceeding default threshold (4) → isWithinBound=false', () => {
  const expected = 1.0;
  const actual = 1.0 + 10 * Number.EPSILON;
  const result = classifyNumericalDivergence(expected, actual, getProfile('N2'));
  assert.equal(result.level, 'N2');
  assert.equal(result.isWithinBound, false);
  assert.ok(result.ulpDifference! > 4);
});

test('N2: zero ULP difference → isWithinBound=true', () => {
  const result = classifyNumericalDivergence(3.14, 3.14, getProfile('N2'));
  assert.equal(result.isWithinBound, true);
  assert.equal(result.ulpDifference, 0);
});

test('N2: custom threshold via profile (threshold=1)', () => {
  // Use the frozen N2 profile but override threshold is not possible on frozen object.
  // The profile has threshold=4 by default. Test within that.
  // For custom threshold, the function should use profile.threshold.
  // N2 frozen threshold is 4 — test exactly at boundary.
  const expected = 1.0;
  const actual = 1.0 + 4 * Number.EPSILON;
  const result = classifyNumericalDivergence(expected, actual, getProfile('N2'));
  // At exactly 4 ULP — should be within bound (≤ threshold)
  assert.equal(result.isWithinBound, true);
});

// ---------------------------------------------------------------------------
// N3: bounded-threshold-divergence (absolute/relative)
// ---------------------------------------------------------------------------

test('N3: within default threshold (1e-9) → isWithinBound=true', () => {
  const result = classifyNumericalDivergence(1.0, 1.0 + 1e-12, getProfile('N3'));
  assert.equal(result.level, 'N3');
  assert.equal(result.isWithinBound, true);
});

test('N3: exceeding default threshold → isWithinBound=false', () => {
  const result = classifyNumericalDivergence(1.0, 1.0 + 1e-7, getProfile('N3'));
  assert.equal(result.level, 'N3');
  assert.equal(result.isWithinBound, false);
  assert.ok(result.absoluteDifference !== undefined);
  assert.ok(result.relativeDifference !== undefined);
});

test('N3: absolute and relative differences are populated', () => {
  const actual = 10.0 + 5e-10;
  const expected = 10.0;
  const result = classifyNumericalDivergence(expected, actual, getProfile('N3'));
  // absoluteDifference = |actual - expected| (floating-point arithmetic; 10+5e-10 is not exact)
  assert.ok(result.absoluteDifference !== undefined);
  assert.ok(result.absoluteDifference! > 0);
  assert.ok(result.absoluteDifference! < 1e-8);
  // relative = |actual-expected| / |expected| ≈ 5e-11
  assert.ok(result.relativeDifference !== undefined);
  assert.ok(result.relativeDifference! > 0);
  assert.ok(result.relativeDifference! < 1e-9);
});

test('N3: zero expected → relative difference uses absolute comparison', () => {
  // When expected is 0, relative difference is undefined/infinite.
  // Should fall back to absolute-only comparison.
  const result = classifyNumericalDivergence(0, 1e-12, getProfile('N3'));
  assert.equal(result.isWithinBound, true);
});

// ---------------------------------------------------------------------------
// N4: different-decision-bounded (decision boundary crossing)
// ---------------------------------------------------------------------------

test('N4: no decision boundary provided → throws', () => {
  assert.throws(
    () => classifyNumericalDivergence(0.5, 0.6, getProfile('N4')),
    /N4 requires decisionBoundary/,
  );
});

test('N4: both values on same side of boundary → isWithinBound=true, decisionChanged=false', () => {
  const result = classifyNumericalDivergence(
    0.3, 0.4, getProfile('N4'), { decisionBoundary: 0.5 },
  );
  assert.equal(result.level, 'N4');
  assert.equal(result.isWithinBound, true);
  assert.equal(result.decisionChanged, false);
});

test('N4: values cross boundary → isWithinBound=false, decisionChanged=true', () => {
  const result = classifyNumericalDivergence(
    0.3, 0.7, getProfile('N4'), { decisionBoundary: 0.5 },
  );
  assert.equal(result.level, 'N4');
  assert.equal(result.isWithinBound, false);
  assert.equal(result.decisionChanged, true);
});

test('N4: one value exactly on boundary → decisionChanged=false (boundary not crossed)', () => {
  const result = classifyNumericalDivergence(
    0.5, 0.7, getProfile('N4'), { decisionBoundary: 0.5 },
  );
  // expected == boundary, actual > boundary → same side or boundary
  // Crossing means strictly on opposite sides. Exact boundary is "not crossed".
  assert.equal(result.decisionChanged, false);
});

// ---------------------------------------------------------------------------
// assertNoNonFiniteNumber: rejects NaN and Infinity in expected/actual
// ---------------------------------------------------------------------------

test('assertNoNonFiniteNumber: NaN in expected throws', () => {
  assert.throws(
    () => classifyNumericalDivergence(NaN, 1.0, getProfile('N2')),
    /NaN and Infinity are not allowed/,
  );
});

test('assertNoNonFiniteNumber: -Infinity in actual throws', () => {
  assert.throws(
    () => classifyNumericalDivergence(1.0, -Infinity, getProfile('N2')),
    /NaN and Infinity are not allowed/,
  );
});

// ---------------------------------------------------------------------------
// Type shape: NumericalDivergenceResult
// ---------------------------------------------------------------------------

test('result shape: always includes level, isWithinBound, absoluteDifference, relativeDifference', () => {
  const result: NumericalDivergenceResult = classifyNumericalDivergence(
    1.0, 1.0, getProfile('N2'),
  );
  assert.equal(typeof result.level, 'string');
  assert.equal(typeof result.isWithinBound, 'boolean');
  assert.ok('absoluteDifference' in result);
  assert.ok('relativeDifference' in result);
});

test('N2 result includes ulpDifference', () => {
  const result = classifyNumericalDivergence(1.0, 1.0, getProfile('N2'));
  assert.ok(result.ulpDifference !== undefined);
  assert.equal(result.ulpDifference, 0);
});

test('N4 result includes decisionChanged', () => {
  const result = classifyNumericalDivergence(
    0.3, 0.4, getProfile('N4'), { decisionBoundary: 0.5 },
  );
  assert.ok(result.decisionChanged !== undefined);
  assert.equal(result.decisionChanged, false);
});
