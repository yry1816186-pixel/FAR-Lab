import type { StageContext } from '../types.js';
import type { ClaimId, EvidenceRelation, HypothesisCandidate, ScientificClaim } from '../../domain/index.js';
import { RELATION_POLARITY } from '../../domain/evidence.js';

/**
 * Small deterministic utilities shared by the hypothesis-group stages
 * (generate_hypotheses / critique_falsify / rank). No LLM involvement here:
 * everything in this module is pure bookkeeping over persisted domain objects.
 */

/** Marker appended to derivation.rationale of paraphrase-duplicate candidates. */
export const DUPLICATE_MARKER = 'duplicate-of-representative:';

/**
 * A candidate is a cluster representative iff it was not marked as a
 * paraphrase duplicate during clustering. Only representatives are
 * falsified and ranked; duplicates stay stored for provenance.
 */
export const isRepresentative = (h: Pick<HypothesisCandidate, 'derivation'>): boolean =>
  !h.derivation.rationale.includes(DUPLICATE_MARKER);

/**
 * Structured cancellation checkpoint — the message prefix is what the orchestrator matches.
 * Also a W8 lease-fencing checkpoint (audit P1-3): a worker disowned via lease adoption
 * stops here BEFORE its next domain-object write instead of racing the adopter.
 */
export const assertNotCancelled = (ctx: StageContext, stage: string): void => {
  if (ctx.disowned?.()) throw new Error(`run lease lost during ${stage} (adopted by another executor)`);
  if (ctx.cancelled()) throw new Error(`cancelled by user during ${stage}`);
};

/** Minimal claim projection safe to serialize into model prompts. */
export const claimsForPrompt = (claims: readonly ScientificClaim[]): { id: string; text: string }[] =>
  claims.map((c) => ({ id: c.id, text: c.text }));

// ---------------------------------------------------------------------------
// Real-content discipline (owner directive 2026-08-29)
// ---------------------------------------------------------------------------

/**
 * Skip-reason marker persisted on stages skipped by the real-content discipline
 * (red-team P1-1): resume REOPENS these exactly like budget-exhaustion pauses —
 * the promised recovery ("restore a live model route and resume") must be true.
 */
export const TEMPLATE_REFUSAL_REASON = 'template_mode_refused';

/**
 * Thrown by judgment call sites when a PRODUCT run's receipt is test-mode: the
 * in-process test double answers purposes with filler payloads, which must never
 * be stored as scientific content. Stage handlers catch this and record an honest
 * skip carrying TEMPLATE_REFUSAL_REASON (resumable once a live route serves — the
 * orchestrator reopens marker skips). Throw it INSIDE ctx.checkpointed fns: a
 * refusal must never be cached as a successful step output (red-team P1-2 poison
 * loop).
 */
export class TemplateModeRefusal extends Error {
  constructor(readonly what: string) {
    super(
      `${TEMPLATE_REFUSAL_REASON}: model route is the in-process test double — filler ${what} refused as scientific content ` +
        `in a product run; restore a live model route and resume (marker-skipped stages are reopened automatically)`,
    );
    this.name = 'TemplateModeRefusal';
  }
}

/**
 * Guard one receipt: refuse test-mode output in a product run. Direct
 * stage-level tests leave ctx.productRun unset and are unaffected.
 */
export const refuseTemplateMode = (
  ctx: StageContext,
  executionMode: 'live' | 'test' | undefined,
  what: string,
): void => {
  if (ctx.productRun === true && executionMode === 'test') throw new TemplateModeRefusal(what);
};

// ---------------------------------------------------------------------------
// RU-9 GO4 — minimal context compiler (deterministic, zero LLM)
// ---------------------------------------------------------------------------

export interface BudgetedSection {
  id: string;
  /** 1 = highest; whole sections are kept in priority order until the budget. */
  priority: number;
  text: string;
}

/**
 * Deterministic section-budget trim: keep WHOLE sections in ascending priority
 * (ties by id) while the char budget holds; a section that does not fit whole is
 * dropped (never silently half-truncated). Returns kept texts + dropped ids so
 * callers can disclose what was cut.
 */
export const applySectionBudget = (
  sections: readonly BudgetedSection[],
  budgetChars: number,
): { kept: string[]; dropped: string[] } => {
  const ordered = [...sections].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const kept: string[] = [];
  const dropped: string[] = [];
  let used = 0;
  for (const s of ordered) {
    if (used + s.text.length <= budgetChars) {
      kept.push(s.text);
      used += s.text.length;
    } else {
      dropped.push(s.id);
    }
  }
  return { kept, dropped };
};

const STOP = new Set(['that', 'with', 'from', 'this', 'have', 'were', 'which', 'about', 'their', 'been', 'such', 'than', 'then', 'also', 'into', 'over', 'under', 'between', 'because', 'while', 'these', 'those', 'study', 'studies', 'results', 'result', 'using', 'used', 'show', 'shown', 'effect', 'effects']);
const tokensOf = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));

/**
 * TF-IDF greedy diverse selection (A4.4-dispersion lineage): score =
 * normalized relevance × (1 − max similarity to an already-selected item).
 * Deterministic (ties by id); replaces naive top-k when the prompt cap binds,
 * so a large evidence base conditions generation on a DIVERSE span instead of
 * the first N claims.
 */
export const selectDiverseExemplars = <T extends { id: string; text: string }>(
  items: readonly T[],
  seedText: string,
  k: number,
): T[] => {
  if (items.length <= k) return [...items];
  const df = new Map<string, number>();
  const itemTokens = items.map((it) => {
    const toks = tokensOf(it.text);
    for (const tok of new Set(toks)) df.set(tok, (df.get(tok) ?? 0) + 1);
    return toks;
  });
  const seedSet = new Set(tokensOf(seedText));
  const N = items.length;
  const tfidf = (toks: string[], tok: string): number => {
    const tf = toks.filter((x) => x === tok).length / Math.max(toks.length, 1);
    const idf = Math.log(1 + N / (1 + (df.get(tok) ?? 0)));
    return tf * idf;
  };
  const sim = (a: string[], b: string[]): number => {
    if (a.length === 0 || b.length === 0) return 0;
    const vec = (toks: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const tok of new Set(toks)) m.set(tok, tfidf(toks, tok));
      return m;
    };
    const va = vec(a);
    const vb = vec(b);
    let dot = 0;
    for (const [tok, w] of va) {
      const wb = vb.get(tok);
      if (wb !== undefined) dot += w * wb;
    }
    const na = Math.sqrt([...va.values()].reduce((s, w) => s + w * w, 0));
    const nb = Math.sqrt([...vb.values()].reduce((s, w) => s + w * w, 0));
    return na === 0 || nb === 0 ? 0 : dot / (na * nb);
  };
  const rawRelevance = itemTokens.map((toks) => {
    let s = 0;
    for (const tok of seedSet) s += tfidf(toks, tok);
    return s;
  });
  // normalize relevance to [0,1] so it shares a scale with the cosine
  // diversity penalty — otherwise a large-magnitude relevance sum drowns the
  // penalty and the picker degrades to naive top-k (caught by the diversity test).
  const maxRel = Math.max(...rawRelevance, 0);
  const relevance = maxRel > 0 ? rawRelevance.map((r) => r / maxRel) : rawRelevance.map(() => 0);
  const selected: number[] = [];
  const remaining = items.map((_, i) => i);
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (const i of remaining) {
      const redundancy = selected.length === 0
        ? 0
        : Math.max(...selected.map((j) => sim(itemTokens[i]!, itemTokens[j]!)));
      // Multiplicative marginal gain (DPP-flavored): score = relevance × (1 − redundancy).
      // A subtractive penalty cannot unseat a 2:1 relevance gap (proven by the
      // diversity test failing at every additive weight); multiplication makes a
      // near-duplicate of an already-selected item nearly worthless while a
      // less-relevant-but-different item retains most of its value. Relevance-first
      // is preserved: zero relevance still scores exactly zero.
      const score = relevance[i]! * (1 - redundancy);
      if (score > bestScore || (score === bestScore && (bestIdx === -1 || items[i]!.id < items[bestIdx]!.id))) {
        bestScore = score;
        bestIdx = i;
      }
    }
    selected.push(bestIdx);
    remaining.splice(remaining.indexOf(bestIdx), 1);
  }
  return selected.map((i) => items[i]!);
};

/** Prompt cap for the claim-conditioning base (GO4): diverse-trim above this. */
export const CLAIMS_PROMPT_CAP = 16;

/** claimsForPrompt with the GO4 cap: under cap = identical projection; over = diverse exemplars. */
export const cappedClaimsForPrompt = (
  claims: readonly ScientificClaim[],
  seedText: string,
): { id: string; text: string }[] => {
  if (claims.length <= CLAIMS_PROMPT_CAP) return claimsForPrompt(claims);
  const exemplars = selectDiverseExemplars(
    claims.map((c) => ({ id: c.id, text: c.text })),
    seedText,
    CLAIMS_PROMPT_CAP,
  );
  const byId = new Map(exemplars.map((e) => [e.id, e]));
  return claims.filter((c) => byId.has(c.id)).map((c) => ({ id: c.id, text: c.text }));
};

export interface ClaimBuckets {
  /** Verified claims not implicated in any counter/neutral-direction relation (default affirmative evidence). */
  supporting: ScientificClaim[];
  /** Claims implicated in counter-polarity relations (either side of a conflict) or only in neutral ones. */
  counter: ScientificClaim[];
}

/**
 * Deterministic direction split of the verified evidence base.
 *
 * EvidenceRelation polarity (RELATION_POLARITY) is the only signal available at
 * hypothesis-generation time:
 * - a claim on EITHER side (claimId or targetClaimId) of a counter-polarity relation
 *   (contradicts/weakens/fails_to_replicate/alternative_explanation) is counter-direction —
 *   conflicts are never averaged away, and the contested claim belongs with the conflict;
 * - a claim implicated only in neutral relations (qualifies/depends_on/derived_from/
 *   methodological_limitation/unknown) is counter-direction too (qualifies/unknown bucket);
 * - everything else is supports-direction (uncontested affirmative evidence).
 */
export const bucketClaims = (
  claims: readonly ScientificClaim[],
  relations: readonly EvidenceRelation[],
): ClaimBuckets => {
  const counterIds = new Set<string>();
  const neutralIds = new Set<string>();
  for (const rel of relations) {
    if (!rel.claimId) continue; // source-level relations carry no claim-direction signal
    const polarity = RELATION_POLARITY[rel.relation];
    const parties = [rel.claimId, rel.targetClaimId].filter((id): id is string => typeof id === 'string');
    for (const id of parties) {
      if (polarity === 'counter') counterIds.add(id);
      else if (polarity === 'neutral') neutralIds.add(id);
    }
  }
  const isCounter = (c: ScientificClaim) => counterIds.has(c.id) || neutralIds.has(c.id);
  return {
    supporting: claims.filter((c) => !isCounter(c)),
    counter: claims.filter(isCounter),
  };
};

export interface ClaimRefPartition {
  valid: ClaimId[];
  invalid: string[];
}

/**
 * Evidence references must point at claim ids that actually exist in this run.
 * Invalid references are dropped (never silently kept) and surfaced as warnings.
 */
export const partitionClaimRefs = (
  referenced: readonly string[],
  existing: ReadonlySet<string>,
): ClaimRefPartition => {
  const valid: ClaimId[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const id of referenced) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (existing.has(id)) valid.push(id as ClaimId);
    else invalid.push(id);
  }
  return { valid, invalid };
};

/** All persisted claim ids for the run — the existence oracle for reference filtering. */
export const runClaimIds = (ctx: StageContext): Set<string> =>
  new Set(ctx.store.listObjects('claim', ctx.run.id).map((c) => c.id));

/** Verified claims of the run (the only admissible conditioning base for generation). */
export const verifiedClaims = (ctx: StageContext): ScientificClaim[] =>
  ctx.store.listObjects('claim', ctx.run.id).filter((c) => c.bindingStatus === 'verified');

/**
 * Bounded-concurrency ordered map (WP4, W8 parallelization stretch): items are
 * independent calls whose inputs come from the store (no cross-iteration coupling) —
 * overlapping them cuts wall-clock on model-bound stages without changing call count,
 * payloads, per-item failure semantics, or output order (results indexed by input
 * position; first-by-index error wins). `limit` 1 degenerates to sequential execution
 * (determinism escape hatch). Default ceiling comes from FARLAB_STAGE_CONCURRENCY
 * (floor 1) — 3 overlaps provider politeness (transport 429 backoff stays the guard).
 */
export const STAGE_CONCURRENCY = Math.max(1, Number(process.env.FARLAB_STAGE_CONCURRENCY ?? 3) || 3);

export async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  const errors: Array<{ index: number; error: unknown }> = [];
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (errors.length > 0) return; // stop launching; in-flight work settles
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (error) {
        errors.push({ index: i, error });
        return;
      }
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  if (errors.length > 0) {
    errors.sort((a, b) => a.index - b.index);
    throw errors[0]!.error;
  }
  return results;
}
