import { describe, expect, it } from 'vitest';
import { buildForestGroups, metricShares, tallyVerdicts } from '../web/src/viz/experiment-viz';

describe('buildForestGroups', () => {
  it('groups by metric and scales the axis over points and CI bounds with padding', () => {
    const groups = buildForestGroups([
      { id: 'r1', comparisonId: 'cmp_a', metricKey: 'accuracy', pointEstimate: 0.06, ci: { level: 0.95, low: 0.02, high: 0.10 } },
      { id: 'r2', comparisonId: 'cmp_b', metricKey: 'accuracy', pointEstimate: 0.30, ci: { level: 0.95, low: 0.25, high: 0.35 } },
      { id: 'r3', comparisonId: 'cmp_a', metricKey: 'f1', pointEstimate: 0.5 },
    ]);
    expect(groups.map((g) => g.metric).sort()).toEqual(['accuracy', 'f1']);
    const acc = groups.find((g) => g.metric === 'accuracy')!;
    expect(acc.rows).toHaveLength(2);
    expect(acc.scale.min).toBeLessThan(0.02);
    expect(acc.scale.max).toBeGreaterThan(0.35);
    expect(acc.scale.spansZero).toBe(false);
  });

  it('drops reports without a finite point estimate (never fabricates a bar)', () => {
    const groups = buildForestGroups([
      { id: 'bad', metricKey: 'accuracy', pointEstimate: Number.NaN },
      { id: 'none', metricKey: 'accuracy' },
    ]);
    expect(groups).toHaveLength(0);
  });

  it('keeps a CI-less report as a bare point row', () => {
    const groups = buildForestGroups([{ id: 'r', comparisonId: 'cmp', metricKey: 'rmse', pointEstimate: 2.5 }]);
    expect(groups[0]!.rows[0]!.low).toBeUndefined();
    expect(groups[0]!.rows[0]!.high).toBeUndefined();
  });

  it('degenerate single-value domain gets symmetric padding', () => {
    const groups = buildForestGroups([{ id: 'r', metricKey: 'm', pointEstimate: 1 }]);
    expect(groups[0]!.scale.min).toBeLessThan(1);
    expect(groups[0]!.scale.max).toBeGreaterThan(1);
  });

  it('marks spansZero when the domain crosses zero (zero reference line)', () => {
    const groups = buildForestGroups([
      { id: 'r1', metricKey: 'delta', pointEstimate: -0.4, ci: { low: -0.8, high: 0.0 } },
      { id: 'r2', metricKey: 'delta', pointEstimate: 0.3, ci: { low: 0.1, high: 0.5 } },
    ]);
    expect(groups[0]!.scale.spansZero).toBe(true);
  });
});

describe('metricShares', () => {
  const cells = [
    { key: 'a', metrics: { accuracy: 0.93, rmse: 1.2 } },
    { key: 'b', metrics: { accuracy: 0.33, rmse: 0.4 } },
  ];

  it('shares are relative to the same metric max across cells', () => {
    const shares = metricShares(cells)!;
    expect(shares.get('accuracy')!.get('a')).toBeCloseTo(1);
    expect(shares.get('accuracy')!.get('b')).toBeCloseTo(0.33 / 0.93);
    expect(shares.get('rmse')!.get('a')).toBeCloseTo(1); // rmse max is a's 1.2 — higher error = longer bar
  });

  it('single cell has no comparison semantics — undefined, not decorative bars', () => {
    expect(metricShares([cells[0]!])).toBeUndefined();
  });

  it('non-positive or non-finite values are excluded from shares', () => {
    const shares = metricShares([
      { key: 'a', metrics: { accuracy: 0.5, loss: -1, nan: Number.NaN } },
      { key: 'b', metrics: { accuracy: 0.25, loss: -2, nan: Number.NaN } },
    ])!;
    expect(shares.has('loss')).toBe(false);
    expect(shares.has('nan')).toBe(false);
    expect(shares.get('accuracy')!.get('b')).toBeCloseTo(0.5);
  });
});

describe('tallyVerdicts', () => {
  it('counts verdicts and POPPER discipline flags separately', () => {
    const t = tallyVerdicts([
      { verdict: 'supports' },
      { verdict: 'supports' },
      { verdict: 'falsifies' },
      { exploratory: true }, // no verdict → inconclusive + exploratory
      { secondary: true },
    ]);
    expect(t).toMatchObject({ supports: 2, falsifies: 1, inconclusive: 2, exploratory: 1, secondary: 1 });
  });
});
