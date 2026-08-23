import { describe, expect, it } from 'vitest';
import { buildStageGantt, formatDuration } from '../web/src/viz/stage-viz';
import type { StageRecord } from '../web/src/api/types';

const rec = (over: Partial<StageRecord>): StageRecord => ({ stage: 'retrieve', state: 'done', ...over });

const T0 = Date.parse('2026-08-23T10:00:00Z');
const at = (ms: number): string => new Date(T0 + ms).toISOString();

describe('buildStageGantt', () => {
  it('computes real durations and normalized bar geometry, sorted by start', () => {
    const model = buildStageGantt(
      [
        rec({ stage: 'retrieve', startedAt: at(0), endedAt: at(60_000), subtasks: { done: 3, total: 4, known: true } }),
        rec({ stage: 'rank', startedAt: at(90_000), endedAt: at(150_000) }),
        rec({ stage: 'scope', startedAt: at(10_000), endedAt: at(20_000), attempt: 2 }),
      ],
      T0 + 200_000,
    );
    expect(model.bars.map((b) => b.stage)).toEqual(['retrieve', 'scope', 'rank']); // by start time
    const retrieve = model.bars[0]!;
    expect(retrieve.durationMs).toBe(60_000);
    expect(retrieve.w).toBeCloseTo(60_000 / 150_000, 5);
    expect(retrieve.x).toBe(0);
    expect(retrieve.attempt).toBeUndefined();
    const scope = model.bars[1]!;
    expect(scope.attempt).toBe(2);
    expect(scope.x).toBeCloseTo(10_000 / 150_000, 5);
    expect(model.spanMs).toBe(150_000);
  });

  it('a running stage ends at the injected now and is marked live, not complete', () => {
    const model = buildStageGantt(
      [rec({ state: 'running', startedAt: at(0) })], // no endedAt
      T0 + 45_000,
    );
    expect(model.bars[0]!.running).toBe(true);
    expect(model.bars[0]!.durationMs).toBe(45_000);
    expect(model.bars[0]!.endMs).toBe(T0 + 45_000);
  });

  it('a done stage with no endedAt is NOT live (state decides, not the field)', () => {
    const model = buildStageGantt(
      [rec({ state: 'done', startedAt: at(0), endedAt: at(5_000) })],
      T0 + 100_000,
    );
    expect(model.bars[0]!.running).toBe(false);
  });

  it('stages without a start time never produce a bar', () => {
    const model = buildStageGantt(
      [rec({ startedAt: undefined, endedAt: undefined, state: 'pending' }), rec({ startedAt: at(0), endedAt: at(1_000) })],
      T0,
    );
    expect(model.bars).toHaveLength(1);
  });

  it('empty input yields no bars and null span', () => {
    expect(buildStageGantt([], Date.now())).toEqual({ bars: [], spanMs: null });
  });
});

describe('formatDuration', () => {
  it('picks honest units without invented precision', () => {
    expect(formatDuration(950)).toBe('950ms');
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(204_000)).toBe('3.4 分钟');
    expect(formatDuration(7_560_000)).toBe('2.1 小时');
  });
});
