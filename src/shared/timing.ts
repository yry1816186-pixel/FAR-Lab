import { performance } from 'node:perf_hooks';

export type MonotonicClock = () => number;

/**
 * Process-local monotonic time for elapsed-duration measurements.
 *
 * Wall time (`Date.now()`) may step backwards when the host clock is corrected,
 * especially across a long-running child process. It remains appropriate for
 * timestamps, but must never own a persisted duration.
 */
export const monotonicMilliseconds = (): number => performance.now();

/** Return a whole-millisecond duration and fail visibly if the clock contract breaks. */
export const elapsedMilliseconds = (
  startedAt: number,
  clock: MonotonicClock = monotonicMilliseconds,
): number => {
  const elapsed = clock() - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new Error(`monotonic clock produced invalid elapsed duration: ${elapsed}`);
  }
  return Math.round(elapsed);
};
