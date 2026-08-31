import type { ReactNode } from 'react';
import type { RunSummary } from '../api/types';
import { useI18n } from '../i18n/LanguageContext';
import { runStatusTone } from '../tones';
import { stageKey } from '../i18n/keys';
import { Badge } from './common';

/**
 * B3-2 multi-run awareness: the researcher works in one study while others
 * run in the background — this strip keeps the active ones one glance away
 * (real status/stage from the polled list, nothing invented). Its shell slot
 * is always present: loading and idle are first-class truthful states, which
 * also prevents the workbench from jumping when active runs arrive. The
 * selected run stays in the sidebar; the strip is for the OTHERS.
 */
export function AwarenessBar({
  activeRuns,
  loading,
  selectedRunId,
  onSelect,
}: {
  activeRuns: RunSummary[];
  loading: boolean;
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}): ReactNode {
  const { t } = useI18n();
  const others = activeRuns.filter((r) => r.id !== selectedRunId);
  return (
    <div
      className="awareness-bar"
      role="status"
      aria-busy={loading}
      aria-label={loading ? t('awareness.loading') : t('awareness.title', { n: activeRuns.length })}
    >
      {loading ? (
        <span className="awareness-label muted small">{t('awareness.loading')}</span>
      ) : activeRuns.length === 0 ? (
        <span className="awareness-label muted small">{t('awareness.none')}</span>
      ) : (
        <>
          <span className="awareness-label muted small">{t('awareness.title', { n: activeRuns.length })}</span>
          <ul className="awareness-list">
            {activeRuns.slice(0, 4).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`awareness-item${r.id === selectedRunId ? ' awareness-item--current' : ''}`}
                  onClick={() => onSelect(r.id)}
                  title={r.questionText ?? r.id}
                >
                  <Badge tone={runStatusTone(r.status)}>{t(stageKey(r.currentStage))}</Badge>
                  <span className="awareness-question">
                    {(r.questionText ?? r.id).length > 48 ? `${r.questionText!.slice(0, 48)}…` : (r.questionText ?? r.id)}
                  </span>
                  {r.progress !== undefined && (
                    <span className="muted small mono">{r.progress.done}/{r.progress.total}</span>
                  )}
                  {r.id === selectedRunId && <span className="muted small">· {t('awareness.current')}</span>}
                </button>
              </li>
            ))}
          </ul>
          {others.length > 4 && <span className="muted small">+{others.length - 4}</span>}
        </>
      )}
    </div>
  );
}
