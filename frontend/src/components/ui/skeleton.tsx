import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton — animated placeholder shape for loading states.
 *
 * Replaces bare spinners with structural placeholders (shadcn/ui convention) so the
 * user sees the *shape* of the upcoming content rather than a generic spinner — a
 * perceived-performance improvement (the layout doesn't jump when data arrives).
 *
 * Usage: <Skeleton className="h-4 w-64" /> — set size/shape via className.
 */
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
