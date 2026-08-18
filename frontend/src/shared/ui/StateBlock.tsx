import type { ReactNode } from 'react';

import { useT } from '@/shared/i18n/index.tsx';
import { ApiError } from '@/shared/api/http.ts';
import { Button } from './Button.tsx';
import { cx } from './cx.ts';

/**
 * First-class async states. Every data surface renders one of these instead
 * of fabricating content: loading (announced politely), empty (honest), error
 * (role=alert, with machine code + backend remediation guidance verbatim),
 * unavailable (capability blocked by configuration, with its real reason).
 */

export function LoadingBlock({ label, className }: { readonly label?: string; readonly className?: string }) {
  const t = useT();
  return (
    <div role="status" className={cx('flex items-center gap-2 py-8 text-sm text-ink2', className)} data-testid="state-loading">
      <span className="far-spinner inline-block h-4 w-4 rounded-full border-2 border-borderStrong border-t-accent" aria-hidden="true" />
      <span>{label ?? t('state.loading')}</span>
    </div>
  );
}

export function EmptyBlock({ title, hint, className }: { readonly title?: string; readonly hint?: string; readonly className?: string }) {
  const t = useT();
  return (
    <div className={cx('rounded border border-dashed border-borderStrong px-4 py-8 text-center', className)} data-testid="state-empty">
      <p className="text-sm text-ink2">{title ?? t('state.empty')}</p>
      {hint !== undefined ? <p className="mt-1 text-xs text-ink3">{hint}</p> : null}
    </div>
  );
}

export function ErrorBlock({
  error,
  onRetry,
  className,
  testId,
}: {
  readonly error: unknown;
  readonly onRetry?: (() => void) | undefined;
  readonly className?: string;
  readonly testId?: string;
}) {
  const t = useT();
  const apiError = error instanceof ApiError ? error : null;
  const guidance = apiError?.guidance() ?? null;
  const message =
    apiError !== null
      ? apiError.message
      : error instanceof Error
        ? error.message
        : t('error.unknown');
  return (
    <div role="alert" className={cx('rounded border border-danger/50 bg-danger/5 px-4 py-3', className)} data-testid={testId ?? 'state-error'}>
      <p className="text-sm font-medium text-danger">{t('state.error.title')}</p>
      <p className="mt-1 text-sm text-ink2">{message}</p>
      {apiError !== null ? (
        <p className="mt-1 font-mono text-xs text-ink3">
          {t('state.error.code')}: {apiError.errorCode}
          {apiError.httpStatus > 0 ? ` · HTTP ${String(apiError.httpStatus)}` : ''}
        </p>
      ) : null}
      {guidance !== null ? (
        <p className="mt-2 border-t border-danger/30 pt-2 text-sm text-ink2">
          <span className="label-micro mr-2">{t('state.error.guidance')}</span>
          {guidance}
        </p>
      ) : null}
      {onRetry !== undefined ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t('state.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function UnavailableBlock({
  title,
  body,
  guidance,
  className,
  testId,
}: {
  readonly title: string;
  readonly body: string;
  readonly guidance?: string | undefined;
  readonly className?: string;
  readonly testId?: string;
}) {
  const t = useT();
  return (
    <div className={cx('rounded border border-warn/50 bg-warn/5 px-4 py-3', className)} data-testid={testId ?? 'state-unavailable'}>
      <p className="text-sm font-medium text-warn">{title}</p>
      <p className="mt-1 text-sm text-ink2">{body}</p>
      {guidance !== undefined ? (
        <p className="mt-2 border-t border-warn/30 pt-2 text-sm text-ink2">
          <span className="label-micro mr-2">{t('state.error.guidance')}</span>
          {guidance}
        </p>
      ) : null}
    </div>
  );
}

/** Inline status line for streams (connecting/live/closed) — text, not just color. */
export function StreamStatusLine({ status, labels }: { readonly status: 'connecting' | 'live' | 'closed'; readonly labels: Readonly<Record<'connecting' | 'live' | 'closed', string>> }) {
  const tone = status === 'live' ? 'text-ok' : status === 'connecting' ? 'text-warn' : 'text-ink3';
  return (
    <p role="status" className={cx('flex items-center gap-1.5 text-xs', tone)} data-testid="stream-status" data-status={status}>
      <span
        aria-hidden="true"
        className={cx('inline-block h-1.5 w-1.5 rounded-full', status === 'live' ? 'bg-ok' : status === 'connecting' ? 'bg-warn' : 'bg-ink3')}
      />
      {labels[status]}
    </p>
  );
}

export function Section({ title, children, actions, className }: { readonly title: ReactNode; readonly children: ReactNode; readonly actions?: ReactNode; readonly className?: string }) {
  return (
    <section className={cx('mt-8 first:mt-0', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <h2 className="label-micro">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
