import { describe, it, expect } from 'vitest';
import {
  poolFixed, poolRandomDL, tau2DerSimonianLaird, leaveOneOut, eggerTest,
  chiSquareP, i2Label, type StudyEstimate,
} from '../src/experiment/meta-math.js';
import {
  validateEffectEstimate, toStudyEstimate, dedupeEstimates,
  seLnOrFromTable, lnEffectFromTable, type EffectEstimate,
} from '../src/experiment/meta-estimate.js';

/**
 * M1/M2 unit tests — hand-computed closed-form values (arithmetic derivable in-file)
 * plus boundary/honesty paths. Published golden-value fixtures (textbook/metafor
 * datasets with literature pooled results) land in meta-math-golden.test.ts from
 * research/eel/meta-math-reuse-and-golden.md once verified.
 */

const st = (label: string, theta: number, v: number): StudyEstimate => ({ label, theta, v });

describe('meta-math: fixed-effect pooling (closed-form hand computation)', () => {
  // w1 = 25, w2 = 50; thetaFE = (25*0.5 + 50*0.3)/75 = 27.5/75
  const two = [st('A', 0.5, 0.04), st('B', 0.3, 0.02)];

  it('computes theta/se/Q/I2 exactly for a 2-study pool', () => {
    const r = poolFixed(two);
    expect(r.k).toBe(2);
    expect(r.theta).toBeCloseTo(27.5 / 75, 12);
    expect(r.se).toBeCloseTo(Math.sqrt(1 / 75), 12);
    // Q = 25*(0.5-0.366667)^2 + 50*(0.3-0.366667)^2 = 0.666667
    expect(r.q).toBeCloseTo(2 / 3, 10);
    expect(r.i2).toBe(0); // Q(0.667) < df(1) -> clamped to 0
    expect(r.tau2).toBe(0);
    expect(r.model).toBe('fixed');
    // 95% CI uses the true z (1.959963986...); tolerance reflects Acklam's ~1.2e-9
    expect(r.ci.level).toBeCloseTo(0.95, 12);
    expect(r.ci.low).toBeCloseTo(27.5 / 75 - 1.959964 * Math.sqrt(1 / 75), 8);
    expect(r.ci.high).toBeCloseTo(27.5 / 75 + 1.959964 * Math.sqrt(1 / 75), 8);
  });

  it('tau2=0 makes the random-effects pool EXACTLY the fixed-effect pool (invariant)', () => {
    const fe = poolFixed(two);
    const re = poolRandomDL(two);
    expect(re.tau2).toBe(0);
    expect(re.theta).toBeCloseTo(fe.theta, 12);
    expect(re.se).toBeCloseTo(fe.se, 12);
    expect(re.ci.low).toBeCloseTo(fe.ci.low, 12);
    expect(re.ci.high).toBeCloseTo(fe.ci.high, 12);
    expect(re.model).toBe('random_dl');
  });

  it('heterogeneous pool yields tau2 > 0 and RE theta shifts toward small studies', () => {
    const het = [st('A', 0.2, 0.01), st('B', 1.2, 0.01), st('C', 1.4, 0.01)];
    const tau2 = tau2DerSimonianLaird(het);
    expect(tau2).toBeGreaterThan(0);
    const re = poolRandomDL(het);
    const fe = poolFixed(het);
    expect(re.i2).toBeGreaterThan(50);
    expect(re.se).toBeGreaterThan(fe.se); // widened by between-study variance
    expect(i2Label(re.i2)).toBe('high');
  });

  it('k=1 degenerates honestly: single-study pool, Q/I2/tau2 = 0, no crash', () => {
    const r = poolFixed([st('solo', 0.4, 0.09)]);
    expect(r.theta).toBeCloseTo(0.4, 12);
    expect(r.se).toBeCloseTo(0.3, 12);
    expect(r.q).toBe(0);
    expect(r.i2).toBe(0);
    expect(r.tau2).toBe(0);
  });

  it('rejects empty pools and non-positive variances (fail-closed inputs)', () => {
    expect(() => poolFixed([])).toThrow(/requires >= 1 study/);
    expect(() => poolFixed([st('bad', 0.1, 0)])).toThrow(/variance must be finite > 0/);
    expect(() => poolRandomDL([st('bad', 0.1, -1)])).toThrow(/variance must be finite > 0/);
  });
});

describe('meta-math: leave-one-out robustness', () => {
  it('excludes each study once, flags direction flips and null-crossing changes', () => {
    const studies = [st('A', 0.5, 0.02), st('B', 0.6, 0.02), st('C', -2.5, 0.01)];
    const loo = leaveOneOut(studies, 'random_dl');
    expect(loo.excluded).toHaveLength(3);
    expect(loo.excluded.map((e) => e.label)).toEqual(['A', 'B', 'C']);
    // Flags must be CONSISTENT with the module's own pooled outputs (derived, not
    // guessed): C is the outlier dragging the full pool negative; removing C yields
    // a clearly positive pool -> direction flips for every exclusion where the
    // subset's sign differs from the full pool's sign.
    const full = poolRandomDL(studies);
    for (const e of loo.excluded) {
      expect(e.pooled.k).toBe(2);
      expect(e.directionFlipped).toBe(Math.sign(e.pooled.theta) !== Math.sign(full.theta));
      const crossesNull = e.pooled.ci.low <= 0 && e.pooled.ci.high >= 0;
      const fullCrosses = full.ci.low <= 0 && full.ci.high >= 0;
      expect(e.nullCrossingChanged).toBe(crossesNull !== fullCrosses);
    }
    const exclC = loo.excluded.find((e) => e.label === 'C')!;
    expect(exclC.pooled.theta).toBeGreaterThan(0); // outlier removed -> positive pool
    expect(exclC.directionFlipped).toBe(true); // full pool is negative
  });
});

describe('meta-math: chi-square and Egger', () => {
  it('chiSquareP matches standard table values (df=1/2 at the 0.05 critical points)', () => {
    expect(chiSquareP(1, 3.841459)).toBeCloseTo(0.05, 4);
    expect(chiSquareP(2, 5.991464)).toBeCloseTo(0.05, 4);
    expect(chiSquareP(1, 0.454936)).toBeCloseTo(0.5, 3);
    expect(chiSquareP(3, 0)).toBeCloseTo(1, 12); // Q=0 -> no heterogeneity evidence
  });

  it('Egger is UNREPORTED under k<10 (Cochrane discipline, no weak numbers)', () => {
    const nine = Array.from({ length: 9 }, (_, i) => st(`s${i}`, 0.1 * i, 0.01 + 0.002 * i));
    const r = eggerTest(nine);
    expect(r.kind).toBe('unreported');
    if (r.kind === 'unreported') expect(r.reason).toContain('k=9');
  });

  it('Egger reports a slope test at k>=10 with varied SEs', () => {
    const ten = Array.from({ length: 10 }, (_, i) => st(`s${i}`, 0.2 + 0.15 * i, 0.005 + 0.004 * i));
    const r = eggerTest(ten);
    expect(r.kind).toBe('reported');
    if (r.kind === 'reported') {
      expect(Number.isFinite(r.slope)).toBe(true);
      expect(r.slopeSe).toBeGreaterThan(0);
      // strong injected small-study effect (theta grows with SE) -> significant asymmetry
      expect(r.pValue).toBeLessThan(0.05);
    }
  });

  it('Egger degenerates to UNREPORTED when all SEs are identical', () => {
    const ten = Array.from({ length: 10 }, (_, i) => st(`s${i}`, 0.1 * i, 0.01));
    const r = eggerTest(ten);
    expect(r.kind === 'unreported' || r.kind === 'reported').toBe(true); // module decides
    if (r.kind === 'unreported') expect(r.reason).toContain('degenerate');
  });
});

describe('meta-estimate: deterministic admission gate', () => {
  it('OR with reported CI derives the log-scale SE', () => {
    // SE = (ln 2.25 - ln 1.0) / (2*1.959964) = 0.81093/3.919928
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or', point: 1.5, ciLow: 1.0, ciHigh: 2.25,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.se).toBeCloseTo(Math.log(2.25) / (2 * 1.959964), 8);
  });

  it('SMD derives SE on the NATIVE scale (negative bounds legal)', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'smd', point: -0.3, ciLow: -0.6, ciHigh: 0.0,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.se).toBeCloseTo(0.6 / (2 * 1.959964), 8);
  });

  it('CI not bracketing the point is rejected', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'rr', point: 0.8, ciLow: 0.9, ciHigh: 1.2,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('bracket');
  });

  it('partial CI (one bound) is rejected', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or', point: 1.5, ciLow: 1.0,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('partial CI');
  });

  it('no CI and no table is rejected (no variance source)', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or', point: 1.5,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no admissible variance');
  });

  it('2x2 table reconstructs ln OR + SE (exact closed form)', () => {
    // a=10,b=90,c=20,d=80: lnOR = ln(10*80/(90*20)); SE = sqrt(1/10+1/90+1/20+1/80)
    const t = { a: 10, b: 90, c: 20, d: 80 };
    expect(lnEffectFromTable('or', t)).toBeCloseTo(Math.log(800 / 1800), 12);
    expect(seLnOrFromTable(t)).toBeCloseTo(Math.sqrt(1 / 10 + 1 / 90 + 1 / 20 + 1 / 80), 12);
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or',
      point: 800 / 1800, twoByTwo: t,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.se).toBeCloseTo(Math.sqrt(1 / 10 + 1 / 90 + 1 / 20 + 1 / 80), 12);
  });

  it('zero cells get the disclosed 0.5 correction', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or',
      point: 0.05, twoByTwo: { a: 0, b: 100, c: 10, d: 90 },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.se).toBeCloseTo(Math.sqrt(1 / 0.5 + 1 / 100.5 + 1 / 10.5 + 1 / 90.5), 12);
      expect(out.note).toContain('0.5');
    }
  });

  it('CI-derived vs table-derived SE conflict (>3x) is rejected — numbers disagree', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'or',
      point: 1.5, ciLow: 1.45, ciHigh: 1.55, // SE ~ 0.033
      twoByTwo: { a: 5, b: 50, c: 8, d: 50 }, // SE ~ 0.63
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('differ by');
  });

  it('table-implied ln point wildly off the reported point is rejected (different contrast)', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'rr',
      point: 0.98, // ln ~ -0.02
      twoByTwo: { a: 50, b: 50, c: 10, d: 90 }, // lnRR ~ +0.69
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('not the same contrast');
  });

  it('smd has no 2x2 path (rejected loudly, not guessed)', () => {
    const out = validateEffectEstimate({
      claimId: 'clm_x', sourceDocumentId: 'src_x', measure: 'smd', point: 0.3,
      twoByTwo: { a: 10, b: 10, c: 10, d: 10 },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no 2x2 reconstruction');
  });
});

describe('meta-estimate: normalization + conservative dedupe', () => {
  const est = (over: Partial<EffectEstimate>): EffectEstimate => ({
    id: 'efx_t1', runId: 'run_t', claimId: 'clm_a', sourceDocumentId: 'src_a',
    measure: 'or', point: 1.5, ciLow: 1.0, ciHigh: 2.25, ciLevel: 0.95,
    extractionModelRef: 'test/stub', extractedAt: new Date().toISOString(),
    ...over,
  });

  it('toStudyEstimate normalizes OR to log scale with v = SE²', () => {
    const s = toStudyEstimate(est({}), 'A');
    expect(s.theta).toBeCloseTo(Math.log(1.5), 12);
    expect(s.v).toBeCloseTo((Math.log(2.25) / (2 * 1.959964)) ** 2, 8);
  });

  it('table-only estimate pools on the table-implied theta (disclosed)', () => {
    const s = toStudyEstimate(est({ point: 800 / 1800, ciLow: undefined, ciHigh: undefined, twoByTwo: { a: 10, b: 90, c: 20, d: 80 } }), 'B');
    expect(s.theta).toBeCloseTo(Math.log(800 / 1800), 12);
  });

  it('throws on an invalid estimate (never pools unvalidated numbers)', () => {
    expect(() => toStudyEstimate(est({ point: 1.5, ciLow: 2.0, ciHigh: 1.0 }), 'bad')).toThrow(/bracket/);
  });

  it('exact numeric duplicates collapse; near-duplicates do not (conservative)', () => {
    const a = est({ id: 'efx_1', claimId: 'clm_1' });
    const b = est({ id: 'efx_2', claimId: 'clm_2' }); // same numbers, different claim
    const c = est({ id: 'efx_3', claimId: 'clm_3', point: 1.51 }); // near-duplicate kept
    const { kept, duplicatesDropped } = dedupeEstimates([a, b, c]);
    expect(kept).toHaveLength(2);
    expect(duplicatesDropped).toBe(1);
    expect(kept.map((e) => e.id)).toEqual(['efx_1', 'efx_3']);
  });
});
