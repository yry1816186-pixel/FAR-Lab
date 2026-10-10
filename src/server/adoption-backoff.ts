/**
 * LOG-004: bounded adoption-backoff bookkeeping for the frozen-run watchdog
 * (api.ts sweepExpiredLeases). lastAdoptedAt gained one entry per adopted run
 * id and never removed them — including runs that later reached a terminal
 * state — so a long-lived server over a workspace with thousands of historical
 * runs grew the map without bound (CWE-401, slow leak).
 *
 * Contract: an entry is pruned when BOTH hold —
 *   1. its run id no longer appears in the expired-lease scan output (the run
 *      reached a terminal state or was restored), AND
 *   2. its stored timestamp is at least adoptionBackoffMs old (a recently
 *      vanished id may re-enter the set via restore; keep its backoff).
 * Entries for still-expired runs are never pruned: they are the hot-loop guard
 * the map exists for. With this rule the map is bounded by
 * |live expired runs| + |ids vanished within the last backoff window|.
 */
export const pruneAdoptionBackoff = (
  lastAdoptedAt: Map<string, number>,
  liveExpiredRunIds: ReadonlySet<string>,
  now: number,
  backoffMs: number,
): number => {
  let pruned = 0;
  for (const [id, ts] of lastAdoptedAt) {
    if (!liveExpiredRunIds.has(id) && now - ts >= backoffMs) {
      lastAdoptedAt.delete(id);
      pruned += 1;
    }
  }
  return pruned;
};
