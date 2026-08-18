/**
 * shared/api/sse — Server-Sent Events lifecycle, in one place.
 *
 * Two real streams exist on the backend:
 *   - GET /api/v1/research/:runId/events — `state` snapshot frame, then
 *     `research` lifecycle frames, `: ping` keepalives; the server closes the
 *     stream after a terminal state.
 *   - GET /api/v1/events/stream — global agent-loop frames (optional bus;
 *     absent producer ⇒ an honest "no events" surface, never fake activity).
 *
 * EventSource auto-reconnects natively on network interruption (the browser
 * re-issues the request with Last-Event-ID); a dropped connection is shown as
 * "reconnecting", never as "live".
 */

import { useEffect, useRef, useState } from 'react';

import type { AgentEventDto, ResearchRunEventDto, ResearchRunStatusSummary } from '@/entities/dtos.ts';
import { buildApiUrl } from './http.ts';

export type StreamStatus = 'connecting' | 'live' | 'closed';

/** Events are stamped with a client-side sequence so React keys stay stable across reconnects. */
export type Stamped<T> = T & { readonly clientSeq: number };

export interface ResearchEventStreamState {
  readonly status: StreamStatus;
  /** Latest `state` snapshot (research status summary), null before it arrives. */
  readonly snapshot: ResearchRunStatusSummary | null;
  readonly events: readonly Stamped<ResearchRunEventDto>[];
  readonly error: string | null;
}

const RESEARCH_FRAME = 'research';
const STATE_FRAME = 'state';

/**
 * Subscribe to one mission's lifecycle stream. Re-subscribing (runId change)
 * swaps in a fresh view — events of a previous run never linger.
 */
export function useResearchEventStream(
  runId: string,
  options?: { readonly maxEvents?: number; readonly enabled?: boolean },
): ResearchEventStreamState {
  const maxEvents = options?.maxEvents ?? 200;
  const enabled = options?.enabled ?? true;

  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [snapshot, setSnapshot] = useState<ResearchRunStatusSummary | null>(null);
  const [events, setEvents] = useState<readonly Stamped<ResearchRunEventDto>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || runId.length === 0 || typeof EventSource === 'undefined') {
      setStatus('closed');
      return;
    }
    setEvents([]);
    setSnapshot(null);
    setError(null);
    setStatus('connecting');

    const es = new EventSource(buildApiUrl(`/api/v1/research/${encodeURIComponent(runId)}/events`));
    let active = true;

    es.addEventListener(STATE_FRAME, (evt: MessageEvent<string>) => {
      if (!active) return;
      try {
        setSnapshot(JSON.parse(evt.data) as ResearchRunStatusSummary);
        setStatus('live');
      } catch {
        setError('state frame parse failed');
      }
    });

    es.addEventListener(RESEARCH_FRAME, (evt: MessageEvent<string>) => {
      if (!active) return;
      try {
        const parsed = JSON.parse(evt.data) as ResearchRunEventDto;
        seqRef.current += 1;
        setEvents((prev) => [...prev, { ...parsed, clientSeq: seqRef.current }].slice(-maxEvents));
        setStatus('live');
      } catch {
        setError('event frame parse failed');
      }
    });

    es.addEventListener('open', () => {
      if (active) setStatus('live');
    });
    // Native auto-reconnect: a transient drop reads as "connecting", events kept.
    es.addEventListener('error', () => {
      if (active) setStatus('connecting');
    });

    return () => {
      active = false;
      es.close();
      setStatus('closed');
    };
  }, [runId, maxEvents, enabled]);

  return { status, snapshot, events, error };
}

export interface AgentEventStreamState {
  readonly status: StreamStatus;
  readonly events: readonly Stamped<AgentEventDto>[];
  readonly lastEvent: Stamped<AgentEventDto> | null;
  readonly error: string | null;
}

const AGENT_EVENT_TYPES: readonly string[] = [
  'run_started',
  'stage_started',
  'stage_completed',
  'iteration_completed',
  'run_completed',
  'run_error',
  'stage_held',
  'stage_resumed',
];

/**
 * Subscribe to the global agent-loop stream (`replay=true` first replays the
 * retained history, then live frames follow). Used by the claim-assay surface
 * to show real progress of a hypothesize run.
 */
export function useAgentEventStream(options?: {
  readonly runId?: string;
  readonly maxEvents?: number;
  readonly enabled?: boolean;
}): AgentEventStreamState {
  const runId = options?.runId;
  const maxEvents = options?.maxEvents ?? 200;
  const enabled = options?.enabled ?? true;

  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [events, setEvents] = useState<readonly Stamped<AgentEventDto>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      setStatus('closed');
      return;
    }
    setEvents([]);
    setError(null);
    setStatus('connecting');

    const extraParams: Record<string, string> = { replay: 'true' };
    if (runId !== undefined && runId.length > 0) extraParams['runId'] = runId;
    const es = new EventSource(buildApiUrl('/api/v1/events/stream', extraParams));
    let active = true;

    const handleFrame = (evt: MessageEvent<string>): void => {
      if (!active) return;
      try {
        const parsed = JSON.parse(evt.data) as AgentEventDto;
        seqRef.current += 1;
        setEvents((prev) => [...prev, { ...parsed, clientSeq: seqRef.current }].slice(-maxEvents));
        setStatus('live');
      } catch {
        setError('SSE frame parse failed');
      }
    };

    es.addEventListener('open', () => {
      if (active) setStatus('live');
    });
    es.addEventListener('error', () => {
      if (active) setStatus('connecting');
    });
    for (const type of AGENT_EVENT_TYPES) {
      es.addEventListener(type, handleFrame);
    }

    return () => {
      active = false;
      es.close();
      setStatus('closed');
    };
  }, [runId, maxEvents, enabled]);

  return {
    status,
    events,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
    error,
  };
}
