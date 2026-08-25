import { useMemo } from 'react';
import { useI18n } from '../../../i18n/LanguageContext';
import type { ForestInputReport } from '../../../viz/experiment-viz';
import { buildForestGroups } from '../../../viz/experiment-viz';

/**
 * CI forest plot (VIZ V3): one horizontal error bar per stat report, grouped
 * by metric so each axis is honest to its own scale. Points are markers, CI
 * bounds are whiskers; a report without a CI draws a bare point (never a
 * fabricated whisker). No threshold line — the payload carries threshold
 * PROVENANCE text, not a number, and we do not invent one.
 */

const ROW_H = 34;
const LABEL_W = 170;
const AXIS_H = 22;
const PLOT_W = 420;

export function ForestPlot({ reports }: { reports: ForestInputReport[] }): JSX.Element | null {
  const { t } = useI18n();
  const groups = useMemo(() => buildForestGroups(reports), [reports]);
  if (groups.length === 0) return null;

  const fmt = (v: number): string => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

  return (
    <div className="forest-plot">
      {groups.map((g) => {
        const height = g.rows.length * ROW_H + AXIS_H;
        const x = (v: number): number => ((v - g.scale.min) / (g.scale.max - g.scale.min)) * PLOT_W;
        const ticks = [g.scale.min, (g.scale.min + g.scale.max) / 2, g.scale.max];
        return (
          <div key={g.metric} className="forest-group">
            <p className="mono small muted forest-metric">{g.metric}</p>
            <svg
              viewBox={`0 0 ${LABEL_W + PLOT_W + 16} ${height}`}
              style={{ width: '100%', maxWidth: LABEL_W + PLOT_W + 16, height: 'auto' }}
              role="img"
              aria-label={`${t('exp.forestTitle')} (${g.metric}) — ${g.rows
                .map((r) => `${r.label}: ${fmt(r.point)}${r.low !== undefined && r.high !== undefined ? ` [${fmt(r.low)}, ${fmt(r.high)}]` : ''}`)
                .join('；')}`}
            >
              {g.scale.spansZero && (
                <line x1={LABEL_W + x(0)} y1={0} x2={LABEL_W + x(0)} y2={g.rows.length * ROW_H} style={{ stroke: 'var(--v2-text-3)' }} strokeDasharray="3 3" strokeWidth={1}>
                  <title>0</title>
                </line>
              )}
              {ticks.map((tv, i) => (
                <g key={i}>
                  <line x1={LABEL_W + x(tv)} y1={g.rows.length * ROW_H - 4} x2={LABEL_W + x(tv)} y2={g.rows.length * ROW_H} style={{ stroke: 'var(--v2-border)' }} strokeWidth={1} />
                  <text x={LABEL_W + x(tv)} y={height - 6} textAnchor="middle" className="forest-tick">{fmt(tv)}</text>
                </g>
              ))}
              {g.rows.map((r, i) => {
                const cy = i * ROW_H + ROW_H / 2;
                // verdict = epistemic semantics → the ONE token color family (§8.3);
                // CSS vars resolve live, so the plot follows the theme without re-init.
                const verdictColor = r.verdict === 'supports' ? 'var(--v2-verified)' : r.verdict === 'falsifies' ? 'var(--v2-refuted)' : 'var(--v2-info)';
                return (
                  <g key={r.key}>
                    <text x={0} y={cy + 4} className="forest-label">
                      {r.label.length > 26 ? `${r.label.slice(0, 26)}…` : r.label}
                      <title>{r.label}</title>
                    </text>
                    {r.low !== undefined && r.high !== undefined && (
                      <line
                        x1={LABEL_W + x(r.low)}
                        y1={cy}
                        x2={LABEL_W + x(r.high)}
                        y2={cy}
                        stroke={verdictColor}
                        strokeWidth={2}
                      >
                        <title>{`CI${(r.ciLevel ?? 0.95).toString()} [${fmt(r.low)}, ${fmt(r.high)}]`}</title>
                      </line>
                    )}
                    <circle cx={LABEL_W + x(r.point)} cy={cy} r={4.5} fill={verdictColor}>
                      <title>{`${r.label}: ${fmt(r.point)}`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
      <p className="muted small">{t('exp.forestNote')}</p>
    </div>
  );
}
