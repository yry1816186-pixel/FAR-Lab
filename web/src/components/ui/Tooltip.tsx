import { forwardRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from './cn';

/** Radix tooltip copy-in (HX1). Native title attrs leak IDs and vanish on
 *  touch/keyboard — this is the accessible replacement for new surfaces. */
export const TooltipProvider = TooltipPrimitive.Provider;

export const Tooltip = ({ children, content, side = 'top' }: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}): JSX.Element => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        sideOffset={6}
        className={cn(
          'z-50 max-w-64 rounded-[var(--radius-s)] border border-[var(--v2-form-border)]',
          'bg-[var(--v2-surface)] px-2 py-1 text-[var(--fs-aux)] leading-[var(--lh-aux)] text-[var(--v2-text-1)]',
          'shadow-md',
        )}
      >
        {content}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);

export const TooltipButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => <button ref={ref} type="button" {...props} />,
);
TooltipButton.displayName = 'TooltipButton';
