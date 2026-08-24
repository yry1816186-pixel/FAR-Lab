import type { SourceIdentifier } from '../domain/source.js';
import type { CitationChaseAdapter } from '../shared/ports.js';

/**
 * Citation-graph expansion (RU-R GO1, ADOPT of the standard snowball/citation-
 * chaining loop behind Connected Papers / Semantic Scholar / scite): keyword
 * search misses the works that are only reachable THROUGH the citation graph —
 * foundational method papers (backward references) and follow-ups/replications/
 * critiques (forward citations). This module owns the DETERMINISTIC plan and
 * bounds; execution (receipts, pool merge, counters) lives in retrieve.ts.
 *
 * Bounds are hard: seeds are capped, per-seed backward/forward fetches are
 * capped, and the whole chase stops at CHASE_MAX_NEW pool additions — an
 * enrichment pass, never an open loop.
 */

/** Max seeds chased per run (top-fused + counter passthrough, see planCitationChase). */
export const CHASE_SEEDS_MAX = 3;
/** How many of the seeds come from the top of the fused order. */
export const CHASE_TOP_SEEDS = 2;
/** Backward references resolved per seed (first N in the API's citation order). */
export const CHASE_REFERENCES_PER_SEED = 3;
/** Forward citing works fetched per seed (most-cited first, deterministic sort). */
export const CHASE_CITING_PER_SEED = 5;
/** Hard cap on NEW pool entries introduced by the whole chase. */
export const CHASE_MAX_NEW = 8;
/** Depth-2 seeds: at most ONE hop-2 seed (the first chase-added resolvable doc). */
export const CHASE_HOP2_SEEDS = 1;
/** Backward references resolved at hop 2 (method lineage narrows fast). */
export const CHASE_HOP2_REFERENCES_PER_SEED = 2;

export interface ChaseSeedInput {
  readonly key: string;
  readonly purposes: ReadonlySet<string>;
  /** Structurally compatible with retrieve's PoolEntry (record.identifiers). */
  readonly record: { readonly identifiers: readonly SourceIdentifier[] };
}

export interface ChaseSeed {
  readonly key: string;
  /** OpenAlex work ref: bare W-id or `doi:<doi>` compound. */
  readonly workRef: string;
  readonly tag: 'top' | 'counter';
}

const WID_RE = /^W\d+$/;

/**
 * Resolvable citation ref for one pool entry: a bare OpenAlex W-id when the
 * record carries one, else a `doi:` compound, else null (not chaseable).
 * W-id wins over DOI — one request either way, same payload.
 */
export const workRefOf = (entry: ChaseSeedInput): string | null => {
  for (const id of entry.record.identifiers) {
    if (id.kind !== 'openalex') continue;
    const bare = id.value.trim().replace(/^https?:\/\/openalex\.org\//i, '');
    if (WID_RE.test(bare)) return bare;
  }
  for (const id of entry.record.identifiers) {
    if (id.kind !== 'doi') continue;
    const v = id.value.trim().replace(/^https?:\/\/doi\.org\//i, '');
    if (v.length > 0) return `doi:${v}`;
  }
  return null;
};

/**
 * Deterministic seed selection over the (pre-chase) fused order:
 * the first CHASE_TOP_SEEDS chaseable entries, plus the first chaseable
 * COUNTER-origin entry not already selected (forward citations of a critique
 * paper surface the controversy around it — the exact neighborhood keyword
 * search under-samples). Total capped at CHASE_SEEDS_MAX; order = selection
 * order (stable, fused-rank-first).
 */
export const planCitationChase = (fused: readonly ChaseSeedInput[]): readonly ChaseSeed[] => {
  const seeds: ChaseSeed[] = [];
  const taken = new Set<string>();
  const push = (entry: ChaseSeedInput, tag: ChaseSeed['tag']): void => {
    if (seeds.length >= CHASE_SEEDS_MAX || taken.has(entry.key)) return;
    const workRef = workRefOf(entry);
    if (workRef === null) return;
    taken.add(entry.key);
    seeds.push({ key: entry.key, workRef, tag });
  };
  for (const entry of fused) {
    if (seeds.filter((s) => s.tag === 'top').length >= CHASE_TOP_SEEDS) break;
    push(entry, 'top');
  }
  for (const entry of fused) {
    if (!entry.purposes.has('counter_evidence')) continue;
    if (seeds.length >= CHASE_SEEDS_MAX) break;
    push(entry, 'counter');
  }
  return seeds;
};

/** True when an adapter error means the chase should ABORT (not per-seed skip). */
export const isChaseAbortError = (e: unknown): boolean =>
  e instanceof Error && /429|rate|budget|insufficient/i.test(e.message);

/**
 * Depth-2 seed selection: the FIRST hop-1-added entry (pool insertion order —
 * deterministic) with a resolvable workRef. Backward-only: hop 2 answers "what
 * methodology does the methodology paper rest on" — foundational-of-foundational
 * lineage. Forward-of-forward (follow-ups of follow-ups) is recency noise, not
 * lineage, and doubles budget for little evidential value.
 */
export const planHop2Seed = (chaseAdded: readonly ChaseSeedInput[]): ChaseSeed | null => {
  for (const entry of chaseAdded) {
    const workRef = workRefOf(entry);
    if (workRef !== null) return { key: entry.key, workRef, tag: 'top' };
  }
  return null;
};

/** The citation capability's execution surface the retrieve stage needs. */
export type { CitationChaseAdapter };
