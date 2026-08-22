import { useEffect, useRef, useState } from 'react';
import { Pencil, Settings, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { useModelConfigs } from '../hooks/useModelConfigs';
import { discoverModels, getUsage } from '../api/endpoints';
import type { UsageAggregate } from '../api/types';
import type { DiscoveredModel } from '../api/endpoints';
import { errorText } from './common';
import type { ModelConfigSummary, ModelConfigTestResult, ProviderWireProtocol } from '../api/types';

/**
 * Model configuration panel (custom model routes): the product surface where the
 * researcher manages OpenAI/Anthropic-compatible endpoints — list + default
 * switching + one-shot connectivity probe + create/edit form with quick presets.
 * The API key is write-only: stored server-side, echoed back only as a mask.
 */

interface FormState {
  /** null = creating a new config; otherwise the id being edited. */
  id: string | null;
  label: string;
  wire: ProviderWireProtocol;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  /** BP-4: ordered failover chain + user-declared pricing (empty string = unset). */
  fallbackConfigIds: string[];
  pricingIn: string;
  pricingOut: string;
}

const EMPTY_FORM: FormState = { id: null, label: '', wire: 'openai', baseUrl: '', modelId: '', apiKey: '', fallbackConfigIds: [], pricingIn: '', pricingOut: '' };

/** Quick-fill presets (baseUrl + wire only; label/model stay the researcher's). */
const PRESETS: ReadonlyArray<{ key: DictKey; wire: ProviderWireProtocol; baseUrl: string }> = [
  { key: 'settings.presetOpenai', wire: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { key: 'settings.presetAnthropic', wire: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { key: 'settings.presetZai', wire: 'anthropic', baseUrl: 'https://open.bigmodel.cn/api/anthropic' },
  { key: 'settings.presetDashscope', wire: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { key: 'settings.presetOllama', wire: 'openai', baseUrl: 'http://localhost:11434/v1' },
];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { t } = useI18n();
  const { configs, envDefault, loading, error, saving, create, update, remove, setActive, testing, test } = useModelConfigs();
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Test outcome per config id (or 'draft' for the unsaved form). */
  const [testResults, setTestResults] = useState<Record<string, ModelConfigTestResult>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** BP-4: workspace usage ledger + discovery results. */
  const [usage, setUsage] = useState<UsageAggregate[] | null>(null);
  const [discovered, setDiscovered] = useState<Record<string, DiscoveredModel[]>>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    setForm(null);
    setFormError(null);
    setTestResults({});
    setDeletingId(null);
    setUsage(null);
    setDiscovered({});
    void getUsage().then((r) => setUsage(r.aggregates)).catch(() => setUsage([]));
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

  const wireLabel = (wire: ProviderWireProtocol): string => t(wire === 'openai' ? 'settings.wireOpenai' : 'settings.wireAnthropic');

  const startEdit = (cfg: ModelConfigSummary): void => {
    setFormError(null);
    setForm({
      id: cfg.id, label: cfg.label, wire: cfg.wire, baseUrl: cfg.baseUrl, modelId: cfg.modelId, apiKey: '',
      fallbackConfigIds: cfg.fallbackConfigIds ?? [],
      pricingIn: cfg.pricing !== undefined ? String(cfg.pricing.inputUsdPerMTok) : '',
      pricingOut: cfg.pricing !== undefined ? String(cfg.pricing.outputUsdPerMTok) : '',
    });
  };

  const runTest = async (target: { configId?: string; label?: string; wire: ProviderWireProtocol; baseUrl: string; modelId: string; apiKey?: string }): Promise<void> => {
    const key = target.configId ?? 'draft';
    setTestResults((prev) => ({ ...prev, [key]: { ok: false, modelId: target.modelId, latencyMs: 0, error: { kind: 'pending', message: '', retryable: false } } }));
    const result = await test(target);
    setTestResults((prev) => ({ ...prev, [key]: result }));
  };

  const submitForm = async (): Promise<void> => {
    if (form === null) return;
    if (form.label.trim().length === 0 || form.baseUrl.trim().length === 0 || form.modelId.trim().length === 0) {
      setFormError(t('settings.formInvalid'));
      return;
    }
    if (form.id === null && form.apiKey.length === 0) {
      setFormError(t('settings.formInvalid'));
      return;
    }
    setFormError(null);
    const inPrice = Number.parseFloat(form.pricingIn);
    const outPrice = Number.parseFloat(form.pricingOut);
    const pricing = form.pricingIn.trim() !== '' && form.pricingOut.trim() !== '' && Number.isFinite(inPrice) && Number.isFinite(outPrice) && inPrice >= 0 && outPrice >= 0
      ? { inputUsdPerMTok: inPrice, outputUsdPerMTok: outPrice }
      : undefined;
    try {
      if (form.id === null) {
        await create({ label: form.label.trim(), wire: form.wire, baseUrl: form.baseUrl.trim(), modelId: form.modelId.trim(), apiKey: form.apiKey, fallbackConfigIds: form.fallbackConfigIds, ...(pricing !== undefined ? { pricing } : {}) } as Parameters<typeof create>[0]);
      } else {
        // apiKey absent from the payload = keep the stored key (server contract).
        await update(form.id, {
          label: form.label.trim(),
          wire: form.wire,
          baseUrl: form.baseUrl.trim(),
          modelId: form.modelId.trim(),
          fallbackConfigIds: form.fallbackConfigIds,
          ...(pricing !== undefined ? { pricing } : {}),
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}),
        } as Parameters<typeof update>[1]);
      }
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const testBadge = (result: ModelConfigTestResult | undefined): JSX.Element | null => {
    if (result === undefined) return null;
    if (result.error?.kind === 'pending') return <span className="badge muted">{t('settings.testing')}</span>;
    if (result.ok) return <span className="badge badge--ok">{t('settings.testOk')} · {result.latencyMs} ms</span>;
    return (
      <span className="badge badge--err" title={result.error?.message}>
        {t('settings.testFail')}
      </span>
    );
  };

  return (
    <div className="settings-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        tabIndex={-1}
      >
        <div className="settings-head">
          <h2 className="settings-title">
            <Settings size={15} aria-hidden="true" /> {t('settings.title')}
          </h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <p className="muted small settings-hint">{t('settings.subtitle')}</p>

        {error !== null && (
          <p className="field-error" role="alert">{errorText(error)}</p>
        )}

        {envDefault !== null && (
          <p className="muted small settings-env">
            {t('settings.envDefaultLabel')}：<span className="mono">{envDefault.name}</span>
            {envDefault.modelId.length > 0 ? <> · <span className="mono">{envDefault.modelId}</span></> : null}
            {envDefault.liveReady ? '' : ` — ${t('settings.envNotReady')}`}
          </p>
        )}

        <section className="settings-usage" aria-label={t('settings.usage')}>
          <h3 className="settings-form-title">{t('settings.usage')}</h3>
          <p className="muted small">{t('settings.usageHint')}</p>
          {usage === null ? (
            <p className="muted small">{t('common.loading')}</p>
          ) : usage.length === 0 ? (
            <p className="muted small">{t('settings.usageEmpty')}</p>
          ) : (
            <table className="settings-usage-table">
              <thead>
                <tr>
                  <th>{t('settings.usageProvider')}</th>
                  <th>{t('settings.usageTokens')}</th>
                  <th>{t('settings.usageCost')}</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={`${u.provider}/${u.modelId}`}>
                    <td><span className="mono">{u.provider}</span> · <span className="mono">{u.modelId}</span> · {u.calls}×</td>
                    <td>{u.totalTokens.toLocaleString()}</td>
                    <td>{u.costUsd !== null ? `$${u.costUsd.toFixed(4)}` : <span className="muted">{t('settings.usageUnknownCost')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : (
          <ul className="settings-list">
            {configs.length === 0 && <li className="muted small">{t('settings.empty')}</li>}
            {configs.map((cfg) => (
              <li key={cfg.id} className="settings-item">
                <div className="settings-item-main">
                  <span className="settings-item-label">
                    {cfg.label}
                    {cfg.active && <span className="badge badge--info">{t('settings.defaultBadge')}</span>}
                    {!cfg.apiKeySet && <span className="badge badge--err">{t('settings.noKey')}</span>}
                  </span>
                  <span className="muted small settings-item-meta">
                    <span className="badge">{wireLabel(cfg.wire)}</span>
                    <span className="mono">{cfg.modelId}</span>
                    <span className="mono">{cfg.baseUrl}</span>
                    {cfg.apiKeySet ? <span className="mono">{cfg.apiKeyMasked}</span> : null}
                  </span>
                  {testBadge(testResults[cfg.id])}
                </div>
                <div className="settings-item-actions">
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={saving || testing}
                    onClick={() => { void (cfg.active ? setActive(null) : setActive(cfg.id)); }}
                  >
                    {cfg.active ? t('settings.unsetDefault') : t('settings.setDefault')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={saving || testing}
                    onClick={() => { void runTest({ configId: cfg.id, wire: cfg.wire, baseUrl: cfg.baseUrl, modelId: cfg.modelId }); }}
                  >
                    {testing ? t('settings.testing') : t('settings.test')}
                  </button>
                  <button type="button" className="btn btn--small" disabled={saving} onClick={() => startEdit(cfg)} aria-label={t('settings.edit')}>
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                  {deletingId === cfg.id ? (
                    <>
                      <button type="button" className="btn btn--small btn--danger" disabled={saving} onClick={() => {
                        void remove(cfg.id).then(() => setDeletingId(null)).catch(() => setDeletingId(null));
                      }}>
                        {t('settings.deleteConfirm')}
                      </button>
                      <button type="button" className="btn btn--small" onClick={() => setDeletingId(null)}>
                        {t('settings.cancel')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--small" disabled={saving} onClick={() => setDeletingId(cfg.id)} aria-label={t('settings.delete')}>
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {form !== null ? (
          <form
            className="settings-form"
            onSubmit={(e) => { e.preventDefault(); void submitForm(); }}
            noValidate
          >
            <h3 className="settings-form-title">{form.id === null ? t('settings.add') : t('settings.edit')}</h3>

            <label className="field-label" htmlFor="mcfg-label">{t('settings.label')}</label>
            <input id="mcfg-label" type="text" value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t('settings.labelPlaceholder')} />

            <label className="field-label" htmlFor="mcfg-wire">{t('settings.wire')}</label>
            <select id="mcfg-wire" value={form.wire} onChange={(e) => setForm({ ...form, wire: e.target.value as ProviderWireProtocol })}>
              <option value="openai">{t('settings.wireOpenai')}</option>
              <option value="anthropic">{t('settings.wireAnthropic')}</option>
            </select>

            <label className="field-label" htmlFor="mcfg-baseurl">{t('settings.baseUrl')}</label>
            <input id="mcfg-baseurl" type="text" value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://…" />

            <label className="field-label" htmlFor="mcfg-model">{t('settings.modelId')}</label>
            <input id="mcfg-model" type="text" value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              placeholder={t('settings.modelIdPlaceholder')} />

            <label className="field-label" htmlFor="mcfg-key">{t('settings.apiKey')}</label>
            <input id="mcfg-key" type="password" value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={form.id === null ? t('settings.apiKeyPlaceholder') : t('settings.apiKeyKeep')}
              autoComplete="off" />
            <p className="muted small">{t('settings.keyNeverShown')}</p>

            <label className="field-label" htmlFor="mcfg-fallback">{t('settings.fallback')}</label>
            {configs.filter((c) => c.id !== form.id).length === 0 ? (
              <p className="muted small">{t('settings.fallbackNone')}</p>
            ) : (
              <select
                id="mcfg-fallback"
                multiple
                size={Math.min(3, Math.max(2, configs.length - 1))}
                value={form.fallbackConfigIds}
                onChange={(e) => setForm({
                  ...form,
                  fallbackConfigIds: Array.from(e.target.selectedOptions, (o) => o.value),
                })}
              >
                {configs.filter((c) => c.id !== form.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            )}

            <label className="field-label" htmlFor="mcfg-price-in">{t('settings.pricing')}</label>
            <span className="muted small">
              {t('settings.pricingIn')}：
              <input id="mcfg-price-in" type="number" min="0" step="0.1" value={form.pricingIn}
                onChange={(e) => setForm({ ...form, pricingIn: e.target.value })} style={{ width: '90px' }} />
              {' '}{t('settings.pricingOut')}：
              <input type="number" min="0" step="0.1" value={form.pricingOut}
                onChange={(e) => setForm({ ...form, pricingOut: e.target.value })} style={{ width: '90px' }} />
            </span>

            <p className="muted small">
              <button
                type="button"
                className="btn btn--small"
                title={t('settings.discoverHint')}
                onClick={() => {
                  const key = form.id ?? 'draft';
                  void discoverModels({
                    ...(form.id !== null ? { configId: form.id } : { wire: form.wire, baseUrl: form.baseUrl.trim(), ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}) }),
                  })
                    .then((r) => setDiscovered((prev) => ({ ...prev, [key]: r.models })))
                    .catch((e: unknown) => setFormError(e instanceof Error ? e.message : String(e)));
                }}
              >
                {t('settings.discover')}
              </button>
              {discovered[form.id ?? 'draft'] !== undefined && (
                <span> {t('settings.discoverOk', { n: discovered[form.id ?? 'draft']?.length ?? 0 })}</span>
              )}
            </p>
            {(discovered[form.id ?? 'draft'] ?? []).length > 0 && (
              <select
                aria-label={t('settings.discover')}
                value=""
                onChange={(e) => { if (e.target.value.length > 0) setForm({ ...form, modelId: e.target.value }); }}
              >
                <option value="">—</option>
                {discovered[form.id ?? 'draft']!.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}{m.displayName !== undefined ? ` (${m.displayName})` : ''}</option>
                ))}
              </select>
            )}

            <p className="muted small">
              {t('settings.presets')}：{' '}
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="btn btn--small settings-preset"
                  onClick={() => setForm({ ...form, wire: p.wire, baseUrl: p.baseUrl })}
                >
                  {t(p.key)}
                </button>
              ))}
            </p>

            {formError !== null && <p className="field-error" role="alert">{formError}</p>}
            {testResults['draft'] !== undefined && testResults['draft'].error?.kind !== 'pending' && (
              <p className={testResults['draft'].ok ? 'field-ok' : 'field-error'} role="status">
                {testResults['draft'].ok
                  ? `${t('settings.testOk')} · ${testResults['draft'].latencyMs} ms`
                  : `${t('settings.testFail')}：${testResults['draft'].error?.message ?? ''}`}
              </p>
            )}

            <div className="settings-form-actions">
              <button
                type="button"
                className="btn btn--small"
                disabled={testing || form.baseUrl.trim().length === 0 || form.modelId.trim().length === 0 || (form.id === null && form.apiKey.length === 0)}
                onClick={() => {
                  void runTest({
                    ...(form.id !== null ? { configId: form.id } : {}),
                    label: form.label,
                    wire: form.wire,
                    baseUrl: form.baseUrl.trim(),
                    modelId: form.modelId.trim(),
                    ...(form.apiKey.length > 0 || form.id === null ? { apiKey: form.apiKey } : {}),
                  });
                }}
              >
                {testing ? t('settings.testing') : t('settings.test')}
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
                {saving ? t('settings.saving') : t('settings.save')}
              </button>
              <button type="button" className="btn btn--small" onClick={() => { setForm(null); setFormError(null); }}>
                {t('settings.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn--small" disabled={saving} onClick={() => { setFormError(null); setForm(EMPTY_FORM); }}>
            ＋ {t('settings.add')}
          </button>
        )}
      </div>
    </div>
  );
}
