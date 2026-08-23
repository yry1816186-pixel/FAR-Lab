import { describe, expect, it } from 'vitest';
import {
  INITIAL_STREAM_SNAPSHOT,
  nextStreamSnapshot,
  type StreamSnapshot,
} from '../web/src/hooks/eventStreamTracker';

/**
 * HX-3 visible-reconnect state machine: the deterministic core behind
 * useEventStream. Every UI claim the StreamStatusChip makes (attempt counter,
 * polling fallback) must be derivable here — no invented connection states.
 */

const step = (snap: StreamSnapshot, ...signals: Parameters<typeof nextStreamSnapshot>[1][]): StreamSnapshot =>
  signals.reduce(nextStreamSnapshot, snap);

describe('nextStreamSnapshot', () => {
  it('starts idle and resets from anywhere', () => {
    expect(INITIAL_STREAM_SNAPSHOT).toEqual({ phase: 'idle', attempts: 0 });
    const hot = step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying', 'retrying');
    expect(nextStreamSnapshot(hot, 'reset')).toEqual(INITIAL_STREAM_SNAPSHOT);
  });

  it('open -> live with a zeroed attempt counter', () => {
    const reconnected = step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying', 'retrying', 'open');
    expect(reconnected).toEqual({ phase: 'live', attempts: 0 });
  });

  it('mid-stream drops count retries: attempt N is visible while the browser retries', () => {
    expect(step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying')).toEqual({ phase: 'reconnecting', attempts: 1 });
    expect(step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying', 'retrying')).toEqual({ phase: 'reconnecting', attempts: 2 });
  });

  it('browser giving up lands on polling-fallback and keeps the honest count', () => {
    const gaveUp = step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying', 'retrying', 'gave-up');
    expect(gaveUp).toEqual({ phase: 'polling-fallback', attempts: 2 });
  });

  it('never-opened environments are polling-fallback with zero attempts (not a reconnect)', () => {
    expect(step(INITIAL_STREAM_SNAPSHOT, 'unsupported')).toEqual({ phase: 'polling-fallback', attempts: 0 });
  });

  it('a gave-up stream that later reopens is live again with a fresh counter', () => {
    const revived = step(INITIAL_STREAM_SNAPSHOT, 'open', 'retrying', 'gave-up', 'open');
    expect(revived).toEqual({ phase: 'live', attempts: 0 });
  });
});
