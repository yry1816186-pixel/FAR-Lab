/**
 * W-F M1: meta-analysis pooling math — pure deterministic TS, zero dependencies.
 *
 * Public-domain textbook mathematics (formulas as stated in Borenstein et al. 2009
 * "Introduction to Meta-Analysis", Higgins 2003, Egger 1997; DerSimonian-Laird 1986).
 * No third-party source code copied (scout §4.3; JS ecosystem has no maintained
 * meta-analysis library — see research/eel/statistical-experiment-type-scout.md §6).
 *
 * All pooling runs on the LOG scale for ratio measures (log OR / log RR); SMD is
 * already on its native scale. Callers report exp() back to the original scale.
 *
 * Verdict semantics deliberately LIVE ELSEWHERE (domain/experiment.ts
 * mechanicalVerdict): this module produces numbers only — numbers -> verdict is a
 * preregistered decision rule, never a statistical function's opinion.
 */

/** One study's estimate on the analysis scale (log ratio or SMD): theta = point, v = variance (SE²). */
export interface StudyEstimate {
  readonly theta: number;
  readonly v: number;
  /** Study label for leave-one-out disclosure (deterministic order = caller's order). */
  readonly label: string;
}

const assertStudy = (s: StudyEstimate): void => {
  if (!Number.isFinite(s.theta) || !Number.isFinite(s.v) || s.v <= 0) {
    throw new Error(`meta-math: invalid study ${s.label}: theta=${s.theta}, v=${s.v} (variance must be finite > 0)`);
  }
};

/** Sum-based fixed-effect weights: w = 1/v. Pure. */
export const fixedWeights = (studies: readonly StudyEstimate[]): number[] => studies.map((s) => 1 / s.v);

export interface PooledResult {
  /** Pooled point estimate on the analysis scale. */
  readonly theta: number;
  /** Standard error of the pooled estimate. */
  readonly se: number;
  /** (1-alpha) CI on the analysis scale. */
  readonly ci: { readonly level: number; readonly low: number; readonly high: number };
  /**
   * How the CI was constructed. 'hartung_knapp' (random effects, k>=3): t_{k-2}
   * quantile on the HK variance estimator — Cochrane-required since 2022 (DL
   * z-intervals under-cover at small k, which is our regime). 'z': fixed effects;
   * 'z_small_k': random effects with k<=2, where t_{k-2} is undefined (honest
   * fallback, disclosed — never a silently wrong interval).
   */
  readonly ciMethod?: 'hartung_knapp' | 'z' | 'z_small_k';
  /** Cochran's Q heterogeneity statistic. */
  readonly q: number;
  /** I² percentage, clamped at [0,100) — 0 when Q <= df. */
  readonly i2: number;
  /** Between-study variance (DerSimonian-Laird moment estimate, clamped at >= 0). */
  readonly tau2: number;
  readonly k: number;
  /** Which model produced theta/se/ci. */
  readonly model: 'fixed' | 'random_dl';
}


/**
 * Student-t two-sided coverage P(|T_df| <= t) for INTEGER df via the finite
 * closed forms (Abramowitz & Stegun 26.7.4/26.7.5, clean-room): exact sums of
 * elementary terms — no numerical library, no convergence risk. Our only caller
 * (Hartung-Knapp) always passes df = k-2, a positive integer.
 */
export const studentTCdfTwoSided = (t: number, df: number): number => {
  if (!Number.isInteger(df) || df <= 0) throw new Error(`studentTCdfTwoSided: df must be a positive integer, got ${df}`);
  if (t <= 0) return 0;
  const theta = Math.atan(t / Math.sqrt(df));
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  if (df % 2 === 1) {
    // df = 2m+1: P = (2/pi) * [theta + s * sum_{j=0}^{m-1} c_j * c^(2j+1)],
    // c_j = (2*4*...*2j)/(3*5*...*(2j+1)): 1, 2/3, (2*4)/(3*5), ...
    const m = (df - 1) / 2;
    let sum = 0;
    let coeff = 1; // c_0 = 1
    for (let j = 0; j < m; j++) {
      sum += coeff * Math.pow(c, 2 * j + 1);
      coeff *= (2 * j + 2) / (2 * j + 3);
    }
    return (2 / Math.PI) * (theta + s * sum);
  }
  // df = 2m: P = s * sum_{j=0}^{m-1} c_j * c^(2j), c_j = (1*3*...*(2j-1))/(2*4*...*2j), c_0 = 1
  const m = df / 2;
  let sum = 0;
  let coeff = 1;
  for (let j = 0; j < m; j++) {
    sum += coeff * Math.pow(c, 2 * j);
    coeff *= (2 * j + 1) / (2 * j + 2);
  }
  return s * sum;
};

/** Two-sided t quantile t_{df,1-alpha/2} by bisection on the CDF (deterministic, 1e-9). */
export const tTwoSided = (alpha: number, df: number): number => {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`tTwoSided: alpha must be in (0,1), got ${alpha}`);
  if (df <= 0) throw new Error(`tTwoSided: df must be > 0, got ${df}`);
  const target = 1 - alpha;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdfTwoSided(mid, df) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** Two-sided z quantile z_{1-alpha/2} for CI construction (inverse-normal, Acklam). */
export const zTwoSided = (alpha: number): number => {
  // Acklam's inverse standard-normal CDF (same approximation as domain/experiment.ts).
  const p = 1 - alpha / 2;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const horner = (coefs: readonly (number | undefined)[], q: number): number => {
    // ((((c0*q + c1)*q + c2)*q + c3)*q + c4)*q + c5 — Horner form, no hand-counted parens
    let acc = coefs[0]!;
    for (let i = 1; i < coefs.length; i++) acc = acc * q + coefs[i]!;
    return acc;
  };
  let z: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = horner(c, q) / (horner(d, q) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    // numerator: H6(a, r) * q ; denominator: H5(b, r) * r + 1 (Acklam central region)
    z = (horner(a, r) * q) / (horner(b, r) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z = -horner(c, q) / (horner(d, q) * q + 1);
  }
  return z;
};

export const CI_LEVEL_DEFAULT = 0.95;

/**
 * Fixed-effect inverse-variance pooling with full heterogeneity statistics.
 * k=1 degenerates honestly: Q/I²/τ² undefined → q/i2/tau2 = 0 with model 'fixed'.
 */
export const poolFixed = (studies: readonly StudyEstimate[], alpha = 1 - CI_LEVEL_DEFAULT): PooledResult => {
  if (studies.length === 0) throw new Error('meta-math: pooling requires >= 1 study');
  for (const s of studies) assertStudy(s);
  const w = fixedWeights(studies);
  const sumW = w.reduce((a, x) => a + x, 0);
  const sumWt = studies.reduce((a, s, i) => a + w[i]! * s.theta, 0);
  const theta = sumWt / sumW;
  const se = Math.sqrt(1 / sumW);
  const q = studies.reduce((a, s, i) => a + w[i]! * (s.theta - theta) ** 2, 0);
  const df = studies.length - 1;
  const i2 = q > 0 && df > 0 ? Math.max(0, (q - df) / q) * 100 : 0;
  const z = zTwoSided(alpha);
  return {
    theta, se,
    ci: { level: 1 - alpha, low: theta - z * se, high: theta + z * se },
    ciMethod: 'z',
    q, i2, tau2: 0, k: studies.length, model: 'fixed',
  };
};

/** DerSimonian-Laird between-study variance moment estimate (clamped at >= 0; 0 when k=1). */
export const tau2DerSimonianLaird = (studies: readonly StudyEstimate[]): number => {
  const k = studies.length;
  if (k <= 1) return 0;
  const w = fixedWeights(studies);
  const sumW = w.reduce((a, x) => a + x, 0);
  const sumW2 = w.reduce((a, x) => a + x * x, 0);
  const denominator = sumW - sumW2 / sumW;
  if (denominator <= 0) return 0; // degenerate weights (single dominating study)
  const fe = poolFixed(studies);
  return Math.max(0, (fe.q - (k - 1)) / denominator);
};

/**
 * Random-effects pooling (DerSimonian-Laird): w* = 1/(v + τ²) on the DL estimate.
 * τ²=0 collapses exactly to the fixed-effect result (structural invariant, unit-tested).
 */
export const poolRandomDL = (studies: readonly StudyEstimate[], alpha = 1 - CI_LEVEL_DEFAULT): PooledResult => {
  if (studies.length === 0) throw new Error('meta-math: pooling requires >= 1 study');
  for (const s of studies) assertStudy(s);
  const fe = poolFixed(studies, alpha);
  const tau2 = tau2DerSimonianLaird(studies);
  const wStar = studies.map((s) => 1 / (s.v + tau2));
  const sumW = wStar.reduce((a, x) => a + x, 0);
  const theta = studies.reduce((a, s, i) => a + wStar[i]! * s.theta, 0) / sumW;
  const se = Math.sqrt(1 / sumW);
  const k = studies.length;
  // 06→10 handoff §2: Hartung-Knapp interval for random-effects meta-analysis
  // (Cochrane-required since 2022; the z interval under-covers at small k — our
  // regime). SE_HK = sqrt(s2 / sumW) with s2 = sum w*(theta_i - theta)^2 / (k-1),
  // quantile t_{k-2}. k<=2: t_{k-2} undefined -> disclosed z fallback, never a
  // silently wrong interval.
  if (k >= 3) {
    const s2 = studies.reduce((a, s, i) => a + wStar[i]! * (s.theta - theta) ** 2, 0) / (k - 1);
    const seHk = Math.sqrt(s2 / sumW);
    const t = tTwoSided(alpha, k - 2);
    return {
      theta, se,
      ci: { level: 1 - alpha, low: theta - t * seHk, high: theta + t * seHk },
      ciMethod: 'hartung_knapp',
      q: fe.q, i2: fe.i2, tau2, k, model: 'random_dl',
    };
  }
  const z = zTwoSided(alpha);
  return {
    theta, se,
    ci: { level: 1 - alpha, low: theta - z * se, high: theta + z * se },
    ciMethod: 'z_small_k',
    q: fe.q, i2: fe.i2, tau2, k, model: 'random_dl',
  };
};

export interface LeaveOneOutResult {
  /** Pooled result with study i excluded, in the caller's study order. */
  readonly excluded: readonly {
    readonly label: string;
    readonly pooled: PooledResult;
    /** Sign (direction) of the pooled estimate flipped vs the full pool. */
    readonly directionFlipped: boolean;
    /** Pooled CI crossed the analysis-scale null (0) where the full pool's CI did not (or vice versa). */
    readonly nullCrossingChanged: boolean;
  }[];
}

/** Leave-one-out robustness: recompute the chosen model k times, deterministically. */
export const leaveOneOut = (
  studies: readonly StudyEstimate[],
  model: 'fixed' | 'random_dl',
  alpha = 1 - CI_LEVEL_DEFAULT,
): LeaveOneOutResult => {
  if (studies.length === 0) throw new Error('meta-math: leave-one-out requires >= 1 study');
  const pool = model === 'fixed' ? poolFixed : poolRandomDL;
  const full = pool(studies, alpha);
  const fullCrossesNull = full.ci.low <= 0 && full.ci.high >= 0;
  const excluded = studies.map((_, i) => {
    const subset = studies.filter((_, j) => j !== i);
    const pooled = pool(subset, alpha);
    const crossesNull = pooled.ci.low <= 0 && pooled.ci.high >= 0;
    return {
      label: studies[i]!.label,
      pooled,
      directionFlipped: Math.sign(pooled.theta) !== Math.sign(full.theta),
      nullCrossingChanged: crossesNull !== fullCrossesNull,
    };
  });
  return { excluded };
};

export type EggerResult =
  | {
      readonly kind: 'reported';
      readonly slope: number;
      readonly slopeSe: number;
      readonly z: number;
      /** Two-sided p-value for funnel asymmetry (slope = 0). */
      readonly pValue: number;
    }
  | { readonly kind: 'unreported'; readonly reason: string };

/** Normal CDF (Abramowitz-Stegun 7.1.26 erf, |err|<1.5e-7 — same basis as domain/experiment.ts). */
const normalCdf = (z: number): number => {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
};

/** Upper-tail chi-square survival function via the regularized upper incomplete gamma Q(a, x). */
export const chiSquareP = (df: number, q: number): number => {
  if (df <= 0 || q < 0 || !Number.isFinite(q)) return Number.NaN;
  return regUpperGamma(df / 2, q / 2);
};

/** Regularized upper incomplete gamma Q(a,x) — series for x < a+1, continued fraction otherwise (standard recipe). */
const regUpperGamma = (a: number, x: number): number => {
  if (x < 0 || a <= 0) return Number.NaN;
  if (x === 0) return 1;
  // ln Γ(a) via Lanczos (g=7, n=9) — standard coefficients.
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const logGamma = (aa: number): number => {
    if (aa < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * aa)) - logGamma(1 - aa);
    aa -= 1;
    let x = g[0]!;
    const t = aa + 7.5;
    for (let i = 1; i < 9; i++) x += g[i]! / (aa + i);
    return 0.5 * Math.log(2 * Math.PI) + (aa + 0.5) * Math.log(t) - t + Math.log(x);
  };
  const lg = logGamma(a);
  if (x < a + 1) {
    // series for P(a,x), then Q = 1 - P
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.max(0, Math.min(1, 1 - sum * Math.exp(-x + a * Math.log(x) - lg)));
  }
  // continued fraction (Lentz) for Q(a,x)
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - lg) * h));
};

/**
 * Egger regression test (Egger, Davey Smith, Schneider & Minder 1997): inverse-variance
 * weighted linear regression of theta on SE; the SLOPE tests small-study/funnel
 * asymmetry (the intercept parametrization is algebraically equivalent — the standard
 * weighted fit yields both; slope-vs-0 is the reported test here).
 *
 * Cochrane discipline: NOT computed under k<10 (low power is the most common misuse) —
 * an explicit 'unreported' result with the reason, never a silently weak number.
 */
export const eggerTest = (studies: readonly StudyEstimate[]): EggerResult => {
  const k = studies.length;
  if (k < 10) {
    return { kind: 'unreported', reason: `k=${k} < 10: funnel-asymmetry tests under 10 studies are underpowered and prone to false reassurance (Cochrane Handbook Ch.13) — reported as UNREPORTED, not guessed` };
  }
  for (const s of studies) assertStudy(s);
  // Weighted least squares, closed form: X = [1, SE], w = 1/v.
  const w = studies.map((s) => 1 / s.v);
  const x = studies.map((s) => Math.sqrt(s.v)); // precision axis: SE_i
  // Normal equations for beta = (X'WX)^-1 X'Wy with 2 parameters.
  const s00 = w.reduce((a, wi) => a + wi, 0);
  const s01 = w.reduce((a, wi, i) => a + wi * x[i]!, 0);
  const s11 = w.reduce((a, wi, i) => a + wi * x[i]! * x[i]!, 0);
  const t0 = w.reduce((a, wi, i) => a + wi * studies[i]!.theta, 0);
  const t1 = w.reduce((a, wi, i) => a + wi * x[i]! * studies[i]!.theta, 0);
  const det = s00 * s11 - s01 * s01;
  if (Math.abs(det) < 1e-12) return { kind: 'unreported', reason: 'degenerate design (all SEs identical) — Egger slope not identifiable' };
  const beta1 = (s00 * t1 - s01 * t0) / det;
  // Covariance of beta under WLS: sigma^2 (X'WX)^-1; with known weights, sigma^2 = 1.
  const cov11 = s00 / det;
  const slopeSe = Math.sqrt(cov11);
  const z = beta1 / slopeSe;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { kind: 'reported', slope: beta1, slopeSe, z, pValue };
};

/** Higgins 2003 tentative bands — DISPLAY LABELS ONLY, never verdict inputs (scout §1.2). */
export const i2Label = (i2: number): 'low' | 'moderate' | 'high' =>
  i2 < 25 ? 'low' : i2 < 50 ? 'moderate' : 'high';
