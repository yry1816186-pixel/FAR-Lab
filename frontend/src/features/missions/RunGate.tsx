import type { ReactNode } from 'react';

import type { ResearchRunDto } from '@/entities/dtos.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/shared/ui/StateBlock.tsx';

/**
 * Gate for views that need the frozen ResearchRun: renders the real loading /
 * not-completed(409) / error states before children see a non-null run.
 */
export function RunGate({
  run,
  runPending,
  runNotCompleted,
  runError,
  children,
}: {
  readonly run: ResearchRunDto | null;
  readonly runPending: boolean;
  readonly runNotCompleted: boolean;
  readonly runError?: Error | null;
  readonly children: (run: ResearchRunDto) => ReactNode;
}) {
  const t = useT();
  if (run !== null) return <>{children(run)}</>;
  if (runNotCompleted) return <EmptyBlock title={t('mission.notCompleted')} />;
  if (runError !== null && runError !== undefined) {
    return <ErrorBlock error={runError} testId="run-error" />;
  }
  if (runPending) return <LoadingBlock />;
  return <EmptyBlock title={t('mission.notCompleted')} />;
}
