import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cx } from './cx.ts';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';

const VARIANT_CLASS: Readonly<Record<Variant, string>> = {
  primary: 'bg-accent text-accentInk hover:opacity-90 disabled:opacity-50',
  ghost: 'text-ink2 hover:bg-surface2 hover:text-ink disabled:opacity-50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  outline: 'border border-borderStrong text-ink hover:bg-surface2 disabled:opacity-50',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: 'sm' | 'md';
}

/**
 * The single button primitive. Always a real <button type="button"> by
 * default (never a div), with a visible focus ring via :focus-visible.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    />
  );
});
