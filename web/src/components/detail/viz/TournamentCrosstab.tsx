import { useI18n } from '../../../i18n/LanguageContext';
import type { HypothesisCandidate, HypothesisTournament } from '../../../api/types';
import { buildCrosstab, crosstabCellText, crosstabCellTone } from '../../../viz/compare-viz';

/**
 * Round-robin match crosstable (VIZ V1) — chess-style, because a round-robin
 * tournament has no honest bracket tree. Every cell is the ROW hypothesis's
 * record against that column opponent (aggregate when they met twice); the
 * per-match rationale drill-down stays in the existing matches list below.
 */
export function TournamentCrosstab({
  tournament,
  hypotheses,
}: {
  tournament: HypothesisTournament;
  hypotheses: HypothesisCandidate[];
}): JSX.Element | null {
  const { t } = useI18n();
  if (tournament.standings.length < 2) return null;
  const crosstab = buildCrosstab(tournament.standings, tournament.matches);
  const byId = new Map(hypotheses.map((h) => [h.id, h] as const));
  const rankById = new Map(tournament.standings.map((s) => [s.hypothesisId, s.rank] as const));
  const statementOf = (id: string): string => {
    const h = byId.get(id);
    if (h === undefined) return id;
    return h.statement.length > 50 ? `${h.statement.slice(0, 50)}…` : h.statement;
  };

  return (
    <div>
      <div className="table-scroll">
        <table className="data-table table--compact">
          <caption className="sr-only">{t('viz.crosstabTitle')}</caption>
          <thead>
            <tr>
              <th scope="col" className="small">{t('hyp.statement')}</th>
              {crosstab.ids.map((id) => (
                <th key={id} scope="col" className="mono small" title={statementOf(id)}>
                  №{rankById.get(id) ?? '—'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crosstab.ids.map((rowId) => (
              <tr key={rowId}>
                <th scope="row" className="small">
                  <span className={`rank-medal${rankById.get(rowId) === 1 ? ' rank-medal--first' : ''}`}>№{rankById.get(rowId) ?? '—'}</span>{' '}
                  <span title={byId.get(rowId)?.statement ?? rowId}>{statementOf(rowId)}</span>
                </th>
                {crosstab.ids.map((colId) => {
                  if (colId === rowId) {
                    return <td key={colId} className="mono small muted" aria-label={t('viz.crosstabSelf')}>—</td>;
                  }
                  const cell = crosstab.cells.get(`${rowId}\u0000${colId}`);
                  const tone = crosstabCellTone(cell);
                  return (
                    <td key={colId} className="mono small">
                      {cell === undefined ? (
                        <span className="muted">·</span>
                      ) : (
                        <span
                          className={
                            tone === 'ok' ? 'compare-count compare-count--support'
                              : tone === 'err' ? 'compare-count compare-count--counter'
                                : 'compare-count compare-count--unknown'
                          }
                        >
                          {crosstabCellText(cell)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{t('viz.crosstabNote')}</p>
    </div>
  );
}
