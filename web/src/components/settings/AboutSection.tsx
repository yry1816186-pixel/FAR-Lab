import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext';
import { getHealth, getServerMeta } from '../../api/endpoints';
import type { HealthReport } from '../../api/types';

/**
 * Settings section: about. Server version, data dir, db/watchdog health and
 * the provider readiness strip — all from real endpoints, never fabricated.
 */
export function AboutSection(): JSX.Element {
  const { t } = useI18n();
  const [meta, setMeta] = useState<{ version: string; dataDir: string } | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getServerMeta().then(setMeta).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void getHealth().then(setHealth).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="settings-section">
      <h3 className="settings-form-title">{t('settings.aboutTitle')}</h3>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
      {meta !== null && (
        <p className="muted small">
          {t('settings.aboutVersion')}：<span className="mono">v{meta.version}</span>
        </p>
      )}
      {health !== null && (
        <>
          <p className="muted small">
            {t('settings.aboutStatus')}：
            <span className="badge badge--ok">{health.status}</span>
            <span className="badge">db: {health.db}</span>
          </p>
          {Array.isArray(health.providers) && (
            <ul className="settings-list">
              {health.providers.map((p) => (
                <li key={p.name} className="settings-item">
                  <span className="settings-item-label">
                    <span className="mono">{p.name}</span>
                    {p.liveReady
                      ? <span className="badge badge--ok">{t('settings.aboutReady')}</span>
                      : <span className="badge">{t('settings.aboutNotReady')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="muted small">{t('settings.aboutHint')}</p>
    </div>
  );
}
