import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpenCheck, Scale, SearchCheck, TriangleAlert } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import { ResearchComposer } from './ResearchComposer';
import { healthProjection, useHealth } from '../hooks/useHealth';
import { listModelConfigs } from '../api/endpoints';
import { runStatusTone } from '../tones';
import { runStatusKey } from '../tones';
import { stageKey } from '../i18n/keys';
import { TimeAgo } from './common';
import { runLabel } from './RunsSidebar';
import type { RunSummary } from '../api/types';

/**
 * Default-route degradation (2026-08-26 live incident): liveReady means the
 * key is PRESENT, not that the route is callable — a quota-exhausted default
 * still reads "引擎就绪" and the next submission dies at scope. Project the
 * honest state from recent failed runs whose lastError names the default
 * route. Resolution follows the server's effective-default chain
 * (run override > active custom config > env chain): with an ACTIVE custom
 * config the env route is not the effective default, so a stale builtin
 * failure must NOT fire this alert (audit P1) — custom-default failures
 * surface through the run's own banner/resume path. (Deleted failures are
 * invisible to this pass — receipts-level projection is a server-side
 * follow-up.)
 */
function useDefaultRouteDegradation(runs: RunSummary[]): { route: string; kind: 'rate_limited' | 'provider_error'; at: string } | null {
  const [envRoute, setEnvRoute] = useState<{ name: string | null; activeCustom: boolean }>({ name: null, activeCustom: false });
  useEffect(() => {
    const controller = new AbortController();
    listModelConfigs(controller.signal)
      .then((d) => { setEnvRoute({ name: d.envDefault?.name ?? null, activeCustom: d.activeModelConfigId !== null && d.activeModelConfigId !== undefined }); })
      .catch(() => { /* projection degrades to "no data" — the strip keeps its base state */ });
    return () => controller.abort();
  }, []);
  return useMemo(() => {
    if (envRoute.name === null || envRoute.name.length === 0) return null;
    if (envRoute.activeCustom) return null; // effective default is the custom config, not this env route
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const r of runs) {
      if (r.status !== 'failed' && r.status !== 'partial') continue;
      if (Date.parse(r.createdAt) < cutoff) continue;
      const err = r.lastError ?? '';
      if (err.includes('model call failed') && err.includes(`${envRoute.name}:`)) {
        return {
          route: envRoute.name,
          // quota_exceeded (HTTP 402 class, e.g. DeepSeek insufficient balance)
          // reads the same as rate limiting: the route is spent, not flaky.
          kind: err.includes('rate_limited') || err.includes('quota_exceeded') ? 'rate_limited' : 'provider_error',
          at: r.createdAt,
        };
      }
    }
    return null;
  }, [runs, envRoute]);
}

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
  const degraded = useDefaultRouteDegradation(runs);
  // Study-deduped recents (M2 parity): the sidebar groups runs by question, so
  // the home list must too — otherwise the same study occupies two of three
  // cards while other recent work is pushed out of sight.
  const seenStudies = new Set<string>();
  const recent = [...runs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((r) => {
      const key = r.questionText?.trim().toLowerCase().replace(/\s+/g, ' ') || r.id;
      if (seenStudies.has(key)) return false;
      seenStudies.add(key);
      return true;
    })
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
        {degraded !== null && (
          <p className="home-health home-health--degraded" role="alert">
            <TriangleAlert size={13} aria-hidden="true" />{' '}
            {t(degraded.kind === 'rate_limited' ? 'health.routeQuotaDead' : 'health.routeFailing', { route: degraded.route })}
            <button type="button" className="link-button small" onClick={onOpenSettings}>
              {t('health.routeSwitchAction')}
            </button>
          </p>
        )}

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
