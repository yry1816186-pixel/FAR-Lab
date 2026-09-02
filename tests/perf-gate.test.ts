import { describe, expect, it } from 'vitest';
import { percentileOf, breachesOf, THRESHOLDS_MS } from '../scripts/perf-gate.mjs';

/** FA-PRF-02: the percentile math and the fail-closed gate semantics are pure and locked. */

describe('perf-gate percentile math (nearest-rank)', () => {
  it('computes nearest-rank percentiles exactly', () => {
    const sorted = [10, 20, 30, 40];
    expect(percentileOf(sorted, 50)).toBe(20);
    expect(percentileOf(sorted, 95)).toBe(40);
    expect(percentileOf(sorted, 100)).toBe(40);
    expect(percentileOf([5], 50)).toBe(5);
    expect(percentileOf([1, 2, 3], 1)).toBe(1);
  });

  it('rejects an empty sample instead of inventing a value', () => {
    expect(() => percentileOf([], 50)).toThrow(/empty/);
    expect(() => percentileOf('not-an-array' as unknown as number[], 50)).toThrow(/empty/);
  });
});

describe('perf-gate breach semantics (fail-closed)', () => {
  it('flags a p95 above its threshold', () => {
    const breaches = breachesOf([{ name: 'api-get-runs', p95: 999 }], { 'api-get-runs': 500 });
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toContain('api-get-runs');
  });

  it('passes a metric at or below its threshold', () => {
    expect(breachesOf([{ name: 'api-get-runs', p95: 500 }], { 'api-get-runs': 500 })).toHaveLength(0);
  });

  it('an invalid (non-finite) p95 is a breach, never a silent pass', () => {
    const breaches = breachesOf([{ name: 'api-get-runs', p95: undefined as unknown as number }], { 'api-get-runs': 500 });
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatch(/invalid p95/);
  });

  it('a metric without a threshold entry is a breach (no default pass)', () => {
    const breaches = breachesOf([{ name: 'unlisted-metric', p95: 1 }], {});
    expect(breaches[0]).toMatch(/no threshold entry/);
  });

  it('every shipped threshold is a finite positive number', () => {
    for (const [name, ms] of Object.entries(THRESHOLDS_MS)) {
      expect(Number.isFinite(ms) && ms > 0, name).toBe(true);
    }
  });
});
