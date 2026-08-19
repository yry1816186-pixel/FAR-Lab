/**
 * features/events/EventsPage — global agent-loop event stream (live SSE surface).
 *
 * v2 rewrite note: the v1 global events page was lost in the rewrite while its
 * data layer (`useAgentEventStream`) survived with zero consumers. This page
 * restores the surface against the real `/api/v1/events/stream` endpoint.
 *
 * Honesty contract:
 *   - The status badge reflects the real EventSource state (connecting / live /
 *     closed); no fake "live" when the stream drops.
 *   - `replay=true` history frames and live frames share one list; the replay
 *     boundary is not marked per-frame (the stream itself does not mark it —
 *     never invent a divider the protocol does not provide).
 *   - Environments without EventSource degrade to an explicit unavailable block.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { AgentEventDto } from '@/entities/dtos.ts';
import { useAgentEventStream, type Stamped } from '@/shared/api/sse.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { Badge, type Tone } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { Section } from '@/shared/ui/StateBlock.tsx';

const STATUS_TONE: Readonly<Record<string, Tone>> = {
  connecting: 'warn',
  live: 'ok',
  closed: 'muted',
};

/** Short per-event summary line — fields that actually exist on each variant. */
function eventSummary(evt: AgentEventDto): string {
  switch (evt.type) {
    case 'run_started':
      return `iterations≤${evt.maxIterations}${evt.verdictDriven ? ' · verdict-driven' : ''}`;
    case 'stage_started':
      return `iter ${evt.iteration} · ${evt.stageId}`;
    case 'stage_completed':
      return `iter ${evt.iteration} · ${evt.stageId} · ${evt.payloadKind}${evt.degraded ? ' · degraded' : ''} · ${evt.tokens} tok`;
    case 'iteration_completed':
      return `iter ${evt.iteration} · ${evt.tokensConsumed} tok · verdict ${evt.verdict ?? '—'}`;
    case 'run_completed':
      return `${evt.reason} · ${evt.iterations} iter · ${evt.artifactCount} artifacts · verdict ${evt.verdict ?? '—'}`;
    case 'run_error':
      return `${evt.code} · iter ${evt.iterations} · ${evt.message}`;
    case 'stage_held':
      return `iter ${evt.iteration} · ${evt.stageId} held`;
    case 'stage_resumed':
      return `iter ${evt.iteration} · ${evt.stageId} resumed`;
  }
}

function EventRow({ evt }: { readonly evt: Stamped<AgentEventDto> }): ReactNode {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 py-1.5 text-xs last:border-0">
      <span className="w-10 shrink-0 font-mono text-ink3">#{evt.clientSeq}</span>
      <Badge tone={evt.type === 'run_error' ? 'danger' : evt.type === 'run_completed' ? 'ok' : 'info'}>
        {evt.type}
      </Badge>
      <span className="font-mono text-ink2">{evt.runId.slice(0, 12)}…</span>
      <span className="flex-1 text-ink2">{eventSummary(evt)}</span>
      <time className="font-mono text-ink3" dateTime={evt.ts}>{evt.ts.slice(11, 19)}</time>
    </li>
  );
}

export default function EventsPage(): ReactNode {
  const t = useT();
  const [filterDraft, setFilterDraft] = useState('');
  const [filterRunId, setFilterRunId] = useState('');
  const [clearedAt, setClearedAt] = useState(0);
  const [follow, setFollow] = useState(true);
  const stream = useAgentEventStream({
    ...(filterRunId.length > 0 ? { runId: filterRunId } : {}),
  });
  const logRef = useRef<HTMLOListElement>(null);

  const visible = stream.events.filter((e) => e.clientSeq > clearedAt);

  // Bottom-follow: only when the user has not disabled it; Clear semantics =
  // watermark (clear the view), never a permanent mute of the stream.
  useEffect(() => {
    if (follow && logRef.current !== null) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visible.length, follow]);

  const unavailable = typeof EventSource === 'undefined';

  return (
    <div data-testid="events-page">
      <PageHeader title={t('events.title')} lede={t('events.lede')} />
      <Section title={t('events.streamTitle')}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[stream.status] ?? 'muted'} data-testid="events-status">
            {t(`events.status.${stream.status}` as const)}
          </Badge>
          <span className="text-xs text-ink3">
            {t('events.count', { shown: visible.length, total: stream.events.length })}
          </span>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setFilterRunId(filterDraft.trim());
              setClearedAt(0);
            }}
          >
            <input
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              placeholder={t('events.filterPlaceholder')}
              aria-label={t('events.filterLabel')}
              className="w-56 rounded border border-borderStrong bg-surface px-2 py-1 font-mono text-xs text-ink placeholder:text-ink3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Button type="submit" variant="outline" size="sm" disabled={filterDraft.trim().length === 0}>
              {t('events.filterApply')}
            </Button>
            {filterRunId.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterRunId('');
                  setFilterDraft('');
                  setClearedAt(0);
                }}
              >
                {t('events.filterClear')}
              </Button>
            ) : null}
          </form>
          <span className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink2">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {t('events.follow')}
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearedAt(stream.events.length > 0 ? stream.events[stream.events.length - 1]!.clientSeq : 0)}
              disabled={visible.length === 0}
            >
              {t('events.clearView')}
            </Button>
          </span>
        </div>
        {unavailable ? (
          <p role="note" className="rounded border border-warn/50 bg-warn/5 px-3 py-2 text-sm text-warn" data-testid="events-unavailable">
            {t('events.unavailable')}
          </p>
        ) : (
          <ol
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label={t('events.streamTitle')}
            className="max-h-[28rem] overflow-y-auto rounded border border-border bg-surface2/40 px-3 py-1"
            data-testid="events-log"
          >
            {visible.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink3" data-testid="events-empty">
                {t('events.empty')}
              </li>
            ) : (
              visible.map((evt) => <EventRow key={evt.clientSeq} evt={evt} />)
            )}
          </ol>
        )}
        {stream.error !== null ? (
          <p role="alert" className="mt-2 text-sm text-danger">{stream.error}</p>
        ) : null}
      </Section>
    </div>
  );
}
