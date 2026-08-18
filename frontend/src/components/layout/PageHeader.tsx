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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {icon !== undefined && (
            <span className="shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description !== undefined && description.length > 0 && (
              <p className="mt-1 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions !== undefined && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  );
}
