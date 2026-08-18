/**
 * Student's t-distribution functions for small-sample statistical inference.
 *
 * FAR-Lab's original statistics module relied solely on normal-approximation
 * z-tests. This is adequate for large samples (N>200) but produces systematically
 * anti-conservative p-values for small samples (N<30), which covers most real
 * psychology / clinical trial / neuroscience papers. This module adds the
 * t-distribution CDF/Survival/inverse so callers can compute exact t-test p-values
 * and t-based confidence intervals.
 *
 * Implementation: regularized incomplete beta function (I_x(a,b)) via continued
 * fraction (Lentz's method), matching Numerical Recipes §6.4. The quantile
 * (inverse-CDF) uses Newton's method seeded from the normal approximation.
 * All functions are pure, deterministic, and side-effect free.
 *
 * References:
 *   - Press et al. (2007). Numerical Recipes 3rd ed., §6.4 (Incomplete Beta).
 *   - Abramowitz & Stegun (1964), §26.7 (Probability Functions).
 */

import { normalQuantile } from './p_value.ts';
// KERNEL-NUMERIC-001: convergence tolerances centralized in numerics.ts (values unchanged:
// 3.0e-12 → T_BETA_CONVERGENCE, 1e-13 → T_NEWTON_CONVERGENCE — bit-identical, golden vectors unaffected).
import { CENTRAL_TOLERANCE } from './numerics.ts';

/** Maximum iterations for continued fraction expansion. */
const BETA_ITMAX = 200;
/** Convergence threshold for continued fraction (CENTRAL_TOLERANCE.T_BETA_CONVERGENCE). */
const BETA_EPS = CENTRAL_TOLERANCE.T_BETA_CONVERGENCE;
/** Numerical floor for values treated as zero. */
const TINY = 1.0e-300;

/**
 * Log of the Gamma function (Lanczos approximation).
 * Used by the regularized incomplete beta function.
 */
export function logGamma(x: number): number {
  const cof = [
    76.1800917294715, -86.5053203294168, 24.0140982408309,
    -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (y + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    const c = cof[j];
    if (c !== undefined) {
      ser += c / y;
    }
  }
  return -tmp + Math.log(2.5066282746310002 * ser / x);
}

/**
 * Regularized incomplete beta function I_x(a,b).
 * Returns the probability that a Beta(a,b) random variable is ≤ x.
 * Core engine for t-distribution and F-distribution CDFs.
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) {
    throw new Error(`incompleteBeta: x must be in [0,1], got ${x}`);
  }
  if (x === 0 || x === 1) {
    return x;
  }
  // Symmetry relation: I_x(a,b) = 1 - I_{1-x}(b,a)
  // bt = x^a * (1-x)^b / B(a,b) where B(a,b) = exp(lgamma(a)+lgamma(b)-lgamma(a+b))
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) + lbeta);

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinuedFraction(x, a, b) / a;
  }
  return 1 - bt * betaContinuedFraction(1 - x, b, a) / b;
}

/**
 * Continued fraction for the incomplete beta function (Lentz's method).
 * Numerical Recipes §6.4: betacf.
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) {
    d = TINY;
  }
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= BETA_ITMAX; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) {
      d = TINY;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) {
      c = TINY;
    }
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) {
      d = TINY;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) {
      c = TINY;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < BETA_EPS) {
      break;
    }
  }
  return h;
}

/**
 * CDF of Student's t-distribution with df degrees of freedom.
 * P(T <= t) where T ~ t(df).
 *
 * For t >= 0: P = 1 - 0.5 * I_{df/(df+t^2)}(df/2, 1/2)
 * For t <  0: P = 0.5 * I_{df/(df+t^2)}(df/2, 1/2)
 */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) {
    throw new Error(`studentTCdf: t must be finite, got ${t}`);
  }
  if (df <= 0) {
    throw new Error(`studentTCdf: df must be positive, got ${df}`);
  }
  const x = df / (df + t * t);
  const ib = incompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/**
 * Survival function (upper tail) of Student's t-distribution.
 * P(T > t) = 1 - studentTCdf(t, df).
 */
export function studentTSurvival(t: number, df: number): number {
  return 1 - studentTCdf(t, df);
}

/**
 * Two-sided p-value from Student's t-distribution.
 * p = 2 * studentTSurvival(|t|, df).
 */
export function studentTTwoSidedP(t: number, df: number): number {
  const tt = Math.abs(t);
  return 2 * studentTSurvival(tt, df);
}

/**
 * Probability density function of Student's t-distribution.
 *
 * f(t; df) = Γ((df+1)/2) / (√(df·π) · Γ(df/2)) · (1 + t²/df)^(-(df+1)/2)
 *
 * Computed in log-space then exponentiated for numerical stability with large |t|
 * or small df. Used as the derivative in studentTQuantile's Newton iteration.
 */
export function studentTPdf(t: number, df: number): number {
  if (!Number.isFinite(t)) {
    throw new Error(`studentTPdf: t must be finite, got ${t}`);
  }
  if (df <= 0) {
    throw new Error(`studentTPdf: df must be positive, got ${df}`);
  }
  const logCoeff = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  const logBody = -((df + 1) / 2) * Math.log1p((t * t) / df);
  return Math.exp(logCoeff + logBody);
}

/**
 * Maximum |t| the Newton iterate is allowed to reach. Beyond this the t-density
 * underflows and the CDF is effectively 0 or 1 for any representable df, so the
 * quantile is indistinguishable from ±∞. Clamping prevents overflow in
 * `1 + t*t/df` for tiny df (Cauchy tail) while staying below Number.MAX_VALUE.
 */
const STUDENT_T_QUANTILE_CLAMP = 1e7;

/**
 * Quantile (inverse CDF) of Student's t-distribution with df degrees of freedom.
 * Returns t such that P(T <= t) = p where T ~ t(df).
 *
 * Implementation: Newton's method seeded from `normalQuantile(p)` (the exact
 * asymptotic answer as df → ∞), iterating t_{n+1} = t_n - (F(t_n) − p) / f(t_n)
 * where F = studentTCdf and f = studentTPdf. For p < 0.5 the symmetry
 * t_p(df) = −t_{1−p}(df) is used to keep the iterate in the well-conditioned
 * upper tail. Convergence is quadratic once close.
 *
 * Validated against published t-tables to 1e-6 (see tests/statistics/t_quantile.test.ts):
 *   studentTQuantile(0.975, 2) = 4.30265373
 *   studentTQuantile(0.975, 10) = 2.22813885
 *   studentTQuantile(0.95, 100) = 1.66023490
 *
 * @param p - target cumulative probability, strictly in (0, 1)
 * @param df - degrees of freedom, strictly positive (may be fractional for Welch)
 */
export function studentTQuantile(p: number, df: number): number {
  if (!Number.isFinite(p)) {
    throw new Error(`studentTQuantile: p must be finite, got ${p}`);
  }
  if (p <= 0 || p >= 1) {
    throw new Error(`studentTQuantile: p must be strictly in (0,1), got ${p}`);
  }
  if (!Number.isFinite(df)) {
    throw new Error(`studentTQuantile: df must be finite, got ${df}`);
  }
  if (df <= 0) {
    throw new Error(`studentTQuantile: df must be positive, got ${df}`);
  }
  // Median: exact by symmetry of the t-density about 0.
  if (p === 0.5) {
    return 0;
  }
  // Symmetry t_p(df) = -t_{1-p}(df): solve in the upper tail (p > 0.5) where
  // normalQuantile gives a positive seed and the CDF/PDF are well-conditioned.
  if (p < 0.5) {
    return -studentTQuantile(1 - p, df);
  }

  let t = normalQuantile(p);
  // Newton iteration. 100 iterations is far more than enough for double precision
  // (typically < 10); the cap is a safety net against pathological divergence.
  for (let i = 0; i < 100; i++) {
    // Clamp to avoid overflow in (1 + t^2/df) for small df + extreme p.
    if (t > STUDENT_T_QUANTILE_CLAMP) {
      t = STUDENT_T_QUANTILE_CLAMP;
    } else if (t < -STUDENT_T_QUANTILE_CLAMP) {
      t = -STUDENT_T_QUANTILE_CLAMP;
    }
    const cdf = studentTCdf(t, df);
    const err = cdf - p;
    const pdf = studentTPdf(t, df);
    if (!(pdf > 0) || !Number.isFinite(pdf)) {
      // PDF underflowed: the current iterate is so far in the tail that finer
      // resolution is below double precision. Accept it.
      break;
    }
    const delta = err / pdf;
    const next = t - delta;
    if (!Number.isFinite(next)) {
      break;
    }
    t = next;
    // Convergence: both the CDF residual and the step must be negligible.
    if (Math.abs(delta) < CENTRAL_TOLERANCE.T_NEWTON_CONVERGENCE && Math.abs(err) < CENTRAL_TOLERANCE.T_NEWTON_CONVERGENCE) {
      break;
    }
  }
  return t;
}

/** Result of a one-sample t-test against a null hypothesis mean. */
export interface TTestResult {
  /** t-statistic. */
  readonly statistic: number;
  /** Degrees of freedom (n-1). */
  readonly degreesOfFreedom: number;
  /** Exact p-value from t-distribution. */
  readonly pValue: number;
  /** Standard error of the mean (sample SD / sqrt(n)). */
  readonly standardError: number;
  /** Alternative hypothesis direction. */
  readonly alternative: 'less' | 'greater' | 'two_sided';
}

/**
 * One-sample t-test: tests whether the sample mean differs from nullMean.
 *
 * Uses the exact t-distribution (not normal approximation), making it
 * statistically correct for all sample sizes including small N (<30).
 *
 * @param sample - observed values (n >= 2 required for sample SD)
 * @param nullMean - hypothesized population mean under H0
 * @param alternative - 'greater' (H1: mean > nullMean), 'less', or 'two_sided'
 */
export function oneSampleTTest(
  sample: readonly number[],
  nullMean: number,
  alternative: 'less' | 'greater' | 'two_sided' = 'two_sided',
): TTestResult {
  if (sample.length < 2) {
    throw new Error('oneSampleTTest: sample must contain at least 2 observations');
  }
  if (!Number.isFinite(nullMean)) {
    throw new Error(`oneSampleTTest: nullMean must be finite, got ${nullMean}`);
  }
  const n = sample.length;
  const mean = sample.reduce((a, b) => a + b, 0) / n;
  const variance = sample.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  if (se === 0) {
    throw new Error('oneSampleTTest: standard error is zero (all sample values identical)');
  }
  const t = (mean - nullMean) / se;
  const df = n - 1;

  let pValue: number;
  switch (alternative) {
    case 'greater':
      pValue = studentTSurvival(t, df);
      break;
    case 'less':
      pValue = studentTCdf(t, df);
      break;
    case 'two_sided':
      pValue = studentTTwoSidedP(t, df);
      break;
  }

  return { statistic: t, degreesOfFreedom: df, pValue, standardError: se, alternative };
}

/** Result of a paired t-test (within-subject difference). */
export interface PairedTTestResult extends TTestResult {
  /** Mean of the paired differences. */
  readonly meanDifference: number;
}

/**
 * Paired (within-subject) t-test.
 *
 * Tests whether the mean difference between paired observations differs from
 * zero. This is the correct test for repeated-measures / pre-post / matched-pairs
 * designs, which are the most common designs in psychology, neuroscience, and
 * clinical trials.
 *
 * @param before - baseline measurements (same length as after)
 * @param after - follow-up measurements
 * @param alternative - direction of the alternative hypothesis
 */
export function pairedTTest(
  before: readonly number[],
  after: readonly number[],
  alternative: 'less' | 'greater' | 'two_sided' = 'two_sided',
): PairedTTestResult {
  if (before.length !== after.length) {
    throw new Error(`pairedTTest: before and after must have equal length (${before.length} vs ${after.length})`);
  }
  if (before.length < 2) {
    throw new Error('pairedTTest: need at least 2 pairs');
  }
  const diffs = before.map((b, i) => (after[i] ?? 0) - b);
  const result = oneSampleTTest(diffs, 0, alternative);
  const meanDifference = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return { ...result, meanDifference };
}

/**
 * Two-sample (independent) t-test with pooled variance.
 *
 * Uses exact t-distribution (not Welch's z-approximation). This is the
 * Student's t-test assuming equal variances; for unequal variances use
 * twoSampleWelchTTest.
 *
 * @param left - first sample (n1 >= 2)
 * @param right - second sample (n2 >= 2)
 * @param alternative - direction of the alternative hypothesis
 */
export function twoSampleTTest(
  left: readonly number[],
  right: readonly number[],
  alternative: 'less' | 'greater' | 'two_sided' = 'two_sided',
): TTestResult {
  if (left.length < 2) {
    throw new Error('twoSampleTTest: left sample must contain at least 2 observations');
  }
  if (right.length < 2) {
    throw new Error('twoSampleTTest: right sample must contain at least 2 observations');
  }
  const n1 = left.length;
  const n2 = right.length;
  const mean1 = left.reduce((a, b) => a + b, 0) / n1;
  const mean2 = right.reduce((a, b) => a + b, 0) / n2;
  const var1 = left.reduce((acc, x) => acc + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = right.reduce((acc, x) => acc + (x - mean2) ** 2, 0) / (n2 - 1);
  // Pooled variance
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
  if (se === 0) {
    throw new Error('twoSampleTTest: standard error is zero');
  }
  const t = (mean1 - mean2) / se;
  const df = n1 + n2 - 2;

  let pValue: number;
  switch (alternative) {
    case 'greater':
      pValue = studentTSurvival(t, df);
      break;
    case 'less':
      pValue = studentTCdf(t, df);
      break;
    case 'two_sided':
      pValue = studentTTwoSidedP(t, df);
      break;
  }

  return { statistic: t, degreesOfFreedom: df, pValue, standardError: se, alternative };
}

/**
 * Two-sample Welch's t-test (unequal variances) with exact t-distribution.
 *
 * Unlike twoSampleWelchZTest (which uses normal approximation), this uses the
 * Welch-Satterthwaite degrees of freedom and the exact t-distribution, making
 * it correct for small samples with unequal variances.
 *
 * @param left - first sample (n1 >= 2)
 * @param right - second sample (n2 >= 2)
 * @param alternative - direction of the alternative hypothesis
 */
export function twoSampleWelchTTest(
  left: readonly number[],
  right: readonly number[],
  alternative: 'less' | 'greater' | 'two_sided' = 'two_sided',
): TTestResult {
  if (left.length < 2) {
    throw new Error('twoSampleWelchTTest: left sample must contain at least 2 observations');
  }
  if (right.length < 2) {
    throw new Error('twoSampleWelchTTest: right sample must contain at least 2 observations');
  }
  const n1 = left.length;
  const n2 = right.length;
  const mean1 = left.reduce((a, b) => a + b, 0) / n1;
  const mean2 = right.reduce((a, b) => a + b, 0) / n2;
  const var1 = left.reduce((acc, x) => acc + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = right.reduce((acc, x) => acc + (x - mean2) ** 2, 0) / (n2 - 1);
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    throw new Error('twoSampleWelchTTest: standard error is zero');
  }
  const t = (mean1 - mean2) / se;
  // Welch-Satterthwaite degrees of freedom
  const num = (var1 / n1 + var2 / n2) ** 2;
  const den = (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = num / den;

  let pValue: number;
  switch (alternative) {
    case 'greater':
      pValue = studentTSurvival(t, df);
      break;
    case 'less':
      pValue = studentTCdf(t, df);
      break;
    case 'two_sided':
      pValue = studentTTwoSidedP(t, df);
      break;
  }

  return { statistic: t, degreesOfFreedom: df, pValue, standardError: se, alternative };
}
