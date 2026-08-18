/**
 * Deterministic two-sample Kolmogorov–Smirnov (KS) test.
 *
 * Background (T-046 · 2026-07-24 ): the a16 pulsar demo seed's plan
 * lists "Two-sample KS test for P₀ distributions" as a method, but `src/statistics/` had no KS
 * implementation — the plan was not backed by capability. This module provides the real, fully
 * deterministic KS implementation so the plan is genuine. It also widens the statistical surface
 * (permutation/bootstrap/KS) toward closing the B→A- science-depth gap (T-006/T-044).
 *
 * Algorithm (two-sided two-sample KS — standard, ref: Numerical Recipes §14.3 / Massey 1951):
 *   1. D_{n,m} = sup_x |F̂_1(x) − F̂_2(x)| (empirical-CDF gap, two-sided);
 *   2. asymptotic p-value via the Kolmogorov distribution Q_KS(λ) with
 *      λ = (√(n·m/(n+m)) + 0.12 + 0.11/√(n·m/(n+m))) · D   (NR continuity correction);
 *   3. Q_KS(λ) = 2 · Σ_{j=1}^{∞} (−1)^{j−1} e^{−2 j² λ²}, summed until terms < 1e-12·|Σ|.
 *
 * Determinism (F2): pure function, no ambient state, no RNG. Tie handling: the merge-walk advances
 * all equal values in each sample before recomputing the CDF gap, so tied observations do not
 * inflate D (matches the standard step-function CDF definition).
 *
 * Honest limits: the asymptotic p-value is accurate for n, m ≳ 10–20; for very small samples it
 * is an approximation (the exact small-sample null distribution is discrete). We do not claim
 * exactness for n,m < 8 — callers should treat small-sample p-values as approximate. No LLM.
 */

// KERNEL-NUMERIC-001: series truncation tolerance centralized in numerics.ts (value unchanged:
// 1e-12 → CENTRAL_TOLERANCE.SERIES_TRUNCATION_REL — bit-identical, golden vectors unaffected).
import { CENTRAL_TOLERANCE } from './numerics.ts';

/** Two-sample KS test result. */
export interface KsTestResult {
  /** KS two-sided statistic D_{n,m} = sup_x |F̂_1(x) − F̂_2(x)| ∈ [0, 1]. */
  readonly statistic: number;
  /** Asymptotic two-sided p-value ∈ [0, 1] (Kolmogorov distribution · NR correction). */
  readonly pValue: number;
  /** Sample sizes [n1, n2]. */
  readonly sampleSizes: readonly [number, number];
  /** Effective sample size √(n·m/(n+m)) (transparency · the NR correction input). */
  readonly effectiveN: number;
}

/**
 * Two-sample two-sided Kolmogorov–Smirnov test.
 *
 * @param sample1 - first sample (≥1 finite observation)
 * @param sample2 - second sample (≥1 finite observation)
 * @returns KsTestResult (statistic D + asymptotic pValue + sampleSizes + effectiveN)
 * @throws if either sample is empty or contains non-finite values
 */
export function kolmogorovSmirnovTwoSample(
  sample1: readonly number[],
  sample2: readonly number[],
): KsTestResult {
  assertFiniteSample(sample1, 'sample1');
  assertFiniteSample(sample2, 'sample2');

  const n1 = sample1.length;
  const n2 = sample2.length;
  const data1 = [...sample1].sort(compareAscending);
  const data2 = [...sample2].sort(compareAscending);

  // Two-sided D via merge-walk over both sorted samples (handles ties correctly).
  let i = 0;
  let j = 0;
  let dMax = 0;
  // Loop invariant: at each step we consume all observations equal to the next smallest value in
  // either sample, then record the empirical-CDF gap. D = max gap over the combined support.
  while (i < n1 || j < n2) {
    // noUncheckedIndexedAccess: data[k] is number|undefined; narrow explicitly. The bound check
    // (i<n1 / j<n2) guarantees presence, undefined is the exhausted-sample sentinel → +∞.
    const raw1 = i < n1 ? data1[i] : undefined;
    const raw2 = j < n2 ? data2[j] : undefined;
    const v1: number = raw1 ?? Number.POSITIVE_INFINITY;
    const v2: number = raw2 ?? Number.POSITIVE_INFINITY;
    if (v1 < v2) {
      // advance sample1 through all ties of v1
      while (i < n1 && data1[i] === v1) {
        i += 1;
      }
    } else if (v2 < v1) {
      // advance sample2 through all ties of v2
      while (j < n2 && data2[j] === v2) {
        j += 1;
      }
    } else {
      // v1 === v2 (finite tie, or both exhausted) — advance both through their ties
      const tied = v1;
      while (i < n1 && data1[i] === tied) {
        i += 1;
      }
      while (j < n2 && data2[j] === tied) {
        j += 1;
      }
    }
    const cdf1 = i / n1;
    const cdf2 = j / n2;
    const gap = Math.abs(cdf1 - cdf2);
    if (gap > dMax) {
      dMax = gap;
    }
  }

  const statistic = dMax;
  const effectiveN = Math.sqrt((n1 * n2) / (n1 + n2));
  const lambda = (effectiveN + 0.12 + 0.11 / effectiveN) * statistic;
  const pValue = qKs(lambda);

  return {
    statistic,
    pValue,
    sampleSizes: [n1, n2],
    effectiveN,
  };
}

/**
 * Q_KS(λ) — upper-tail of the Kolmogorov distribution (asymptotic two-sided p-value).
 *
 * Q_KS(λ) = 2 · Σ_{j=1}^{∞} (−1)^{j−1} e^{−2 j² λ²}, summed until |term| ≤ 1e-12 · |Σ| (capped 100
 * terms for safety). λ ≤ 0 ⇒ no separation ⇒ p = 1. Result clamped to [0, 1].
 *
 * Determinism: no RNG, fixed convergence threshold. The alternating series converges absolutely
 * for all λ > 0 (terms decay as e^{−2 j² λ²}).
 */
function qKs(lambda: number): number {
  if (lambda <= 0) {
    return 1;
  }
  let sum = 0;
  let sign = 1;
  for (let k = 1; k <= 100; k += 1) {
    const exponent = -2 * k * k * lambda * lambda;
    const term = sign * Math.exp(exponent);
    sum += term;
    sign = -sign;
    if (Math.abs(term) <= CENTRAL_TOLERANCE.SERIES_TRUNCATION_REL * Math.abs(sum)) {
      break;
    }
  }
  const p = 2 * sum;
  if (p < 0) {
    return 0;
  }
  if (p > 1) {
    return 1;
  }
  return p;
}

/** Numeric ascending comparator (deterministic · NaN-free guaranteed by assertFiniteSample). */
function compareAscending(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function assertFiniteSample(values: readonly number[], name: string): void {
  if (values.length < 1) {
    throw new Error(`${name}: expected at least 1 observation, got ${values.length}`);
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name}: expected a finite number, got ${value}`);
    }
  }
}
