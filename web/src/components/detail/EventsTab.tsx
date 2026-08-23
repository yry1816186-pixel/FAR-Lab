import { useMemo, useState } from 'react';
import type { ResearchRun } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';
import { Badge, EmptyState, IdText, TimeText } from '../common';
import type { EventsState } from '../RunDetail';
import { runStatusKey, runStatusTone } from '../../tones';
import { stageKey } from '../../i18n/keys';
import { bucketEvents, eventCategory, type EventCategory } from '../../viz/cross-viz';

const MAX_RENDER = 300;

/**
 * Event stream view fed by the App-level 2s incremental poll (afterSeq).
 * Newest first; capped rendering with an honest "showing last N" note.
 * VIZ V6: category filter (lifecycle/model/retrieval/tool/agent/other) with
 * live per-bucket counts — the buckets derive from event types actually held.
 */
export function EventsTab({ run, events }: { run: ResearchRun; events: EventsState }): JSX.Element {
  const { t } = useI18n();
  const [category, setCategory] = useState<EventCategory | 'all'>('all');
  const ordered = useMemo(() => [...events.events].sort((a, b) => b.seq - a.seq), [events.events]);
  const buckets = useMemo(() => bucketEvents(ordered.map((e) => e.type)), [ordered]);
  const filtered = category === 'all' ? ordered : ordered.filter((e) => eventCategory(e.type) === category);
  const shown = filtered.slice(0, MAX_RENDER);

  return (
    <>
      <p className="muted small">{t('events.intro')}</p>
      {events.error !== null && <p className="callout callout--warn small">{events.error}</p>}
      {run.status === 'running' || run.status === 'queued' ? (
        <p className="muted small mono" aria-live="off">
          {t('events.pollingLive')}
        </p>
      ) : (
        <p className="muted small mono">⏸ {t(runStatusKey(run.status))}</p>
      )}
      {events.events.length === 0 ? (
        <EmptyState titleKey="events.empty" />
      ) : (
        <>
          <div className="event-filter" role="group" aria-label={t('events.filterLabel')}>
            <button
              type="button"
              className={`btn btn--sm${category === 'all' ? ' btn--primary' : ''}`}
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              {t('events.catAll', { n: ordered.length })}
            </button>
            {buckets.map((b) => (
              <button
                key={b.category}
                type="button"
                className={`btn btn--sm${category === b.category ? ' btn--primary' : ''}`}
                aria-pressed={category === b.category}
                onClick={() => setCategory(b.category)}
              >
                {t(`events.cat.${b.category}` as DictKey)} {b.count}
              </button>
            ))}
          </div>
          <p className="muted small">
            {t('events.latest', { n: events.lastSeq, m: events.total, k: Math.min(shown.length, MAX_RENDER) })}
          </p>
          <ol className="events-list">
            {shown.map((ev) => (
              <li key={ev.seq} className="event-item">
                <span className="mono event-seq">#{ev.seq}</span>
                <Badge tone={eventTone(ev.type)}>{t(eventKey(ev.type))}</Badge>
                <TimeText iso={ev.at} />
                {ev.stage !== undefined && (
                  <span className="muted small">{t(stageKey(ev.stage))}</span>
                )}
                {ev.status !== undefined && (
                  <Badge tone={runStatusTone(ev.status)}>{t(runStatusKey(ev.status))}</Badge>
                )}
                {ev.receiptId !== undefined && <IdText value={ev.receiptId} className="muted small" />}
                {ev.detail !== undefined && Object.keys(ev.detail).length > 0 && (
                  <details className="event-detail">
                    <summary>{t('events.detail')}</summary>
                    <pre className="pre-block small">{formatDetail(ev.detail)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function eventTone(type: string): 'ok' | 'err' | 'info' | 'warn' | 'muted' {
  switch (type) {
    case 'stage_done': case 'run_created': return 'ok';
    case 'stage_failed': return 'err';
    case 'stage_started': case 'run_status_changed': case 'run_resumed': return 'info';
    case 'run_cancelled': return 'warn';
    default: return 'muted';
  }
}

function eventKey(type: string): DictKey {
  return `event.${type}` as DictKey;
}

function formatDetail(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return Object.entries(detail)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('\n');
  }
}
