import { Badge, CountProgress, IdText, Skeleton, TimeText } from './common';
import { runStatusKey, runStatusTone } from '../tones';
import type { RunSummary } from '../api/types';
import { useI18n } from '../i18n/LanguageContext';
import { stageKey } from '../i18n/keys';

export function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: RunSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        className={`run-item${selected ? ' run-item--selected' : ''}`}
        onClick={() => onSelect(run.id)}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="run-item-top">
          <IdText value={run.id} />
          <Badge tone={runStatusTone(run.status)}>{t(runStatusKey(run.status))}</Badge>
        </span>
        <span className="run-item-mid">
          <span className="run-item-stage">
            {t('runs.currentStage')}: {t(stageKey(run.currentStage))}
          </span>
          {run.progress !== undefined ? (
            <CountProgress done={run.progress.done} total={run.progress.total} label={t('runs.progress', run.progress)} />
          ) : (
            <span className="muted small">—</span>
          )}
        </span>
        <span className="run-item-bottom">
          <TimeText iso={run.createdAt} />
        </span>
        {run.lastError !== undefined && run.lastError.length > 0 && (
          <span className="run-item-error" title={run.lastError}>
            {t('runs.errorPrefix')}: {run.lastError.length > 80 ? `${run.lastError.slice(0, 80)}…` : run.lastError}
          </span>
        )}
      </button>
    </li>
  );
}

export function RunsList({
  runs,
  loading,
  selectedId,
  onSelect,
}: {
  runs: RunSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  if (loading && runs.length === 0) {
    return (
      <div role="status">
        <Skeleton lines={4} />
        <span className="sr-only">{t('runs.loading')}</span>
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <p className="sidebar-empty">
        {t('runs.empty')}
        <br />
        <span className="muted">{t('runs.emptyHint')}</span>
      </p>
    );
  }
  return (
    <ul className="runs-list" aria-label={t('runs.title')}>
      {runs.map((run) => (
        <RunListItem key={run.id} run={run} selected={run.id === selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}
