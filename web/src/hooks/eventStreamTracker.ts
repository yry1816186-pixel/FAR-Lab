/**
 * SSE connection state machine (HX-3 residual: visible reconnect honesty) —
 * pure and framework-free so the transitions are unit-testable in the node
 * suite. The React hook (useEventStream) only maps EventSource events onto
 * these signals; every derived UI state (reconnect banner, polling fallback)
 * comes from here, never invented.
 */

export type StreamPhase =
  | 'idle'
  /** Connected and receiving server push. */
  | 'live'
  /** Opened before, dropped; the browser is retrying (attempt counter live). */
  | 'reconnecting'
  /** No server push this session (unsupported/never opened) or the browser gave
   * up after a mid-stream drop — polling alone carries the feed. */
  | 'polling-fallback';

export interface StreamSnapshot {
  readonly phase: StreamPhase;
  /** Failed retry cycles since the stream was last live (0 while live). */
  readonly attempts: number;
}

export const INITIAL_STREAM_SNAPSHOT: StreamSnapshot = { phase: 'idle', attempts: 0 } as const;

export type StreamSignal =
  /** EventSource.onopen */
  | 'open'
  /** onerror after a successful open, readyState CONNECTING (browser retrying) */
  | 'retrying'
  /** onerror after a successful open, readyState CLOSED (browser gave up) */
  | 'gave-up'
  /** onerror with no successful open this session (unsupported environment) */
  | 'unsupported'
  /** Unmount / run change: no stream claims anything */
  | 'reset';

export function nextStreamSnapshot(prev: StreamSnapshot, signal: StreamSignal): StreamSnapshot {
  switch (signal) {
    case 'reset':
      return INITIAL_STREAM_SNAPSHOT;
    case 'open':
      return { phase: 'live', attempts: 0 };
    case 'retrying':
      return { phase: 'reconnecting', attempts: prev.attempts + 1 };
    case 'gave-up':
      return { phase: 'polling-fallback', attempts: prev.attempts };
    case 'unsupported':
      return { phase: 'polling-fallback', attempts: 0 };
  }
}
