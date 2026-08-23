import { useI18n } from '../../../i18n/LanguageContext';
import type { AchAnalysis, HypothesisScorecard } from '../../../api/types';
import { buildAchNetMatrix } from '../../../viz/compare-viz';

/**
 * ACH diagnosticity net-contribution matrix (VIZ V1): top diagnostic claims ×
 * hypotheses. Positive net = the claim argues FOR that hypothesis (support-hue
 * ink), negative = against (counter-hue ink), '·' = no binding (never 0 — 0 is
 * a real computed tie and stays visible as a number). Diverging intensity is
 * anchored to the shown cells' max |net| so color never exaggerates.
 */
export function AchNetTable({
  ach,
  scorecards,
  claimLabels,
}: {
  ach: AchAnalysis;
  scorecards: HypothesisScorecard[];
  claimLabels: Map<string, string>;
}): JSX.Element | null {
  const { t } = useI18n();
  const ranked = scorecards.slice().sort((a, b) => a.rank - b.rank);
  const { rows, scale, hypIds } = buildAchNetMatrix(
    ach,
    ranked.map((s) => s.hypothesisId),
  );
  const rankById = new Map(ranked.map((s) => [s.hypothesisId, s.rank] as const));
  if (rows.length === 0 || hypIds.length === 0) return null;

  const ink = (v: number): string => {
    const a = scale > 0 ? 0.08 + 0.3 * (Math.abs(v) / scale) : 0.12;
    return v >= 0 ? `rgba(61, 139, 95, ${a})` : `rgba(179, 53, 44, ${a})`;
  };

  return (
    <div>
      <div className="table-scroll">
        <table className="data-table table--compact viz-heatmap">
          <caption className="sr-only">{t('viz.achNetTitle')}</caption>
          <thead>
            <tr>
              <th scope="col" className="small">{t('compare.achClaimCol')}</th>
              {hypIds.map((id) => (
                <th key={id} scope="col" className="mono small" title={t('hyp.rankOf', { rank: rankById.get(id) ?? 0 })}>
                  №{rankById.get(id) ?? '—'}
                </th>
              ))}
              <th scope="col" className="mono small">{t('ach.diagnosticityScoreCol')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.claimId}>
                <th scope="row" className="small" title={r.claimId}>
                  {claimLabels.get(r.claimId) ?? r.claimId}
                </th>
                {r.net.map((v, i) => (
                  <td key={i} className="mono small" style={v !== null ? { background: ink(v) } : undefined}>
                    {v !== null ? v.toFixed(2) : <span className="muted">·</span>}
                  </td>
                ))}
                <td className="mono small">{r.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{t('viz.achNetNote')}</p>
    </div>
  );
}
