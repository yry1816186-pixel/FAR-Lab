import { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { isNotFound } from '../../api/client';
import { getEvidence, getHypotheses } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { EmptyState, ErrorBox, Skeleton } from '../common';

/**
 * Research landing summary: for a settled study, the page answers "what came
 * of it" before anything else — the leading hypothesis in the statement voice,
 * its tournament standing with uncertainty, and the evidence corpus counts.
 * Every number is fetched from the run's real objects; while the study is
 * still running this component stays out of the way (the activity narrative
 * is the honest main character then).
 */
export function ResearchSummary({
  run,
  onOpenHypotheses,
  onOpenEvidence,
}: {
  run: ResearchRun;
  onOpenHypotheses: () => void;
  onOpenEvidence: () => void;
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
  const top = [...active].sort((a, b) => (rankById.get(a.id) ?? 99) - (rankById.get(b.id) ?? 99))[0];
  const topStanding = top !== undefined
    ? data.tournament?.standings.find((s) => s.hypothesisId === top.id)
    : undefined;
  const evidence = evidenceRes.data;
  const supportCount = top?.supportingClaimIds?.length ?? 0;
  const counterCount = top?.counterClaimIds?.length ?? 0;

  return (
    <section className="section research-summary">
      <div className="section-head">
        <h3 className="section-title">{t('summary.title')}</h3>
        <div className="section-actions">
          <button type="button" className="link-button small" onClick={onOpenHypotheses}>
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
              {(supportCount > 0 || counterCount > 0) && (
                <span className="summary-evidence-balance">
                  <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span>
                  <span className="mono">{supportCount}</span>
                  <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span>
                  <span className="mono">{counterCount}</span>
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
          </>
        ) : (
          <EmptyState titleKey="summary.noHypotheses" hintKey="summary.noHypothesesHint" />
        )}
        {evidenceRes.error !== null && !isNotFound(evidenceRes.error) && (
          <p className="callout callout--warn small">{t('summary.evidenceUnavailable')}</p>
        )}
        <button type="button" className="btn btn--small summary-evidence-link" onClick={onOpenEvidence}>
          {t('summary.openEvidence')} <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
