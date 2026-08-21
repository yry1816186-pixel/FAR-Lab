import { Fragment, useState } from 'react';
import type { HypothesisScorecard } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, IdText } from '../common';

/**
 * Score comparison table with the FIXED disclaimer: scores are inspectable
 * decision aids produced by uncalibrated LLM judgments — never objective
 * probabilities. Producer + calibration travel with every dimension.
 * Rows expand to the full per-dimension rationale (keyboard accessible).
 */
export function ScorecardsTable({ scorecards }: { scorecards: HypothesisScorecard[] }): JSX.Element {
  const { t } = useI18n();
  const [openRank, setOpenRank] = useState<number | null>(null);
  const sorted = [...scorecards].sort((a, b) => a.rank - b.rank);

  if (sorted.length === 0) {
    return <p className="muted">{t('scorecards.empty')}</p>;
  }

  return (
    <div>
      <p className="callout callout--info" role="note">
        {t('scorecards.disclaimer')}
      </p>
      <div className="table-scroll">
        <table className="data-table scorecards">
          <caption className="sr-only">{t('scorecards.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('scorecards.col.rank')}</th>
              <th scope="col">{t('scorecards.col.hypothesis')}</th>
              <th scope="col">{t('scorecards.col.overall')}</th>
              <th scope="col">{t('scorecards.dimension')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((card) => {
              const open = openRank === card.rank;
              const valueCount = card.dimensions.filter((d) => d.value !== null).length;
              return (
                <Fragment key={card.id}>
                  <tr className="scorecard-row">
                    <th scope="row" className="mono">{t('scorecards.ofN', { rank: card.rank, total: card.rankedOutOf })}</th>
                    <td><IdText value={card.hypothesisId} /></td>
                    <td className="overall-cell">{summarize(card.overallRationale)}</td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        aria-expanded={open}
                        aria-label={`${t('scorecards.expandRow')} — ${card.hypothesisId}`}
                        onClick={() => setOpenRank(open ? null : card.rank)}
                      >
                        {open ? t('common.collapse') : `${valueCount} / ${card.dimensions.length}`}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="scorecard-detail-row">
                      <td colSpan={4}>
                        <div className="scorecard-detail">
                          <p>
                            <strong>{t('scorecards.overall')}:</strong> {card.overallRationale}
                          </p>
                          {card.comparisonNote !== undefined && card.comparisonNote.trim().length > 0 && (
                            <p className="muted">
                              <strong>{t('scorecards.comparisonNote')}:</strong> {card.comparisonNote}
                            </p>
                          )}
                          <table className="data-table dimension-table">
                            <caption className="sr-only">{t('scorecards.dimension')}</caption>
                            <thead>
                              <tr>
                                <th scope="col">{t('scorecards.dimension')}</th>
                                <th scope="col">{t('scorecards.value')}</th>
                                <th scope="col">{t('scorecards.rationale')}</th>
                                <th scope="col">{t('scorecards.producer')} / {t('scorecards.calibration')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {card.dimensions.map((d) => (
                                <tr key={d.dimension}>
                                  <th scope="row" className="mono">{d.dimension}</th>
                                  <td className="mono">
                                    {d.value === null ? (
                                      <Badge tone="muted">{t('scorecards.notAssessed')}</Badge>
                                    ) : (
                                      `${d.value}${d.qualitative !== undefined ? ` (${d.qualitative})` : ''}`
                                    )}
                                  </td>
                                  <td>
                                    {d.rationale}
                                    {d.uncertainty !== undefined && <span className="muted small"> — {d.uncertainty}</span>}
                                  </td>
                                  <td className="mono small muted">
                                    {d.producer}
                                    <br />
                                    {d.calibration}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summarize(text: string, max = 140): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
