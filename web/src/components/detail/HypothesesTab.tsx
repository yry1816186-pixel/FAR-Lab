import { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import { ApiError, isNotFound, withTimeout } from '../../api/client';
import { connectClaim, editHypothesis, forkHypothesis, getEvidence, getHypotheses, promoteHypothesis, rejectHypothesis } from '../../api/endpoints';
import type { AchAnalysis, EvidenceBody, EvidenceRelation, HypothesisCandidate, HypothesisScorecard, HypothesisTournament, ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { EmptyState, ErrorBox, Section, Skeleton } from '../common';
import { buildHypothesisBalances } from '../../viz/compare-viz';
import { HypothesisCard } from './HypothesisCard';
import type { HypothesisCardOps } from './HypothesisCard';
import { HypothesesTable } from './HypothesesTable';
import { ScorecardsTable } from './ScorecardsTable';
import { CompareView } from './CompareView';
import { ResearchActions } from './ResearchActions';
import { DimensionHeatmap } from './viz/DimensionHeatmap';
import { AchNetTable } from './viz/AchNetTable';
import { TournamentCrosstab } from './viz/TournamentCrosstab';
import { buildClaimLabels } from './InlineIdRefs';
import type { FeedbackTarget } from './FeedbackForm';
import { stageKey } from '../../i18n/keys';

const COMPARE_LIMIT = 3;

export function HypothesesTab({
  run,
  onFeedback,
  onOpenClaim,
}: {
  run: ResearchRun;
  onFeedback: (target?: FeedbackTarget) => void;
  /** Cross-tab navigation (S3): jump to a claim's anchor in the evidence tab. */
  onOpenClaim?: (claimId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const fetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const res = useResource(fetcher, [run.id], `${run.updatedAt}:${run.status}`);
  // Claims feed the ACH evidence analysis in compare view AND the B5 connect
  // picker (fetched only when either is active — no extra request for the
  // plain browsing path).
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const evidenceFetcher = useCallback((signal: AbortSignal) => getEvidence(run.id, signal), [run.id]);
  // B5 ops state: which card's connect picker is open, in-flight op key, last error.
  const [connectOpenFor, setConnectOpenFor] = useState<string | null>(null);
  const [editOpenFor, setEditOpenFor] = useState<string | null>(null);
  const [opBusy, setOpBusy] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  // HX4: the evidence graph feeds every card's balance bar (supporting vs
  // counter relations) — one request the tab already needs for compare/connect.
  const evidenceRes = useResource(evidenceFetcher, [run.id], `${run.updatedAt}`);

  /**
   * B5 op runner: POST, then refetch the tab's resource on success (new status
   * badge / forked card / linked claim counts). Failures surface inline below —
   * buttons disable while posting, so a missing endpoint degrades cleanly and
   * never shows fake success.
   */
  const runHypOp = (
    hypId: string,
    op: 'promote' | 'reject' | 'fork' | 'connect' | 'edit',
    act: (signal: AbortSignal) => Promise<unknown>,
  ): void => {
    setOpError(null);
    setOpBusy(`${hypId}:${op}`);
    const controller = new AbortController();
    act(withTimeout(controller.signal, 30_000))
      .then(() => {
        setOpBusy(null);
        if (op === 'connect') setConnectOpenFor(null);
        if (op === 'edit') setEditOpenFor(null);
        res.retry();
      })
      .catch((e: unknown) => {
        setOpBusy(null);
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setOpError(e instanceof ApiError ? e.message : String(e));
      });
  };

  const connectClaims = evidenceRes.data?.claims.map((c) => ({
    id: c.id,
    text: c.text.length > 70 ? `${c.text.slice(0, 70)}…` : c.text,
  }));
  const buildOps = (h: HypothesisCandidate): HypothesisCardOps => ({
    busy: opBusy !== null && opBusy.startsWith(`${h.id}:`),
    claims: connectClaims,
    connectOpen: connectOpenFor === h.id,
    onConnectToggle: () => setConnectOpenFor((prev) => (prev === h.id ? null : h.id)),
    onPromote: () => runHypOp(h.id, 'promote', (signal) => promoteHypothesis(run.id, h.id, signal)),
    onReject: () => runHypOp(h.id, 'reject', (signal) => rejectHypothesis(run.id, h.id, signal)),
    onFork: () => runHypOp(h.id, 'fork', (signal) => forkHypothesis(run.id, h.id, signal)),
    onConnect: (claimId, direction) => runHypOp(h.id, 'connect', (signal) => connectClaim(run.id, h.id, claimId, direction, signal)),
    editOpen: editOpenFor === h.id,
    onEditToggle: () => setEditOpenFor((prev) => (prev === h.id ? null : h.id)),
    // Only CHANGED fields ride the request — an untouched mechanism is not an edit;
    // a whitespace-only edit is blocked HERE, not by a server 400 after the fact.
    onEditSubmit: ({ statement, mechanism, note }) => {
      const fields = {
        ...(statement.trim() !== h.statement ? { statement: statement.trim() } : {}),
        ...(mechanism.trim() !== h.mechanism ? { mechanism: mechanism.trim() } : {}),
      };
      if (Object.keys(fields).length === 0) {
        setOpError(t('hyp.editNoChange'));
        return;
      }
      runHypOp(h.id, 'edit', (signal) => editHypothesis(run.id, h.id, { ...fields, note }, signal));
    },
  });

  const toggleCompare = (id: string): void => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= COMPARE_LIMIT
          ? prev
          : [...prev, id],
    );
  };
  // Run switch invalidates the compare selection (hypotheses belong to a run).
  useEffect(() => {
    setCompareIds([]);
    setConnectOpenFor(null);
    setEditOpenFor(null);
  }, [run.id]);

  const data = res.data;
  const byId = data !== null ? new Map(data.hypotheses.map((h) => [h.id, h] as const)) : null;
  // Compare columns are ordered by scorecard rank (stable, matches the medals),
  // never by click order (critique: unstable column order reads as chaos).
  const rankById = data !== null ? new Map(data.scorecards.map((s) => [s.hypothesisId, s.rank] as const)) : null;
  const compareHyps =
    byId !== null && rankById !== null && compareIds.length > 0
      ? compareIds
          .map((id) => byId.get(id))
          .filter((h): h is HypothesisCandidate => h !== undefined)
          .sort((a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99))
      : [];
  // VIZ V1: balance row inputs for the compare view (counts + evidence bodies).
  const compareBalances =
    data !== null ? buildHypothesisBalances(data.evidenceBodies, evidenceRes.data?.relations) : undefined;

  return (
    <>
      {res.loading ? (
        <Skeleton lines={6} />
      ) : res.error !== null && isNotFound(res.error) ? (
        <EmptyState titleKey="hyp.empty" hint={t('hyp.emptyHint', { stage: t(stageKey(run.currentStage)) })} />
      ) : res.error !== null ? (
        <ErrorBox error={res.error} onRetry={res.retry} />
      ) : data === null ? null : (
        <>
          {opError !== null && (
            <p className="field-error small" role="alert">
              {t('hyp.opFailed')}：{opError}
            </p>
          )}
          {compareHyps.length >= 2 && (
            <Section
              title={t('compare.title')}
              actions={
                <button type="button" className="btn btn--small" onClick={() => setCompareIds([])}>
                  <X size={12} aria-hidden="true" /> {t('compare.clear')}
                </button>
              }
            >
              <CompareView
                hypotheses={compareHyps}
                scorecards={data.scorecards}
                claims={evidenceRes.data?.claims}
                balances={compareBalances}
                onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
                onChallenge={(id, label) => onFeedback({ kind: 'hypothesis', id, label })}
                onOpenClaim={onOpenClaim}
              />
            </Section>
          )}

          {/* M1: the comparison table is the scan surface — one screen answers
              "which hypothesis stands where" before any card is read. Cards
              below remain the deep-reading surface; counts share one
              computation (buildHypothesisBalances) with the cards. */}
          <Section title={t('hypTable.title')} count={<span className="muted small">{t('hypTable.hint')}</span>}>
            <HypothesesTable
              hypotheses={data.hypotheses}
              scorecards={data.scorecards}
              tournament={data.tournament}
              balances={buildHypothesisBalances(data.evidenceBodies, evidenceRes.data?.relations)}
              compareIds={compareIds}
              onToggleCompare={toggleCompare}
            />
          </Section>

          {/* HX4: hypotheses ARE the page — the card flow leads, one count line
              reconciles 生成 vs 排名 (cluster representatives), and every ranking
              artifact (scorecards/tournament/ACH) folds into a methods disclosure. */}
          <Section
            title={t('tab.hypotheses')}
            count={
              <span className="muted small">
                {t('hyp.counts', {
                  total: data.hypotheses.length,
                  reps: representativesOf(data).length,
                  extras: data.hypotheses.length - representativesOf(data).length,
                })}
              </span>
            }
            actions={
              compareIds.length > 0 ? (
                <span className="compare-bar-inline muted small" aria-live="polite">
                  <GitCompareArrows size={12} aria-hidden="true" /> {t('compare.selectedCount', { n: compareIds.length, max: COMPARE_LIMIT })}
                </span>
              ) : undefined
            }
          >
            <HypothesisList
              data={data}
              runId={run.id}
              relations={evidenceRes.data?.relations}
              compareIds={compareIds}
              compareLimit={COMPARE_LIMIT}
              onToggleCompare={toggleCompare}
              onChallenge={(id, label) => onFeedback({ kind: 'hypothesis', id, label })}
              onOpenClaim={onOpenClaim}
              onToFeedback={onFeedback}
              opsFor={buildOps}
            />
          </Section>

          <details className="hyp-methods">
            <summary>{t('hyp.methodsTitle')}</summary>
            <div className="hyp-methods-body">
              <p className="muted small">{t('hyp.methodsIntro')}</p>
              <Section title={t('viz.heatTitle')}>
                <DimensionHeatmap hypotheses={data.hypotheses} scorecards={data.scorecards} />
              </Section>
              <Section title={t('scorecards.title')}>
                <ScorecardsTable scorecards={data.scorecards} hypotheses={data.hypotheses} />
              </Section>
              {data.tournament !== null && (
                <Section title={t('tournament.title')}>
                  <TournamentView tournament={data.tournament} hypotheses={data.hypotheses} />
                </Section>
              )}
              {data.achAnalysis != null && data.achAnalysis.diagnosticity.length > 0 && (
                <Section title={t('ach.title')}>
                  <p className="muted small">{t('ach.intro')}</p>
                  <AchNetTable
                    ach={data.achAnalysis}
                    scorecards={data.scorecards}
                    claimLabels={
                      evidenceRes.data !== null
                        ? buildClaimLabels(evidenceRes.data.claims.map((c) => c.id), t('idref.claim'))
                        : new Map<string, string>()
                    }
                  />
                  <p className="muted small">
                    {data.achAnalysis.removalSensitivity.stable
                      ? t('ach.removalStable', { k: data.achAnalysis.removalSensitivity.removedTopK })
                      : t('ach.removalUnstable', {
                          k: data.achAnalysis.removalSensitivity.removedTopK,
                          n: data.achAnalysis.removalSensitivity.inversions,
                        })}
                  </p>
                </Section>
              )}
            </div>
          </details>
        </>
      )}
    </>
  );
}

interface HypoData {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
  tournament?: HypothesisTournament | null;
  /** Wave-S g8/g9 (optional: older runs render without them, never fake values). */
  evidenceBodies?: EvidenceBody[];
  achAnalysis?: AchAnalysis | null;
}

function TournamentView({ tournament, hypotheses }: { tournament: HypothesisTournament; hypotheses: HypothesisCandidate[] }): JSX.Element {
  const { t } = useI18n();
  const statementOf = (id: string): string => {
    const h = hypotheses.find((x) => x.id === id);
    if (!h) return id;
    return h.statement.length > 90 ? `${h.statement.slice(0, 90)}…` : h.statement;
  };
  if (tournament.standings.length === 0) {
    return <p className="muted small">{t('tournament.empty')}</p>;
  }
  return (
    <div>
      <table className="data-table">
        <caption className="sr-only">{t('tournament.title')}</caption>
        <thead>
          <tr>
            <th>{t('tournament.rank')}</th>
            <th>{t('hyp.statement')}</th>
            <th>{t('tournament.record')}</th>
            <th>{t('tournament.winRate')}</th>
            <th>{t('tournament.bt')}</th>
          </tr>
        </thead>
        <tbody>
          {tournament.standings.map((s) => (
            <tr key={s.hypothesisId}>
              <td className="mono">{s.rank}</td>
              <td>
                <a className="hyp-anchor-link" href={`#hyp-${s.hypothesisId}`} title={statementOf(s.hypothesisId)}>
                  {statementOf(s.hypothesisId)}
                </a>
              </td>
              <td className="mono">{s.wins}-{s.losses}-{s.ties}</td>
              <td>
                <span className="rank-cell">
                  <span className="rank-bar" aria-hidden="true">
                    {/* proportional ink (Wilke §17): width is the true win-rate ratio on a zero base */}
                    <span className="rank-fill" style={{ width: `${Math.round(s.winRate * 100)}%` }} />
                  </span>
                  <span className="mono">{(s.winRate * 100).toFixed(0)}%</span>
                </span>
              </td>
              <td className="mono">{s.btScore.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TournamentCrosstab tournament={tournament} hypotheses={hypotheses} />
      <details className="hyp-details">
        <summary>{t('tournament.matches', { n: tournament.matches.length })}</summary>
        <ul>
          {tournament.matches.map((m, i) => (
            <li key={i}>
              <span className="mono">[{m.outcome === 'no_contest' ? t('tournament.noContest') : m.outcome}]</span>{' '}
              {statementOf(m.aId)} <strong>vs</strong> {statementOf(m.bId)}
              <span className="muted small">
                {' '}
                — {t('tournament.verdicts')}: {m.aFirstVerdict}/{m.bFirstVerdict}
              </span>
              <div className="muted small">{m.rationale}</div>
            </li>
          ))}
        </ul>
      </details>
      {/* Backend uncertainty text is English prose — the localized reading aid
          leads, the verbatim original follows (audit fidelity). */}
      <p className="muted small">{t('tournament.uncertaintyNote')}</p>
      <p className="muted small">{tournament.uncertainty}</p>
    </div>
  );
}

function representativesOf(data: HypoData): HypothesisCandidate[] {
  const byId = new Map(data.hypotheses.map((h) => [h.id, h] as const));
  const reps = data.scorecards
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((s) => byId.get(s.hypothesisId))
    .filter((h): h is HypothesisCandidate => h !== undefined);
  if (reps.length > 0) return reps;
  return data.hypotheses; // no scorecards yet: all candidates, honestly labeled as unranked
}

function HypothesisList({
  data,
  runId,
  relations,
  compareIds,
  compareLimit,
  onToggleCompare,
  onChallenge,
  onOpenClaim,
  onToFeedback,
  opsFor,
}: {
  data: HypoData;
  runId: string;
  /** HX4: the run's evidence relations — per-hypothesis supporting/counter counts. */
  relations?: EvidenceRelation[];
  compareIds: string[];
  compareLimit: number;
  onToggleCompare: (id: string) => void;
  onChallenge: (id: string, label: string) => void;
  onOpenClaim?: (claimId: string) => void;
  onToFeedback: (target: { kind: string; id: string; label?: string; content?: string }) => void;
  /** B5: builds the lifecycle-ops prop for each card (POST+refetch live in the tab). */
  opsFor: (h: HypothesisCandidate) => HypothesisCardOps;
}): JSX.Element {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const { hypotheses } = data;
  if (hypotheses.length === 0) {
    return <EmptyState titleKey="hyp.empty" />;
  }
  // In-tab filter (CPP-6): match statement/mechanism text — the researcher's
  // mental query, not machine ids.
  const needle = filter.trim().toLowerCase();
  const matches = needle.length === 0
    ? () => true
    : (h: HypothesisCandidate): boolean =>
        h.statement.toLowerCase().includes(needle) ||
        h.mechanism.toLowerCase().includes(needle) ||
        h.id.toLowerCase().includes(needle);
  const repsAll = representativesOf(data);
  const reps = repsAll.filter(matches);
  const repIds = new Set(repsAll.map((h) => h.id));
  const extras = hypotheses.filter((h) => !repIds.has(h.id));
  const clusterCounts = new Map<string, number>();
  for (const h of hypotheses) {
    const key = h.clusterKey ?? h.id;
    clusterCounts.set(key, (clusterCounts.get(key) ?? 0) + 1);
  }
  const rankOf = new Map(data.scorecards.map((s) => [s.hypothesisId, s.rank] as const));
  // HX4 balance counts feed every card's bar; the shared builder keeps the
  // compare view's balance row and the cards on one identical computation.
  const balancesById = buildHypothesisBalances(data.evidenceBodies, relations);

  return (
    <div>
      <input
        type="text"
        className="in-tab-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('hyp.filterPlaceholder')}
        aria-label={t('hyp.filterLabel')}
      />
      {reps.length === 0 && <p className="muted small">{t('hyp.filterEmpty')}</p>}
      {reps.map((h) => (
        <HypothesisCard
          key={h.id}
          hypothesis={h}
          clusterSize={clusterCounts.get(h.clusterKey ?? h.id) ?? 1}
          isRepresentative
          rank={rankOf.get(h.id)}
          featured={rankOf.get(h.id) === 1}
          onChallenge={(id, label) => onChallenge(id, label)}
          aiActions={
            <ResearchActions
              runId={runId}
              targetType="hypothesis"
              targetId={h.id}
              targetLabel={h.statement.length > 60 ? `${h.statement.slice(0, 60)}…` : h.statement}
              onOpenClaim={(claimId) => onOpenClaim?.(claimId)}
              onToFeedback={(content) => onToFeedback({ kind: 'hypothesis', id: h.id, label: h.statement, content })}
            />
          }
          compare={{
            selected: compareIds.includes(h.id),
            onToggle: () => onToggleCompare(h.id),
            disabled: compareIds.length >= compareLimit,
          }}
          ops={opsFor(h)}
          evidenceBody={balancesById.get(h.id)?.body}
          balance={balancesById.get(h.id)}
        />
      ))}
      {extras.length > 0 && (
        <p className="muted small">{t('hyp.others', { n: extras.length })}</p>
      )}
    </div>
  );
}
