import { describe, expect, it } from 'vitest';
import { pruneAdoptionBackoff } from '../src/server/adoption-backoff.js';

/**
 * LOG-004: the frozen-run watchdog's lastAdoptedAt map gains one entry per
 * adopted run id and never removes them — unbounded (slow) memory growth on a
 * long-lived server over a workspace with thousands of historical runs. The
 * prune is a pure function so the bounding contract is unit-testable (the
 * behavior is memory-only: adoption stays legal after the backoff window, so
 * no integration observable distinguishes it).
 */

const BACKOFF_MS = 60_000;

describe('pruneAdoptionBackoff (LOG-004)', () => {
  it('drops entries for runs that left the expired-lease set once past backoff', () => {
    const map = new Map<string, number>([['run_a', 1_000], ['run_b', 1_000], ['run_c', 1_000]]);
    const pruned = pruneAdoptionBackoff(map, new Set(['run_b']), 1_000 + BACKOFF_MS, BACKOFF_MS);
    expect(pruned).toBe(2);
    expect([...map.keys()]).toEqual(['run_b']);
  });

  it('keeps vanished-but-recent entries (a restored run may still hot-loop)', () => {
    const map = new Map<string, number>([['run_a', 50_000]]);
    const pruned = pruneAdoptionBackoff(map, new Set(), 60_000, BACKOFF_MS); // age 10s < backoff
    expect(pruned).toBe(0);
    expect(map.has('run_a')).toBe(true);
  });

  it('never prunes runs still in the expired-lease set regardless of age', () => {
    const map = new Map<string, number>([['run_a', 0]]);
    const pruned = pruneAdoptionBackoff(map, new Set(['run_a']), 10 * BACKOFF_MS, BACKOFF_MS);
    expect(pruned).toBe(0);
    expect(map.has('run_a')).toBe(true);
  });

  it('empty map is a no-op returning zero', () => {
    const map = new Map<string, number>();
    expect(pruneAdoptionBackoff(map, new Set(), 123, BACKOFF_MS)).toBe(0);
  });

  it('bounds the map to live expired runs plus the backoff window (growth argument)', () => {
    // 100 adopted-then-terminal runs, only 2 still expired: after their backoff
    // windows pass, one sweep shrinks the map to the live set.
    const map = new Map<string, number>();
    for (let i = 0; i < 100; i += 1) map.set(`run_${i}`, 0);
    const pruned = pruneAdoptionBackoff(map, new Set(['run_0', 'run_1']), 5 * BACKOFF_MS, BACKOFF_MS);
    expect(pruned).toBe(98);
    expect(map.size).toBe(2);
  });
});
