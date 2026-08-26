import { useCallback } from 'react';
import { ArrowRight, MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { isNotFound } from '../../api/client';
import { getEvidence, getHypotheses } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { EmptyState, ErrorBox, Skeleton } from '../common';
import { buildHypothesisBalances } from '../../viz/compare-viz';
import type { TabId } from '../RunDetail';
import type { FeedbackTarget } from './FeedbackForm';

/**
 * Research brief (M1 reconstruction): the settled study answers first — the
 * leading hypothesis with its standing, the top-3 ranked comparison at a
 * glance, the main declared uncertainty, and the researcher's next actions.
 * Process/telemetry never precedes this block; every number comes from the
 * run's real objects (balances use the same relation-based computation as the
 * hypotheses tab, so the two surfaces can never disagree).
 */
export function ResearchBrief({
  run,
  onNavigate,
  onFeedback,
}: {
  run: ResearchRun;
  onNavigate: (tab: TabId) => void;
  onFeedback: (target?: FeedbackTarget) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const settled = run.status === 'completed' || run.status === 'partial';
  const refreshKey = `${run.updatedAt}:${run.status}`;

  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const hypRes = useResource(hypFetcher, [run.id], settled ? refreshKey : 'off');

  const evidenceFetcher = useCallback((signal: AbortSignal) => getEvidence(run.id, signal), [run.id]);
  const evidenceRes = useResource(evidenceFetcher, [run.id], settled ? refreshKey : 'off');

  if (!settled) return null;

  const loading = hypRes.loading || evidenceRes.loading;
  if (loading && hypRes.data === null && evidenceRes.data === null) {
    return (
      <section className="section research-summary" aria-busy="true">
        <Skeleton lines={4} />
      </section>
    );
  }
  // The rank stage may not have produced objects yet (partial runs): a missing
  // hypotheses bundle is an honest empty state, never a fabricated summary.
  if (hypRes.error !== null && isNotFound(hypRes.error)) {
    return (
      <section className="section research-summary">
        <EmptyState titleKey="summary.notRanked" hintKey="summary.notRankedHint" />
      </section>
    );
  }
  if (hypRes.error !== null) {
    return (
      <section className="section research-summary">
        <ErrorBox error={hypRes.error} onRetry={hypRes.retry} />
      </section>
    );
  }

  const data = hypRes.data;
  if (data === null) return null;
  const rankById = new Map(data.scorecards.map((s) => [s.hypothesisId, s.rank] as const));
  const active = data.hypotheses.filter((h) => h.status === undefined || h.status === 'active');
  const ranked = [...active].sort((a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99));
  const top = ranked[0];
  const topStanding = top !== undefined
    ? data.tournament?.standings.find((s) => s.hypothesisId === top.id)
    : undefined;
  // Why #1 is #1 (revalidation P2): the scorecard's own rationale, not a
  // re-derivation — the ranking story lives with the ranking artifact.
  const topScorecard = top !== undefined ? data.scorecards.find((s) => s.hypothesisId === top.id) : undefined;
  const whyTop = topScorecard?.comparisonNote?.trim() || topScorecard?.overallRationale?.trim() || undefined;
  const evidence = evidenceRes.data;
  // Same relation-based counts as the hypotheses tab cards — one computation,
  // two surfaces, zero divergence.
  const balances = buildHypothesisBalances(data.evidenceBodies, evidence?.relations);
  const balanceOf = (id: string): { supports: number; counters: number } =>
    balances.get(id) ?? { supports: 0, counters: 0 };
  const topBalance = top !== undefined ? balanceOf(top.id) : undefined;
  const mainUncertainty = top?.uncertainties !== undefined && top.uncertainties.length > 0
    ? top.uncertainties[0]!
    : undefined;

  return (
    <section className="section research-summary research-brief">
      <div className="section-head">
        <h3 className="section-title">{t('summary.title')}</h3>
        <div className="section-actions">
          <button type="button" className="link-button small" onClick={() => onNavigate('hypotheses')}>
            {t('summary.allHypotheses', { n: active.length })} <ArrowRight size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="section-body">
        {top !== undefined ? (
          <>
            <p className="summary-top-statement">{top.statement}</p>
            <div className="summary-meta">
              <span className="rank-medal rank-medal--first">{t('summary.rank', { rank: rankById.get(top.id) ?? '?' })}</span>
              {topStanding !== undefined && (
                <span className="mono small muted" title={t('summary.btHint')}>
                  BT {topStanding.btScore.toFixed(2)} · {t('summary.winRate', { rate: Math.round(topStanding.winRate * 100) })}
                </span>
              )}
              {topBalance !== undefined && (topBalance.supports > 0 || topBalance.counters > 0) && (
                <span className="summary-evidence-balance">
                  <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span>
                  <span className="mono">{topBalance.supports}</span>
                  <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span>
                  <span className="mono">{topBalance.counters}</span>
                  <span className="muted small">{t('summary.evidenceBalance')}</span>
                </span>
              )}
              {evidence !== null && (
                <span className="muted small">
                  · {t('summary.corpus', { c: evidence.claims.length, r: evidence.relations.length })}
                </span>
              )}
            </div>
            <p className="muted small summary-top-note">
              {top.mechanism.length > 0 && top.mechanism.length > 220 ? `${top.mechanism.slice(0, 220)}…` : top.mechanism}
            </p>
            {whyTop !== undefined && (
              <p className="summary-why-top" title={whyTop}>
                <strong>{t('summary.whyTopLabel')}：</strong>
                {whyTop.length > 200 ? `${whyTop.slice(0, 200)}…` : whyTop}
              </p>
            )}
            {mainUncertainty !== undefined && (
              <p className="summary-uncertainty" title={mainUncertainty}>
                <span className="ev-glyph ev-glyph--unknown" aria-hidden="true">?</span>{' '}
                <strong>{t('summary.uncertaintyLabel')}：</strong>
                {mainUncertainty.length > 160 ? `${mainUncertainty.slice(0, 160)}…` : mainUncertainty}
              </p>
            )}
            {ranked.length > 1 && (
              <div className="brief-top3" role="list" aria-label={t('summary.top3Label')}>
                {ranked.slice(0, 3).map((h) => {
                  const bal = balanceOf(h.id);
                  const rank = rankById.get(h.id);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      role="listitem"
                      className="brief-row"
                      onClick={() => onNavigate('hypotheses')}
                      title={h.statement}
                    >
                      <span className={`rank-medal${rank === 1 ? ' rank-medal--first' : ''}`} title={t('hyp.rankOf', { rank: rank ?? '?' })}>
                        #{rank ?? '?'}
                      </span>
                      <span className="brief-row-statement">
                        {h.statement.length > 110 ? `${h.statement.slice(0, 110)}…` : h.statement}
                      </span>
                      <span className="brief-row-balance mono small" aria-label={t('summary.evidenceBalance')}>
                        <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span>{bal.supports}
                        <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span>{bal.counters}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyState titleKey="summary.noHypotheses" hintKey="summary.noHypothesesHint" />
        )}
        {evidenceRes.error !== null && !isNotFound(evidenceRes.error) && (
          <p className="callout callout--warn small">{t('summary.evidenceUnavailable')}</p>
        )}
        <div className="brief-actions">
          <button type="button" className="btn btn--small" onClick={() => onNavigate('evidence')}>
            {t('summary.openEvidence')} <ArrowRight size={12} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn--small" onClick={() => onFeedback()}>
            <MessageSquarePlus size={12} aria-hidden="true" /> {t('summary.feedbackAction')}
          </button>
          <button type="button" className="btn btn--small" onClick={() => onNavigate('verify')}>
            <ShieldCheck size={12} aria-hidden="true" /> {t('summary.exportAction')}
          </button>
        </div>
      </div>
    </section>
  );
}
