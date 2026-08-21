import { useCallback } from 'react';
import { isNotFound } from '../../api/client';
import { getEvidence, getSources } from '../../api/endpoints';
import type { EvidenceRelation, ResearchRun, ScientificClaim, SourceDocument } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Section, Skeleton } from '../common';
import { bindingKey, bindingTone } from '../../tones';

export function EvidenceTab({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const refreshKey = `${run.updatedAt}:${run.status}`;

  const sourcesFetcher = useCallback((signal: AbortSignal) => getSources(run.id, signal), [run.id]);
  const sourcesRes = useResource(sourcesFetcher, [run.id], refreshKey);

  const evidenceFetcher = useCallback((signal: AbortSignal) => getEvidence(run.id, signal), [run.id]);
  const evidenceRes = useResource(evidenceFetcher, [run.id], refreshKey);

  const claims = evidenceRes.data?.claims ?? null;
  const relations = evidenceRes.data?.relations ?? null;

  return (
    <div className="tab-content">
      <Section title={t('evidence.sources', { n: sourcesRes.data?.length ?? 0 })}>
        {sourcesRes.loading ? (
          <Skeleton lines={4} />
        ) : sourcesRes.error !== null && isNotFound(sourcesRes.error) ? (
          <EmptyState titleKey="evidence.noSources" hint={t('evidence.noSourcesHint', { stage: t(`stage.${run.currentStage}` as never) })} />
        ) : sourcesRes.error !== null ? (
          <ErrorBox error={sourcesRes.error} onRetry={sourcesRes.retry} />
        ) : sourcesRes.data !== null ? (
          <SourcesTable sources={sourcesRes.data} />
        ) : null}
      </Section>

      <Section title={t('evidence.claims', { n: claims?.length ?? 0 })}>
        {evidenceRes.loading ? (
          <Skeleton lines={4} />
        ) : evidenceRes.error !== null && isNotFound(evidenceRes.error) ? (
          <EmptyState titleKey="evidence.noClaims" hint={t('evidence.noClaimsHint', { stage: t(`stage.${run.currentStage}` as never) })} />
        ) : evidenceRes.error !== null ? (
          <ErrorBox error={evidenceRes.error} onRetry={evidenceRes.retry} />
        ) : claims !== null ? (
          <ClaimsList claims={claims} />
        ) : null}
        {evidenceRes.data !== null && evidenceRes.data.unclassified > 0 && (
          <p className="callout callout--warn" role="status">
            {t('evidence.unclassifiedWarn', { n: evidenceRes.data.unclassified })}
          </p>
        )}
      </Section>

      <Section title={t('evidence.relations')}>
        {!evidenceRes.loading && evidenceRes.error === null && relations !== null ? (
          <RelationsSummary relations={relations} claims={claims ?? []} sources={sourcesRes.data ?? []} />
        ) : null}
      </Section>
    </div>
  );
}

function SourcesTable({ sources }: { sources: SourceDocument[] }): JSX.Element {
  const { t } = useI18n();
  if (sources.length === 0) return <EmptyState titleKey="evidence.noSources" />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="sr-only">{t('evidence.sources', { n: sources.length })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('evidence.col.title')}</th>
            <th scope="col">{t('evidence.col.year')}</th>
            <th scope="col">{t('evidence.col.depth')}</th>
            <th scope="col">{t('evidence.col.access')}</th>
            <th scope="col">{t('evidence.col.verify')}</th>
            <th scope="col">{t('evidence.col.hash')}</th>
            <th scope="col">parse</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const v = s.verification;
            const verifyBadge = v === undefined
              ? <Badge tone="muted">{t('evidence.unverified')}</Badge>
              : v.resolved
                ? <Badge tone="ok" title={v.detail}>{t('evidence.verified')} · {v.method}</Badge>
                : <Badge tone="err" title={v.detail}>{t('evidence.verifyFail')} · {v.method}</Badge>;
            return (
              <tr key={s.id} id={`src-${s.id}`} className="source-row">
                <th scope="row">
                  <span className="source-title" title={s.id}>{s.title}</span>
                </th>
                <td className="mono">{s.publicationYear ?? '—'}</td>
                <td>{t(`depth.${s.contentDepth}` as never)}</td>
                <td>{t(`access.${s.accessState}` as never)}</td>
                <td>
                  {verifyBadge}
                  {v?.titleMatch === false && <span className="muted small"> titleMatch=false</span>}
                </td>
                <td className="mono hash-cell" title={s.contentHash}>{s.contentHash.slice(0, 12)}</td>
                <td>{s.parseStatus === 'ok' ? <span className="muted">ok</span> : <span className="text-warn mono">{s.parseStatus}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClaimsList({ claims }: { claims: ScientificClaim[] }): JSX.Element {
  const { t } = useI18n();
  if (claims.length === 0) return <EmptyState titleKey="evidence.noClaims" />;
  return (
    <ul className="claims-list">
      {claims.map((claim) => (
        <li key={claim.id} className="claim-item">
          <div className="claim-head">
            <IdText value={claim.id} />
            <Badge tone={bindingTone(claim.bindingStatus)} title={t(`binding.${claim.bindingStatus}.zh` as never)}>
              {t(bindingKey(claim.bindingStatus))}
            </Badge>
            {claim.alignmentChecked === true ? (
              <span className="muted small">{t('evidence.alignmentChecked')}</span>
            ) : (
              <span className="muted small">{t('evidence.alignmentNotChecked')}</span>
            )}
            {claim.extractionModelRef !== undefined && (
              <span className="muted small mono"> · {claim.extractionModelRef}</span>
            )}
          </div>
          <p className="claim-text">{claim.text}</p>
          {claim.locators.slice(0, 3).map((loc, i) => (
            <blockquote key={i} className="claim-quote">
              <p>{loc.quote}</p>
              <cite>
                <a href={`#src-${loc.sourceDocumentId}`} className="source-link">
                  {t('evidence.jumpToSource', { n: i + 1 })}
                </a>{' '}
                <IdText value={loc.sourceDocumentId} className="muted" />
                {loc.section !== undefined && <span className="muted"> · {loc.section}</span>}
              </cite>
            </blockquote>
          ))}
          {claim.locators.length > 3 && (
            <p className="muted small">+{claim.locators.length - 3} locators…</p>
          )}
          {claim.uncertainties !== undefined && claim.uncertainties.length > 0 && (
            <details className="claim-uncertainties">
              <summary>{t('hyp.uncertainties')} ({claim.uncertainties.length})</summary>
              <ul>
                {claim.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function RelationsSummary({
  relations,
  claims,
  sources,
}: {
  relations: EvidenceRelation[];
  claims: ScientificClaim[];
  sources: SourceDocument[];
}): JSX.Element {
  const { t } = useI18n();
  if (relations.length === 0) {
    return <EmptyState titleKey="evidence.noRelations" />;
  }

  const byType = new Map<string, number>();
  for (const r of relations) byType.set(r.relation, (byType.get(r.relation) ?? 0) + 1);
  const claimById = new Map(claims.map((c) => [c.id, c] as const));
  const sourceById = new Map(sources.map((s) => [s.id, s] as const));
  const counter = relations.filter((r) => r.relation === 'contradicts' || r.relation === 'weakens'
    || r.relation === 'fails_to_replicate' || r.relation === 'alternative_explanation');

  const polarityTone = (p: string): 'ok' | 'err' | 'muted' => (p === 'supporting' ? 'ok' : p === 'counter' ? 'err' : 'muted');

  return (
    <div className="relations">
      <p className="muted">{t('relation.total', { n: relations.length })}</p>
      <ul className="relation-counts">
        {[...byType.entries()].map(([type, n]) => (
          <li key={type} className={`relation-chip relation-chip--${polarityOf(type)}`}>
            <Badge tone={polarityTone(polarityOf(type))}>{t(`relation.${type}` as never)}</Badge>
            <span className="mono count">{n}</span>
          </li>
        ))}
      </ul>
      <h4 className="minor-title">{t('evidence.counterList', { n: counter.length })}</h4>
      {counter.length === 0 ? (
        <p className="muted">{t('evidence.noCounterFound')}</p>
      ) : (
        <ul className="counter-list">
          {counter.map((r) => {
            const claim = r.claimId !== undefined ? claimById.get(r.claimId) : undefined;
            const sourceId = claim?.locators[0]?.sourceDocumentId ?? r.sourceDocumentId;
            const source = sourceId !== undefined ? sourceById.get(sourceId) : undefined;
            return (
              <li key={r.id} className="counter-item">
                <div className="counter-head">
                  <Badge tone="err">{t(`relation.${r.relation}` as never)}</Badge>
                  <span className="muted small mono">strength={r.strength ?? 'unrated'}</span>
                </div>
                <p className="counter-text">
                  {claim !== undefined
                    ? claim.text
                    : r.claimId !== undefined
                      ? t('evidence.claimMissing', { id: r.claimId })
                      : source !== undefined
                        ? source.title
                        : r.rationale}
                </p>
                <p className="muted small">
                  {t('evidence.rationale')}: {r.rationale}
                  {source !== undefined && <span> · <a className="source-link" href={`#src-${source.id}`}>{source.title.length > 48 ? `${source.title.slice(0, 48)}…` : source.title}</a></span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function polarityOf(relationType: string): 'supporting' | 'counter' | 'neutral' {
  switch (relationType) {
    case 'supports': case 'replicates': return 'supporting';
    case 'contradicts': case 'weakens': case 'fails_to_replicate': case 'alternative_explanation': return 'counter';
    default: return 'neutral';
  }
}
