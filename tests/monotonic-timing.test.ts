import { describe, expect, it, vi } from 'vitest';
import { elapsedMilliseconds, monotonicMilliseconds } from '../src/shared/timing.js';

describe('elapsed duration clock discipline', () => {
  it('stays nonnegative when wall time moves backwards', async () => {
    const wallClock = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(1_000);
    try {
      const startedAt = monotonicMilliseconds();
      await Promise.resolve();
      const wallStartedAt = Date.now();
      const wallEndedAt = Date.now();

      expect(wallEndedAt - wallStartedAt).toBe(-1_000);
      expect(elapsedMilliseconds(startedAt)).toBeGreaterThanOrEqual(0);
    } finally {
      wallClock.mockRestore();
    }
  });

  it('rounds a valid monotonic duration and rejects a broken clock contract', () => {
    expect(elapsedMilliseconds(10, () => 16.4)).toBe(6);
    expect(() => elapsedMilliseconds(10, () => 9)).toThrow('monotonic clock produced invalid elapsed duration');
  });
});
