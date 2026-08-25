import { describe, it, expect } from 'vitest';
import {
  poolFixed, poolRandomDL, leaveOneOut, eggerTest, tTwoSided, type StudyEstimate,
} from '../src/experiment/meta-math.js';
import {
  lnEffectFromTable, seLnOrFromTable, seLnRrFromTable,
} from '../src/experiment/meta-estimate.js';

/**
 * GOLDEN-VALUE fixtures — published meta-analysis results asserted value-for-value.
 * Every dataset and every published number is source-anchored in
 * research/eel/meta-math-reuse-and-golden.md (fetched/verified 2026-08-23):
 *
 *  - dat.bcg (Colditz 1994 JAMA; yi/vi derived here at FULL precision from the
 *    published 2x2 table — same escalc formulas, no zero cells — so pooled values
 *    must reproduce rma(method="EE"/"DL") to ~1e-4)
 *  - Borenstein et al. 2009 Table 14.1 (SMD): yi/vi taken as the published
 *    4-decimal values (SMD-from-means is out of minimal scope), tolerances widened
 *    accordingly (~1e-2 on Q, published theta at 2dp)
 *  - Borenstein Table 14.4 (OR): yi/vi derived full-precision from the 2x2 table
 *  - dat.egger2001: detection agreement (parametrization matches regtest's
 *    yi~sei slope; our IV-FE weights differ from their OLS/REML — no value equality)
 */

const st = (label: string, theta: number, v: number): StudyEstimate => ({ label, theta, v });

/** log RR + variance from a 2x2 table (exposed a/b, control c/d). */
const rrFromTable = (t: { a: number; b: number; c: number; d: number }): { theta: number; v: number } => ({
  theta: Math.log((t.a / (t.a + t.b)) / (t.c / (t.c + t.d))),
  v: seLnRrFromTable(t) ** 2,
});

/** log OR + variance from a 2x2 table. */
const orFromTable = (t: { a: number; b: number; c: number; d: number }): { theta: number; v: number } => ({
  theta: lnEffectFromTable('or', t),
  v: seLnOrFromTable(t) ** 2,
});

/* ---------------- dat.bcg: BCG vaccine, TB, k=13, log RR ---------------- */

// 2x2 table (tpos/tneg/cpos/cneg) exactly as published in metadat::dat.bcg.
const BCG_TABLE: readonly { label: string; a: number; b: number; c: number; d: number }[] = [
  { label: 'Aronson 1948', a: 4, b: 119, c: 11, d: 128 },
  { label: 'Ferguson & Simes 1949', a: 6, b: 300, c: 29, d: 274 },
  { label: 'Rosenthal 1960', a: 3, b: 228, c: 11, d: 209 },
  { label: 'Hart & Sutherland 1977', a: 62, b: 13536, c: 248, d: 12619 },
  { label: 'Frimodt-Moller 1973', a: 33, b: 5036, c: 47, d: 5761 },
  { label: 'Stein & Aronson 1953', a: 180, b: 1361, c: 372, d: 1079 },
  { label: 'Vandiviere 1973', a: 8, b: 2537, c: 10, d: 619 },
  { label: 'TPT Madras 1980', a: 505, b: 87886, c: 499, d: 87892 },
  { label: 'Coetzee & Berjak 1968', a: 29, b: 7470, c: 45, d: 7232 },
  { label: 'Rosenthal 1961', a: 17, b: 1699, c: 65, d: 1600 },
  { label: 'Comstock 1974', a: 186, b: 50448, c: 141, d: 27197 },
  { label: 'Comstock & Webster 1969', a: 5, b: 2493, c: 3, d: 2338 },
  { label: 'Comstock 1976', a: 27, b: 16886, c: 29, d: 17825 },
];
const BCG: StudyEstimate[] = BCG_TABLE.map((t) => {
  const { theta, v } = rrFromTable(t);
  return st(t.label, theta, v);
});

describe('golden: dat.bcg (k=13, log RR)', () => {
  it('fixed effect reproduces the published rma(method="EE") values', () => {
    const r = poolFixed(BCG);
    // published: estimate -0.4303, se 0.0405, 95%CI [-0.5097, -0.3509]
    expect(r.theta).toBeCloseTo(-0.4303, 4);
    expect(r.se).toBeCloseTo(0.0405, 4);
    expect(r.ci.low).toBeCloseTo(-0.5097, 4);
    expect(r.ci.high).toBeCloseTo(-0.3509, 4);
  });

  it('heterogeneity reproduces Q / I2', () => {
    const r = poolFixed(BCG);
    // published: Q(df=12)=152.2330, I2=92.12%, H2=12.69
    expect(r.q).toBeCloseTo(152.2330, 3);
    expect(r.i2).toBeCloseTo(92.12, 2);
  });

  it('DerSimonian-Laird random effects reproduces the published DL pool', () => {
    const r = poolRandomDL(BCG);
    // published DL: estimate -0.7141, se 0.1787, tau2=0.3088 (theta/tau2 unchanged by HK).
    // CI now HARTUNG-KNAPP (06-10 handoff §2, Cochrane-required since 2022): reference values
    // computed independently with scipy.stats (t.ppf + DL weights) — 6-decimal agreement.
    expect(r.tau2).toBeCloseTo(0.3088, 4);
    expect(r.theta).toBeCloseTo(-0.7141, 4);
    expect(r.se).toBeCloseTo(0.1787, 4);
    expect(r.ciMethod).toBe('hartung_knapp');
    expect(r.ci.low).toBeCloseTo(-1.111828, 6);
    expect(r.ci.high).toBeCloseTo(-0.316407, 6);
  });

  it('leave-one-out stays well-formed over the 13-study pool', () => {
    const loo = leaveOneOut(BCG, 'random_dl');
    expect(loo.excluded).toHaveLength(13);
    for (const e of loo.excluded) expect(e.pooled.k).toBe(12);
  });
});

/* ------------- Borenstein 2009 Table 14.1 (k=6, SMD, Hedges g) ------------- */

const T141: StudyEstimate[] = [
  st('Carroll', 0.0945, 0.0329),
  st('Grant', 0.2774, 0.0307),
  st('Peck', 0.3665, 0.0499),
  st('Donat', 0.6644, 0.0105),
  st('Stewart', 0.4618, 0.0427),
  st('Young', 0.1852, 0.0234),
];

describe('golden: Borenstein Table 14.1 (k=6, SMD)', () => {
  it('FE matches the book/R reproduction', () => {
    const r = poolFixed(T141);
    // published (digits=2): 0.41, CI [0.29, 0.54], Q=12.00, I2=58.34%
    expect(r.theta).toBeCloseTo(0.41, 2);
    expect(r.ci.low).toBeCloseTo(0.29, 2);
    expect(r.ci.high).toBeCloseTo(0.54, 2);
    // Q tolerance 1dp: yi/vi here are the PUBLISHED 4-decimal values (SMD-from-means
    // is out of minimal scope), and Q amplifies vi rounding through the weights —
    // observed drift 0.015 is input rounding, not implementation error (the two
    // full-precision datasets above pin Q to 3dp).
    expect(r.q).toBeCloseTo(12.0033, 1);
    // I2 inherits the same input-rounding drift (Q shifted 0.015 → I2 shifted 0.06)
    expect(r.i2).toBeCloseTo(58.34, 0);
  });

  it('DL random effects matches the published pool', () => {
    const r = poolRandomDL(T141);
    // published DL: 0.3582, tau2=0.0373. HK CI (scipy cross-checked): [0.107703, 0.608676]
    expect(r.theta).toBeCloseTo(0.3582, 3);
    expect(r.ciMethod).toBe('hartung_knapp');
    expect(r.ci.low).toBeCloseTo(0.107703, 6);
    expect(r.ci.high).toBeCloseTo(0.608676, 6);
    expect(r.tau2).toBeCloseTo(0.0373, 3);
  });
});

/* ------------- Borenstein 2009 Table 14.4 (k=6, log OR) ------------- */

// events1/n1/events2/n2 exactly as published; log OR + variance derived full-precision.
const T144_TABLE: readonly { label: string; a: number; b: number; c: number; d: number }[] = [
  { label: 'Saint', a: 12, b: 53, c: 16, d: 49 },
  { label: 'Kelly', a: 8, b: 32, c: 10, d: 30 },
  { label: 'Pilbeam', a: 14, b: 66, c: 19, d: 61 },
  { label: 'Lane', a: 25, b: 375, c: 80, d: 320 },
  { label: 'Wright', a: 8, b: 32, c: 11, d: 29 },
  { label: 'Day', a: 16, b: 49, c: 18, d: 47 },
];
const T144: StudyEstimate[] = T144_TABLE.map((t) => {
  const { theta, v } = orFromTable(t);
  return st(t.label, theta, v);
});

describe('golden: Borenstein Table 14.4 (k=6, log OR)', () => {
  it('DL random effects matches the published pool and back-transformed OR', () => {
    const r = poolRandomDL(T144);
    // published DL: -0.5663, tau2=0.1729, I2=52.61%, Q=10.5512. HK CI (scipy cross-checked):
    // [-1.112785, -0.019807] — exp() OR-scale HK interval [0.3286, 0.9804].
    expect(r.theta).toBeCloseTo(-0.5663, 4);
    expect(r.ciMethod).toBe('hartung_knapp');
    expect(r.ci.low).toBeCloseTo(-1.112785, 6);
    expect(r.ci.high).toBeCloseTo(-0.019807, 6);
    expect(r.tau2).toBeCloseTo(0.1729, 4);
    expect(r.i2).toBeCloseTo(52.61, 2);
    expect(r.q).toBeCloseTo(10.5512, 3);
    // exp() back to the OR scale: pooled OR 0.5676; HK interval [exp(-1.112785), exp(-0.019807)]
    expect(Math.exp(r.theta)).toBeCloseTo(0.5676, 4);
    expect(Math.exp(r.ci.low)).toBeCloseTo(0.3286, 3);
    expect(Math.exp(r.ci.high)).toBeCloseTo(0.9804, 3);
  });
});

/* ------------- dat.egger2001 (k=15 after dropping ISIS-4): funnel asymmetry ------------- */

describe('golden: dat.egger2001 funnel asymmetry (detection agreement)', () => {
  // Per-study yi/vi are derived here from the published 2x2 table (ai/n1i/ci/n2i,
  // log OR with the disclosed 0.5 zero-cell correction — trial 8 has a zero cell),
  // NOT taken as published values: the anchor values below (pooled model) are REML
  // and thus not directly assertable against our DL implementation.
  const egger2001Table: readonly { label: string; ai: number; n1i: number; ci: number; n2i: number }[] = [
    { label: 'Morton 1984', ai: 1, n1i: 40, ci: 2, n2i: 36 },
    { label: 'Rasmussen 1986', ai: 9, n1i: 135, ci: 23, n2i: 135 },
    { label: 'Smith 1986', ai: 2, n1i: 200, ci: 7, n2i: 200 },
    { label: 'Abraham 1987', ai: 1, n1i: 48, ci: 1, n2i: 46 },
    { label: 'Feldstedt 1988', ai: 10, n1i: 150, ci: 8, n2i: 148 },
    { label: 'Shechter 1989', ai: 1, n1i: 59, ci: 9, n2i: 56 },
    { label: 'Ceremuzynski 1989', ai: 1, n1i: 25, ci: 3, n2i: 23 },
    { label: 'Bertschat 1989', ai: 0, n1i: 22, ci: 1, n2i: 21 },
    { label: 'Singh 1990', ai: 6, n1i: 76, ci: 11, n2i: 75 },
    { label: 'Pereira 1990', ai: 1, n1i: 27, ci: 7, n2i: 27 },
    { label: 'Shechter 1991', ai: 2, n1i: 89, ci: 12, n2i: 80 },
    { label: 'Golf 1991', ai: 5, n1i: 23, ci: 13, n2i: 33 },
    { label: 'Thogersen 1991', ai: 4, n1i: 130, ci: 8, n2i: 122 },
    { label: 'LIMIT-2 1992', ai: 90, n1i: 1159, ci: 118, n2i: 1157 },
    { label: 'Shechter 1995', ai: 4, n1i: 107, ci: 17, n2i: 108 },
    // trial 16 (ISIS-4) dropped, mirroring the published regtest example (k=15)
  ];

  const studies: StudyEstimate[] = egger2001Table.map((t) => {
    const table = { a: t.ai, b: t.n1i - t.ai, c: t.ci, d: t.n2i - t.ci };
    return st(t.label, lnEffectFromTable('or', table), seLnOrFromTable(table) ** 2);
  });

  it('detects the published small-study asymmetry (agreement in conclusion, not in test statistic)', () => {
    const r = eggerTest(studies);
    expect(r.kind).toBe('reported');
    if (r.kind !== 'reported') return;
    // Published regtest on this dataset (metafor docs): lm t=-3.1783 p=0.0073;
    // rma z=-2.8062 p=0.0050 — both conclude SIGNIFICANT asymmetry. Our slope
    // parametrization matches regtest's (yi ~ sei slope) but our weights are
    // inverse-variance FE (not OLS, not REML), so the exact statistic legitimately
    // differs; the assertion is decision agreement, value-for-value equality is
    // not claimed.
    expect(r.pValue).toBeLessThan(0.05);
  });
});

describe('t machinery for Hartung-Knapp (06-10 s2)', () => {
  it('tTwoSided matches the standard t-table (5% two-sided) to 3 decimals', () => {
    const table: Array<[df: number, t: number]> = [[1, 12.7062], [2, 4.3027], [3, 3.1824], [5, 2.5706], [10, 2.2281], [30, 2.0423], [100, 1.9840]];
    for (const [df, t] of table) expect(tTwoSided(0.05, df)).toBeCloseTo(t, 3);
  });
  it('k<=2 pools disclose the z fallback (t_{k-2} undefined) instead of inventing an interval', () => {
    const two = poolRandomDL([st('a', 0.1, 0.02), st('b', 0.3, 0.05)]);
    expect(two.ciMethod).toBe('z_small_k');
    expect(two.ci.high - two.ci.low).toBeCloseTo(2 * 1.959964 * two.se, 4);
  });
});
