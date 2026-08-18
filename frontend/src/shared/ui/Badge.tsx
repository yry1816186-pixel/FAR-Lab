import type { HTMLAttributes } from 'react';

import { cx } from './cx.ts';

export type Tone = 'ok' | 'danger' | 'warn' | 'info' | 'muted';

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  ok: 'border-ok/60 bg-ok/10 text-ok',
  danger: 'border-danger/60 bg-danger/10 text-danger',
  warn: 'border-warn/60 bg-warn/10 text-warn',
  info: 'border-info/60 bg-info/10 text-info',
  muted: 'border-borderStrong bg-surface2 text-ink2',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
}

/** Small semantic badge — always carries text (tone is a secondary channel). */
export function Badge({ tone = 'muted', children, className, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
