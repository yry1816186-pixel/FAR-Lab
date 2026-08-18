import { useState, type ReactNode } from 'react';

import { useT } from '@/shared/i18n/index.tsx';
import { cx } from './cx.ts';

/** Collapsible raw-JSON disclosure — evidence payloads stay inspectable verbatim. */
export function JsonBlock({ value, className }: { readonly value: unknown; readonly className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        {open ? t('state.hideJson') : t('state.showJson')}
      </button>
      {open ? (
        <pre className="mt-2 max-h-80 overflow-auto rounded border border-border bg-surface2 p-3 font-mono text-xs text-ink2">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** Page header: title + optional lede + right-side actions. */
export function PageHeader({ title, lede, actions, className }: { readonly title: ReactNode; readonly lede?: ReactNode; readonly actions?: ReactNode; readonly className?: string }) {
  return (
    <header className={cx('mb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {actions}
      </div>
      {lede !== undefined ? <p className="mt-1 max-w-3xl text-sm text-ink2">{lede}</p> : null}
    </header>
  );
}
