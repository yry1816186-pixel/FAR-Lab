// src/v2_domain/numerical_equivalence.ts
//
// IMPL-027: Runtime verification of numericalEquivalenceProfile N0-N4.
// Provides classifyNumericalDivergence which produces a NumericalDivergenceResult
// indicating whether two numeric values satisfy a given equivalence level.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3,
//            IRG-001 (numerical equivalence).

import type {
  NumericalEquivalenceLevel,
  NumericalEquivalenceLevelId,
} from './algorithm_registry.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of classifying numerical divergence between expected and actual. */
export interface NumericalDivergenceResult {
  /** The equivalence level that was evaluated. */
  readonly level: NumericalEquivalenceLevelId;
  /** Whether the values are within the allowed divergence bound. */
  readonly isWithinBound: boolean;
  /** Absolute difference |expected - actual|. Always present. */
  readonly absoluteDifference: number;
  /** Relative difference |actual - expected| / |expected|. Always present (0 when expected=0). */
  readonly relativeDifference: number;
  /** ULP difference. Present for N2. */
  readonly ulpDifference?: number;
  /** Whether values cross a decision boundary. Present for N4. */
  readonly decisionChanged?: boolean;
}

/** Options for N1 (execution fingerprint) and N4 (decision boundary). */
export interface NumericalDivergenceOptions {
  /** N1: fingerprint hash from current execution. */
  readonly fingerprint?: string;
  /** N1: expected fingerprint hash. */
  readonly fingerprintExpected?: string;
  /** N4: numeric decision boundary. */
  readonly decisionBoundary?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a number is finite (not NaN, not Infinity).
 * Mirrors the logic in src/evidence_log/hasher.ts assertNoNonFiniteNumber.
 */
function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}: NaN and Infinity are not allowed`);
  }
}

/**
 * Compute ULP (Unit in the Last Place) difference between two finite numbers.
 * Uses Math.fround to get 32-bit float representation for consistent ULP calculation.
 * Returns 0 for identical numbers.
 */
function ulpDifference(expected: number, actual: number): number {
  // Use typed array trick for 64-bit IEEE 754 ULP
  const buf = new Float64Array(2);
  buf[0] = expected;
  buf[1] = actual;
  const intBuf = new BigInt64Array(buf.buffer);
  return Number(intBuf[1]! - intBuf[0]!);
}

// ---------------------------------------------------------------------------
// classifyNumericalDivergence
// ---------------------------------------------------------------------------

/**
 * Classify the divergence between two numeric values at a given equivalence level.
 *
 * N0: exact bit-identity via Object.is
 * N1: execution fingerprint hash comparison (options.fingerprint/fingerprintExpected required)
 * N2: bounded ULP divergence (default threshold=4)
 * N3: bounded absolute/relative threshold (default threshold=1e-9)
 * N4: decision boundary crossing check (options.decisionBoundary required)
 *
 * @throws Error if NaN or Infinity is passed as expected or actual.
 * @throws Error if N1 is used without fingerprint/fingerprintExpected options.
 * @throws Error if N4 is used without decisionBoundary option.
 */
export function classifyNumericalDivergence(
  expected: number,
  actual: number,
  profile: NumericalEquivalenceLevel,
  options?: NumericalDivergenceOptions,
): NumericalDivergenceResult {
  // Guard: reject NaN and Infinity in numeric inputs.
  assertFinite(expected, 'classifyNumericalDivergence.expected');
  assertFinite(actual, 'classifyNumericalDivergence.actual');

  const absDiff = Math.abs(actual - expected);
  const relDiff = expected === 0 ? 0 : Math.abs(actual - expected) / Math.abs(expected);

  switch (profile.level) {
    case 'N0': {
      // Exact bit-identity via Object.is.
      const isWithin = Object.is(expected, actual);
      return {
        level: 'N0',
        isWithinBound: isWithin,
        absoluteDifference: absDiff,
        relativeDifference: relDiff,
      };
    }

    case 'N1': {
      // Execution fingerprint match — caller provides hash strings.
      const fp = options?.fingerprint;
      const fpExpected = options?.fingerprintExpected;
      if (fp === undefined || fpExpected === undefined) {
        throw new Error('N1 requires fingerprint and fingerprintExpected options');
      }
      const isWithin = fp === fpExpected;
      return {
        level: 'N1',
        isWithinBound: isWithin,
        absoluteDifference: absDiff,
        relativeDifference: relDiff,
      };
    }

    case 'N2': {
      // Bounded ULP divergence.
      const threshold = profile.threshold ?? 4;
      const ulp = ulpDifference(expected, actual);
      const ulpAbs = Math.abs(ulp);
      const isWithin = ulpAbs <= threshold;
      return {
        level: 'N2',
        isWithinBound: isWithin,
        absoluteDifference: absDiff,
        relativeDifference: relDiff,
        ulpDifference: ulpAbs,
      };
    }

    case 'N3': {
      // Bounded absolute/relative threshold.
      const threshold = profile.threshold ?? 1e-9;
      const isWithin = absDiff <= threshold;
      return {
        level: 'N3',
        isWithinBound: isWithin,
        absoluteDifference: absDiff,
        relativeDifference: relDiff,
      };
    }

    case 'N4': {
      // Decision boundary crossing.
      const boundary = options?.decisionBoundary;
      if (boundary === undefined) {
        throw new Error('N4 requires decisionBoundary option');
      }
      // Crossing = expected and actual are on strictly opposite sides of the boundary.
      const expectedSide = expected < boundary ? -1 : expected > boundary ? 1 : 0;
      const actualSide = actual < boundary ? -1 : actual > boundary ? 1 : 0;
      const decisionChanged = expectedSide !== 0 && actualSide !== 0 && expectedSide !== actualSide;
      const isWithin = !decisionChanged;
      return {
        level: 'N4',
        isWithinBound: isWithin,
        absoluteDifference: absDiff,
        relativeDifference: relDiff,
        decisionChanged,
      };
    }

    default: {
      throw new Error(`Unknown numerical equivalence level: ${String(profile.level)}`);
    }
  }
}
