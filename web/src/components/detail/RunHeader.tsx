import { Badge, TimeAgo } from '../common';
import { runProgress } from '../../api/types';
import type { ResearchRun, RunTruthClass } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { runStatusKey, runStatusTone } from '../../tones';
import { stageKey, truthClassKey } from '../../i18n/keys';
import { useRunTruth } from './ResearchStatePanel';
import type { BadgeTone } from '../common';

/** §5.5: the truth badge never lies by tone — only live is green; every non-live class warns. */
const truthTone = (c: RunTruthClass): BadgeTone => (c === 'live' ? 'ok' : c === 'empty' ? 'muted' : 'warn');

/**
 * Research page header: the study IS the page. The question the researcher
 * asked leads in the statement voice (serif); operational identity (run id,
 * timestamps) stays as quiet metadata. Progress is narrative and honest —
 * stage counts and the current stage name only, never an invented percentage.
 */
export function RunHeader({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const progress = runProgress(run);
  const active = run.status === 'running' || run.status === 'queued';
  const settling = run.status === 'paused' || run.status === 'partial';
  const question = run.questionText?.trim();
  const truth = useRunTruth(run.id);

  return (
    <header className="run-header">
      <div className="run-header-meta">
        <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>
        {truth !== null && (
          <Badge
            tone={truthTone(truth.klass)}
            title={t('truth.title', {
              klass: truth.klass,
              live: truth.modelCalls.live,
              test: truth.modelCalls.test,
              rlive: truth.retrieval.live,
              hit: truth.retrieval.hit,
              stale: truth.retrieval.stale,
              replay: truth.retrieval.replay,
              total: truth.totalReceipts,
            })}
          >
            {t(truthClassKey(truth.klass))}
          </Badge>
        )}
        {run.domain !== undefined && run.domain.length > 0 && (
          <span className="run-header-domain" title={t('runs.domain')}>{run.domain}</span>
        )}
        <TimeAgo iso={run.createdAt} />
      </div>
      {question !== undefined && question.length > 0 ? (
        <h1 className="run-header-question">{question}</h1>
      ) : (
        <h1 className="run-header-question run-header-question--pending">
          {t('runHeader.questionPending')}
        </h1>
      )}
      <p className="run-header-progress">
        {active && <span className="run-header-pulse" aria-hidden="true" />}
        {active ? (
          <>
            {t('runHeader.stageOf', { done: progress.done, total: progress.total })}
            <span className="run-header-sep" aria-hidden="true">·</span>
            {t(stageKey(run.currentStage))}
          </>
        ) : settling ? (
          <>
            {t('runHeader.stagesDone', { done: progress.done, total: progress.total })}
            <span className="run-header-sep" aria-hidden="true">·</span>
            {t(stageKey(run.currentStage))}
          </>
        ) : (
          t('runHeader.stagesDone', { done: progress.done, total: progress.total })
        )}
      </p>
    </header>
  );
}
