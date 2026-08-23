import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/LanguageContext';
import { deleteAutomation, listAutomations, setAutomationEnabled } from '../../api/endpoints';
import type { Automation } from '../../api/types';
import type { AutomationTrigger } from '../../api/types';

/**
 * Settings section: resident-agent automations (workspace-wide list). Honest
 * limits shown inline: fires only while the server runs, each fire is a real
 * capped model turn, state survives restart. Enable/disable + delete map to
 * the real PATCH/DELETE endpoints; the engine picks changes up on its next tick.
 */
export function AutomationsSection(): JSX.Element {
  const { t } = useI18n();
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listAutomations().then(setAutomations).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      setAutomations([]);
    });
  }, []);

  const toggle = async (a: Automation): Promise<void> => {
    setBusyId(a.id);
    setError(null);
    try {
      const updated = await setAutomationEnabled(a.id, !a.enabled);
      setAutomations((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await deleteAutomation(id);
      setAutomations((prev) => prev?.filter((x) => x.id !== id) ?? null);
      setDeletingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const triggerLabel = (trigger: AutomationTrigger): string =>
    trigger.kind === 'run_completed'
      ? t('settings.autoTriggerRun')
      : t('settings.autoTriggerSchedule', { n: trigger.intervalMinutes });

  return (
    <div className="settings-section">
      <h3 className="settings-form-title">{t('settings.automations')}</h3>
      <p className="muted small">{t('settings.automationsHint')}</p>
      {error !== null && <p className="field-error" role="alert">{error}</p>}
      {automations === null ? (
        <p className="muted small">{t('common.loading')}</p>
      ) : automations.length === 0 ? (
        <p className="muted small">{t('settings.automationsEmpty')}</p>
      ) : (
        <ul className="settings-list">
          {automations.map((a) => (
            <li key={a.id} className="settings-item">
              <div className="settings-item-main">
                <span className="settings-item-label">
                  {a.label}
                  <span className="badge">{triggerLabel(a.trigger)}</span>
                  {a.enabled
                    ? <span className="badge badge--ok">{t('settings.autoEnabled')}</span>
                    : <span className="badge">{t('settings.autoDisabled')}</span>}
                </span>
                <span className="muted small settings-item-meta">
                  <span className="mono">{a.task.slice(0, 80)}{a.task.length > 80 ? '…' : ''}</span>
                </span>
                <span className="muted small settings-item-meta">
                  {t('settings.autoFires', { n: a.fireCount })}
                  {a.lastFiredAt !== undefined ? ` · ${t('settings.autoLastFired')}: ${a.lastFiredAt.slice(0, 16).replace('T', ' ')}` : ''}
                  {` · ${t('settings.autoMaxTurns', { n: a.maxTurnsPerFire })}`}
                </span>
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={busyId === a.id}
                  onClick={() => { void toggle(a); }}
                >
                  {a.enabled ? t('settings.autoDisable') : t('settings.autoEnable')}
                </button>
                {deletingId === a.id ? (
                  <>
                    <button type="button" className="btn btn--small btn--danger" disabled={busyId === a.id} onClick={() => { void remove(a.id); }}>
                      {t('settings.deleteConfirm')}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => setDeletingId(null)}>
                      {t('settings.cancel')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--small" disabled={busyId === a.id} onClick={() => setDeletingId(a.id)} aria-label={t('settings.delete')}>
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
