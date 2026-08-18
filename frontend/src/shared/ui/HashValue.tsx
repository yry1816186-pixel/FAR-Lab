import { useState } from 'react';

import { useT } from '@/shared/i18n/index.tsx';
import { cx } from './cx.ts';

/**
 * Mono-rendered hash/identifier. Long hashes truncate in the middle by
 * default (full value in title + accessible label), with a copy affordance.
 * Numbers, hashes, and IDs use the mono face — never body text.
 */
export function HashValue({
  value,
  truncate = true,
  head = 10,
  tail = 8,
  className,
}: {
  readonly value: string;
  readonly truncate?: boolean;
  readonly head?: number;
  readonly tail?: number;
  readonly className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const display = truncate && value.length > head + tail + 3 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

  const copy = (): void => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className={cx('inline-flex max-w-full items-center gap-1 font-mono text-xs', className)}>
      <span className="hash-wrap" title={value} aria-label={value}>
        {display}
      </span>
      <button
        type="button"
        onClick={copy}
        className="rounded px-1 text-ink3 hover:bg-surface2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={copied ? t('state.copied') : t('state.copy')}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}
