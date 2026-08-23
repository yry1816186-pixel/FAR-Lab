import { useEffect, useRef, useState } from 'react';
import type { RunEvent } from '../api/types';
import {
  INITIAL_STREAM_SNAPSHOT,
  nextStreamSnapshot,
  type StreamSnapshot,
} from './eventStreamTracker';

/**
 * B3 realtime events: server push over SSE (`GET /api/v1/runs/:id/events/stream`)
 * with automatic reconnect (EventSource) and Last-event-ID resume. Callers keep
 * their polling as the fallback — delivered events merge through the same
 * seq-cursor path as polled ones, so redelivery on reconnect is idempotent.
 *
 * The returned snapshot (HX-3) makes connection health VISIBLE: `reconnecting`
 * carries a live attempt counter, `polling-fallback` means no server push this
 * session (unsupported environment, or the browser gave up after a mid-stream
 * drop) and polling alone carries the feed. `live`/`idle` stay silent — a calm
 * default; the UI only speaks when something needs saying.
 */
export function useEventStream(
  runId: string | null,
  enabled: boolean,
  onEvents: (events: RunEvent[]) => void,
): StreamSnapshot {
  const [snapshot, setSnapshot] = useState<StreamSnapshot>(INITIAL_STREAM_SNAPSHOT);
  const cbRef = useRef(onEvents);
  cbRef.current = onEvents;

  useEffect(() => {
    if (runId === null || !enabled || typeof EventSource === 'undefined') {
      setSnapshot(INITIAL_STREAM_SNAPSHOT);
      return undefined;
    }
    let es: EventSource;
    try {
      es = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events/stream`);
    } catch {
      setSnapshot(INITIAL_STREAM_SNAPSHOT);
      return undefined;
    }
    let opened = false;
    es.onopen = (): void => {
      opened = true;
      setSnapshot((s) => nextStreamSnapshot(s, 'open'));
    };
    es.addEventListener('run-event', (ev: Event): void => {
      try {
        const data = JSON.parse((ev as MessageEvent<string>).data) as RunEvent;
        cbRef.current([data]);
      } catch {
        // Malformed frame — the polling fallback still converges the feed.
      }
    });
    es.onerror = (): void => {
      if (!opened) {
        // Never opened in this environment: stop trying; polling takes over.
        es.close();
        setSnapshot((s) => nextStreamSnapshot(s, 'unsupported'));
        return;
      }
      if (es.readyState === EventSource.CONNECTING) {
        // Dropped mid-stream; the browser retries on its own schedule.
        setSnapshot((s) => nextStreamSnapshot(s, 'retrying'));
      } else {
        // Browser exhausted its retries: close honestly, polling carries on.
        es.close();
        setSnapshot((s) => nextStreamSnapshot(s, 'gave-up'));
      }
    };
    return () => {
      es.close();
      setSnapshot(INITIAL_STREAM_SNAPSHOT);
    };
  }, [runId, enabled]);

  return snapshot;
}
