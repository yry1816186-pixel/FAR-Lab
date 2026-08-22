import { useCallback } from 'react';
import { isNotFound } from '../../api/client';
import { getCorpus, getEvidence, getReceipts, getSources } from '../../api/endpoints';
import type { CorpusQueryInfo, CorpusSnapshotInfo, EvidenceRelation, EvidenceRelationType, ProvenanceReceipt, ResearchRun, ScientificClaim, SourceDocument } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Section, Skeleton } from '../common';
import { bindingKey, bindingTone } from '../../tones';
import { stageKey, contentDepthKey, accessStateKey, bindingZhKey, relationKey, retrievalPurposeKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';

/** GRADE-lite certainty (deterministic ladder, W-G F-B) — label key per level. */
function gradeKey(level: NonNullable<ScientificClaim['gradeCertainty']>): DictKey {
  return `grade.${level}` as DictKey;
}

export function EvidenceTab({
  run,
  onFeedback,
}: {
  run: ResearchRun;
  onFeedback: (target?: { kind: string; id: string; label?: string }) => void;
}): JSX.Element {
  const { t } = useI18n();
  const refreshKey = `${run.updatedAt}:${run.status}`;

  const sourcesFetcher = useCallback((signal: AbortSignal) => getSources(run.id, signal), [run.id]);
  const sourcesRes = useResource(sourcesFetcher, [run.id], refreshKey);

  const evidenceFetcher = useCallback((signal: AbortSignal) => getEvidence(run.id, signal), [run.id]);
  const evidenceRes = useResource(evidenceFetcher, [run.id], refreshKey);

  const corpusFetcher = useCallback((signal: AbortSignal) => getCorpus(run.id, signal), [run.id]);
  const corpusRes = useResource(corpusFetcher, [run.id], refreshKey);

  const receiptsFetcher = useCallback((signal: AbortSignal) => getReceipts(run.id, signal), [run.id]);
  const receiptsRes = useResource(receiptsFetcher, [run.id], refreshKey);

  const claims = evidenceRes.data?.claims ?? null;
  const relations = evidenceRes.data?.relations ?? null;

  return (
    <div className="tab-content">
      <Section title={t('retrieval.title')}>
        {corpusRes.loading ? (
          <Skeleton lines={3} />
        ) : corpusRes.error !== null && isNotFound(corpusRes.error) ? (
          <EmptyState titleKey="retrieval.noCorpus" hint={t('retrieval.noCorpusHint')} />
        ) : corpusRes.error !== null ? (
          <ErrorBox error={corpusRes.error} onRetry={corpusRes.retry} />
        ) : corpusRes.data !== null ? (
          <RetrievalPanel
            queries={corpusRes.data.queries}
            familyFailures={corpusRes.data.familyFailures ?? []}
            fusion={corpusRes.data.fusion}
            receipts={receiptsRes.data ?? []}
          />
        ) : (
          <EmptyState titleKey="retrieval.noCorpus" hint={t('retrieval.noCorpusHint')} />
        )}
      </Section>

      <Section title={t('evidence.sources', { n: sourcesRes.data?.length ?? 0 })}>
        {sourcesRes.loading ? (
          <Skeleton lines={4} />
        ) : sourcesRes.error !== null && isNotFound(sourcesRes.error) ? (
          <EmptyState titleKey="evidence.noSources" hint={t('evidence.noSourcesHint', { stage: t(stageKey(run.currentStage)) })} />
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
          <EmptyState titleKey="evidence.noClaims" hint={t('evidence.noClaimsHint', { stage: t(stageKey(run.currentStage)) })} />
        ) : evidenceRes.error !== null ? (
          <ErrorBox error={evidenceRes.error} onRetry={evidenceRes.retry} />
        ) : claims !== null ? (
          <ClaimsList claims={claims} onChallenge={(id, label) => onFeedback({ kind: 'claim', id, label })} />
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
                <td>{t(contentDepthKey(s.contentDepth))}</td>
                <td>{t(accessStateKey(s.accessState))}</td>
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

function ClaimsList({ claims, onChallenge }: { claims: ScientificClaim[]; onChallenge: (id: string, label: string) => void }): JSX.Element {
  const { t } = useI18n();
  const gradeTitle = (level: NonNullable<ScientificClaim['gradeCertainty']>, downgraded: string[]): string => {
    const reasons = downgraded.length > 0 ? downgraded.join('；') : t('grade.noDowngrades');
    return `${t('grade.titlePrefix')}（${level}）— ${reasons}`;
  };
  if (claims.length === 0) return <EmptyState titleKey="evidence.noClaims" />;
  return (
    <ul className="claims-list">
      {claims.map((claim) => (
        <li key={claim.id} id={`claim-${claim.id}`} className="claim-item">
          <div className="claim-head">
            {/* Evidence-line signature (§8.3): the epistemic glyph is the claim's cognitive
                state — the only saturated color in the chrome. Same mapping as the badge. */}
            <span
              className={`ev-glyph ev-glyph--${claim.bindingStatus === 'verified' ? 'verified' : claim.bindingStatus === 'resolved_unaligned' ? 'caution' : claim.bindingStatus === 'unresolved' ? 'refuted' : 'unknown'}`}
              aria-hidden="true"
            >
              {claim.bindingStatus === 'verified' ? '✓' : claim.bindingStatus === 'resolved_unaligned' ? '▲' : claim.bindingStatus === 'unresolved' ? '✗' : '–'}
            </span>
            <IdText value={claim.id} />
            <Badge tone={bindingTone(claim.bindingStatus)} title={t(bindingZhKey(claim.bindingStatus))}>
              {t(bindingKey(claim.bindingStatus))}
            </Badge>
            {claim.gradeCertainty !== undefined && (
              <Badge
                tone={claim.gradeCertainty === 'high' ? 'ok' : claim.gradeCertainty === 'moderate' ? 'info' : claim.gradeCertainty === 'low' ? 'warn' : 'err'}
                title={gradeTitle(claim.gradeCertainty, claim.downgraded ?? [])}
              >
                {t(gradeKey(claim.gradeCertainty))}
              </Badge>
            )}
            {claim.alignmentChecked === true ? (
              <span className="muted small">{t('evidence.alignmentChecked')}</span>
            ) : (
              <span className="muted small">{t('evidence.alignmentNotChecked')}</span>
            )}
            {claim.extractionModelRef !== undefined && (
              <span className="muted small mono"> · {claim.extractionModelRef}</span>
            )}
            <span className="claim-actions">
              <button
                type="button"
                className="link-button"
                onClick={() => onChallenge(claim.id, claim.text)}
                title={t('compare.challengeClaimHint')}
              >
                {t('compare.challengeClaim')}
              </button>
            </span>
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

  const byType = new Map<EvidenceRelationType, number>();
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
            <span className={`ev-glyph ev-glyph--${polarityOf(type) === 'supporting' ? 'verified' : polarityOf(type) === 'counter' ? 'refuted' : 'unknown'}`} aria-hidden="true">
              {polarityOf(type) === 'supporting' ? '✓' : polarityOf(type) === 'counter' ? '✗' : '–'}
            </span>
            <Badge tone={polarityTone(polarityOf(type))}>{t(relationKey(type))}</Badge>
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
                  <Badge tone="err">{t(relationKey(r.relation))}</Badge>
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

/**
 * Retrieval transparency (D-060 phase-1): every planned query with its purpose
 * (counter-evidence queries structurally guaranteed), joined against the real
 * source_retrieval receipts for hits/http status, plus fusion stats and honest
 * family failures. No invented numbers — anything without a receipt shows "—".
 */
function RetrievalPanel({
  queries,
  familyFailures,
  fusion,
  receipts,
}: {
  queries: CorpusQueryInfo[];
  familyFailures: { family: string; reason: string }[];
  fusion?: NonNullable<CorpusSnapshotInfo['fusion']>;
  receipts: ProvenanceReceipt[];
}): JSX.Element {
  const { t } = useI18n();
  const retrievals = receipts.filter((r) => r.kind === 'source_retrieval' && r.sourceRetrieval !== undefined);
  // Join by query text; planned queries are unique, receipts may repeat (variants/failures).
  const receiptByText = new Map<string, ProvenanceReceipt[]>();
  for (const r of retrievals) {
    const q = r.sourceRetrieval!.query;
    receiptByText.set(q, [...(receiptByText.get(q) ?? []), r]);
  }
  const plannedTexts = new Set(queries.map((q) => q.text));
  const extras = retrievals.filter((r) => !plannedTexts.has(r.sourceRetrieval!.query));

  const purposeTone = (p: CorpusQueryInfo['purpose']): 'info' | 'ok' | 'warn' | 'muted' =>
    p === 'counter_evidence' ? 'warn' : p === 'supporting' ? 'ok' : p === 'discovery' ? 'info' : 'muted';

  const rerankLabel = fusion?.rerankFailure !== undefined
    ? t('retrieval.rerank.failed')
    : fusion?.rerankApplied === true ? t('retrieval.rerank.on') : t('retrieval.rerank.off');

  return (
    <div className="retrieval-panel">
      <p className="muted small">{t('retrieval.plan', { n: queries.length })}</p>
      <table className="data-table">
        <caption className="sr-only">{t('retrieval.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('events.type')}</th>
            <th scope="col">source</th>
            <th scope="col">query</th>
            <th scope="col">hits</th>
          </tr>
        </thead>
        <tbody>
          {queries.map((q, i) => {
            const rs = receiptByText.get(q.text) ?? [];
            const ok = rs.find((r) => (r.sourceRetrieval!.httpStatus ?? 0) < 400 && r.sourceRetrieval!.resultCount >= 0);
            const fail = rs.find((r) => (r.sourceRetrieval!.httpStatus ?? 0) >= 400);
            const hits = ok !== undefined ? ok.sourceRetrieval!.resultCount : null;
            return (
              <tr key={`${q.text}-${i}`}>
                <td>
                  <Badge tone={purposeTone(q.purpose)}>{t(retrievalPurposeKey(q.purpose))}</Badge>
                </td>
                <td className="mono small">{q.family}</td>
                <td className="mono small" title={q.text}>{q.text.length > 72 ? `${q.text.slice(0, 72)}…` : q.text}</td>
                <td className="mono small">
                  {hits !== null ? t('retrieval.hits', { n: hits }) : fail !== undefined
                    ? <span className="text-warn">{t('retrieval.httpFail', { n: fail.sourceRetrieval!.httpStatus })}</span>
                    : <span className="muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {extras.length > 0 && (
        <p className="muted small">{t('retrieval.extraReceipts', { n: extras.length })}</p>
      )}
      {fusion !== undefined && (
        <p className="muted small mono">
          {t('retrieval.fusion', {
            pool: fusion.poolSize ?? '—',
            rerank: rerankLabel,
            seats: fusion.counterSeatsKept ?? '—',
            variants: fusion.variantSearches !== undefined ? t('retrieval.variants', { n: fusion.variantSearches }) : '',
          })}
        </p>
      )}
      {familyFailures.length > 0 && (
        <div className="callout callout--warn small" role="status">
          <strong>{t('retrieval.familyFailures')}：</strong>
          {familyFailures.map((f) => `${f.family} — ${f.reason}`).join('；')}
        </div>
      )}
    </div>
  );
}
