/**
 * Pure builder for the stage Gantt (VIZ V4). Every bar is a real [startedAt,
 * endedAt] interval from the run's stage records; a running stage ends at the
 * injected `now` and is marked as live (its bar is elapsed time, not a claim of
 * completion). Stages never started draw nothing — no invented bars.
 */
import type { RunStageName, StageRecord, StageState } from '../api/types';

export interface GanttBar {
  stage: RunStageName;
  state: StageState;
  /** Elapsed ms; for a running stage this is "so far", not final. */
  durationMs: number;
  startMs: number;
  endMs: number;
  /** x/width in [0, 1] of the plot area. */
  x: number;
  w: number;
  running: boolean;
  attempt?: number;
  subtasks?: { done: number; total: number };
}

export interface GanttModel {
  bars: GanttBar[];
  /** Total span ms (max end - min start); null when nothing ever started. */
  spanMs: number | null;
}

export function buildStageGantt(stages: StageRecord[], nowMs: number): GanttModel {
  const timed = stages.filter((s) => s.startedAt !== undefined);
  if (timed.length === 0) return { bars: [], spanMs: null };

  const starts = timed.map((s) => Date.parse(s.startedAt!));
  const ends = timed.map((s) => (s.endedAt !== undefined ? Date.parse(s.endedAt) : nowMs));
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(max - min, 1);

  const bars: GanttBar[] = timed
    .slice()
    .sort((a, b) => Date.parse(a.startedAt!) - Date.parse(b.startedAt!))
    .map((s) => {
      const startMs = Date.parse(s.startedAt!);
      const endMs = s.endedAt !== undefined ? Date.parse(s.endedAt) : nowMs;
      return {
        stage: s.stage,
        state: s.state,
        durationMs: endMs - startMs,
        startMs,
        endMs,
        x: (startMs - min) / span,
        w: Math.max((endMs - startMs) / span, 0.004), // 0.4% minimum ink so instantaneous stages stay visible
        running: s.endedAt === undefined && s.state === 'running',
        ...(s.attempt !== undefined ? { attempt: s.attempt } : {}),
        ...(s.subtasks !== undefined ? { subtasks: { done: s.subtasks.done, total: s.subtasks.total } } : {}),
      };
    });
  return { bars, spanMs: max - min };
}

/** Human duration: 42s / 3.4 分钟 / 2.1 小时 — precise units, no invented precision. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(Math.round(ms), 0)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)} 分钟`;
  return `${(m / 60).toFixed(1)} 小时`;
}
