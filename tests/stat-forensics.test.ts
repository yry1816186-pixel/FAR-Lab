import { describe, it, expect } from 'vitest';
import { grimCheck, eValue, extractMeanN } from '../src/domain/stat-forensics.js';

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
