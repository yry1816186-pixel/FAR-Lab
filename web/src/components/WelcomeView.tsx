import { BookOpenCheck, Scale, SearchCheck } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import { ResearchComposer } from './ResearchComposer';
import { healthProjection, useHealth } from '../hooks/useHealth';
import { runStatusTone } from '../tones';
import { runStatusKey } from '../tones';
import { stageKey } from '../i18n/keys';
import { TimeAgo } from './common';
import { runLabel } from './RunsSidebar';
import type { RunSummary } from '../api/types';

/**
 * Workbench home (P-IA): what this is, how to work here, and the central way
 * to start — one question in, a research run out. The status strip and recent
 * tasks are real system state (health API + runs list), never decoration.
 */
export function WelcomeView({
  onCreated,
  runs,
  onSelectRun,
}: {
  onCreated: (runId: string) => void;
  runs: RunSummary[];
  onSelectRun: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { health, healthError } = useHealth();
  const hp = healthProjection(health, healthError);
  const recent = [...runs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const steps = [
    { key: 'welcome.step1', icon: SearchCheck, tone: 'verified' },
    { key: 'welcome.step2', icon: Scale, tone: 'unknown' },
    { key: 'welcome.step3', icon: BookOpenCheck, tone: 'caution' },
  ] as const;

  return (
    <div className="welcome arrive">
      <div className="welcome-hero">
        <h1 className="welcome-title">{t('app.title')}</h1>
        <p className="welcome-subtitle muted">{t('welcome.subtitle')}</p>
        <div className={`health-strip health-strip--${hp.tone}`} role="status">
          <span className="health-dot" aria-hidden="true" />
          {hp.tone === 'err' ? (
            t('health.unknown')
          ) : (
            t('health.readyPlain', { ready: hp.liveReady, total: hp.liveTotal })
          )}
        </div>
      </div>

      <div className="welcome-main">
        <div className="welcome-card">
          <ResearchComposer onCreated={onCreated} />
        </div>

        {recent.length > 0 && (
          <div className="welcome-recent">
            <h2 className="welcome-recent-title">{t('welcome.recentTitle')}</h2>
            <ul className="recent-cards">
              {recent.map((run) => (
                <li key={run.id}>
                  <button type="button" className="recent-card" onClick={() => onSelectRun(run.id)}>
                    <span className="recent-card-top">
                      <span className="recent-card-question" title={runLabel(run)}>{runLabel(run)}</span>
                      <span className={`badge badge--${runStatusTone(run.status)}`}>{t(runStatusKey(run.status))}</span>
                    </span>
                    <span className="recent-card-mid muted">{t(stageKey(run.currentStage))}</span>
                    <span className="recent-card-bottom muted small">
                      <TimeAgo iso={run.createdAt} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="welcome-steps">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key} className={`welcome-step welcome-step--${s.tone}`}>
                <span className={`ev-glyph ev-glyph--${s.tone}`} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span>{t(s.key)}</span>
              </li>
            );
          })}
        </ol>

        <p className="welcome-foot muted">{t('welcome.foot')}</p>
      </div>
    </div>
  );
}
