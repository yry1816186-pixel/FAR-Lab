import { describe, expect, it } from 'vitest';
import { computeEProcess, eProcessThresholdForAlpha } from '../src/domain/e-process.js';

describe('bounded e-process', () => {
  it('is deterministic and returns a nonnegative finite value', () => {
    const result = computeEProcess([1, 1, 0, 1], { direction: 'above', threshold: 0.5, lower: 0, upper: 1 });
    expect(result.n).toBe(4);
    expect(result.eValue).toBeCloseTo(result.factors.reduce((a, b) => a * b, 1), 12);
    expect(result.eValue).toBeGreaterThanOrEqual(0);
  });

  it('rejects rows and thresholds outside preregistered bounds', () => {
    expect(() => computeEProcess([2], { direction: 'above', threshold: 0.5, lower: 0, upper: 1 })).toThrow(/outside/);
    expect(() => computeEProcess([1], { direction: 'above', threshold: 2, lower: 0, upper: 1 })).toThrow(/outside/);
  });

  it('maps alpha to the anytime-valid stopping threshold', () => {
    expect(eProcessThresholdForAlpha(0.05)).toBeCloseTo(20, 12);
    expect(() => eProcessThresholdForAlpha(0)).toThrow();
  });
});
