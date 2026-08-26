import { ScreeningWorkbench } from '../ScreeningWorkbench.js';
import { useCallback, useState } from 'react';
import { isNotFound } from '../../api/client';
import { counterSearch, getCorpus, getEvidence, getHypotheses, getReceipts, getSources } from '../../api/endpoints';
import type { CounterSearchOutcome } from '../../api/endpoints';
import type { CorpusQueryInfo, CorpusSnapshotInfo, EvidenceRelation, EvidenceRelationType, ProvenanceReceipt, ResearchRun, ScientificClaim, SourceDocument } from '../../api/types';
import { RELATION_POLARITY } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Section, Skeleton } from '../common';
import { ResearchActions } from './ResearchActions';
import { EvidenceGraph } from './EvidenceGraph';
import { bindingKey, bindingTone } from '../../tones';
import { stageKey, contentDepthKey, accessStateKey, bindingZhKey, relationKey, retrievalPurposeKey } from '../../i18n/keys';
import type { DictKey } from '../../i18n/dict';
import { revealElement } from '../common';

/** GRADE-lite certainty (deterministic ladder, W-G F-B) — label key per level. */
function gradeKey(level: NonNullable<ScientificClaim['gradeCertainty']>): DictKey {
  return `grade.${level}` as DictKey;
}

/** The ONE counter-evidence predicate (R2-01): every surface that counts
 *  "counter relations" uses this set — overview strip and relations section. */
function isCounterRelation(r: EvidenceRelation): boolean {
  return r.relation === 'contradicts' || r.relation === 'weakens'
    || r.relation === 'fails_to_replicate' || r.relation === 'alternative_explanation';
}

export function EvidenceTab({
  run,
  onFeedback,
  onOpenHypotheses,
}: {
  run: ResearchRun;
  onFeedback: (target?: { kind: string; id: string; label?: string; content?: string }) => void;
  /** B7/R3 graph + binding-chip navigation: jump to the hypotheses tab,
   *  optionally revealing one specific hypothesis card. */
  onOpenHypotheses?: (hypId?: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const refreshKey = `${run.updatedAt}:${run.status}`;
  const [screeningOpen, setScreeningOpen] = useState(false);

  // §5.2 counter-evidence search: one researcher-directed live retrieval into
  // the corpus. Disabled while the run executes (server lease-guard 409s anyway —
  // the UI states the honest reason instead of offering a dead action).
  const runActive = run.status === 'running' || run.status === 'queued';
  const [csQuery, setCsQuery] = useState('');
  const [csBusy, setCsBusy] = useState(false);
  const [csResult, setCsResult] = useState<CounterSearchOutcome | null>(null);
  const [csError, setCsError] = useState<string | null>(null);
  const submitCounterSearch = (): void => {
    const q = csQuery.trim();
    if (q.length < 4 || csBusy || runActive) return;
    setCsBusy(true);
    setCsError(null);
    setCsResult(null);
    void (async () => {
      try {
        const out = await counterSearch(run.id, q);
        setCsResult(out);
        setCsQuery('');
        sourcesRes.retry();
        corpusRes.retry();
        receiptsRes.retry();
      } catch (e) {
        setCsError(e instanceof Error ? e.message : String(e));
      } finally {
        setCsBusy(false);
      }
    })();
  };


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
    <>
      {/* Evidence overview strip: the corpus at a glance before the tables —
          counts are the bundle's real objects (no invented metrics). */}
      {!sourcesRes.loading && !evidenceRes.loading && sourcesRes.error === null && evidenceRes.error === null && (
        <div className="evidence-overview" aria-label={t('evidence.overviewLabel')}>
          <div className="evidence-stat">
            <span className="evidence-stat-num mono">{sourcesRes.data?.length ?? 0}</span>
            <span className="evidence-stat-label">{t('evidence.statSources')}</span>
          </div>
          <div className="evidence-stat">
            <span className="evidence-stat-num mono">{claims?.length ?? 0}</span>
            <span className="evidence-stat-label">{t('evidence.statClaims')}</span>
          </div>
          <div className="evidence-stat">
            <span className="evidence-stat-num mono">
              {relations?.filter((r) => r.relation === 'supports').length ?? 0}
            </span>
            <span className="evidence-stat-label">
              <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span> {t('evidence.statSupporting')}
            </span>
          </div>
          <div className="evidence-stat">
            <span className="evidence-stat-num mono">
              {/* Same counter predicate as the relations section below — the
                  overview and the detail must never disagree (R2-01 fix). */}
              {relations?.filter(isCounterRelation).length ?? 0}
            </span>
            <span className="evidence-stat-label">
              <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span> {t('evidence.statContradicting')}
            </span>
          </div>
        </div>
      )}
      {/* Active-learning screening (ASReview-pattern): enter once the pool is
          big enough for the loop to mean anything; smaller pools are honestly
          not worth a screening pass. */}
      {!sourcesRes.loading && (sourcesRes.data?.length ?? 0) >= 6 && (
        <div className="screening-entry">
          <button type="button" className="btn btn--small" onClick={() => setScreeningOpen(true)}>
            {t('screening.entry', { n: sourcesRes.data?.length ?? 0 })}
          </button>
          <span className="muted small">{t('screening.entryHint')}</span>
        </div>
      )}
      {screeningOpen && <ScreeningWorkbench runId={run.id} onClose={() => setScreeningOpen(false)} />}

      {/* §5.2 counter-evidence loop: execute the missing counter-evidence search
          the counter_evidence action names (or any targeted query) into the corpus. */}
      <div className="counter-search-entry">
        <input
          className="input counter-search-input"
          type="text"
          value={csQuery}
          maxLength={400}
          placeholder={t('counterSearch.placeholder')}
          aria-label={t('counterSearch.placeholder')}
          disabled={runActive || csBusy}
          onChange={(e) => setCsQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCounterSearch(); } }}
        />
        <button
          type="button"
          className="btn btn--small"
          disabled={runActive || csBusy || csQuery.trim().length < 4}
          title={runActive ? t('counterSearch.activeRun') : t('counterSearch.hint')}
          onClick={submitCounterSearch}
        >
          {csBusy ? t('counterSearch.pending') : t('counterSearch.go')}
        </button>
      </div>
      {csResult !== null && (
        <p className="counter-search-note" role="status">
          {csResult.added.length > 0
            ? t('counterSearch.added', { n: csResult.added.length, dupes: csResult.duplicatesSkipped })
            : t('counterSearch.emptyResult')}
          {' '}{csResult.note}
        </p>
      )}
      {csError !== null && <p className="field-error" role="alert">{t('counterSearch.failed')}：{csError}</p>}

      {/* B1 reorder: the researcher's substance leads (sources → claims →
          relations); retrieval transparency stays fully available but is a
          collapsed trust disclosure, not the first screen of the tab. */}
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
          <ClaimsList claims={claims} relations={relations ?? []} runId={run.id} onFeedback={onFeedback} onOpenHypotheses={onOpenHypotheses} />
        ) : null}
        {evidenceRes.data !== null && evidenceRes.data.unclassified > 0 && (
          <p className="callout callout--warn" role="status">
            {t('evidence.unclassifiedWarn', { n: evidenceRes.data.unclassified })}
          </p>
        )}
      </Section>

      <Section title={t('evidence.relations')}>
        {!evidenceRes.loading && evidenceRes.error === null && relations !== null ? (
          <RelationsSummary relations={relations} claims={claims ?? []} sources={sourcesRes.data ?? []} onOpenHypotheses={onOpenHypotheses} />
        ) : null}
      </Section>

      <Section title={t('graph.title')}>
        {!evidenceRes.loading && evidenceRes.error === null && claims !== null && sourcesRes.data !== null ? (
          <EvidenceGraph
            run={run}
            sources={sourcesRes.data}
            claims={claims}
            relations={relations ?? []}
            onOpenClaim={(claimId) => {
              const el = document.getElementById(`claim-${claimId}`);
              if (el !== null) {
                el.scrollIntoView({ block: 'center' });
                el.classList.add('claim-flash');
                window.setTimeout(() => el.classList.remove('claim-flash'), 1600);
              }
            }}
            onOpenHypothesis={() => onOpenHypotheses?.()}
          />
        ) : (
          <p className="muted small">{t('common.loading')}</p>
        )}
      </Section>

      <details className="tech-details">
        <summary>{t('retrieval.title')}</summary>
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
      </details>
    </>
  );
}

function SourcesTable({ sources }: { sources: SourceDocument[] }): JSX.Element {
  const { t } = useI18n();
  if (sources.length === 0) return <EmptyState titleKey="evidence.noSources" />;
  // Honest links (B2-critique): a DOI link is only rendered for values that
  // actually look like DOIs; anything else stays a plain "—" instead of a
  // confident-looking link that 404s. OA links must be https.
  const DOI_RE = /^\d{2,}\.\d{4,}\/\S+$/;
  const doiOf = (s: SourceDocument): string | undefined => {
    const raw = s.identifiers.find((i) => i.kind.toLowerCase() === 'doi')?.value.trim();
    return raw !== undefined && DOI_RE.test(raw) && !raw.startsWith('http') ? raw : undefined;
  };
  const oaUrlOf = (s: SourceDocument): string | undefined => {
    const raw = s.oaUrl;
    if (raw === undefined) return undefined;
    try {
      return new URL(raw).protocol === 'https:' ? raw : undefined;
    } catch {
      return undefined;
    }
  };
  const authorLine = (s: SourceDocument): string | undefined => {
    if (s.authors === undefined || s.authors.length === 0) return undefined;
    const names = s.authors.slice(0, 3).join(', ');
    return s.authors.length > 3 ? `${names} et al.` : names;
  };
  return (
    <div>
      <div className="table-scroll">
        <table className="data-table">
          <caption className="sr-only">{t('evidence.sources', { n: sources.length })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('evidence.col.title')}</th>
              <th scope="col">{t('evidence.col.year')}</th>
              <th scope="col">{t('evidence.col.depth')}</th>
              <th scope="col">{t('evidence.col.verify')}</th>
              <th scope="col">{t('evidence.col.links')}</th>
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
              const doi = doiOf(s);
              const oa = oaUrlOf(s);
              const authors = authorLine(s);
              return (
                <tr key={s.id} id={`src-${s.id}`} className="source-row">
                  <th scope="row">
                    <span className="source-title" title={s.id}>{s.title}</span>
                    {(authors !== undefined || s.venue !== undefined) && (
                      <span className="source-subtitle muted small">
                        {authors}
                        {authors !== undefined && s.venue !== undefined && ' · '}
                        {s.venue}
                      </span>
                    )}
                  </th>
                  <td className="mono">{s.publicationYear ?? '—'}</td>
                  <td>{t(contentDepthKey(s.contentDepth))}</td>
                  <td>
                    {verifyBadge}
                    {v?.titleMatch === false && <span className="muted small"> titleMatch=false</span>}
                    {/* Epistemic caveat stays inline (B2-critique): claims from
                        partially parsed sources read like abstract-only reads. */}
                    {s.parseStatus !== 'ok' && <span className="muted small"> · parse:{s.parseStatus}</span>}
                  </td>
                  <td className="source-links">
                    {doi !== undefined ? (
                      <a href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer" className="source-link mono">
                        DOI
                      </a>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                    {oa !== undefined && (
                      <a href={oa} target="_blank" rel="noreferrer" className="source-link">
                        OA
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Engineering verification data (B1 F-09): content hashes, parse states,
          access states and identifiers stay fully inspectable — as a collapsed
          disclosure, not primary table columns. */}
      <details className="tech-details">
        <summary>{t('evidence.techTitle')}</summary>
        <ul className="tech-list mono small">
          {sources.map((s) => (
            <li key={s.id} id={`src-tech-${s.id}`}>
              {s.id} · hash {s.contentHash.slice(0, 12)} · parse {s.parseStatus} · {t(accessStateKey(s.accessState))}
              {s.license !== undefined && <> · {s.license}</>}
              {s.identifiers.length > 0 && <> · {s.identifiers.map((i) => `${i.kind}:${i.value}`).join(' | ')}</>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ClaimsList({ claims, relations, runId, onFeedback, onOpenHypotheses }: {
  claims: ScientificClaim[];
  /** Claim→hypothesis bindings (R3): the reading question "which hypotheses
   *  does this claim move" is answered inline, not via the graph detour. */
  relations: EvidenceRelation[];
  runId: string;
  onFeedback: (target?: { kind: string; id: string; label?: string; content?: string }) => void;
  onOpenHypotheses?: (hypId?: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const gradeTitle = (level: NonNullable<ScientificClaim['gradeCertainty']>, downgraded: string[]): string => {
    const reasons = downgraded.length > 0 ? downgraded.join('；') : t('grade.noDowngrades');
    return `${t('grade.titlePrefix')}（${level}）— ${reasons}`;
  };
  if (claims.length === 0) return <EmptyState titleKey="evidence.noClaims" />;

  // Hypothesis bindings per claim, from the same relation set the overview
  // strip and the hypotheses table count from — one source of truth.
  const hypBindings = new Map<string, { polarity: 'supporting' | 'counter' | 'neutral'; hypId: string }[]>();
  for (const r of relations) {
    if (r.claimId === undefined || r.targetHypothesisId === undefined) continue;
    const list = hypBindings.get(r.claimId) ?? [];
    list.push({ polarity: RELATION_POLARITY[r.relation], hypId: r.targetHypothesisId });
    hypBindings.set(r.claimId, list);
  }
  // Hypothesis statements for the binding chips (one request, already cached
  // per run by the resource layer when the researcher crossed the other tabs).
  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(runId, signal), [runId]);
  const hypRes = useResource(hypFetcher, [runId], 'settled-only');
  const hypStatement = new Map((hypRes.data?.hypotheses ?? []).map((h) => [h.id, h.statement] as const));

  // Reading order (R3): claims that participate in COUNTER relations lead —
  // the wavering points decide the study, then the most-connected claims.
  const order = claims.map((c, i) => {
    const binds = hypBindings.get(c.id) ?? [];
    return { claim: c, i, counters: binds.filter((b) => b.polarity === 'counter').length, binds: binds.length };
  });
  order.sort((a, b) => (b.counters - a.counters) || (b.binds - a.binds) || (a.i - b.i));

  const needle = filter.trim().toLowerCase();
  const visible = needle.length === 0
    ? order
    : order.filter(({ claim }) => claim.text.toLowerCase().includes(needle) || claim.id.toLowerCase().includes(needle));
  return (
    <div>
      <input
        type="text"
        className="in-tab-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('evidence.claimFilter')}
        aria-label={t('evidence.claimFilterLabel')}
      />
      {visible.length === 0 && <p className="muted small">{t('evidence.claimFilterEmpty')}</p>}
    <ul className="claims-list">
      {visible.map(({ claim, counters, binds }) => (
        <li
          key={claim.id}
          id={`claim-${claim.id}`}
          className={`claim-item${counters > 0 ? ' claim-item--counter' : ''}`}
          title={claim.id}
        >
          {/* B1 F-09: the claim's statement is the label; provenance metadata
              follows it — the machine id trails the meta line, never leads. */}
          <p className="claim-text">{claim.text}</p>
          <div className="claim-head">
            {/* Evidence-line signature (§8.3): the epistemic glyph is the claim's cognitive
                state — the only saturated color in the chrome. Same mapping as the badge. */}
            <span
              className={`ev-glyph ev-glyph--${claim.bindingStatus === 'verified' ? 'verified' : claim.bindingStatus === 'resolved_unaligned' ? 'caution' : claim.bindingStatus === 'unresolved' ? 'refuted' : 'unknown'}`}
              aria-hidden="true"
            >
              {claim.bindingStatus === 'verified' ? '✓' : claim.bindingStatus === 'resolved_unaligned' ? '▲' : claim.bindingStatus === 'unresolved' ? '✗' : '–'}
            </span>
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
            {counters > 0 && (
              <Badge tone="err" title={t('evidence.counterInvolvedHint', { n: counters })}>
                {t('evidence.counterInvolved')}
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
            <IdText value={claim.id} />
            <span className="claim-actions">
              <button
                type="button"
                className="link-button"
                onClick={() => onFeedback({ kind: 'claim', id: claim.id, label: claim.text })}
                title={t('compare.challengeClaimHint')}
              >
                {t('compare.challengeClaim')}
              </button>
              <ResearchActions
                runId={runId}
                targetType="claim"
                targetId={claim.id}
                targetLabel={claim.text.length > 60 ? `${claim.text.slice(0, 60)}…` : claim.text}
                onOpenClaim={(cid) => {
                  const el = document.getElementById(`claim-${cid}`);
                  if (el !== null) {
                    el.scrollIntoView({ block: 'center' });
                    el.classList.add('claim-flash');
                    window.setTimeout(() => el.classList.remove('claim-flash'), 1600);
                  }
                }}
                onToFeedback={(content) => onFeedback({ kind: 'claim', id: claim.id, label: claim.text, content })}
              />
            </span>
          </div>
          {/* R3: hypothesis bindings inline — supports/weakens chips that carry
              the claim's effect on the hypothesis set to the reading path. */}
          {binds > 0 && (
            <p className="claim-hyp-binds">
              <span className="muted small">{t('evidence.bindsHypotheses')}：</span>
              {(hypBindings.get(claim.id) ?? []).map((b, i) => (
                <button
                  key={`${b.hypId}-${i}`}
                  type="button"
                  className={`claim-bind-chip claim-bind-chip--${b.polarity}`}
                  title={hypStatement.get(b.hypId) ?? b.hypId}
                  onClick={() => onOpenHypotheses?.(b.hypId)}
                >
                  <span className="ev-glyph" aria-hidden="true">{b.polarity === 'supporting' ? '✓' : b.polarity === 'counter' ? '✗' : '–'}</span>
                  {t(b.polarity === 'supporting' ? 'evidence.bindSupports' : b.polarity === 'counter' ? 'evidence.bindCounters' : 'evidence.bindNeutral')}
                  {(() => { const s = hypStatement.get(b.hypId); return s !== undefined ? `：${s.length > 56 ? `${s.slice(0, 56)}…` : s}` : ''; })()}
                </button>
              ))}
            </p>
          )}
          {claim.locators.slice(0, 3).map((loc, i) => (
            <blockquote key={i} className="claim-quote">
              <p>{loc.quote}</p>
              <cite>
                <button type="button" className="source-link link-button" title={loc.sourceDocumentId} onClick={() => revealElement(`src-${loc.sourceDocumentId}`)}>
                  {t('evidence.jumpToSource', { n: i + 1 })}
                </button>
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
    </div>
  );
}

function RelationsSummary({
  relations,
  claims,
  sources,
  onOpenHypotheses,
}: {
  relations: EvidenceRelation[];
  claims: ScientificClaim[];
  sources: SourceDocument[];
  onOpenHypotheses?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  if (relations.length === 0) {
    return <EmptyState titleKey="evidence.noRelations" />;
  }

  const byType = new Map<EvidenceRelationType, number>();
  for (const r of relations) byType.set(r.relation, (byType.get(r.relation) ?? 0) + 1);
  const claimById = new Map(claims.map((c) => [c.id, c] as const));
  const sourceById = new Map(sources.map((s) => [s.id, s] as const));
  const counter = relations.filter(isCounterRelation);

  const polarityTone = (p: string): 'ok' | 'err' | 'muted' => (p === 'supporting' ? 'ok' : p === 'counter' ? 'err' : 'muted');

  return (
    <div className="relations">
      <p className="muted">{t('relation.total', { n: relations.length })}</p>
      <ul className="relation-counts">
        {[...byType.entries()].map(([type, n]) => (
          <li key={type} className={`relation-chip relation-chip--${RELATION_POLARITY[type]}`}>
            <span className={`ev-glyph ev-glyph--${RELATION_POLARITY[type] === 'supporting' ? 'verified' : RELATION_POLARITY[type] === 'counter' ? 'refuted' : 'unknown'}`} aria-hidden="true">
              {RELATION_POLARITY[type] === 'supporting' ? '✓' : RELATION_POLARITY[type] === 'counter' ? '✗' : '–'}
            </span>
            <Badge tone={polarityTone(RELATION_POLARITY[type])}>{t(relationKey(type))}</Badge>
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
                {/* Lane-01 debt #8: disclose WHAT the counter evidence targets — a
                 * weakening without its target reads as an orphaned verdict. */}
                {(r.targetClaimId !== undefined || r.targetHypothesisId !== undefined) && (
                  <p className="muted small">
                    {t('evidence.counterTarget')}:{' '}
                    {r.targetClaimId !== undefined
                      ? (claimById.get(r.targetClaimId)?.text.slice(0, 80)
                        ?? t('evidence.claimMissing', { id: r.targetClaimId }))
                      : (
                        <button type="button" className="link-button" onClick={() => onOpenHypotheses?.()}>
                          {t('evidence.hypothesisTarget', { id: r.targetHypothesisId ?? '' })}
                        </button>
                      )}
                  </p>
                )}
                <p className="muted small">
                  {t('evidence.rationale')}: {r.rationale}
                  {source !== undefined && <span> · <button type="button" className="source-link link-button" onClick={() => revealElement(`src-${source.id}`)}>{source.title.length > 48 ? `${source.title.slice(0, 48)}…` : source.title}</button></span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Polarity mapping lives in one place: api/types.RELATION_POLARITY (the same
 *  table the hypotheses balance bars count from — the two surfaces cannot
 *  disagree). */

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
