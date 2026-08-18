import type { ResearchRunDto } from '@/entities/dtos.ts';
import { formatRate } from '@/shared/format.ts';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { EmptyBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { RunGate } from './RunGate.tsx';

const RELATION_KEY: Readonly<Record<string, MessageKey>> = {
  supports: 'mission.grounding.relation.supports',
  contradicts: 'mission.grounding.relation.contradicts',
  contextualizes: 'mission.grounding.relation.contextualizes',
  methods: 'mission.grounding.relation.methods',
  insufficient: 'mission.grounding.relation.insufficient',
};

/** Grounding view: corpus snapshot, citation gate, falsifiability gate, documents. */
export function MissionGrounding({
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
      {(frozen) => {
        const gate = frozen.citationGate;
        const fals = frozen.falsifiabilityGate;
        return (
          <div data-testid="mission-grounding">
            <div className="grid gap-8 lg:grid-cols-2">
              <Section title={t('mission.grounding.snapshot')}>
                <KeyValueList>
                  <KeyValue label={t('mission.grounding.snapshot')}>
                    <HashValue value={frozen.corpus.snapshotId} />
                  </KeyValue>
                  <KeyValue label={t('mission.grounding.rootHash')}>
                    <HashValue value={frozen.corpus.rootHash} />
                  </KeyValue>
                  <KeyValue label={t('mission.grounding.documents')}>{frozen.corpus.documentCount}</KeyValue>
                </KeyValueList>
                {frozen.corpus.sourceQueries.length > 0 ? (
                  <div className="mt-3">
                    <p className="label-micro mb-1">{t('mission.grounding.queries')}</p>
                    <ul className="space-y-1 text-sm text-ink2">
                      {frozen.corpus.sourceQueries.map((query) => (
                        <li key={query} className="rounded bg-surface2 px-2 py-1 font-mono text-xs">
                          {query}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Section>

              <Section title={t('mission.grounding.citationGate')}>
                <KeyValueList>
                  <KeyValue label={t('mission.grounding.citationGate')}>
                    <Badge tone={gate.gateVerdict === 'PASS' ? 'ok' : gate.gateVerdict === 'DEGRADED' ? 'warn' : 'danger'}>
                      {gate.gateVerdict}
                    </Badge>
                  </KeyValue>
                  <KeyValue label={t('mission.grounding.boundRate')}>{formatRate(gate.boundRate)}</KeyValue>
                  <KeyValue label={t('mission.grounding.totalCited')}>{gate.totalCited}</KeyValue>
                  <KeyValue label={t('mission.grounding.bound')}>{gate.boundCount}</KeyValue>
                  <KeyValue label={t('mission.grounding.unboundExcluded')}>{gate.unboundEvidenceCount}</KeyValue>
                  {gate.resolvedViaRetrieval.length > 0 ? (
                    <KeyValue label={t('mission.grounding.resolved')}>{gate.resolvedViaRetrieval.length}</KeyValue>
                  ) : null}
                </KeyValueList>
              </Section>
            </div>

            <Section title={t('mission.grounding.falsifiabilityGate')}>
              <p className="mb-3">
                <Badge tone={fals.allPassed ? 'ok' : 'warn'}>
                  {fals.allPassed ? t('mission.grounding.allPassed') : t('mission.grounding.notAllPassed')}
                </Badge>
              </p>
              <DataTable caption={t('mission.grounding.falsifiabilityGate')} head={['id', 'gate', 'errors']}>
                {Object.entries(fals.perHypothesis).map(([hypoId, outcome]) => (
                  <tr key={hypoId}>
                    <Td>
                      <HashValue value={hypoId} />
                    </Td>
                    <Td>
                      <Badge tone={outcome.passed ? 'ok' : 'danger'}>{outcome.passed ? 'PASS' : 'FAIL'}</Badge>
                    </Td>
                    <Td className="text-xs text-ink2">
                      {outcome.errors.length === 0 ? '—' : outcome.errors.join('; ')}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </Section>

            <Section title={`${t('mission.grounding.documents')} (${String(frozen.corpus.documents.length)})`}>
              {frozen.corpus.documents.length === 0 ? (
                <EmptyBlock title={t('mission.grounding.noDocuments')} />
              ) : (
                <ul className="divide-y divide-border rounded border border-border">
                  {frozen.corpus.documents.map((doc) => (
                    <li key={doc.documentId} className="px-4 py-3">
                      <a
                        href={doc.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-ink hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {doc.title}
                      </a>
                      <p className="mt-1 text-xs text-ink3">
                        {doc.sourceName}
                        {doc.publicationDate !== null ? ` · ${doc.publicationDate}` : ''}
                        {doc.authors.length > 0 ? ` · ${doc.authors.slice(0, 3).join(', ')}${doc.authors.length > 3 ? ' et al.' : ''}` : ''}
                      </p>
                      {doc.doi !== null ? (
                        <p className="mt-0.5 font-mono text-xs text-ink3">
                          {t('mission.grounding.doi')}: {doc.doi}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {Object.values(frozen.bindings).some((b) => b.relations.length > 0) ? (
              <Section title={t('mission.hypotheses.citations')}>
                <DataTable caption={t('mission.hypotheses.citations')} head={['claim', 'document', 'relation', 'binding']}>
                  {Object.values(frozen.bindings).flatMap((binding) =>
                    binding.relations.map((relation) => (
                      <tr key={`${relation.claimId}-${relation.documentId}`}>
                        <Td>
                          <HashValue value={relation.claimId} head={6} tail={4} />
                        </Td>
                        <Td className="max-w-xs">
                          <span className="font-mono text-xs">{relation.documentId}</span>
                        </Td>
                        <Td className="text-xs">{t(RELATION_KEY[relation.relation] ?? 'mission.grounding.relation.contextualizes')}</Td>
                        <Td>
                          <Badge tone={relation.validationStatus === 'bound' ? 'ok' : 'warn'}>
                            {relation.validationStatus === 'bound' ? t('mission.grounding.bound') : t('mission.grounding.unbound')}
                          </Badge>
                        </Td>
                      </tr>
                    )),
                  )}
                </DataTable>
              </Section>
            ) : null}
          </div>
        );
      }}
    </RunGate>
  );
}
