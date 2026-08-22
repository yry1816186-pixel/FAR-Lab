import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ApiError, withTimeout } from '../../api/client';
import { postFeedback } from '../../api/endpoints';
import type { FeedbackSourceKind } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { errorText } from '../common';

const SOURCE_KINDS: FeedbackSourceKind[] = [
  'human_expert', 'new_literature', 'new_dataset', 'tool_result', 'simulation',
  'experiment', 'reviewer', 'verification_failure', 'reproduction_failure',
];

/** Valid ObjectRef kinds (src/domain/ids.ts) that make researcher-facing feedback targets; the API existence-checks these. */
const TARGET_KINDS = ['hypothesis', 'plan', 'claim', 'question', 'evidence_relation'] as const;

export interface FeedbackTarget {
  kind: string;
  id: string;
  /** Researcher-readable label (statement excerpt) — the object's identity, not its id (CPP-2). */
  label?: string;
}

/**
 * Researcher feedback into the causal revision chain (W2). An optional
 * `initialTarget` comes from inline object actions ("质疑此假设" etc.) — the
 * target then shows as a visible chip with its STATEMENT (never a bare id).
 * After a successful submit the form is replaced by a success panel that
 * closes the loop: where the revision will land and how to watch it (critique:
 * "201 Created" as toast copy was a broken narrative link).
 */
export function FeedbackForm({
  runId,
  onSubmitted,
  initialTarget,
  onClose,
  onViewRevisions,
  onDirtyChange,
}: {
  runId: string;
  onSubmitted: () => void;
  initialTarget?: FeedbackTarget;
  onClose?: () => void;
  onViewRevisions?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [source, setSource] = useState<FeedbackSourceKind>('human_expert');
  const [content, setContent] = useState('');
  const [targetKind, setTargetKind] = useState(initialTarget?.kind ?? '');
  const [targetId, setTargetId] = useState(initialTarget?.id ?? '');
  const [showRequired, setShowRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // A drawer reopen with a different pre-target (e.g. challenging another
  // hypothesis) must re-seed the fields — remount is not guaranteed.
  useEffect(() => {
    if (initialTarget !== undefined) {
      setTargetKind(initialTarget.kind);
      setTargetId(initialTarget.id);
    }
  }, [initialTarget]);

  // Dirty tracking lets the drawer warn before discarding TYPED content.
  // A pre-seeded target chip is one click to re-establish — not a loss worth
  // blocking close over — so only the free-text body counts as dirty.
  useEffect(() => {
    onDirtyChange?.(content.trim().length > 0);
  }, [content, onDirtyChange]);

  const submit = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setError(null);
    if (content.trim().length === 0) {
      setShowRequired(true);
      return;
    }
    setShowRequired(false);
    setSubmitting(true);
    const controller = new AbortController();
    try {
      const input: { source: FeedbackSourceKind; content: string; targetKind?: string; targetId?: string } = {
        source,
        content: content.trim(),
      };
      if (targetKind !== '' && targetId.trim().length > 0) {
        input.targetKind = targetKind;
        input.targetId = targetId.trim();
      }
      await postFeedback(runId, input, withTimeout(controller.signal, 15_000));
      onDirtyChange?.(false);
      setSubmitted(true);
      onSubmitted();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '请求超时（15s）', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 15 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="feedback-success" role="status">
        <p className="feedback-success-title">{t('feedback.successTitle')}</p>
        <p className="muted">{t('feedback.successBody')}</p>
        <div className="feedback-success-actions">
          {onViewRevisions !== undefined && (
            <button type="button" className="btn btn--primary" onClick={onViewRevisions}>
              {t('feedback.viewRevisions')} <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSubmitted(false);
              setContent('');
              setTargetKind('');
              setTargetId('');
            }}
          >
            {t('feedback.another')}
          </button>
          {onClose !== undefined && (
            <button type="button" className="btn" onClick={onClose}>
              {t('feedback.close')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const targetLabel = initialTarget?.label;

  return (
    <form className="feedback-form" onSubmit={(e) => void submit(e)} noValidate>
      <p className="muted">{t('feedback.intro')}</p>

      {targetKind !== '' && targetId.trim().length > 0 && (
        <p className="feedback-target-chip" title={targetId}>
          {targetLabel !== undefined && targetLabel.length > 0 ? (
            <span className="feedback-target-label">{targetLabel}</span>
          ) : (
            <span className="mono">{targetKind}:{targetId}</span>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => { setTargetKind(''); setTargetId(''); }}
          >
            {t('feedback.clearTarget')}
          </button>
        </p>
      )}

      <label className="field-label" htmlFor="fb-source">
        {t('feedback.source')}
      </label>
      <select id="fb-source" value={source} onChange={(e) => setSource(e.target.value as FeedbackSourceKind)} disabled={submitting}>
        {SOURCE_KINDS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="fb-content">
        {t('feedback.content')} <span aria-hidden="true" className="req">*</span>
      </label>
      <textarea
        id="fb-content"
        rows={3}
        value={content}
        placeholder={t('feedback.contentPlaceholder')}
        aria-required="true"
        aria-invalid={showRequired}
        disabled={submitting}
        onChange={(e) => setContent(e.target.value)}
      />
      {showRequired && (
        <p className="field-error" role="alert">
          {t('feedback.contentRequired')}
        </p>
      )}

      <details className="feedback-advanced">
        <summary>{t('feedback.advanced')}</summary>
        <div className="feedback-advanced-body">
          <label className="field-label" htmlFor="fb-targetkind">
            {t('feedback.targetKind')}
          </label>
          <select id="fb-targetkind" value={targetKind} onChange={(e) => setTargetKind(e.target.value)} disabled={submitting}>
            <option value="">—</option>
            {TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="fb-targetid">
            {t('feedback.targetId')}
          </label>
          <input
            id="fb-targetid"
            type="text"
            value={targetId}
            placeholder={t('feedback.targetIdPlaceholder')}
            disabled={submitting}
            onChange={(e) => setTargetId(e.target.value)}
          />
        </div>
      </details>

      {error !== null && (
        <p className="field-error" role="alert">
          {t('controls.actionFailed')}：{errorText(error)}
        </p>
      )}

      <button type="submit" className="btn btn--primary" disabled={submitting || content.trim().length === 0}>
        {submitting ? t('feedback.submitting') : t('feedback.submit')}
      </button>
    </form>
  );
}
