import type { ResearchRunDto, ResearchRunStatusSummary } from '@/entities/dtos.ts';
import { isLiveRunMode } from '@/entities/run.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { Section } from '@/shared/ui/StateBlock.tsx';
import { StageRail } from '@/shared/ui/StageRail.tsx';
import { RunGate } from './RunGate.tsx';

/**
 * Overview: live status (always real) + a compact outcome summary once the
 * frozen run exists. The aggregate run mode is stated verbatim with its
 * honesty note — a replay never reads as live.
 */
export function MissionOverview({
  status,
  run,
  runPending,
  runNotCompleted,
  runError,
}: {
  readonly status: ResearchRunStatusSummary;
  readonly run: ResearchRunDto | null;
  readonly runPending: boolean;
  readonly runNotCompleted: boolean;
  readonly runError: Error | null;
}) {
  const t = useT();
  const { locale } = useI18n();

  return (
    <div data-testid="mission-overview">
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={t('mission.overview.title')}>
          <KeyValueList>
            <KeyValue label={t('mission.overview.state')}>
              <Badge tone={status.state === 'COMPLETED' ? 'ok' : status.state === 'FAILED' ? 'danger' : status.state === 'CANCELLED' ? 'muted' : 'info'}>
                {status.state}
              </Badge>
            </KeyValue>
            <KeyValue label={t('mission.overview.profile')}>
              <span className="font-mono text-xs">{status.profile}</span>
            </KeyValue>
            <KeyValue label={t('mission.overview.startedAt')}>
              <time dateTime={status.startedAt}>{formatDateTime(status.startedAt, locale)}</time>
            </KeyValue>
            <KeyValue label={t('mission.overview.updatedAt')}>
              <time dateTime={status.updatedAt}>{formatDateTime(status.updatedAt, locale)}</time>
            </KeyValue>
            {status.completedAt !== null ? (
              <KeyValue label={t('mission.overview.completedAt')}>
                <time dateTime={status.completedAt}>{formatDateTime(status.completedAt, locale)}</time>
              </KeyValue>
            ) : null}
            {status.error !== null ? (
              <>
                <KeyValue label={t('mission.overview.error')}>
                  <span className="text-danger">{status.error}</span>
                </KeyValue>
                {status.errorKind !== null ? (
                  <KeyValue label={t('mission.overview.errorKind')}>
                    <span className="font-mono text-xs">{status.errorKind}</span>
                  </KeyValue>
                ) : null}
              </>
            ) : null}
          </KeyValueList>
        </Section>

        <Section title={t('mission.overview.stages')}>
          <StageRail completedStages={status.completedStages} failed={status.state === 'FAILED'} />
          <p className="mt-2 text-xs text-ink3">
            {t('stage.progress', { done: status.completedStages.length, total: status.completedStages.length + status.remainingStages.length })}
          </p>
        </Section>
      </div>

      <RunGate run={run} runPending={runPending} runNotCompleted={runNotCompleted} runError={runError}>
        {(frozen) => (
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title={t('mission.overview.outcomes')}>
              <KeyValueList>
                <KeyValue label={t('runMode.label')}>
                  <Badge tone={isLiveRunMode(frozen.runMode) ? 'ok' : 'warn'}>{frozen.runMode}</Badge>
                </KeyValue>
                <KeyValue label={t('mission.overview.hypotheses')}>{frozen.hypotheses.length}</KeyValue>
                <KeyValue label={t('mission.overview.corpus')}>{frozen.corpus.documentCount}</KeyValue>
                <KeyValue label={t('mission.overview.revisions')}>{frozen.revisions.length}</KeyValue>
                <KeyValue label={t('mission.overview.observations')}>{frozen.observations.length}</KeyValue>
                <KeyValue label={t('mission.overview.gateVerdict')}>
                  <span className="font-mono text-xs">{frozen.gateReport.verdict}</span>
                </KeyValue>
                <KeyValue label={t('mission.overview.primaryHypothesis')}>
                  <HashValue value={frozen.plan.primaryHypothesisId} />
                </KeyValue>
              </KeyValueList>
              {!isLiveRunMode(frozen.runMode) ? (
                <p className="mt-3 rounded border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink2" data-testid="runmode-note">
                  {t('runMode.honestNote')}
                </p>
              ) : null}
              {frozen.gateReport.reasons.length > 0 ? (
                <div className="mt-3">
                  <p className="label-micro mb-1">{t('mission.overview.gateReasons')}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
                    {frozen.gateReport.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>

            <Section title={t('mission.overview.modes')}>
              <KeyValueList>
                <KeyValue label={t('mission.overview.modeModel')}>
                  <span className="font-mono text-xs">{frozen.modes.modelExecutionMode}</span>
                </KeyValue>
                <KeyValue label={t('mission.overview.modeRetrieval')}>
                  <span className="font-mono text-xs">{frozen.modes.retrievalExecutionMode}</span>
                </KeyValue>
                <KeyValue label={t('mission.overview.modeExperiment')}>
                  <span className="font-mono text-xs">{frozen.modes.experimentExecutionMode}</span>
                </KeyValue>
              </KeyValueList>
            </Section>
          </div>
        )}
      </RunGate>
    </div>
  );
}
