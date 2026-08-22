import { describe, it, expect } from 'vitest';
import { medianOf, aggregateVotes } from '../eval/judge-votes.mjs';

/**
 * W4-F4 self-consistency aggregation (median + spread + full vote retention).
 * Source mechanism: gemini-cli evals/llm-judge.ts judgeYesNo majority; adapted to
 * FAR-Lab's 2-dimension 1-5 rubric with per-dimension MEDIAN (D-037 precedent).
 */

const vote = (hqX: number, ccX: number, reason = 'r') => ({
  ok: true as const,
  data: {
    X: { hypothesis_quality: hqX, counter_evidence_coverage: ccX, one_line_reason: reason },
    Y: { hypothesis_quality: 3, counter_evidence_coverage: 3, one_line_reason: 'y' },
    Z: { hypothesis_quality: 4, counter_evidence_coverage: 2, one_line_reason: 'z' },
  },
});

describe('medianOf', () => {
  it('odd counts take the middle, even counts average the two middles', () => {
    expect(medianOf([3])).toBe(3);
    expect(medianOf([1, 5, 3])).toBe(3);
    expect(medianOf([4, 1, 5, 3])).toBe(3.5);
    expect(medianOf([2, 2, 2, 2])).toBe(2);
  });
});

describe('aggregateVotes', () => {
  it('single vote passes through unchanged with zero spread', () => {
    const agg = aggregateVotes([vote(4, 2)]);
    expect(agg).not.toBeNull();
    expect(agg!.okVotes).toBe(1);
    expect(agg!.labels.X.hypothesis_quality).toEqual({ median: 4, min: 4, max: 4 });
    expect(agg!.labels.X.one_line_reason).toBe('r');
  });

  it('three votes take the median and record the full min/max spread', () => {
    const agg = aggregateVotes([vote(2, 5), vote(4, 3), vote(5, 3)]);
    expect(agg!.okVotes).toBe(3);
    expect(agg!.labels.X.hypothesis_quality).toEqual({ median: 4, min: 2, max: 5 });
    expect(agg!.labels.X.counter_evidence_coverage).toEqual({ median: 3, min: 3, max: 5 });
  });

  it('reason comes from the earliest vote matching the median HQ', () => {
    const agg = aggregateVotes([vote(2, 3, 'low'), vote(4, 3, 'mid'), vote(5, 3, 'high')]);
    expect(agg!.labels.X.one_line_reason).toBe('mid');
  });

  it('failed votes are excluded; zero successful votes return null (honest failure)', () => {
    const agg = aggregateVotes([{ ok: false }, vote(3, 3), { ok: false }]);
    expect(agg!.okVotes).toBe(1);
    expect(aggregateVotes([{ ok: false }, { ok: false }])).toBeNull();
  });
});
