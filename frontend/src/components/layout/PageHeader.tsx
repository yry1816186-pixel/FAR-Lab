/**
 * PageHeader — reusable page header component.
 *
 * Usage:
 *   <PageHeader
 *     title="证据链可视化"
 *     description="浏览证据节点与边"
 *     actions={<Button>操作</Button>}
 *   />
 */

import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Page title (rendered as h1). */
  readonly title: string;
  /** Optional subtitle / description below the title. */
  readonly description?: string;
  /** Optional action buttons / controls on the right side. */
  readonly actions?: ReactNode;
  /** Optional icon to display next to the title. */
  readonly icon?: ReactNode;
  /** Optional test id for the header wrapper. */
  readonly 'data-testid'?: string;
}

export function PageHeader({ title, description, actions, icon, 'data-testid': testId }: PageHeaderProps) {
  return (
    <header data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {icon !== undefined && (
            <span className="shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight truncate">{title}</h1>
            {description !== undefined && description.length > 0 && (
              <p className="mt-1 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions !== undefined && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
