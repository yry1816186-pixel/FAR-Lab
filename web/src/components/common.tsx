import type { ReactNode } from 'react';
import {
  BookMarked, BookOpen, FileJson, FileSpreadsheet, FileText, Globe, Link2, Presentation,
} from 'lucide-react';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { FileKind } from '../utils/ingest';

/** Attachment card kind — shared by every ingest surface (home composer + conversation). */
export type AttachKind =
  | 'PDF' | 'DOC' | 'SHEET' | 'SLIDES' | 'WEB' | 'DATA' | 'BOOK'
  | 'TXT' | 'REF' | 'DOI' | 'arXiv' | 'URL';

/** Display card kind per ingest kind (odt is a document, odp is a slide deck). */
export const DISPLAY_KIND: Record<FileKind, AttachKind> = {
  pdf: 'PDF', docx: 'DOC', sheet: 'SHEET', slides: 'SLIDES',
  odf: 'DOC', html: 'WEB', json: 'DATA', epub: 'BOOK', text: 'TXT', ref: 'REF',
};

const ATTACH_ICON: Record<AttachKind, typeof FileText> = {
  PDF: FileText, DOC: FileText, TXT: FileText,
  SHEET: FileSpreadsheet, SLIDES: Presentation, WEB: Globe, DATA: FileJson, BOOK: BookOpen,
  REF: BookMarked, DOI: Link2, arXiv: Link2, URL: Link2,
};

/** Icon for an attachment kind (semantic type identity, never decoration). */
export function AttachIcon({ kind, size = 14 }: { kind: AttachKind; size?: number }): JSX.Element {
  const Icon = ATTACH_ICON[kind];
  return <Icon size={size} />;
}

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

/** Relative time for scan contexts ("3 小时前"); precise local timestamp and
 *  raw ISO stay on hover (audit-grade honesty). Falls back to absolute when
 *  the value is unparseable or the local clock is behind (skew — never guess). */
export function relativeTime(iso: string, lang: 'zh' | 'en'): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const diffMs = Date.now() - at;
  if (diffMs < -60_000) return iso;
  const rtf = new Intl.RelativeTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' });
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return rtf.format(0, 'minute');
  if (min < 60) return rtf.format(-min, 'minute');
  const hours = Math.round(min / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  return rtf.format(-Math.round(days / 30), 'month');
}

/** Relative-first variant for list surfaces (sidebar/cards). */
export function TimeAgo({ iso }: { iso: string }): JSX.Element {
  const { formatTime, lang } = useI18n();
  return (
    <time dateTime={iso} title={`${formatTime(iso)} · ${iso}`} className="mono">
      {relativeTime(iso, lang)}
    </time>
  );
}

/**
 * Determinate progress ONLY: n/total counts the runtime actually knows
 * (INTERFACES §1 — never an invented percentage). Custom track/fill replaces
 * the native <progress> whose pseudo-element styling diverges per engine.
 */
export function CountProgress({ done, total, label }: { done: number; total: number; label: string }): JSX.Element {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="count-progress">
      <span
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>{' '}
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

/** In-page reveal that NEVER touches location.hash (2026-08-27 baseline finding:
 *  href="#src-..." overwrote the SPA route and bounced the user back home). */
export const revealElement = (id: string): void => {
  const el = document.getElementById(id);
  if (el === null) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('claim-flash');
  window.setTimeout(() => el.classList.remove('claim-flash'), 1600);
};
