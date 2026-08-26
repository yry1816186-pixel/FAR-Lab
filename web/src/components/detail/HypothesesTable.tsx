import { GitCompareArrows } from 'lucide-react';
import { useI18n } from '../../i18n/LanguageContext';
import type { HypothesisCandidate, HypothesisScorecard, HypothesisTournament } from '../../api/types';

/**
 * Hypothesis comparison table (M1 reconstruction): the researcher's scan
 * surface for the core judgment task — rank, statement, evidence standing and
 * comparability in one screen, regardless of how many hypotheses exist. Rows
 * jump to the full card; card depth stays for reading, the table is for
 * comparing. Counts come from the same relation-based balance computation the
 * cards use (passed in by the tab) — the two surfaces cannot disagree.
 */
export function HypothesesTable({
  hypotheses,
  scorecards,
  tournament,
  balances,
  compareIds,
  onToggleCompare,
}: {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
  tournament?: HypothesisTournament | null;
  /** hypothesisId -> { supports, counters } (buildHypothesisBalances output). */
  balances: Map<string, { supports: number; counters: number }>;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const byId = new Map(hypotheses.map((h) => [h.id, h] as const));
  const rankById = new Map(scorecards.map((s) => [s.hypothesisId, s.rank] as const));
  const standingById = new Map((tournament?.standings ?? []).map((s) => [s.hypothesisId, s] as const));
  // Ranked representatives first (rank order); unranked candidates follow in
  // creation order — honestly unlabeled, never silently mixed.
  const ranked = scorecards
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((s) => byId.get(s.hypothesisId))
    .filter((h): h is HypothesisCandidate => h !== undefined);
  const rankedIds = new Set(ranked.map((h) => h.id));
  const unranked = hypotheses.filter((h) => !rankedIds.has(h.id));
  const rows = [...ranked, ...unranked];
  const hasTournament = (tournament?.standings.length ?? 0) > 0;

  const jump = (id: string): void => {
    const el = document.getElementById(`hyp-${id}`);
    if (el !== null) el.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="hyp-table-wrap">
      <table className="data-table hyp-table">
        <caption className="sr-only">{t('hypTable.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('hypTable.colRank')}</th>
            <th scope="col">{t('hypTable.colHypothesis')}</th>
            <th scope="col" aria-label={t('summary.evidenceBalance')}>
              <span className="ev-glyph ev-glyph--verified" aria-hidden="true">✓</span>
            </th>
            <th scope="col" aria-label={t('summary.evidenceBalance')}>
              <span className="ev-glyph ev-glyph--refuted" aria-hidden="true">✗</span>
            </th>
            {hasTournament && <th scope="col">{t('tournament.winRate')}</th>}
            <th scope="col">
              <span className="hyp-compare-colhead" title={t('compare.selectedCount', { n: compareIds.length, max: 3 })}>
                <GitCompareArrows size={12} aria-hidden="true" /> {t('hypTable.colCompare')}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const rank = rankById.get(h.id);
            const bal = balances.get(h.id) ?? { supports: 0, counters: 0 };
            const standing = standingById.get(h.id);
            const inCompare = compareIds.includes(h.id);
            const status = h.status ?? 'active';
            return (
              <tr
                key={h.id}
                className={`hyp-row${inCompare ? ' hyp-row--compare' : ''}${status !== 'active' ? ` hyp-row--${status}` : ''}`}
                onClick={() => jump(h.id)}
              >
                <td className="mono">
                  {rank !== undefined
                    ? <span className={`rank-medal${rank === 1 ? ' rank-medal--first' : ''}`} title={t('hyp.rankOf', { rank })}>#{rank}</span>
                    : <span className="muted" title={t('hypTable.unranked')}>—</span>}
                </td>
                <td className="hyp-row-statement" title={h.statement}>
                  {h.statement.length > 130 ? `${h.statement.slice(0, 130)}…` : h.statement}
                  {status !== 'active' && (
                    <span className={`badge ${status === 'promoted' ? 'badge--ok' : 'badge--err'}`}>
                      {t(status === 'promoted' ? 'hyp.statusPromoted' : 'hyp.statusRejected')}
                    </span>
                  )}
                </td>
                <td className={`mono${bal.supports > 0 ? ' hyp-cell--support' : ' muted'}`}>{bal.supports}</td>
                <td className={`mono${bal.counters > 0 ? ' hyp-cell--counter' : ' muted'}`}>{bal.counters}</td>
                {hasTournament && (
                  <td className="mono">
                    {standing !== undefined
                      ? `${Math.round(standing.winRate * 100)}%`
                      : <span className="muted">—</span>}
                  </td>
                )}
                <td>
                  <button
                    type="button"
                    className={`hyp-compare-toggle${inCompare ? ' hyp-compare-toggle--on' : ''}`}
                    aria-pressed={inCompare}
                    aria-label={t(inCompare ? 'hypTable.compareRemove' : 'hypTable.compareAdd', { rank: rank ?? '?' })}
                    onClick={(e) => { e.stopPropagation(); onToggleCompare(h.id); }}
                  >
                    {inCompare ? '✓' : '+'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
