import { useEffect, useRef, useState } from 'react';
import type { RunEvent } from '../api/types';

/**
 * B3 realtime events: server push over SSE (`GET /api/v1/runs/:id/events/stream`)
 * with automatic reconnect (EventSource) and Last-Event-ID resume. Returns
 * whether the stream is ACTIVE; callers keep their polling as the fallback —
 * when the stream never opens (unsupported environment, proxy), polling alone
 * carries the feed. Delivered events are merged by the caller through the same
 * seq-cursor path as polled events, so redelivery on reconnect is idempotent.
 */
export function useEventStream(
  runId: string | null,
  enabled: boolean,
  onEvents: (events: RunEvent[]) => void,
): boolean {
  const [active, setActive] = useState(false);
  const cbRef = useRef(onEvents);
  cbRef.current = onEvents;

  useEffect(() => {
    if (runId === null || !enabled || typeof EventSource === 'undefined') {
      setActive(false);
      return undefined;
    }
    let es: EventSource;
    try {
      es = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events/stream`);
    } catch {
      setActive(false);
      return undefined;
    }
    let opened = false;
    es.onopen = (): void => {
      opened = true;
      setActive(true);
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
      // Never opened in this environment: stop trying; polling takes over.
      // After a successful open, EventSource reconnects by itself (the 10-minute
      // server-side stream lifetime is by design).
      if (!opened) {
        es.close();
        setActive(false);
      }
    };
    return () => {
      es.close();
      setActive(false);
    };
  }, [runId, enabled]);

  return active;
}
