import { describe, it, expect } from 'vitest';
import { grimCheck, eValue, extractMeanN, rangeGuard, extractStats } from '../src/domain/stat-forensics.js';
import { conformalInterval } from '../src/domain/conformal.js';

// RU-6 GO4 — deterministic statistical forensics (clean-room; scrutiny/statcheck
// are algorithm references only). Includes the canonical published examples.

describe('GRIM granularity check', () => {
  it('accepts a mathematically possible mean/n pair (Brown & Heathers canonical shape)', () => {
    // mean 5.22 with n=9: sums in ceil(5.22-0.05,9)..floor(5.22+0.05,9) -> 47 exists (47/9=5.222..)
    const r = grimCheck(5.22, 9, 2);
    expect(r.consistent).toBe(true);
  });
  it('rejects an impossible pair — the canonical 3.22 / n=3 example from the GRIM paper', () => {
    // n=3 at 2dp: possible means are sums/3 with spacing 1/3=0.333..; 3.22 is not reachable
    const r = grimCheck(3.22, 3, 2);
    expect(r.consistent).toBe(false);
    expect(r.detail).toContain('cannot come from the stated sample size');
  });
  it('never flags on malformed input (fail-open for applicability, not for verdicts)', () => {
    expect(grimCheck(NaN, 10).consistent).toBe(true);
    expect(grimCheck(1.5, 0).consistent).toBe(true);
  });
});

describe('E-value (VanderWeele & Ding closed form)', () => {
  it('RR=1.5 -> E=1.94... (published worked example)', () => {
    const { eValue: e, detail } = eValue(1.5);
    expect(e).toBeCloseTo(1.5 + Math.sqrt(1.5 * 0.5), 12);
    expect(detail).toContain('unmeasured confounder');
  });
  it('protective RR<1 mirrors via reciprocal; non-positive RR inapplicable', () => {
    expect(eValue(0.5).eValue).toBeCloseTo(eValue(2).eValue, 12);
    expect(Number.isNaN(eValue(-1).eValue)).toBe(true);
  });
});

describe('quote statistics extraction (deterministic regex)', () => {
  it('extracts mean/n pairs from verbatim text; ignores prose without stats', () => {
    const pairs = extractMeanN('the mean score was 3.22 (n = 3) post intervention');
    expect(pairs).toEqual([{ mean: 3.22, n: 3, decimals: 2 }]);
    expect(extractMeanN('no statistics here at all')).toEqual([]);
    expect(extractMeanN('mean 5.22 but no sample size')).toEqual([]);
  });
});

describe('RU-5 GO2 — range/domain guard', () => {
  it('flags impossible values; passes legitimate ones', () => {
    expect(rangeGuard({ pValue: 1.3 }).length).toBe(1);
    expect(rangeGuard({ percent: 140 }).length).toBe(1);
    expect(rangeGuard({ ci: { low: 5, high: 2, point: 3 } })[0]!.detail).toContain('inverted');
    expect(rangeGuard({ ci: { low: 1, high: 2, point: 5 } })[0]!.detail).toContain('outside its own CI');
    expect(rangeGuard({ sd: -0.5 }).length).toBe(1);
    expect(rangeGuard({ pValue: 0.04, percent: 62, ci: { low: 0.5, high: 2.1, point: 1.2 }, sd: 0.8 })).toEqual([]);
  });

  it('extractStats parses verbatim statistics deterministically', () => {
    const s = extractStats('the effect of 1.8 (95% CI [0.9, 2.7], p = .03, 62% improvement, SD 0.8)');
    expect(s.pValue).toBeCloseTo(0.03, 10);
    expect(s.percent).toBe(62);
    expect(s.sd).toBe(0.8);
    expect(s.ci).toEqual({ low: 0.9, high: 2.7, point: 1.8 });
    expect(extractStats('no numbers here')).toEqual({});
  });
});

describe('RU-5 GO1 — split-conformal intervals', () => {
  it('symmetric residuals produce pred ± the finite-sample quantile', () => {
    const residuals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const interval = conformalInterval(residuals, 100, 0.2);
    // n=10, alpha=0.2: k = ceil(11*0.8)=9 -> 9th smallest residual = 9
    expect(interval.low).toBe(91);
    expect(interval.high).toBe(109);
    expect(interval.nCalibration).toBe(10);
    expect(interval.guarantee).toContain('exchangeability');
  });

  it('empirical coverage on exchangeable synthetic data meets the guarantee (seeded)', () => {
    // mulberry32 — same seeded-rng discipline as the W9 stats tier
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const gauss = () => {
      const u = Math.max(rng(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    const alpha = 0.1;
    const calib = Array.from({ length: 200 }, () => Math.abs(gauss()));
    let covered = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      const yTrue = gauss();
      const interval = conformalInterval(calib, 0, alpha);
      if (yTrue >= interval.low && yTrue <= interval.high) covered += 1;
    }
    expect(covered / trials).toBeGreaterThanOrEqual(1 - alpha - 0.02); // small monte-carlo slack
  });

  it('fails closed on malformed inputs', () => {
    expect(() => conformalInterval([1, 2], 0, 0)).toThrow(/alpha/);
    expect(() => conformalInterval([], 0, 0.1)).toThrow(/calibration/);
  });
});
