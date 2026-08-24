import { ArrowRight, BookOpenCheck, Scale, SearchCheck } from 'lucide-react';
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
 * Home (HX v2) — a conversation-first landing in the ChatGPT/LibreChat form
 * (Scout A): one centered greeting + composer card, example chips as the
 * empty-state teacher, recent studies as quiet cards below. The old form-page
 * layout (field label + form + side value-list) is gone.
 */
export function WelcomeView({
  onCreated,
  onOpenSettings,
  runs,
  onSelectRun,
}: {
  onCreated: (runId: string) => void;
  /** Opens the model-management dialog from the composer's model picker. */
  onOpenSettings: () => void;
  runs: RunSummary[];
  onSelectRun: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { health, healthError, checking } = useHealth();
  const hp = healthProjection(health, healthError, checking);
  const recent = [...runs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const hows = [
    { key: 'welcome.step1', icon: SearchCheck, tone: 'verified' },
    { key: 'welcome.step2', icon: Scale, tone: 'unknown' },
    { key: 'welcome.step3', icon: BookOpenCheck, tone: 'caution' },
  ] as const;

  return (
    <div className="home arrive">
      <div className="home-hero">
        <h1 className="home-greeting">{t('home.greeting')}</h1>
        <p className="home-sub muted">{t('home.greetingSub')}</p>
        <p className={`home-health health-strip--${hp.tone}`} role="status">
          <span className="health-dot" aria-hidden="true" />
          {hp.tone === 'err'
            ? t('health.unknown')
            : hp.tone === 'checking'
              ? t('health.checking')
              : t('health.readyPlain', { ready: hp.liveReady, total: hp.liveTotal })}
        </p>

        <div className="home-composer">
          <ResearchComposer onCreated={onCreated} onOpenSettings={onOpenSettings} />
        </div>

        <div className="example-questions">
          <span className="muted small">{t('form.tryExamples')}</span>
          <div className="example-chips">
            {(['example.q1', 'example.q2', 'example.q3'] as const).map((k) => (
              <button key={k} type="button" className="example-chip" onClick={() => {
                const el = document.getElementById('composer-question') as HTMLTextAreaElement | null;
                if (el !== null) { el.value = t(k); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); }
              }}>
                {t(k).length > 64 ? `${t(k).slice(0, 64)}…` : t(k)}
              </button>
            ))}
          </div>
        </div>

        <ul className="home-hows" aria-label={t('welcome.howsLabel')}>
          {hows.map((h) => {
            const Icon = h.icon;
            return (
              <li key={h.key} className={`home-how home-how--${h.tone}`}>
                <span className={`ev-glyph ev-glyph--${h.tone}`} aria-hidden="true"><Icon size={13} /></span>
                <span>{t(h.key)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {recent.length > 0 && (
        <section className="home-recent" aria-label={t('welcome.recentTitle')}>
          <h2 className="home-recent-title">{t('welcome.recentTitle')}</h2>
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
                    <ArrowRight size={12} aria-hidden="true" className="recent-card-go" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
