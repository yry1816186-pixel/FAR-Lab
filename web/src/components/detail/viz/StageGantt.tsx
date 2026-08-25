import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/LanguageContext';
import type { ResearchRun, StageState } from '../../../api/types';
import { buildStageGantt, formatDuration } from '../../../viz/stage-viz';
import { stageKey } from '../../../i18n/keys';

/**
 * Stage Gantt (VIZ V4): where the run's wall-clock time actually went. Bars are
 * real [startedAt, endedAt] intervals — gaps between bars stay visible (queue
 * waits are information, not noise). A running stage ends at the ticking now
 * and is hatched as live elapsed, never presented as complete. Subtask progress
 * rides inside the bar; attempts > 1 get a retry marker.
 */

const ROW_H = 22;
const LABEL_W = 130;

// Epistemic state colors = the ONE token family at tint-strength ink (§8.3);
// CSS vars resolve live in the fill property, so bars follow the theme.
const stateInk = (state: StageState): string =>
  state === 'done' ? 'color-mix(in oklab, var(--v2-verified) 55%, transparent)'
    : state === 'failed' ? 'color-mix(in oklab, var(--v2-refuted) 60%, transparent)'
      : state === 'running' ? 'color-mix(in oklab, var(--v2-info) 50%, transparent)'
        : 'color-mix(in oklab, var(--v2-text-3) 45%, transparent)';

export function StageGantt({ run }: { run: ResearchRun }): JSX.Element | null {
  const { t } = useI18n();
  // Live stages end at "now": tick every 30s (matches the banner's clock) — the
  // bar is elapsed-time truth, not a spinner.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const live = run.status === 'running' || run.status === 'queued';
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [live]);

  const model = useMemo(() => buildStageGantt(run.stages, nowMs), [run.stages, nowMs]);
  if (model.bars.length === 0 || model.spanMs === null) return null;

  const height = model.bars.length * ROW_H + 4;
  const plotW = 100; // normalized units; rendered responsive via viewBox
  const barW = (b: { w: number }): number => b.w * plotW;
  const aria = model.bars
    .map((b) => `${t(stageKey(b.stage))}: ${formatDuration(b.durationMs)}${b.running ? `（${t('gantt.running')}）` : ''}${b.attempt !== undefined && b.attempt > 1 ? ` ${t('gantt.retryMark', { n: b.attempt })}` : ''}`)
    .join('；');

  return (
    <div className="stage-gantt">
      <svg
        viewBox={`0 0 ${LABEL_W + plotW + 8} ${height}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${t('gantt.title')} — ${aria}`}
      >
        {model.bars.map((b, i) => {
          const y = i * ROW_H + 4;
          const fill = stateInk(b.state);
          return (
            <g key={b.stage}>
              <text x={0} y={y + 11} className="gantt-label">
                {t(stageKey(b.stage))}
                <title>{`${t(stageKey(b.stage))} — ${b.state}`}</title>
              </text>
              <rect
                x={LABEL_W + b.x * plotW}
                y={y}
                width={Math.max(barW(b), 0.8)}
                height={14}
                rx={2}
                fill={fill}
                {...(b.running ? { style: { stroke: 'var(--v2-info)' }, strokeWidth: 1, strokeDasharray: '3 2' } : {})}
              >
                <title>
                  {`${t(stageKey(b.stage))}: ${formatDuration(b.durationMs)}${b.running ? ` — ${t('gantt.running')}` : ''}${b.attempt !== undefined && b.attempt > 1 ? ` · ${t('gantt.retryMark', { n: b.attempt })}` : ''}${b.subtasks !== undefined ? ` · ${t('overview.subtasks', { done: b.subtasks.done, total: b.subtasks.total })}` : ''}`}
                </title>
              </rect>
              {b.subtasks !== undefined && b.subtasks.total > 0 && (
                <rect
                  x={LABEL_W + b.x * plotW}
                  y={y + 10}
                  width={Math.max(barW(b) * (b.subtasks.done / b.subtasks.total), 0.4)}
                  height={4}
                  rx={1}
                  style={{ fill: 'color-mix(in oklab, var(--v2-text-1) 45%, transparent)' }}
                />
              )}
              <text x={LABEL_W + b.x * plotW + Math.max(barW(b), 0.8) + 3} y={y + 11} className="gantt-dur">
                {formatDuration(b.durationMs)}
                {b.attempt !== undefined && b.attempt > 1 ? ` ×${b.attempt}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted small">{t('gantt.note')}</p>
    </div>
  );
}
