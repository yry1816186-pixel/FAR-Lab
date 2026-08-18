import type { ResearchRunDto, ResearchRunStatusSummary } from '@/entities/dtos.ts';
import { isTerminalState } from '@/entities/run.ts';
import { useResearchAnalyze } from '@/shared/api/endpoints.ts';
import type { Stamped } from '@/shared/api/sse.ts';
import type { ResearchRunEventDto } from '@/entities/dtos.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { JsonBlock } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, Section, StreamStatusLine } from '@/shared/ui/StateBlock.tsx';

function EventLog({ events }: { readonly events: readonly Stamped<ResearchRunEventDto>[] }) {
  const { locale } = useI18n();
  const t = useT();
  if (events.length === 0) return <EmptyBlock title={t('mission.execution.noEvents')} />;
  return (
    <ol className="max-h-96 space-y-1 overflow-y-auto rounded border border-border bg-surface2 p-3 font-mono text-xs" role="log" aria-label={t('mission.execution.events')}>
      {events.map((event) => (
        <li key={event.clientSeq} className="flex gap-2 text-ink2">
          <time dateTime={event.at} className="shrink-0 text-ink3">
            {formatDateTime(event.at, locale)}
          </time>
          <span className="shrink-0 text-accent">{event.type}</span>
          <span className="hash-wrap text-ink3">
            {'stageId' in event ? event.stageId : 'to' in event ? `${event.from} → ${event.to}` : 'error' in event ? event.error : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Execution view: the live event stream, real-data observations, analysis. */
export function MissionExecution({
  runId,
  status,
  run,
  runNotCompleted,
  events,
  streamStatus,
}: {
  readonly runId: string;
  readonly status: ResearchRunStatusSummary;
  readonly run: ResearchRunDto | null;
  readonly runNotCompleted: boolean;
  readonly events: readonly Stamped<ResearchRunEventDto>[];
  readonly streamStatus: 'connecting' | 'live' | 'closed';
}) {
  const t = useT();
  const { locale } = useI18n();
  const analyze = useResearchAnalyze(runId);
  const terminal = isTerminalState(status.state);
  const canAnalyze = status.state === 'COMPLETED' && run !== null;

  return (
    <div data-testid="mission-execution">
      {!terminal ? (
        <Section
          title={t('mission.execution.events')}
          actions={
            <StreamStatusLine
              status={streamStatus}
              labels={{
                connecting: t('mission.stream.connecting'),
                live: t('mission.stream.live'),
                closed: t('mission.stream.closed'),
              }}
            />
          }
        >
          <EventLog events={events} />
        </Section>
      ) : null}

      <Section title={t('mission.execution.analyze.title')}>
        {runNotCompleted || !canAnalyze ? (
          <p className="text-sm text-ink3">{t('mission.execution.analyze.needsCompleted')}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={analyze.isPending} onClick={() => analyze.mutate({ live: false })} data-testid="analyze-replay">
                {t('mission.execution.analyze.replay')}
              </Button>
              <Button variant="outline" size="sm" disabled={analyze.isPending} onClick={() => analyze.mutate({ live: true })} data-testid="analyze-live">
                {t('mission.execution.analyze.live')}
              </Button>
            </div>
            {analyze.isPending ? <p role="status" className="text-sm text-ink2">{t('mission.execution.analyze.running')}</p> : null}
            {analyze.isError ? <ErrorBlock error={analyze.error} testId="analyze-error" /> : null}
            {analyze.isSuccess ? (
              <p role="status" className="text-sm text-ok" data-testid="analyze-done">
                {t('mission.execution.analyze.done')}
              </p>
            ) : null}
          </div>
        )}
      </Section>

      <Section title={`${t('mission.execution.observations')} (${String(run?.observations.length ?? 0)})`}>
        {run === null || run.observations.length === 0 ? (
          <EmptyBlock title={t('mission.execution.noObservations')} />
        ) : (
          <div className="space-y-4">
            {run.observations.map((observation) => (
              <article key={observation.id} className="rounded border border-border px-4 py-3" aria-label={observation.id}>
                <header className="flex flex-wrap items-center gap-2 text-xs text-ink3">
                  <span className="font-mono">{observation.adapter}</span>
                  <Badge tone={observation.mode === 'LIVE' ? 'ok' : 'warn'}>{observation.mode}</Badge>
                  <time dateTime={observation.producedAt} className="ml-auto font-mono">
                    {formatDateTime(observation.producedAt, locale)}
                  </time>
                </header>
                <div className="mt-2 text-sm text-ink2">
                  <JsonBlock value={observation.result} />
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
