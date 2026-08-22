import { useCallback } from 'react';
import { TriangleAlert } from 'lucide-react';
import { isNotFound } from '../../api/client';
import { getQuestion, getRevisions } from '../../api/endpoints';
import type { ResearchQuestion, ResearchRun } from '../../api/types';
import { runProgress } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { runStatusKey, runStatusTone } from '../../tones';
import { Badge, CountProgress, EmptyState, ErrorBox, FieldList, IdText, Section, Skeleton, TimeText } from '../common';
import { StageTimeline } from './StageTimeline';
import { RunControls } from './RunControls';
import { FeedbackForm } from './FeedbackForm';
import { stageKey, goalTypeKey } from '../../i18n/keys';

export function OverviewTab({ run, onMutated }: { run: ResearchRun; onMutated: () => void }): JSX.Element {
  const { t } = useI18n();
  const refreshKey = `${run.updatedAt}:${run.status}`;

  const questionFetcher = useCallback((signal: AbortSignal) => getQuestion(run.id, signal), [run.id]);
  const questionRes = useResource(questionFetcher, [run.id], refreshKey);

  const revisionsFetcher = useCallback((signal: AbortSignal) => getRevisions(run.id, signal), [run.id]);
  const revisionsRes = useResource(revisionsFetcher, [run.id], refreshKey);
  const hasFeedback = (revisionsRes.data?.feedbacks.length ?? 0) > 0;

  const progress = runProgress(run);
  const failedStages = run.stages.filter((s) => s.state === 'failed');

  return (
    <div className="tab-content">
      <Section title={t('overview.meta')}>
        <FieldList
          items={[
            { key: t('overview.runId'), value: <IdText value={run.id} /> },
            {
              key: t('runs.currentStage'),
              value: (
                <>
                  <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>{' '}
                  {t(stageKey(run.currentStage))}
                </>
              ),
            },
            {
              key: t('overview.coreProgress'),
              value: <CountProgress done={progress.done} total={progress.total} label={t('runs.progress', progress)} />,
            },
            { key: t('overview.createdAt'), value: <TimeText iso={run.createdAt} /> },
            { key: t('overview.updatedAt'), value: <TimeText iso={run.updatedAt} /> },
            ...(run.parentRunId !== undefined
              ? [{ key: t('overview.parentRun'), value: <IdText value={run.parentRunId} /> }]
              : []),
            ...(run.tags.length > 0 ? [{ key: t('overview.tags'), value: <span className="mono">{run.tags.join(', ')}</span> }] : []),
          ]}
        />
        {run.cancelRequested && (
          <p className="callout callout--warn">{t('controls.cancelRequested')}</p>
        )}
        {(run.status === 'running' || run.status === 'queued') && run.leaseInfo !== undefined && !run.leaseInfo.live && (
          <p className="callout callout--warn" role="status"><TriangleAlert size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('overview.frozenHint')}</p>
        )}
        {(run.status === 'partial' || run.status === 'failed') && (
          <div className="callout callout--err" role="alert">
            <strong>{run.status === 'partial' ? t('overview.partialNotice') : t('status.failed')}</strong>
            {run.lastError !== undefined && <div className="mono small">{run.lastError}</div>}
            {failedStages.length > 0 && (
              <div>
                {t('overview.failedStages')}:{' '}
                {failedStages.map((s) => t(stageKey(s.stage))).join(t('common.sep'))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title={t('overview.question')}>
        {questionRes.loading ? (
          <Skeleton lines={4} />
        ) : questionRes.error !== null && isNotFound(questionRes.error) ? (
          <EmptyState titleKey="overview.noQuestion" hint={t('overview.noQuestionHint', { stage: t(stageKey(run.currentStage)) })} />
        ) : questionRes.error !== null ? (
          <ErrorBox error={questionRes.error} onRetry={questionRes.retry} />
        ) : questionRes.data !== null ? (
          <QuestionScope question={questionRes.data} />
        ) : null}
      </Section>

      <Section title={t('overview.timeline')}>
        <StageTimeline run={run} />
      </Section>

      <Section title={t('overview.controls')}>
        <RunControls run={run} hasFeedback={hasFeedback} onMutated={onMutated} />
        <div className="feedback-block">
          <h4 className="minor-title">{t('feedback.title')}</h4>
          <FeedbackForm runId={run.id} onSubmitted={onMutated} />
        </div>
      </Section>
    </div>
  );
}

function QuestionScope({ question }: { question: ResearchQuestion }): JSX.Element {
  const { t } = useI18n();
  const c = question.constraints;
  const constraintGroups: [labelKey: Parameters<typeof t>[0], items: string[]][] = [
    ['overview.assumptions', c.assumptions],
    ['overview.dataConstraints', c.dataConstraints],
    ['overview.resourceConstraints', c.resourceConstraints],
    ['overview.ethicalConstraints', c.ethicalConstraints],
    ['overview.methodologicalConstraints', c.methodologicalConstraints],
  ];
  const activeConstraints = constraintGroups.filter(([, items]) => items.length > 0);

  return (
    <div className="question-scope">
      <p className="question-text">{question.text}</p>
      <FieldList
        items={[
          { key: t('overview.goalType'), value: t(goalTypeKey(question.goalType)) },
          { key: t('overview.domain'), value: question.scope.domain },
          ...(question.background.trim().length > 0 ? [{ key: t('overview.background'), value: question.background }] : []),
          { key: t('overview.phenomena'), value: question.scope.phenomena.join('；') },
          ...(question.scope.temporalBoundary !== undefined ? [{ key: t('overview.temporalBoundary'), value: question.scope.temporalBoundary }] : []),
          ...(question.scope.spatialOrSystemBoundary !== undefined ? [{ key: t('overview.spatialBoundary'), value: question.scope.spatialOrSystemBoundary }] : []),
          ...(question.scope.populationOrScopeNotes !== undefined ? [{ key: t('overview.populationNotes'), value: question.scope.populationOrScopeNotes }] : []),
        ]}
      />
      <div className="scope-lists">
        {question.scope.inScope.length > 0 && (
          <div>
            <h4 className="minor-title">{t('overview.inScope')}</h4>
            <ul>
              {question.scope.inScope.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {question.scope.outOfScope.length > 0 && (
          <div>
            <h4 className="minor-title">{t('overview.outOfScope')}</h4>
            <ul>
              {question.scope.outOfScope.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
      {activeConstraints.length > 0 && (
        <details className="constraints">
          <summary>{t('overview.constraints')}</summary>
          <dl className="fieldlist">
            {activeConstraints.map(([labelKey, items]) => (
              <div className="fieldlist-row" key={labelKey}>
                <dt>{t(labelKey)}</dt>
                <dd>{items.join('；')}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
