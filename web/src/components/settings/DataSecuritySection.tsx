import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext';
import { getAgentPolicy, getServerMeta, listBuiltinRoutes, revokeRememberedKinds } from '../../api/endpoints';
import type { AgentPolicy } from '../../api/endpoints';
import type { BuiltinRouteSummary } from '../../api/types';

/**
 * Settings section: data & authorization. Shows where research state lives
 * (real data dir from the server), which env vars feed the built-in routes
 * (NAMES only — values never leave the machine), and the resident-agent
 * approval posture: fail-closed ask-per-conversation, with per-conversation
 * remembered kinds listed and revocable.
 */
export function DataSecuritySection(): JSX.Element {
  const { t } = useI18n();
  const [meta, setMeta] = useState<{ version: string; dataDir: string } | null>(null);
  const [routes, setRoutes] = useState<BuiltinRouteSummary[] | null>(null);
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadPolicy = (): void => {
    void getAgentPolicy().then(setPolicy).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    void getServerMeta().then(setMeta).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void listBuiltinRoutes().then((r) => setRoutes(r.routes)).catch(() => setRoutes([]));
    reloadPolicy();
  }, []);

  const revoke = async (conversationId: string): Promise<void> => {
    setRevokingId(conversationId);
    setError(null);
    try {
      await revokeRememberedKinds(conversationId);
      reloadPolicy();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-form-title">{t('settings.dataTitle')}</h3>
      <p className="muted small">{t('settings.dataHint')}</p>
      {meta !== null && (
        <p className="muted small">
          {t('settings.dataDir')}：<span className="mono">{meta.dataDir}</span>
        </p>
      )}
      {routes !== null && (
        <p className="muted small">
          {t('settings.envVars')}：
          {routes.filter((r) => r.kind === 'live').map((r, i) => (
            <span key={r.name}>{i > 0 ? ' · ' : ''}<span className="mono">{r.apiKeyEnvVar}</span></span>
          ))}
          {' '}— {t('settings.envVarsNote')}
        </p>
      )}

      <h3 className="settings-form-title">{t('settings.agentPolicyTitle')}</h3>
      <p className="muted small">{t('settings.agentPolicyHint')}</p>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
      {policy === null ? (
        <p className="muted small">{t('common.loading')}</p>
      ) : policy.remembered.length === 0 ? (
        <p className="muted small">{t('settings.agentPolicyNone')}</p>
      ) : (
        <ul className="settings-list">
          {policy.remembered.map((r) => (
            <li key={r.conversationId} className="settings-item">
              <div className="settings-item-main">
                <span className="settings-item-label">
                  {r.conversationTitle}
                  {r.kinds.map((k) => <span key={k} className="badge">{k}</span>)}
                </span>
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={revokingId === r.conversationId}
                  onClick={() => { void revoke(r.conversationId); }}
                >
                  {t('settings.agentPolicyRevoke')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
