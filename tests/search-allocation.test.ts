import { describe, it, expect } from 'vitest';
import { allocateSamples } from '../src/domain/search-allocation.js';

// RU-15 A4.7 — deterministic stratified sample allocation for hypothesis
// generation (packet verdict: BUILD, zero LLM cost). Given a candidate pool's
// dispersion×evidence-balance cell occupancy and an EXTRA-sample budget,
// allocate extras to the SPARSEST high-value cells so compute widens coverage
// instead of piling onto already-dense regions.

const cells = (occupancy: Record<string, number>): Array<{ key: string; count: number }> =>
  Object.entries(occupancy).map(([key, count]) => ({ key, count }));

describe('allocateSamples', () => {
  it('returns zero extras when budget is zero', () => {
    const r = allocateSamples(cells({ 'mid:balanced': 4, 'high:support-only': 6 }), 0);
    expect(Object.values(r.extras).every((n) => n === 0)).toBe(true);
    expect(r.allocated).toBe(0);
  });

  it('gives every sparse cell priority over dense ones', () => {
    const occ = cells({ 'high:balanced': 8, 'low:balanced': 1, 'high:support-only': 5, 'mid:counter-heavy': 2 });
    const r = allocateSamples(occ, 3);
    // Sparsest cells first: low:balanced (1), mid:counter-heavy (2), then high:support-only (5)
    expect(r.order[0]?.key).toBe('low:balanced');
    expect(r.order[1]?.key).toBe('mid:counter-heavy');
    expect(r.allocated).toBe(3);
    expect(r.extras['low:balanced']).toBeGreaterThanOrEqual(1);
    expect((r.extras['high:balanced'] ?? 0)).toBe(0); // densest gets nothing
  });

  it('respects the budget exactly — never over-allocates', () => {
    const occ = cells({ a: 1, b: 2, c: 3, d: 9 });
    const r = allocateSamples(occ, 2);
    expect(r.allocated).toBe(2);
    expect(Object.values(r.extras).reduce((s, n) => s + n, 0)).toBe(2);
  });

  it('round-robins among tied cells deterministically (stable order)', () => {
    const occ = cells({ x: 2, y: 2, z: 2 });
    const r1 = allocateSamples(occ, 2);
    // Ties break by first occurrence in the INPUT array; the allocation is a
    // pure function of the cell multiset, so a reversed input yields the same
    // recipient SET — assert order-independence on the sorted keys.
    const r2 = allocateSamples([...occ].reverse(), 2);
    expect([...r1.order.map((c) => c.key)].sort()).toEqual([...r2.order.map((c) => c.key)].sort());
    expect(r1.allocated).toBe(2);
    expect(r2.allocated).toBe(2);
  });

  it('handles empty pool and single cell', () => {
    expect(allocateSamples([], 5).allocated).toBe(0);
    const single = allocateSamples(cells({ only: 7 }), 5);
    expect(single.allocated).toBe(5);
    expect(single.extras['only']).toBe(5);
  });

  it('caps per-cell extras so one starved cell cannot absorb everything', () => {
    const occ = cells({ starved: 0, fat: 10 });
    const r = allocateSamples(occ, 6, { maxPerCell: 2 });
    expect(r.extras['starved']).toBeLessThanOrEqual(2);
    expect(r.extras['fat']).toBeLessThanOrEqual(2);
    expect(r.allocated).toBeLessThanOrEqual(4);
    expect(r.underAllocated).toBeGreaterThan(0); // honest report of unspent budget
  });
});
