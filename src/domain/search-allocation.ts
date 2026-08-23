/**
 * RU-15 A4.7 — deterministic stratified sample allocation (packet verdict: BUILD).
 *
 * Inference-time compute should WIDEN coverage, not pile onto dense regions.
 * Given cell occupancy over the candidate pool's dispersion×evidence-balance
 * strata and an extra-sample budget, allocate to the sparsest cells first —
 * a pure function, zero LLM cost, fully reproducible.
 *
 * Cell keys are caller-defined strings ("dispersion:balance", e.g.
 * "high:support-only"); this module only sees occupancy counts, so it stays
 * independent of how cells are computed upstream.
 */

export interface OccupancyCell {
  /** Caller-defined stratum key. */
  key: string;
  /** Current sample count in that cell. */
  count: number;
}

export interface AllocationOptions {
  /**
   * Max extras any single cell may receive. Prevents one starved cell from
   * absorbing the whole budget when other cells are absent; unspent budget is
   * reported honestly via `underAllocated` instead of being force-fed.
   */
  maxPerCell?: number;
}

export interface AllocationResult {
  /** Extras per cell key (absent = 0). Sum ≤ budget. */
  extras: Record<string, number>;
  /** Cells in allocation priority order (sparsest first), with post-allocation target counts. */
  order: Array<{ key: string; count: number }>;
  /** Total extras actually allocated (≤ budget; equals it unless capped). */
  allocated: number;
  /** Budget not spent because of caps / no eligible cells — disclosed, never hidden. */
  underAllocated: number;
}

/** Allocate `budget` extra samples across cells, sparsest-first. Deterministic. */
export function allocateSamples(
  cells: readonly OccupancyCell[],
  budget: number,
  opts: AllocationOptions = {},
): AllocationResult {
  const maxPerCell = opts.maxPerCell ?? Number.POSITIVE_INFINITY;
  const extras: Record<string, number> = {};
  // Stable sort: ascending occupancy, ties broken by original array position
  // so equal-occupancy inputs allocate round-robin regardless of input order
  // after normalization (reverse() then stable sort → identical order).
  const indexed = cells.map((c, i) => ({ ...c, i }));
  indexed.sort((a, b) => (a.count - b.count) || (a.i - b.i));

  let remaining = budget;
  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (const c of indexed) {
      if (remaining === 0) break;
      const given = extras[c.key] ?? 0;
      if (given >= maxPerCell) continue;
      extras[c.key] = given + 1;
      remaining -= 1;
      progress = true;
    }
  }

  return {
    extras,
    order: indexed.map((c) => ({ key: c.key, count: c.count + (extras[c.key] ?? 0) })),
    allocated: budget - remaining,
    underAllocated: remaining,
  };
}
