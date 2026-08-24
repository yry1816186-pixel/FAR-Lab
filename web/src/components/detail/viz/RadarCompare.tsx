import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../../i18n/LanguageContext';
import type { HypothesisCandidate, HypothesisScorecard } from '../../../api/types';
import { init, type EChartsCoreOption } from '../../../viz/echarts';
import { buildRadar, type RadarSpec } from '../../../viz/compare-viz';
import { useChartTokens, type ChartInks } from '../../../viz/chart-theme';

/**
 * Radar overlay of the compared hypotheses' score dimensions (VIZ V1). Drawn
 * only from the intersection of dimensions every compared hypothesis actually
 * scored — a missing score never becomes a fake 0 (buildRadar refuses instead).
 * The chart is role="img" with a summary label, and the full data table sits
 * right below in a disclosure: the text alternative IS the fallback, not an
 * afterthought (PRODUCT_HCI §7 drill-down + §1.2 accessible alternative).
 */

/** Hues legible on both light and dark themes; quantitative identity, not semantic state. */
const SERIES_COLORS = ['#2d78bd', '#b3352c', '#3d8b5f'] as const;

export function RadarCompare({
  hypotheses,
  scorecards,
}: {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
}): JSX.Element | null {
  const { t } = useI18n();
  const inks = useChartTokens();
  const result = useMemo(() => buildRadar(hypotheses, scorecards), [hypotheses, scorecards]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (result.spec === undefined || containerRef.current === null) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chart = init(containerRef.current, undefined, { renderer: 'svg' });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    chart.setOption(radarOption(result.spec, prefersReduced, inks));
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [result, inks]);

  if (result.spec === undefined) {
    const { refusal } = result;
    return (
      <p className="muted small" role="note">
        {refusal.kind === 'few_scored'
          ? t('viz.radarFewScored')
          : t('viz.radarFewDims', { n: refusal.commonDims.length })}
      </p>
    );
  }

  const { indicators, series } = result.spec;
  const ariaSummary = series
    .map((s) => `${s.label}: ${indicators.map((ind, i) => `${ind.name} ${s.values[i]?.toFixed(2)}`).join(', ')}`)
    .join('；');

  return (
    <div className="radar-compare">
      <div className="radar-legend muted small" aria-hidden="true">
        {series.map((s, i) => (
          <span key={s.id} className="radar-legend-item">
            <span className="radar-legend-dot" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        style={{ height: 300 }}
        role="img"
        aria-label={`${t('viz.radarTitle')} — ${ariaSummary}`}
      />
      <details className="viz-fallback">
        <summary className="small muted">{t('viz.dataTable')}</summary>
        <div className="table-scroll">
          <table className="data-table table--compact">
            <caption className="sr-only">{t('viz.radarTableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('hyp.statement')}</th>
                {indicators.map((ind) => (
                  <th key={ind.name} scope="col" className="mono small">{ind.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.id}>
                  <th scope="row" className="small">
                    <span className="radar-legend-dot" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden="true" />{' '}
                    {s.label}
                  </th>
                  {s.values.map((v, j) => (
                    <td key={j} className="mono small">{v.toFixed(2)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="muted small">{t('compare.dimUncalibrated')}</p>
    </div>
  );
}

/** Default export: this module is a lazy chunk (echarts rides along only when compare opens). */
export default RadarCompare;

function radarOption(spec: RadarSpec, reducedMotion: boolean, ink: ChartInks): EChartsCoreOption {
  return {
    animation: !reducedMotion,
    animationDuration: 200,
    tooltip: { trigger: 'item' },
    radar: {
      indicator: spec.indicators,
      radius: '62%',
      center: ['50%', '54%'],
      axisName: { color: ink.text2, fontSize: 11 },
      splitNumber: 4,
      splitLine: { lineStyle: { color: ink.border } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: ink.border } },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 4,
        data: spec.series.map((s, i) => ({
          name: s.label,
          value: s.values,
          lineStyle: { width: 2, color: SERIES_COLORS[i % SERIES_COLORS.length] },
          itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
          areaStyle: { opacity: 0.06 },
        })),
      },
    ],
  };
}
