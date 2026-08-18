import { Link } from 'react-router-dom';

import { useResearchList } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { lifecycleTone } from '@/entities/run.ts';
import { NewMissionForm } from '@/features/missions/NewMissionForm.tsx';

/**
 * Home — the mission control surface. The three primary actions answer "what
 * can I do here" in seconds; the recent-missions list answers "what did I do".
 * No metrics dashboard, no marketing hero.
 */
export default function HomePage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useResearchList();

  return (
    <div data-testid="home-page">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('home.heading')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink2">{t('home.lede')}</p>
      </header>

      <Section title={t('home.newMission')}>
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <NewMissionForm />
          <div className="space-y-3">
            <Link
              to="/assay"
              className="block rounded border border-border px-4 py-3 hover:border-borderStrong hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm font-medium text-ink">{t('home.quickAssay')}</span>
              <span className="mt-0.5 block text-xs text-ink3">{t('home.quickAssayHint')}</span>
            </Link>
            <Link
              to="/verify"
              className="block rounded border border-border px-4 py-3 hover:border-borderStrong hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm font-medium text-ink">{t('home.verifyBundle')}</span>
              <span className="mt-0.5 block text-xs text-ink3">{t('home.verifyBundleHint')}</span>
            </Link>
          </div>
        </div>
      </Section>

      <Section
        title={t('home.recentMissions')}
        actions={
          <Link to="/missions" className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
            {t('home.viewAllMissions')}
          </Link>
        }
      >
        {list.isPending ? <LoadingBlock /> : null}
        {list.isError ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && list.data.runs.length === 0 ? <EmptyBlock title={t('home.recentEmpty')} /> : null}
        {list.isSuccess && list.data.runs.length > 0 ? (
          <ul className="divide-y divide-border rounded border border-border">
            {list.data.runs.slice(0, 8).map((run) => (
              <li key={run.runId}>
                <Link
                  to={`/missions/${run.runId}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{run.question}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tone={lifecycleTone(run.state)}>{run.state}</Badge>
                    <time className="font-mono text-xs text-ink3" dateTime={run.startedAt}>
                      {formatDateTime(run.startedAt, locale)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}
