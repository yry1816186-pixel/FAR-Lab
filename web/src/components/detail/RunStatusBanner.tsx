import { useEffect, useState } from 'react';
import { resumeRun } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { runProgress } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { stageKey } from '../../i18n/keys';

/**
 * Proactive run banner (P-IA): the workbench tells you what is happening and
 * what to do next, derived ONLY from real run state — stage, progress, lease
 * liveness, elapsed/updated time. The resume action is the same endpoint the
 * control panel uses. No invented progress, no fake liveness.
 */
export function RunStatusBanner({ run, onMutated }: { run: ResearchRun; onMutated: () => void }): JSX.Element | null {
  const { t } = useI18n();
  const [resuming, setResuming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const progress = runProgress(run);
  const elapsedMin = Math.max(0, Math.round((now - Date.parse(run.createdAt)) / 60_000));
  const updatedAgoSec = Math.max(0, Math.round((now - Date.parse(run.updatedAt)) / 1000));

  const doResume = async (): Promise<void> => {
    setResuming(true);
    try {
      await resumeRun(run.id);
      onMutated();
    } finally {
      setResuming(false);
    }
  };

  if (run.status === 'running' || run.status === 'queued') {
    const frozen = run.leaseInfo !== undefined && !run.leaseInfo.live;
    if (frozen) {
      return (
        <div className="run-banner run-banner--warn arrive" role="status">
          <span className="run-banner-text">
            {t('banner.frozen', { minutes: elapsedMin })}
          </span>
          <button type="button" className="btn btn--small btn--primary" onClick={() => void doResume()} disabled={resuming}>
            {resuming ? t('banner.resuming') : t('banner.resumeNow')}
          </button>
        </div>
      );
    }
    if (run.status === 'queued') {
      return (
        <div className="run-banner run-banner--info arrive" role="status">
          <span className="run-banner-pulse" aria-hidden="true" />
          <span className="run-banner-text">{t('banner.queued')}</span>
        </div>
      );
    }
    return (
      <div className="run-banner run-banner--info arrive" role="status">
        <span className="run-banner-pulse" aria-hidden="true" />
        <span className="run-banner-text">
          {t('banner.running', {
            stage: t(stageKey(run.currentStage)),
            done: progress.done,
            total: progress.total,
            minutes: elapsedMin,
          })}
        </span>
        <span className="run-banner-meta muted">
          {t('banner.lastUpdate', { seconds: updatedAgoSec })}
        </span>
      </div>
    );
  }

  if (run.status === 'partial' || run.status === 'failed') {
    const quota = run.lastError?.includes('quota_exceeded') ?? false;
    return (
      <div className="run-banner run-banner--err arrive" role="alert">
        <span className="run-banner-text">{quota ? t('banner.partialQuota') : t('banner.partialGeneric')}</span>
        <button type="button" className="btn btn--small" onClick={() => void doResume()} disabled={resuming}>
          {resuming ? t('banner.resuming') : t('banner.resumeFrom', { stage: t(stageKey(run.currentStage)) })}
        </button>
      </div>
    );
  }

  if (run.status === 'completed') {
    return (
      <div className="run-banner run-banner--ok arrive" role="status">
        <span className="run-banner-text">{t('banner.completedHint')}</span>
      </div>
    );
  }

  return null;
}
