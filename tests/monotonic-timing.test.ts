import { describe, expect, it } from 'vitest';
import { elapsedMilliseconds } from '../src/shared/timing.js';

describe('elapsed duration clock discipline', () => {
  it('derives duration from the supplied monotonic clock, not wall-clock values', () => {
    const wallStartedAt = 2_000;
    const wallEndedAt = 1_000;

    expect(wallEndedAt - wallStartedAt).toBe(-1_000);
    expect(elapsedMilliseconds(100, () => 106)).toBe(6);
  });

  it('rounds a valid monotonic duration and rejects a broken clock contract', () => {
    expect(elapsedMilliseconds(10, () => 16.4)).toBe(6);
    expect(() => elapsedMilliseconds(10, () => 9)).toThrow('monotonic clock produced invalid elapsed duration');
  });
});
