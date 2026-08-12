/**
 * Confidence interval helpers for statistical evidence.
 */

import { sampleMean, sampleStandardDeviation } from './effect_size.ts';
import { normalQuantile } from './p_value.ts';
import { studentTQuantile } from './t_distribution.ts';

/** Interface defining confidence interval. */
export interface ConfidenceInterval {
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidenceLevel: number;
  readonly standardError: number;
}

/**
 * normal approximation interval.
 */
export function normalApproximationInterval(
  estimate: number,
  standardError: number,
  confidenceLevel = 0.95,
): ConfidenceInterval {
  assertFiniteNumber(estimate, 'estimate');
  assertPositiveNumber(standardError, 'standardError');
  assertConfidenceLevel(confidenceLevel);
  const alpha = 1 - confidenceLevel;
  const zCritical = normalQuantile(1 - alpha / 2);
  const margin = zCritical * standardError;
  return {
    estimate,
    lower: estimate - margin,
    upper: estimate + margin,
    confidenceLevel,
    standardError,
  };
}

/**
 * mean confidence interval.
 *
 * @deprecated use meanConfidenceIntervalT for small samples. This z-based
 * interval is systematically too narrow when n < 30 (it ignores the extra
 * uncertainty from estimating the population SD from the sample). It is
 * retained only for callers that supply a known population SD or have large n.
 */
export function meanConfidenceInterval(
  sample: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (sample.length < 2) {
    throw new Error('meanConfidenceInterval: sample must contain at least two observations');
  }
  const estimate = sampleMean(sample);
  const standardError = sampleStandardDeviation(sample) / Math.sqrt(sample.length);
  return normalApproximationInterval(estimate, standardError, confidenceLevel);
}

/**
 * Student's-t mean confidence interval (exact for any n >= 2).
 *
 * Uses the t-distribution with df = n − 1 instead of the normal z-approximation.
 * For small n this yields a strictly WIDER interval than `meanConfidenceInterval`
 * (heavier tails → larger critical value), correctly reflecting the additional
 * uncertainty from estimating the population SD from the sample. As n → ∞ the
 * t critical value converges to z and the two intervals coincide.
 *
 * This is the statistically correct default for one-sample mean CIs when the
 * population SD is unknown (the common psychology / clinical / neuroscience case).
 *
 * @param sample - observations (n >= 2 required for sample SD)
 * @param confidenceLevel - nominal coverage probability, strictly in (0, 1)
 */
export function meanConfidenceIntervalT(
  sample: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (sample.length < 2) {
    throw new Error('meanConfidenceIntervalT: sample must contain at least two observations');
  }
  assertConfidenceLevel(confidenceLevel);
  const n = sample.length;
  const estimate = sampleMean(sample);
  const standardError = sampleStandardDeviation(sample) / Math.sqrt(n);
  const alpha = 1 - confidenceLevel;
  const df = n - 1;
  const tCritical = studentTQuantile(1 - alpha / 2, df);
  const margin = tCritical * standardError;
  return {
    estimate,
    lower: estimate - margin,
    upper: estimate + margin,
    confidenceLevel,
    standardError,
  };
}

/**
 * difference in means confidence interval.
 *
 * @deprecated use differenceInMeansConfidenceIntervalWelch for small samples.
 * This z-based interval is systematically too narrow when n1 or n2 is small and
 * ignores unequal variances. Retained only for callers that have large samples
 * or known population variances.
 */
export function differenceInMeansConfidenceInterval(
  left: readonly number[],
  right: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (left.length < 2 || right.length < 2) {
    throw new Error('differenceInMeansConfidenceInterval: both samples need at least two observations');
  }
  const leftVariance = sampleStandardDeviation(left) ** 2;
  const rightVariance = sampleStandardDeviation(right) ** 2;
  const standardError = Math.sqrt(leftVariance / left.length + rightVariance / right.length);
  const estimate = sampleMean(left) - sampleMean(right);
  return normalApproximationInterval(estimate, standardError, confidenceLevel);
}

/**
 * Welch difference-in-means confidence interval (exact for unequal variances).
 *
 * Uses the t-distribution with Welch–Satterthwaite degrees of freedom:
 *
 *     df = (s1²/n1 + s2²/n2)² / [ (s1²/n1)²/(n1−1) + (s2²/n2)²/(n2−1) ]
 *
 * instead of the normal z-approximation. This matches the distribution used by
 * `twoSampleWelchTTest` (the df formula is identical), so the CI and the p-value
 * come from the SAME sampling distribution — a necessary consistency property
 * for the AT-EFFECT-P-MISMATCH anti-theater detector. For small n1 or n2 the
 * interval is strictly wider than the z-based `differenceInMeansConfidenceInterval`.
 *
 * This is the statistically correct default for two-sample difference CIs when
 * population variances are unknown and unequal (the common case).
 *
 * @param left - first sample (n1 >= 2)
 * @param right - second sample (n2 >= 2)
 * @param confidenceLevel - nominal coverage probability, strictly in (0, 1)
 */
export function differenceInMeansConfidenceIntervalWelch(
  left: readonly number[],
  right: readonly number[],
  confidenceLevel = 0.95,
): ConfidenceInterval {
  if (left.length < 2 || right.length < 2) {
    throw new Error(
      'differenceInMeansConfidenceIntervalWelch: both samples need at least two observations',
    );
  }
  assertConfidenceLevel(confidenceLevel);
  const n1 = left.length;
  const n2 = right.length;
  const leftVariance = sampleStandardDeviation(left) ** 2;
  const rightVariance = sampleStandardDeviation(right) ** 2;
  const term1 = leftVariance / n1;
  const term2 = rightVariance / n2;
  const standardError = Math.sqrt(term1 + term2);
  const estimate = sampleMean(left) - sampleMean(right);

  // Welch–Satterthwaite df — identical formula to twoSampleWelchTTest in
  // t_distribution.ts. Kept inline (not imported) to avoid coupling CI math to
  // the test module; the duplication is one line and guarded by this comment.
  const welchDf = (term1 + term2) ** 2 / (term1 ** 2 / (n1 - 1) + term2 ** 2 / (n2 - 1));

  const alpha = 1 - confidenceLevel;
  const tCritical = studentTQuantile(1 - alpha / 2, welchDf);
  const margin = tCritical * standardError;
  return {
    estimate,
    lower: estimate - margin,
    upper: estimate + margin,
    confidenceLevel,
    standardError,
  };
}

/**
 * wilson score interval.
 */
export function wilsonScoreInterval(
  successes: number,
  trials: number,
  confidenceLevel = 0.95,
): ConfidenceInterval {
  assertCount(successes, 'successes');
  assertCount(trials, 'trials');
  if (trials === 0) {
    throw new Error('wilsonScoreInterval: trials must be greater than zero');
  }
  if (successes > trials) {
    throw new Error('wilsonScoreInterval: successes cannot exceed trials');
  }
  assertConfidenceLevel(confidenceLevel);
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const pHat = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (pHat + zSquared / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) *
    Math.sqrt((pHat * (1 - pHat) + zSquared / (4 * trials)) / trials);
  return {
    estimate: pHat,
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
    confidenceLevel,
    standardError: Math.sqrt((pHat * (1 - pHat)) / trials),
  };
}

function assertConfidenceLevel(value: number): void {
  assertFiniteNumber(value, 'confidenceLevel');
  if (value <= 0 || value >= 1) {
    throw new Error(`confidenceLevel: expected a value strictly between 0 and 1, got ${value}`);
  }
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}: expected a non-negative integer, got ${value}`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`${name}: expected a positive number, got ${value}`);
  }
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}: expected a finite number, got ${value}`);
  }
}
