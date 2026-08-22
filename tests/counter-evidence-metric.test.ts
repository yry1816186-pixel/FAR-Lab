import { describe, it, expect } from 'vitest';
import { evaluate } from '../eval/counter-evidence-metric.mjs';

/**
 * counter-evidence-substantive-hit is a NORTH-STAR metric (target 0.70) — a set-membership
 * bug here would silently flip reported hits/misses. These tests lock the classification.
 */
describe('counter-evidence-metric classification', () => {
  it('perfect hit: every counter-labeled relation re-judged counter', () => {
    const rows = [
      { pipelineLabel: 'contradicts', judgeLabel: 'contradicts' },
      { pipelineLabel: 'weakens', judgeLabel: 'weakens' },
    ];
    const r = evaluate(rows, 't');
    expect(r.counterLabeled).toBe(2);
    expect(r.strictHit).toBe(2);
    expect(r.strictRate).toBe(1);
    expect(r.limitingRate).toBe(1);
    expect(r.missDecomposition).toEqual({ inverted: 0, empty: 0, otherQualifies: 0 });
  });

  it('miss decomposition: inverted (judge=supports) vs empty (judge=unrelated) vs qualifies-only', () => {
    const rows = [
      { pipelineLabel: 'contradicts', judgeLabel: 'supports' },    // inverted
      { pipelineLabel: 'weakens', judgeLabel: 'unrelated' },       // empty
      { pipelineLabel: 'contradicts', judgeLabel: 'qualifies' },   // limiting-only miss
      { pipelineLabel: 'weakens', judgeLabel: 'weakens' },         // strict hit
    ];
    const r = evaluate(rows, 't');
    expect(r.counterLabeled).toBe(4);
    expect(r.strictHit).toBe(1);
    expect(r.strictRate).toBe(0.25);
    expect(r.limitingHit).toBe(2);
    expect(r.missDecomposition.inverted).toBe(1);
    expect(r.missDecomposition.empty).toBe(1);
    expect(r.missDecomposition.otherQualifies).toBe(1);
  });

  it('denominator discipline: only pipeline counter-family labels count (supports-labeled rows excluded)', () => {
    const rows = [
      { pipelineLabel: 'supports', judgeLabel: 'contradicts' },  // NOT in denominator
      { pipelineLabel: 'qualifies', judgeLabel: 'contradicts' }, // NOT in denominator (strict definition)
      { pipelineLabel: 'weakens', judgeLabel: 'contradicts' },
    ];
    const r = evaluate(rows, 't');
    expect(r.counterLabeled).toBe(1);
    expect(r.strictHit).toBe(1);
  });

  it('zero counter-labeled: rates are honestly null, not 0', () => {
    const r = evaluate([{ pipelineLabel: 'supports', judgeLabel: 'supports' }], 't');
    expect(r.counterLabeled).toBe(0);
    expect(r.strictRate).toBe(null);
    expect(r.strictWilson).toBe(null);
  });

  it('Wilson wrapper brackets the point estimate', () => {
    const rows = Array.from({ length: 7 }, () => ({ pipelineLabel: 'weakens', judgeLabel: 'contradicts' }));
    const r = evaluate(rows, 't');
    expect(r.strictRate).toBe(1);
    expect(r.strictWilson.lo).toBeGreaterThan(0.55);
    expect(r.strictWilson.lo).toBeLessThan(0.75);
    expect(r.strictWilson.hi).toBe(1);
  });
});
