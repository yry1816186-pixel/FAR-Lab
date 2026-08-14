/**
 * research/adapters/exoplanet_analysis — deterministic statistical analysis of
 * the NASA Exoplanet Archive sample (Phase 3 hero-case adapter, pure core).
 *
 * Scientific question (hero case): "Does stellar activity inflate hot Jupiter
 * radii?" A first real, executable analysis step from the research plan is the
 * radius–insolation correlation among hot Jupiters: the irradiation-inflation
 * hypothesis predicts larger radii at higher incident flux. This module
 * computes it from REAL archive parameters with REAL statistics — and honestly
 * reports nulls, small samples, and non-significance.
 *
 * Statistical methods (authoritative references, §9.9):
 *   - Pearson r with t-transform + two-sided p (Student's t, df=n-2) —
 *     standard text: e.g. Press et al., Numerical Recipes §14.5.
 *   - Fisher z-transform CI for r (Fisher 1921) via the repo's normalQuantile.
 *   - Insolation S = (R_s/R_sun)²(T_s/T_sun)⁴ / (a/AU)² with a from Kepler III —
 *     standard exoplanet-science approximation.
 *
 * All functions pure: same inputs → same outputs; nulls are excluded and
 * counted, never imputed.
 */

import { normalQuantile } from '../../statistics/p_value.ts';
import { studentTTwoSidedP } from '../../statistics/t_distribution.ts';
import { hashCanonicalJson } from '../../evidence_log/hasher.ts';
import type { PsRow } from './exoplanet_dataset.ts';

/** Parameters of the analysis (derived from the ResearchPlan). */
export interface RadiusInsolationAnalysisParams {
  /** Minimum planet radius (Earth radii) — hot-Jupiter lower bound. */
  readonly minRadiusEarth: number;
  /** Maximum orbital period (days). */
  readonly maxPeriodDays: number;
  /** Confidence level for the r CI (e.g. 0.95). */
  readonly confidenceLevel: number;
  /** Where the parameters came from (the frozen plan, or a built-in default). */
  readonly source: 'plan' | 'default';
}

/** One analyzed system (insolation + radius, both non-null). */
export interface InsolationPoint {
  readonly plName: string;
  readonly radiusEarth: number;
  readonly insolationEarthFlux: number;
}

/** The observation produced by the analysis (structured, hash-pinned). */
export interface RadiusInsolationObservation {
  readonly status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  /** Sample size used (rows with complete inputs). */
  readonly n: number;
  /** Rows excluded for missing stellar parameters (counted honestly). */
  readonly excludedMissing: number;
  /** Pearson correlation radius vs log10(insolation). */
  readonly pearsonR: number | null;
  /** Two-sided p-value of the correlation (null when n<3). */
  readonly pValue: number | null;
  /** Fisher-z confidence interval [lower, upper] (null when n<4). */
  readonly confidenceInterval: [number, number] | null;
  /** Whether the correlation is significant at alpha=0.05. */
  readonly significantAt05: boolean;
  /** Mean insolation of the sample (Earth fluxes). */
  readonly meanInsolation: number | null;
  /** The parameters that produced this observation. */
  readonly params: RadiusInsolationAnalysisParams;
  /** sha256 of the input rows (tamper-detectable, recomputable). */
  readonly inputHash: string;
  /** ISO timestamp (analysis time). */
  readonly analyzedAt: string;
  /** Plain-language result (no causal claim). */
  readonly summary: string;
}

/** Kepler III: semi-major axis in AU from period (yr) + stellar mass (M☉). */
export function semiMajorAxisAu(periodDays: number, stellarMassMsun: number): number {
  return (periodDays / 365.25) ** (2 / 3) * stellarMassMsun ** (1 / 3);
}

/** Incident flux in Earth-flux units (standard approximation). */
export function insolationEarthFlux(
  stellarTeffK: number,
  stellarRadiusRsun: number,
  periodDays: number,
  stellarMassMsun: number,
): number {
  const a = semiMajorAxisAu(periodDays, stellarMassMsun);
  // L_star/L_sun = (R_star/R_sun)² (T_star/T_sun)⁴ ; S = (L_star/L_sun) / (a/AU)²
  return ((stellarRadiusRsun ** 2) * (stellarTeffK / 5777) ** 4) / (a * a);
}

/** Pearson r for two paired samples (throws on length mismatch / n<2). */
export function pearsonR(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(`pearsonR: length mismatch (${xs.length} vs ${ys.length})`);
  }
  const n = xs.length;
  if (n < 2) throw new Error('pearsonR: needs at least 2 points');
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0; // constant vector → no linear association
  return cov / Math.sqrt(varX * varY);
}

/** Two-sided p-value of Pearson r via t-transform (df = n-2). */
export function pearsonTwoSidedP(r: number, n: number): number | null {
  if (n < 3) return null;
  const r2 = r * r;
  if (r2 >= 1) return 0; // perfect correlation
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r2);
  return studentTTwoSidedP(t, n - 2);
}

/** Fisher-z confidence interval for r (Fisher 1921). Returns null when n<4. */
export function fisherZConfidenceInterval(
  r: number,
  n: number,
  level: number,
): [number, number] | null {
  if (n < 4) return null;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
  const se = 1 / Math.sqrt(n - 3);
  const q = normalQuantile(1 - (1 - level) / 2);
  return [Math.tanh(z - q * se), Math.tanh(z + q * se)];
}

/**
 * Run the radius–insolation analysis on archive rows (pure; deterministic).
 *
 * Rows with missing stellar parameters are excluded and counted. The
 * correlation is computed against log10(insolation) (the physical scaling is
 * power-law). Result is honest: n too small → FAILED; some nulls → PARTIAL.
 */
export function analyzeRadiusInsolation(
  rows: readonly PsRow[],
  params: RadiusInsolationAnalysisParams,
  analyzedAt: string,
): RadiusInsolationObservation {
  const points: InsolationPoint[] = [];
  let excludedMissing = 0;
  for (const row of rows) {
    if (
      row.radiusEarth === null ||
      row.periodDays === null ||
      row.stellarTeffK === null ||
      row.stellarRadiusRsun === null ||
      row.stellarMassMsun === null
    ) {
      excludedMissing += 1;
      continue;
    }
    if (row.radiusEarth < params.minRadiusEarth || row.periodDays > params.maxPeriodDays) {
      continue; // outside the hot-Jupiter selection window (by design, not "missing")
    }
    points.push({
      plName: row.plName,
      radiusEarth: row.radiusEarth,
      insolationEarthFlux: insolationEarthFlux(
        row.stellarTeffK,
        row.stellarRadiusRsun,
        row.periodDays,
        row.stellarMassMsun,
      ),
    });
  }

  const n = points.length;
  const status: RadiusInsolationObservation['status'] =
    n < 10 ? 'FAILED' : excludedMissing > 0 ? 'PARTIAL' : 'SUCCESS';

  const xs = points.map((p) => Math.log10(p.insolationEarthFlux));
  const ys = points.map((p) => p.radiusEarth);
  const r = n >= 2 ? pearsonR(xs, ys) : null;
  const p = r === null ? null : pearsonTwoSidedP(r, n);
  const ci = r === null ? null : fisherZConfidenceInterval(r, n, params.confidenceLevel);
  const meanInsolation =
    n > 0
      ? points.reduce((s, p) => s + p.insolationEarthFlux, 0) / n
      : null;

  const significant = p !== null && p < 0.05;
  const summary =
    n < 10
      ? `insufficient sample (n=${n}) — the analysis step reports FAILED honestly; no conclusion drawn`
      : `n=${n} hot Jupiters: r(radius, log10 insolation)=${r?.toFixed(3) ?? 'n/a'} (p=${p === null ? 'n/a' : p.toFixed(3)}), 95% CI [${ci?.[0].toFixed(3) ?? 'n/a'}, ${ci?.[1].toFixed(3) ?? 'n/a'}] — ${significant ? 'significant positive correlation (association, not causation)' : 'not significant at alpha=0.05 (null preserved)'}`;

  return {
    status,
    n,
    excludedMissing,
    pearsonR: r,
    pValue: p,
    confidenceInterval: ci,
    significantAt05: significant,
    meanInsolation,
    params,
    inputHash: hashCanonicalJson(rows.map((row) => ({ ...row }))),
    analyzedAt,
    summary,
  };
}

