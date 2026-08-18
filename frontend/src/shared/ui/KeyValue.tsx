import type { ReactNode } from 'react';

import { cx } from './cx.ts';

/** Definition-list row: label left, value right. The workhorse of dense scientific display. */
export function KeyValue({ label, children, className }: { readonly label: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cx('grid grid-cols-[10rem_1fr] items-baseline gap-3 py-1.5 sm:grid-cols-[12rem_1fr]', className)}>
      <dt className="text-xs text-ink3">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

export function KeyValueList({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <dl className={cx('divide-y divide-border', className)}>{children}</dl>;
}
