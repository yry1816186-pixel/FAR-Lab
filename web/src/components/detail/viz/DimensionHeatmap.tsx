import { useI18n } from '../../../i18n/LanguageContext';
import type { HypothesisCandidate, HypothesisScorecard } from '../../../api/types';
import { buildDimensionMatrix } from '../../../viz/compare-viz';

/**
 * Hypotheses × score-dimensions heatmap (VIZ V1). A colored HTML table, not a
 * canvas: at workbench N (≤ a dozen hypotheses) the numbers-in-cells table IS
 * the most readable encoding and its own accessible fallback. Ink intensity is
 * proportional ink for the quantitative value (neutral hue — score identity,
 * not success/failure semantics); unscored dims stay honestly empty.
 */
export function DimensionHeatmap({
  hypotheses,
  scorecards,
}: {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
}): JSX.Element | null {
  const { t } = useI18n();
  const { dims, rows } = buildDimensionMatrix(hypotheses, scorecards);
  if (rows.length === 0 || dims.length === 0) return null;

  return (
    <div className="table-scroll">
      <table className="data-table table--compact viz-heatmap">
        <caption className="sr-only">{t('viz.heatCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('hyp.statement')}</th>
            {dims.map((d) => (
              <th key={d} scope="col" className="mono small" title={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hypId}>
              <th scope="row" className="small">
                <span className={`rank-medal${row.rank === 1 ? ' rank-medal--first' : ''}`} title={t('hyp.rankOf', { rank: row.rank })}>
                  №{row.rank}
                </span>{' '}
                <span title={row.statement}>{row.statement.length > 60 ? `${row.statement.slice(0, 60)}…` : row.statement}</span>
              </th>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className="mono small"
                  style={v !== null ? { background: `color-mix(in oklab, var(--v2-info) ${Math.round((0.06+0.34*v)*100)}%, transparent)` } : undefined}
                >
                  {v !== null ? v.toFixed(2) : <span className="muted">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
