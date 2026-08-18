import { Link } from 'react-router-dom';

import { lifecycleTone } from '@/entities/run.ts';
import { useResearchList } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { NewMissionForm } from './NewMissionForm.tsx';

/** Missions — the full run inventory with an inline creation form. */
export default function MissionsPage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useResearchList();

  return (
    <div data-testid="missions-page">
      <PageHeader title={t('mission.list.title')} />

      <Section title={t('mission.create.title')}>
        <NewMissionForm />
      </Section>

      <Section title={t('mission.list.title')}>
        {list.isPending ? <LoadingBlock /> : null}
        {list.isError ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && list.data.runs.length === 0 ? <EmptyBlock title={t('mission.list.empty')} /> : null}
        {list.isSuccess && list.data.runs.length > 0 ? (
          <DataTable
            caption={t('mission.list.title')}
            head={[t('mission.list.question'), t('mission.list.state'), t('mission.list.started'), t('mission.list.updated'), '']}
          >
            {list.data.runs.map((run) => (
              <tr key={run.runId}>
                <Td className="max-w-md">
                  <Link to={`/missions/${run.runId}`} className="text-ink hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                    {run.question}
                  </Link>
                  <span className="block font-mono text-xs text-ink3">{run.runId}</span>
                </Td>
                <Td>
                  <Badge tone={lifecycleTone(run.state)}>{run.state}</Badge>
                </Td>
                <Td mono>
                  <time dateTime={run.startedAt}>{formatDateTime(run.startedAt, locale)}</time>
                </Td>
                <Td mono>
                  <time dateTime={run.updatedAt}>{formatDateTime(run.updatedAt, locale)}</time>
                </Td>
                <Td>
                  <Link to={`/missions/${run.runId}`} className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                    {t('mission.list.open')}
                  </Link>
                </Td>
              </tr>
            ))}
          </DataTable>
        ) : null}
      </Section>
    </div>
  );
}
