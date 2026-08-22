import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext';
import { errorText } from './common';
import { goalTypeKey } from '../i18n/keys';
import { useCreateRun } from '../hooks/useCreateRun';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse } from '../api/types';
import type { ScientificGoalType } from '../api/types';

const GOAL_TYPES: ScientificGoalType[] = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'];

/**
 * Hero run-creation input (P-IA): the workbench's central way to start work —
 * a large question field with the primary action, advanced options collapsed
 * behind a details toggle. Same state machine as before via useCreateRun.
 */
export function NewRunForm({ onCreated }: { onCreated: (runId: string) => void }): JSX.Element {
  const { t } = useI18n();
  const { text, setText, domain, setDomain, goalType, setGoalType, providerConfigId, setProviderConfigId, showValidationError, submitting, error, submit } =
    useCreateRun(onCreated);
  const canSubmit = !submitting && text.trim().length > 0;
  // Model-route picker data (custom configs + the env default): fetched once per
  // mount; failures leave the picker at the env default (never block creation).
  const [modelConfigs, setModelConfigs] = useState<ModelConfigsResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listModelConfigs(controller.signal)
      .then((res) => { setModelConfigs(res); })
      .catch(() => { /* picker stays on the env default — creation must not depend on it */ });
    return () => controller.abort();
  }, []);

  return (
    <form className="hero-form" onSubmit={(e) => void submit(e)} noValidate>
      <label className="field-label" htmlFor="newrun-question">
        {t('form.question')} <span aria-hidden="true" className="req">*</span>
      </label>
      <textarea
        id="newrun-question"
        className="hero-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('form.questionPlaceholder')}
        rows={3}
        aria-required="true"
        aria-invalid={showValidationError}
        disabled={submitting}
        // Quick capture (B2): landing on the welcome view puts the cursor in
        // the question box — idea → FAR-Lab friction ≈ 0 (also reached via `n`).
        autoFocus
      />
      {showValidationError && (
        <p className="field-error" role="alert">
          {t('form.questionRequired')}
        </p>
      )}

      <details className="hero-advanced">
        <summary>{t('form.advanced')}</summary>
        <div className="hero-advanced-body">
          <label className="field-label" htmlFor="newrun-domain">
            {t('form.domain')}
          </label>
          <input
            id="newrun-domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t('form.domainPlaceholder')}
            disabled={submitting}
          />
          <label className="field-label" htmlFor="newrun-goaltype">
            {t('form.goalType')}
          </label>
          <select id="newrun-goaltype" value={goalType} onChange={(e) => setGoalType(e.target.value)} disabled={submitting}>
            <option value="">{t('goalType.unset')}</option>
            {GOAL_TYPES.map((g) => (
              <option key={g} value={g}>
                {t(goalTypeKey(g))}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="newrun-model">
            {t('settings.modelRoute')}
          </label>
          <select id="newrun-model" value={providerConfigId} onChange={(e) => setProviderConfigId(e.target.value)} disabled={submitting}>
            <option value="">
              {t('settings.modelRouteEnvDefault')}
              {modelConfigs?.envDefault !== null && modelConfigs?.envDefault !== undefined
                ? `（${modelConfigs.envDefault.name} · ${modelConfigs.envDefault.modelId}）`
                : ''}
            </option>
            {(modelConfigs?.configs ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}（{c.modelId}）
              </option>
            ))}
          </select>
        </div>
      </details>

      {error !== null && (
        <p className="field-error" role="alert">
          {t('form.submitFailed')}：{errorText(error)}
          {error.retryable ? `（${t('common.retryable')}）` : ''}
        </p>
      )}

      <div className="hero-actions">
        <button type="submit" className="btn btn--primary btn--hero" disabled={!canSubmit}>
          {submitting ? t('form.submitting') : t('form.submit')}
        </button>
        <span className="hero-hint muted">{t('form.heroHint')}</span>
      </div>
      <p className="hero-hint muted small">{t('form.kbdHint')}</p>
      <p aria-live="polite" className="sr-only">
        {submitting ? t('form.submitting') : ''}
      </p>
    </form>
  );
}
