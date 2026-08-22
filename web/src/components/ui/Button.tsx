import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * Copy-in button primitive (shadcn pattern, Scout C) bound to the existing v2
 * token scale instead of shadcn's default palette. Existing `.btn` BEM classes
 * stay authoritative for migrated surfaces; new surfaces use this component.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--v2-info)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--v2-btn-ink)] text-[var(--v2-btn-ink-fg)] hover:opacity-90',
        secondary: 'bg-[var(--v2-surface-2)] text-[var(--v2-text-1)] border border-[var(--v2-form-border)] hover:bg-[var(--v2-surface)]',
        ghost: 'text-[var(--v2-text-2)] hover:bg-[var(--v2-surface-2)] hover:text-[var(--v2-text-1)]',
        danger: 'bg-[var(--v2-refuted)] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-7 px-2.5 text-[var(--fs-aux)] rounded-[var(--radius-s)]',
        md: 'h-8 px-3 text-[var(--fs-body)] rounded-[var(--radius-s)]',
        lg: 'h-10 px-4 text-[var(--fs-body)] rounded-[var(--radius-s)]',
        icon: 'h-7 w-7 rounded-[var(--radius-s)]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
