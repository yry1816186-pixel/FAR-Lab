import type { ResearchRunDto } from '@/entities/dtos.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { EmptyBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { RunGate } from './RunGate.tsx';

/** Provenance view: per-stage receipts + environment fingerprint + run modes. */
export function MissionProvenance({
  run,
  runPending,
  runNotCompleted,
}: {
  readonly run: ResearchRunDto | null;
  readonly runPending: boolean;
  readonly runNotCompleted: boolean;
}) {
  const t = useT();
  return (
    <RunGate run={run} runPending={runPending} runNotCompleted={runNotCompleted}>
      {(frozen) => (
        <div data-testid="mission-provenance">
          <Section title={`${t('mission.provenance.receipts')} (${String(frozen.stageReceipts.length)})`}>
            {frozen.stageReceipts.length === 0 ? (
              <EmptyBlock title={t('mission.provenance.noReceipts')} />
            ) : (
              <DataTable
                caption={t('mission.provenance.receipts')}
                head={[
                  t('mission.provenance.sequence'),
                  t('mission.provenance.stage'),
                  t('mission.provenance.component'),
                  t('mission.provenance.mode'),
                  t('mission.provenance.attempt'),
                  t('mission.provenance.version'),
                ]}
              >
                {frozen.stageReceipts.map((receipt) => (
                  <tr key={`${receipt.stageId}-${String(receipt.attempt)}`}>
                    <Td mono>{receipt.sequence}</Td>
                    <Td className="font-mono text-xs">{receipt.stageId}</Td>
                    <Td>{receipt.component}</Td>
                    <Td>
                      <Badge tone={receipt.mode === 'LIVE' ? 'ok' : 'muted'}>{receipt.mode}</Badge>
                    </Td>
                    <Td mono>{receipt.attempt}</Td>
                    <Td mono>{receipt.stageVersion}</Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Section>

          <Section title={t('mission.provenance.environment')}>
            <KeyValueList>
              <KeyValue label={t('mission.provenance.gitCommit')}>
                {frozen.environment.gitCommit !== null ? <HashValue value={frozen.environment.gitCommit} /> : '—'}
              </KeyValue>
              <KeyValue label={t('mission.provenance.gitDirty')}>
                {frozen.environment.gitDirty === null ? '—' : frozen.environment.gitDirty ? 'true' : 'false'}
              </KeyValue>
              <KeyValue label={t('mission.provenance.node')}>
                <span className="font-mono text-xs">{frozen.environment.nodeVersion}</span>
              </KeyValue>
              <KeyValue label={t('mission.provenance.platform')}>
                <span className="font-mono text-xs">{frozen.environment.platform}</span>
              </KeyValue>
              <KeyValue label={t('mission.provenance.lockfile')}>
                {frozen.environment.lockfileHash !== null ? <HashValue value={frozen.environment.lockfileHash} /> : '—'}
              </KeyValue>
              <KeyValue label={t('mission.provenance.package')}>{frozen.environment.packageVersion ?? '—'}</KeyValue>
              <KeyValue label={t('mission.provenance.schemaVersion')}>{frozen.schemaVersion}</KeyValue>
            </KeyValueList>
          </Section>
        </div>
      )}
    </RunGate>
  );
}
