import { useState } from 'react';
import { ApiError, withTimeout } from '../api/client';
import { createRun } from '../api/endpoints';
import type { ScientificGoalType } from '../api/types';
import { useI18n } from '../i18n/LanguageContext';
import { errorText } from './common';
import { goalTypeKey } from '../i18n/keys';

const GOAL_TYPES: ScientificGoalType[] = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'];

interface Props {
  onCreated: (runId: string) => void;
}

export function NewRunForm({ onCreated }: Props): JSX.Element {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [goalType, setGoalType] = useState('');
  const [showValidationError, setShowValidationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canSubmit = !submitting && text.trim().length > 0;

  const submit = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setError(null);
    if (text.trim().length === 0) {
      setShowValidationError(true);
      return;
    }
    setShowValidationError(false);
    setSubmitting(true);
    const controller = new AbortController();
    try {
      const input: { text: string; domain?: string; goalType?: ScientificGoalType } = { text: text.trim() };
      if (domain.trim().length > 0) input.domain = domain.trim();
      if (goalType !== '') input.goalType = goalType as ScientificGoalType;
      const runId = await createRun(input, withTimeout(controller.signal, 20_000));
      setText('');
      setDomain('');
      setGoalType('');
      onCreated(runId);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '请求超时（20s）— run 创建请求无响应', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 20 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="newrun" onSubmit={(e) => void submit(e)} noValidate>
      <h3 className="sidebar-subtitle">{t('form.title')}</h3>

      <label className="field-label" htmlFor="newrun-question">
        {t('form.question')} <span aria-hidden="true" className="req">*</span>
      </label>
      <textarea
        id="newrun-question"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('form.questionPlaceholder')}
        rows={3}
        aria-required="true"
        aria-invalid={showValidationError}
        disabled={submitting}
      />
      {showValidationError && (
        <p className="field-error" role="alert">
          {t('form.questionRequired')}
        </p>
      )}

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

      {error !== null && (
        <p className="field-error" role="alert">
          {t('form.submitFailed')}：{errorText(error)}
          {error.retryable ? `（${t('common.retryable')}）` : ''}
        </p>
      )}

      <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
        {submitting ? t('form.submitting') : t('form.submit')}
      </button>
      <p aria-live="polite" className="sr-only">
        {submitting ? t('form.submitting') : ''}
      </p>
    </form>
  );
}
