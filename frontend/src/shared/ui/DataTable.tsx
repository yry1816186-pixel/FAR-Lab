import type { ReactNode } from 'react';

import { cx } from './cx.ts';

/**
 * Semantic table scaffolding — real <table> markup (screen-reader navigable),
 * horizontally scrollable when narrow (local scroll, never global overflow).
 */
export function DataTable({
  caption,
  head,
  children,
  className,
}: {
  readonly caption: string;
  readonly head: readonly ReactNode[];
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cx('overflow-x-auto rounded border border-border', className)}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface2">
            {head.map((cell, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-xs font-semibold text-ink2">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, mono }: { readonly children: ReactNode; readonly className?: string; readonly mono?: boolean }) {
  return <td className={cx('px-3 py-2 align-top text-ink', mono === true && 'font-mono text-xs', className)}>{children}</td>;
}
