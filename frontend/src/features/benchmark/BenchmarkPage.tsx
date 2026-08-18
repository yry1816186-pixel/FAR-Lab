/**
 * features/benchmark/BenchmarkPage — Science-125 suite report surface.
 *
 * The report is a pre-generated offline fixture (structured demo, not real
 * scientific verdicts) — the backend ships honestyNotes and this page shows
 * them verbatim, prominently. Distribution bars are pure DOM with role="img"
 * + aria-label (screen-reader accessible, no chart library).
 */

import { VERDICT_TONE, VERDICT_VALUES, type VerdictValue } from '@/entities/verdict.ts';
import { useBenchmark } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';

interface BarRow {
  readonly key: string;
  readonly count: number;
  readonly color?: string;
}

/** Accessible distribution bars: each bar is role="img" with a full text label. */
function DistributionBars({ rows, label }: { readonly rows: readonly BarRow[]; readonly label: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <ul className="space-y-2" aria-label={label}>
      {rows.map((row) => {
        const pct = max > 0 ? (row.count / max) * 100 : 0;
        return (
          <li key={row.key} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-xs sm:grid-cols-[14rem_1fr_3rem]">
            <span className="truncate font-mono text-ink2" title={row.key}>
              {row.key}
            </span>
            <span className="h-3 rounded bg-surface2">
              <span
                role="img"
                aria-label={`${row.key}: ${String(row.count)}`}
                className="block h-3 rounded"
                style={{
                  width: `${String(pct)}%`,
                  minWidth: row.count > 0 ? '2px' : '0',
                  backgroundColor: row.color ?? 'var(--accent)',
                }}
              />
            </span>
            <span className="text-right font-mono text-ink">{row.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function BenchmarkPage() {
  const t = useT();
  const { locale } = useI18n();
  const bench = useBenchmark();

  const verdictRows: readonly BarRow[] =
    bench.data === undefined
      ? []
      : VERDICT_VALUES.map((v: VerdictValue) => ({
          key: v,
          count: bench.data.verdictDistribution[v] ?? 0,
          color: VERDICT_TONE[v],
        }));

  const domainRows: readonly BarRow[] =
    bench.data === undefined
      ? []
      : Object.entries(bench.data.domainDistribution)
          .sort((a, b) => b[1] - a[1])
          .map(([domain, count]) => ({ key: domain, count }));

  return (
    <div data-testid="benchmark-page">
      <PageHeader title={t('benchmark.title')} lede={t('benchmark.lede')} />

      {bench.isPending ? <LoadingBlock /> : null}
      {bench.isError ? <ErrorBlock error={bench.error} onRetry={() => void bench.refetch()} /> : null}

      {bench.isSuccess ? (
        <>
          {bench.data.honestyNotes.length > 0 ? (
            <Section title={t('benchmark.honesty')}>
              <ul className="space-y-1 rounded border border-warn/50 bg-warn/5 px-4 py-3" data-testid="honesty-notes">
                {bench.data.honestyNotes.map((note, i) => (
                  <li key={i} className="text-sm text-ink2">
                    {note}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t('benchmark.title')}>
            <KeyValueList>
              <KeyValue label={t('benchmark.generatedAt')}>
                <time dateTime={bench.data.generatedAt}>{formatDateTime(bench.data.generatedAt, locale)}</time>
              </KeyValue>
              <KeyValue label={t('benchmark.problems')}>
                <span className="font-mono text-xs">{bench.data.problemCount}</span>
              </KeyValue>
              <KeyValue label={t('benchmark.suiteRoot')}>
                <HashValue value={bench.data.suiteIntegrityRoot} truncate={false} />
              </KeyValue>
              <KeyValue label={t('benchmark.totalLeaves')}>
                <span className="font-mono text-xs">{bench.data.totalLeaves}</span>
              </KeyValue>
              <KeyValue label={t('benchmark.gitCommit')}>
                <span className="font-mono text-xs">{bench.data.gitCommitSha ?? '—'}</span>
              </KeyValue>
            </KeyValueList>
          </Section>

          <Section title={t('benchmark.distribution')}>
            <DistributionBars rows={verdictRows} label={t('benchmark.distribution')} />
          </Section>

          <Section title={t('benchmark.domains')}>
            <DistributionBars rows={domainRows} label={t('benchmark.domains')} />
          </Section>

          <Section title={t('benchmark.entries')}>
            {bench.data.entries.length === 0 ? (
              <EmptyBlock title={t('benchmark.empty')} />
            ) : (
              <DataTable
                caption={t('benchmark.entries')}
                head={[
                  t('benchmark.col.problem'),
                  t('benchmark.col.domain'),
                  t('benchmark.col.verdict'),
                  t('benchmark.col.stages'),
                  t('benchmark.col.converged'),
                  t('benchmark.col.chainVerified'),
                  t('benchmark.col.integrityRoot'),
                ]}
              >
                {bench.data.entries.map((e) => (
                  <tr key={e.problemId}>
                    <Td className="max-w-md">
                      <span className="block">{e.problemTitle}</span>
                      <span className="block font-mono text-xs text-ink3">{e.problemId}</span>
                    </Td>
                    <Td className="text-xs">{e.domain}</Td>
                    <Td>
                      <VerdictBadge verdict={e.verdict} />
                    </Td>
                    <Td mono>{e.stagesCompleted}</Td>
                    <Td>{e.converged ? t('benchmark.yes') : t('benchmark.no')}</Td>
                    <Td>
                      {e.chainVerified ? (
                        <Badge tone="ok">{t('benchmark.yes')}</Badge>
                      ) : (
                        <Badge tone="danger">{t('benchmark.no')}</Badge>
                      )}
                    </Td>
                    <Td>
                      <HashValue value={e.integrityRoot} />
                    </Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}
