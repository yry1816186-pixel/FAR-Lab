/**
 * research/adapters/climate_analysis — deterministic trend analysis for the
 * annual global temperature anomaly series (GISTEMP v4).
 *
 * Method: ordinary least squares of anomalyC on year over the fetched window,
 * with a two-sided t-test on the slope (df = n-2) using the exact Student t
 * distribution (src/statistics/t_distribution.ts). Output is the per-decade
 * trend with a 95% CI and a two-sided p-value.
 *
 * Honesty: this quantifies the observed trend of the anomaly series; it makes
 * no causal claim about drivers (CO2, solar, etc.). A null/non-significant
 * result is a valid finding, never converted into confirmation.
 */

import { studentTSurvival, studentTTwoSidedP } from '../../statistics/t_distribution.ts';
import type { ClimateAnnualPoint } from './climate_dataset.ts';

export interface ClimateTrendResult {
  readonly windowYears: readonly [number, number];
  readonly n: number;
  /** OLS slope, deg C per decade. */
  readonly trendPerDecadeC: number;
  /** 95% CI of the slope, deg C per decade. */
  readonly ci95PerDecadeC: readonly [number, number];
  /** Two-sided p-value of the slope (Student t, df = n-2). */
  readonly pValue: number;
  /** Null hypothesis result: slope == 0. */
  readonly slopeIsZero: boolean;
  readonly significantAt05: boolean;
}

/**
 * Compute the OLS trend of anomaly on year.
 * Requires at least 3 points (df >= 1); throws on fewer (no honest trend).
 */
export function analyzeClimateTrend(points: readonly ClimateAnnualPoint[]): ClimateTrendResult {
  if (points.length < 3) {
    throw new Error('climate_analysis: at least 3 annual points are required for a trend');
  }
  const n = points.length;
  const years = points.map((p) => p.year);
  const anomalies = points.map((p) => p.anomalyC);

  const meanX = years.reduce((a, b) => a + b, 0) / n;
  const meanY = anomalies.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = years[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (anomalies[i]! - meanY);
  }
  if (!(sxx > 0)) {
    throw new Error('climate_analysis: zero year variance — no trend is computable');
  }
  // Slope in deg C per year; x is measured in years (already unit-normalized,
  // so the slope estimate is scale-correct as-is).
  const slopePerYear = sxy / sxx;
  const intercept = meanY - slopePerYear * meanX;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const fitted = intercept + slopePerYear * years[i]!;
    const residual = anomalies[i]! - fitted;
    sse += residual * residual;
  }
  const df = n - 2;
  const seSlope = Math.sqrt(sse / df / sxx);
  const tStat = slopePerYear / seSlope;
  const pValue = studentTTwoSidedP(tStat, df);
  const tCrit = tQuantile975(df);
  const halfWidth = tCrit * seSlope;
  const perDecade = (v: number): number => v * 10;
  return {
    windowYears: [points[0]!.year, points[n - 1]!.year],
    n,
    trendPerDecadeC: perDecade(slopePerYear),
    ci95PerDecadeC: [perDecade(slopePerYear - halfWidth), perDecade(slopePerYear + halfWidth)],
    pValue,
    slopeIsZero: !Number.isFinite(pValue) || pValue > 0.05,
    significantAt05: Number.isFinite(pValue) && pValue <= 0.05,
  };
}

/**
 * 97.5% quantile of Student t for df degrees of freedom (two-sided 95% CI).
 * Implemented via binary search on studentTSurvival (monotone, bounded) — no
 * extra numerical machinery; ~60 iterations to double precision.
 */
function tQuantile975(df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTSurvival(mid, df) > 0.025) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
