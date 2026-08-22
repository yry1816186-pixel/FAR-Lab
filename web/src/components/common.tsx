import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';

/** Semantic badge tone — semantic color only, never decoration (PRODUCT_HCI §10). */
export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'muted';

export function Badge({ tone, children, title }: { tone: BadgeTone; children: ReactNode; title?: string }): JSX.Element {
  const cls = tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'err' ? 'err' : tone === 'info' ? 'info' : 'muted';
  return (
    <span className={`badge badge--${cls}`} title={title}>
      {children}
    </span>
  );
}

/** Labeled badge from an i18n key + tone. */
export function LabeledBadge({ tone, labelKey, title }: { tone: BadgeTone; labelKey: DictKey; title?: string }): JSX.Element {
  const { t } = useI18n();
  return (
    <Badge tone={tone} title={title}>
      {t(labelKey)}
    </Badge>
  );
}

export function Skeleton({ lines = 3, ariaLabelKey }: { lines?: number; ariaLabelKey?: DictKey }): JSX.Element {
  const { t } = useI18n();
  const label = ariaLabelKey !== undefined ? t(ariaLabelKey) : t('common.loading');
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${[92, 78, 85, 64][i % 4]}%` }} />
      ))}
    </div>
  );
}

/**
 * Error surface with grading (PRODUCT_HCI §6): what happened (message),
 * classification (code, retryability) and the recovery action (retry button
 * only when retry is actually safe).
 */
/** Translated message for an ApiError (i18nKey when present, raw message otherwise). */
export function errorText(error: ApiError): string {
  const { t } = useI18n();
  return error.i18nKey !== undefined ? t(error.i18nKey, error.i18nVars ?? {}) : error.message;
}

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry: () => void }): JSX.Element {
  const { t } = useI18n();
  // Layer-constructed errors carry an i18nKey so the message follows the UI language;
  // the raw message is kept as a tooltip for audit-grade fidelity of the original text.
  const message = error.i18nKey !== undefined ? t(error.i18nKey, error.i18nVars ?? {}) : error.message;
  return (
    <div className="errorbox" role="alert">
      <div className="errorbox-title">
        <strong>{t('common.errorTitle')}</strong>
        <span className="mono"> {t('common.errorCode', { code: error.code })}</span>
      </div>
      <div className="errorbox-message" title={message === error.message ? undefined : error.message}>{message}</div>
      <div className="errorbox-meta">
        <Badge tone={error.retryable ? 'info' : 'err'}>{error.retryable ? t('common.retryable') : t('common.nonRetryable')}</Badge>
        {error.retryable && (
          <button type="button" className="btn btn--small" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ titleKey, hint, hintKey }: { titleKey: DictKey; hint?: string; hintKey?: DictKey }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="empty">
      <div className="empty-title">{t(titleKey)}</div>
      {(hint !== undefined || hintKey !== undefined) && (
        <div className="empty-hint">{hint !== undefined ? hint : t(hintKey as DictKey)}</div>
      )}
    </div>
  );
}

export function Section({
  title,
  count,
  actions,
  children,
  id,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}): JSX.Element {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h3 className="section-title">
          {title}
          {count !== undefined && <span className="section-count">{count}</span>}
        </h3>
        {actions !== undefined && <div className="section-actions">{actions}</div>}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

/** Monospace identifier with the full value in a title tooltip. */
export function IdText({ value, className }: { value: string; className?: string }): JSX.Element {
  return (
    <span className={`mono id-text${className !== undefined ? ` ${className}` : ''}`} title={value}>
      {value}
    </span>
  );
}

/** Timestamp that always shows the raw ISO string on hover (audit-grade honesty). */
export function TimeText({ iso }: { iso: string }): JSX.Element {
  const { formatTime } = useI18n();
  return (
    <time dateTime={iso} title={iso} className="mono">
      {formatTime(iso)}
    </time>
  );
}

/**
 * Determinate progress ONLY: n/total counts the runtime actually knows
 * (INTERFACES §1 — never an invented percentage).
 */
export function CountProgress({ done, total, label }: { done: number; total: number; label: string }): JSX.Element {
  return (
    <span className="count-progress">
      <progress max={total} value={done} aria-label={label} />{' '}
      <span className="mono">{done}/{total}</span>
    </span>
  );
}

/** Definition list helper for dense key/value rendering. */
export function FieldList({ items }: { items: { key: ReactNode; value: ReactNode }[] }): JSX.Element {
  return (
    <dl className="fieldlist">
      {items.map((item, i) => (
        <div className="fieldlist-row" key={i}>
          <dt>{item.key}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
