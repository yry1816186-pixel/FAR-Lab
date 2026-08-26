import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/LanguageContext';
import { useModelConfigs } from '../../hooks/useModelConfigs';
import {
  discoverModels, getSpendLimit, getProviderTemplates, getUsage, listBuiltinRoutes, setBuiltinDefaultRoute, setSpendLimit, updateBuiltinRoute,
} from '../../api/endpoints';
import type { UsageAggregate } from '../../api/types';
import type { DiscoveredModel, SpendLimitStatus } from '../../api/endpoints';
import { errorText } from '../common';
import type {
  BuiltinRouteSummary, ModelConfigSummary, ModelConfigTestResult, ProviderTemplate, ProviderWireProtocol,
  ReasoningCapability, ReasoningGear, ReasoningStyle,
} from '../../api/types';

/**
 * Settings section: model routes. Everything model-plane in one place —
 * built-in env routes (model override / pricing / default switch), the
 * receipt-derived usage ledger, and user-defined configs on any OpenAI /
 * Anthropic / Gemini-native endpoint worldwide. The API key is write-only:
 * stored server-side, echoed back as a mask.
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
  /** Declared thinking capability ('' = not declared). */
  reasoningStyle: '' | ReasoningStyle;
  reasoningDefaultGear: ReasoningGear;
}

const EMPTY_FORM: FormState = { id: null, label: '', wire: 'openai', baseUrl: '', modelId: '', apiKey: '', fallbackConfigIds: [], pricingIn: '', pricingOut: '', reasoningStyle: '', reasoningDefaultGear: 'medium' };

/** Built-in route edit form: modelId '' = follow env; pricing '' both = clear. */
interface BuiltinFormState {
  modelId: string;
  pricingIn: string;
  pricingOut: string;
}

/** Worldwide preset templates from the server catalog (wire+baseUrl prefills). */
const PRESET_FALLBACK: ReadonlyArray<{ label: string; wire: ProviderWireProtocol; baseUrl: string }> = [
  { label: 'OpenAI', wire: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Anthropic', wire: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { label: 'Google Gemini', wire: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
];

export function ModelRoutesSection(): JSX.Element {
  const { t } = useI18n();
  const { configs, envDefault, loading, error, saving, create, update, remove, setActive, testing, test, reload } = useModelConfigs();
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Test outcome per config id (or 'draft' for the unsaved form). */
  const [testResults, setTestResults] = useState<Record<string, ModelConfigTestResult>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** BP-4: workspace usage ledger + discovery results. */
  const [usage, setUsage] = useState<UsageAggregate[] | null>(null);
  const [discovered, setDiscovered] = useState<Record<string, DiscoveredModel[]>>({});
  /** Built-in env routes (zai/dashscope + banned archived): modelId/pricing/default management. */
  const [builtinRoutes, setBuiltinRoutes] = useState<BuiltinRouteSummary[] | null>(null);
  const [builtinSource, setBuiltinSource] = useState<'ui' | 'env'>('env');
  const [editingBuiltin, setEditingBuiltin] = useState<string | null>(null);
  const [builtinForm, setBuiltinForm] = useState<BuiltinFormState | null>(null);
  const [builtinError, setBuiltinError] = useState<string | null>(null);
  const [builtinSaving, setBuiltinSaving] = useState(false);
  /** Gap R5: workspace USD spend ceiling (status + editable input). */
  const [spend, setSpend] = useState<SpendLimitStatus | null>(null);
  const [spendInput, setSpendInput] = useState('');
  const [spendBusy, setSpendBusy] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  /** Worldwide preset catalog (server catalog.ts); fallback trio while/offline. */
  const [templates, setTemplates] = useState<ReadonlyArray<{ label: string; wire: ProviderWireProtocol; baseUrl: string; note?: string; keyUrl?: string }> | null>(null);

  useEffect(() => {
    void getProviderTemplates()
      .then((r) => setTemplates(r.templates.map((t: ProviderTemplate) => ({ label: t.label, wire: t.wire, baseUrl: t.baseUrl, ...(t.note !== undefined ? { note: t.note } : {}), ...(t.keyUrl !== undefined ? { keyUrl: t.keyUrl } : {}) }))))
      .catch(() => setTemplates(PRESET_FALLBACK));
    void getUsage().then((r) => setUsage(r.aggregates)).catch(() => setUsage([]));
    void getSpendLimit().then((r) => { setSpend(r); setSpendInput(r.limitUsd !== null ? String(r.limitUsd) : ''); }).catch(() => setSpend(null));
    void listBuiltinRoutes()
      .then((r) => { setBuiltinRoutes(r.routes); setBuiltinSource(r.defaultSource); })
      .catch(() => setBuiltinRoutes([]));
  }, []);

  const wireLabel = (wire: ProviderWireProtocol): string =>
    t(
      wire === 'openai' ? 'settings.wireOpenai'
        : wire === 'anthropic' ? 'settings.wireAnthropic'
          : wire === 'gemini' ? 'settings.wireGemini'
            : 'settings.wireOffline',
    );

  const startEdit = (cfg: ModelConfigSummary): void => {
    setFormError(null);
    setForm({
      id: cfg.id, label: cfg.label, wire: cfg.wire, baseUrl: cfg.baseUrl, modelId: cfg.modelId, apiKey: '',
      fallbackConfigIds: cfg.fallbackConfigIds ?? [],
      pricingIn: cfg.pricing !== undefined ? String(cfg.pricing.inputUsdPerMTok) : '',
      pricingOut: cfg.pricing !== undefined ? String(cfg.pricing.outputUsdPerMTok) : '',
      reasoningStyle: cfg.reasoning?.style ?? '',
      reasoningDefaultGear: cfg.reasoning?.defaultGear ?? 'medium',
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
    // Reasoning declaration follows the pricing pattern: declared -> send; '' -> absent
    // (create: no declaration / update: keep stored one).
    const reasoning: ReasoningCapability | undefined = form.reasoningStyle === ''
      ? undefined
      : { style: form.reasoningStyle, defaultGear: form.reasoningDefaultGear };
    try {
      if (form.id === null) {
        await create({ label: form.label.trim(), wire: form.wire, baseUrl: form.baseUrl.trim(), modelId: form.modelId.trim(), apiKey: form.apiKey, fallbackConfigIds: form.fallbackConfigIds, ...(pricing !== undefined ? { pricing } : {}), ...(reasoning !== undefined ? { reasoning } : {}) } as Parameters<typeof create>[0]);
      } else {
        // apiKey absent from the payload = keep the stored key (server contract).
        await update(form.id, {
          label: form.label.trim(),
          wire: form.wire,
          baseUrl: form.baseUrl.trim(),
          modelId: form.modelId.trim(),
          fallbackConfigIds: form.fallbackConfigIds,
          ...(pricing !== undefined ? { pricing } : {}),
          // '' means "clear the declaration" on update only when previously declared:
          // absent keeps the stored declaration (server contract mirrors pricing).
          ...(form.reasoningStyle !== '' ? { reasoning } : {}),
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}),
        } as Parameters<typeof update>[1]);
      }
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const startEditBuiltin = (route: BuiltinRouteSummary): void => {
    setBuiltinError(null);
    setEditingBuiltin(route.name);
    setBuiltinForm({
      // Pre-fill only when the route is actually overridden; '' means "follow env".
      modelId: route.effectiveModelId !== route.envModelId ? route.effectiveModelId : '',
      pricingIn: route.pricing !== undefined ? String(route.pricing.inputUsdPerMTok) : '',
      pricingOut: route.pricing !== undefined ? String(route.pricing.outputUsdPerMTok) : '',
    });
  };

  const applyBuiltinResponse = (routes: BuiltinRouteSummary[], defaultSource: 'ui' | 'env'): void => {
    setBuiltinRoutes(routes);
    setBuiltinSource(defaultSource);
    void reload(); // the env-default line + composer picker follow the same server truth
  };

  const saveSpend = async (mode: 'set' | 'clear'): Promise<void> => {
    setSpendError(null);
    let limit: number | null = null;
    if (mode === 'set') {
      limit = Number.parseFloat(spendInput.trim());
      if (!Number.isFinite(limit) || limit <= 0) {
        setSpendError(t('settings.spendLimitInvalid'));
        return;
      }
    }
    setSpendBusy(true);
    try {
      const r = await setSpendLimit(mode === 'set' ? limit : null);
      setSpend(r);
      setSpendInput(r.limitUsd !== null ? String(r.limitUsd) : '');
    } catch (e) {
      setSpendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpendBusy(false);
    }
  };

  const submitBuiltin = async (routeName: string): Promise<void> => {
    if (builtinForm === null) return;
    const modelId = builtinForm.modelId.trim();
    const inFilled = builtinForm.pricingIn.trim() !== '';
    const outFilled = builtinForm.pricingOut.trim() !== '';
    const inPrice = Number.parseFloat(builtinForm.pricingIn);
    const outPrice = Number.parseFloat(builtinForm.pricingOut);
    if (inFilled !== outFilled || (inFilled && (!Number.isFinite(inPrice) || !Number.isFinite(outPrice) || inPrice < 0 || outPrice < 0))) {
      setBuiltinError(t('settings.formInvalid'));
      return;
    }
    setBuiltinError(null);
    setBuiltinSaving(true);
    try {
      const r = await updateBuiltinRoute(routeName, {
        modelId: modelId.length === 0 ? null : modelId,
        pricing: inFilled ? { inputUsdPerMTok: inPrice, outputUsdPerMTok: outPrice } : null,
      });
      applyBuiltinResponse(r.routes, r.defaultSource);
      setEditingBuiltin(null);
      setBuiltinForm(null);
      // Pricing changed -> the receipt-derived cost column follows immediately.
      void getUsage().then((u) => setUsage(u.aggregates)).catch(() => setUsage([]));
    } catch (e) {
      setBuiltinError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuiltinSaving(false);
    }
  };

  const makeDefaultBuiltin = async (routeName: string): Promise<void> => {
    setBuiltinError(null);
    setBuiltinSaving(true);
    try {
      const r = await setBuiltinDefaultRoute(routeName);
      applyBuiltinResponse(r.routes, r.defaultSource);
    } catch (e) {
      setBuiltinError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuiltinSaving(false);
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
    <div className="settings-section">
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

      <section className="settings-builtin" aria-label={t('settings.builtinRoutes')}>
        <h3 className="settings-form-title">{t('settings.builtinRoutes')}</h3>
        <p className="muted small">{t('settings.builtinHint')}</p>
        {builtinRoutes === null ? (
          <p className="muted small">{t('common.loading')}</p>
        ) : (
          <ul className="settings-list">
            {builtinRoutes.map((r) => (
              <li key={r.name} className="settings-item">
                <div className="settings-item-main">
                  <span className="settings-item-label">
                    {r.name}
                    {r.isBuiltinDefault && <span className="badge badge--info">{t('settings.builtinDefaultBadge')}</span>}
                    {r.kind === 'live' && !r.liveReady && <span className="badge badge--err">{t('settings.builtinNotReady')}</span>}
                  </span>
                  {r.kind === 'live' && (
                    <span className="muted small settings-item-meta">
                      <span className="mono">{r.effectiveModelId}</span>
                      {r.effectiveModelId !== r.envModelId && <span className="badge">{t('settings.builtinModelOverridden')}</span>}
                      <span className="mono">{r.baseUrl}</span>
                      <span className="mono">{r.apiKeyEnvVar}</span>
                      {r.pricing !== undefined && <span className="badge badge--ok">{t('settings.builtinPricingSet')}</span>}
                    </span>
                  )}
                </div>
                {r.kind === 'live' && (
                  <div className="settings-item-actions">
                    {!r.isBuiltinDefault && (
                      <button
                        type="button"
                        className="btn btn--small"
                        disabled={builtinSaving}
                        onClick={() => { void makeDefaultBuiltin(r.name); }}
                      >
                        {t('settings.builtinSetDefault')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={builtinSaving}
                      onClick={() => (editingBuiltin === r.name ? (setEditingBuiltin(null), setBuiltinForm(null)) : startEditBuiltin(r))}
                      aria-label={t('settings.edit')}
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                  </div>
                )}
                {editingBuiltin === r.name && builtinForm !== null && (
                  <form
                    className="settings-form"
                    onSubmit={(e) => { e.preventDefault(); void submitBuiltin(r.name); }}
                    noValidate
                  >
                    <label className="field-label" htmlFor={`builtin-model-${r.name}`}>{t('settings.builtinModel')}</label>
                    <input
                      id={`builtin-model-${r.name}`}
                      type="text"
                      value={builtinForm.modelId}
                      placeholder={r.envModelId}
                      onChange={(e) => setBuiltinForm({ ...builtinForm, modelId: e.target.value })}
                    />

                    <label className="field-label" htmlFor={`builtin-price-in-${r.name}`}>{t('settings.pricing')}</label>
                    <span className="muted small">
                      {t('settings.pricingIn')}：
                      <input
                        id={`builtin-price-in-${r.name}`}
                        type="number" min="0" step="0.1" value={builtinForm.pricingIn}
                        onChange={(e) => setBuiltinForm({ ...builtinForm, pricingIn: e.target.value })} style={{ width: '90px' }}
                      />
                      {' '}{t('settings.pricingOut')}：
                      <input
                        type="number" min="0" step="0.1" value={builtinForm.pricingOut}
                        onChange={(e) => setBuiltinForm({ ...builtinForm, pricingOut: e.target.value })} style={{ width: '90px' }}
                      />
                    </span>

                    {builtinError !== null && <p className="field-error" role="alert">{builtinError}</p>}
                    <div className="settings-form-actions">
                      <button type="submit" className="btn btn--primary btn--small" disabled={builtinSaving}>
                        {builtinSaving ? t('settings.saving') : t('settings.save')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => { setEditingBuiltin(null); setBuiltinForm(null); setBuiltinError(null); }}
                      >
                        {t('settings.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {builtinRoutes !== null && (
          <p className="muted small">
            {builtinSource === 'ui' ? t('settings.builtinDefaultFromUi') : t('settings.builtinDefaultFromEnv')}
            {envDefault !== null && envDefault.liveReady ? '' : ` — ${t('settings.envNotReady')}`}
          </p>
        )}

        <div className="settings-spend-limit">
          <h4 className="settings-form-title">{t('settings.spendLimit')}</h4>
          <p className="muted small">{t('settings.spendLimitHint')}</p>
          {spend === null ? (
            <p className="muted small">{t('common.loading')}</p>
          ) : (
            <>
              <p className="small">
                {t('settings.spendLimitSpent', {
                  spent: `$${spend.spentUsd.toFixed(2)}`,
                  limit: spend.limitUsd !== null ? `$${spend.limitUsd.toFixed(2)}` : t('settings.spendLimitUnlimited'),
                })}
                {spend.unpricedCalls > 0 && ` · ${t('settings.spendLimitUnpriced', { n: spend.unpricedCalls })}`}
              </p>
              {spend.limitUsd !== null && spend.spentUsd >= spend.limitUsd && (
                <p className="field-error" role="alert">{t('settings.spendLimitExceeded')}</p>
              )}
              <div className="settings-spend-limit-row">
                <input
                  type="text"
                  inputMode="decimal"
                  value={spendInput}
                  onChange={(e) => setSpendInput(e.target.value)}
                  placeholder={t('settings.spendLimitPlaceholder')}
                  aria-label={t('settings.spendLimit')}
                />
                <button type="button" className="btn" onClick={() => void saveSpend('set')} disabled={spendBusy}>
                  {t('settings.spendLimitSet')}
                </button>
                <button type="button" className="btn" onClick={() => void saveSpend('clear')} disabled={spendBusy || spend.limitUsd === null}>
                  {t('settings.spendLimitClear')}
                </button>
              </div>
              {spendError !== null && <p className="field-error" role="alert">{spendError}</p>}
            </>
          )}
        </div>
      </section>

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
              {usage.map((u) => {
                return (
                  <tr key={`${u.provider}/${u.modelId}`}>
                    <td>
                      <span className="mono">{u.provider}</span> · <span className="mono">{u.modelId}</span> · {u.calls}×
                    </td>
                    <td>{u.totalTokens.toLocaleString()}</td>
                    <td>{u.costUsd !== null ? `$${u.costUsd.toFixed(4)}` : <span className="muted">{t('settings.usageUnknownCost')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {loading ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <section aria-label={t('settings.customConfigs')}>
          <h3 className="settings-form-title">{t('settings.customConfigs')}</h3>
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
        </section>
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
            <option value="gemini">{t('settings.wireGemini')}</option>
            <option value="offline">{t('settings.wireOffline')}</option>
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

          <label className="field-label" htmlFor="mcfg-reasoning">{t('settings.reasoning')}</label>
          <p className="muted small">{t('settings.reasoningHint')}</p>
          <select
            id="mcfg-reasoning"
            value={form.reasoningStyle}
            onChange={(e) => setForm({ ...form, reasoningStyle: e.target.value as FormState['reasoningStyle'] })}
          >
            <option value="">{t('settings.reasoningNone')}</option>
            <option value="reasoning_effort" disabled={form.wire !== 'openai'}>{t('settings.reasoningEffort')}</option>
            <option value="enable_thinking" disabled={form.wire !== 'openai'}>{t('settings.reasoningThinking')}</option>
            <option value="thinking_budget" disabled={form.wire !== 'anthropic'}>{t('settings.reasoningBudget')}</option>
            <option value="thinking_config" disabled={form.wire !== 'gemini'}>{t('settings.reasoningConfig')}</option>
          </select>
          {form.reasoningStyle !== '' && (
            <>
              <label className="field-label" htmlFor="mcfg-reasoning-gear">{t('settings.reasoningDefaultGear')}</label>
              <select
                id="mcfg-reasoning-gear"
                value={form.reasoningDefaultGear}
                onChange={(e) => setForm({ ...form, reasoningDefaultGear: e.target.value as ReasoningGear })}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </>
          )}

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
            <span className="muted small">{t('settings.presetsHint')}</span>
          </p>
          <p className="muted small">
            {(templates ?? []).map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn--small settings-preset"
                title={[p.note, p.keyUrl].filter(Boolean).join(' · ')}
                onClick={() => setForm({ ...form, wire: p.wire, baseUrl: p.baseUrl })}
              >
                {p.label}
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
  );
}
