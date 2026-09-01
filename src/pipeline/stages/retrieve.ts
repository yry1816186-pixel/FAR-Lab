import { z } from 'zod';
import { CorpusSnapshot, SourceDocument, newId } from '../../domain/index.js';
import type { RetrievalQuery, SourceFamily } from '../../domain/source.js';
import { canonicalJson } from '../../shared/crypto.js';
import type { RawSourceRecord } from '../../shared/ports.js';
import { cachedSearch, cachedValue, ReplayCacheMissError } from '../../sources/response-cache.js';
import { shingle, minhashSignature, jaccardFromSignatures, type MinhashConfig } from '../../domain/minhash.js';

const MINHASH_CFG: MinhashConfig = { numPerm: 128 };
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash, excludeVolatile } from '../../sources/snapshot.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { assertNotCancelled, mapBounded, STAGE_CONCURRENCY } from './shared.js';
import { contentTokens } from './evidence.js';
import { isCancellationError, throwIfCancelled } from './guard.js';
import {
  CHASE_CITING_PER_SEED,
  CHASE_HOP2_REFERENCES_PER_SEED,
  CHASE_MAX_NEW,
  CHASE_REFERENCES_PER_SEED,
  isChaseAbortError,
  planCitationChase,
  planHop2Seed,
} from '../citation-chase.js';
import { retractionInfo } from '../../sources/retraction.js';
import { classifyRetractionReasons, type RetractionWatchTable } from '../../sources/retraction-watch.js';
import { diversitySnapshot, diversitySummaryLine, saturationMetrics } from '../retrieval-metrics.js';

/** Hard corpus cap (contract): excess documents are truncated, visibly noted in the summary. */
export const MAX_DOCUMENTS = 12;
/** D-015: per-search result limit — every PLANNED query executes, so the pool is multi-list. */
const SEARCH_LIMIT = 6;
/** Reciprocal Rank Fusion constant (SIGIR 2009 standard k=60). */
const RRF_K = 60;
/**
 * Max pool entries eligible for the LLM listwise rerank (W6/F4 RankGPT sliding
 * window): pools up to 48 rerank in bottom-up windows of 24 (step 12); pools
 * above 48 keep the deterministic RRF order for entries beyond the window pool.
 */
const RERANK_POOL = 48;
/** One listwise window (RankGPT window=20 analog, sized for our abstract excerpts). */
const RERANK_WINDOW = 24;
/** D-015: minimum corpus seats reserved for counter-evidence-origin documents when the cap bites. */
export const COUNTER_MIN_SEATS = 4;

const QueryPlan = z.object({
  discovery: z.array(z.string().min(1)).length(2),
  supporting: z.array(z.string().min(1)).min(1).max(2),
  /**
   * R-05 (forced counter-evidence search): min(2) makes a zero- or single-counter-query
   * plan a schema failure, so the stage fails loudly instead of silently running a
   * counter-evidence-blind (or token) retrieval. W5/S1: BOTH planned counter queries
   * are executed — one per source family — so counter search is structural, not
   * decorative (the old code executed only counter[0] and dropped the second).
   */
  counter: z.array(z.string().min(1)).min(2).max(2),
});
type QueryPlan = z.infer<typeof QueryPlan>;

/**
 * Counter-evidence orientation screen (substring, case-insensitive). At least
 * one counter query must contain explicit counter-evidence vocabulary —
 * limitation / failed replication / contradiction / negative result / critique.
 * Exported since Wave-6: eval/retrieval-baseline.mjs replays THIS exact gate
 * over historical plans (no drift-prone copy).
 */
export const COUNTER_TERM_RE = new RegExp(
  [
    'limitation', 'limit(ed)?', 'fail(ed|ure)?', 'negative', 'null', 'replicat', 'contradict',
    'disput', 'inconsisten', 'critique', 'criticis', 'challeng', 'rebut', 'controvers', 'retract',
    'invalid', 'irreproduc', 'unreproduc', 'overstat', 'refut', 'caveat', 'shortcom', 'no[ -]?effect',
    'cannot', 'problem', 'concern', 'weakness', 'bias',
  ].join('|'),
  'i',
);

const SYSTEM_PROMPT = `You plan the evidence retrieval for one scientific research question.
Return ONE JSON object with exactly these fields:
- "discovery": exactly 2 English scholarly search queries that map the field broadly,
- "supporting": 1 or 2 English queries aimed at direct evidence about the question's expected relationship,
- "counter": exactly 2 DIFFERENT English queries aimed at COUNTER-EVIDENCE: limitations, failed replications, contradictory findings, negative results, or methodological critiques. Cover two distinct counter-evidence angles (e.g. one on failed/negative results, one on methodological critiques or limitations).
Rules:
- All queries in English, written as plain keyword phrases for academic search engines (no boolean operators, no quotes).
- Ground every query in the question's topic; never invent specific papers, authors, journals or results.
- Counter queries MUST carry explicit counter-evidence vocabulary (e.g. "failed replication", "limitations", "contradictory findings", "negative result").
- Anchor EVERY counter query in the question's specific topic and expected relationship: it must reuse the question's own key entities/terms. A generic drift like "limitations of pharmacological interventions" for a CRISPR off-target question is INVALID — retrieved counter-evidence must be about THIS question's subject.`;

/** D-015 rerank output: a permutation of the input indices with graded relevance. */
const RerankEntry = z.object({
  index: z.number().int().min(0),
  relevance: z.enum(['high', 'medium', 'low']),
  reason: z.string().min(8),
});
const RerankOut = z.object({ ranked: z.array(RerankEntry).min(1) });
type RerankOut = z.infer<typeof RerankOut>;

const RERANK_SYSTEM_PROMPT = `You are reranking scholarly documents for one scientific research question.
Rank EVERY candidate by its EVIDENTIAL VALUE for the question: a document is valuable if it can
support, inform, CONTRADICT, or delimit an answer — counter-evidence documents (failed replications,
negative results, methodological critiques) are as valuable as supporting ones.
Ignore writing style, verbosity, confidence tone, and publication prestige. Never invent documents.
Return ONE JSON object: { "ranked": [ { "index": <candidate index>, "relevance": "high"|"medium"|"low",
"reason": "<at least 8 chars> }, ... ] } listing EVERY candidate index exactly once, best first.`;

interface SearchTarget {
  purpose: RetrievalQuery['purpose'];
  text: string;
  family: SourceFamily;
}

/**
 * W5/S1: every planned counter query is executed (schema guarantees exactly 2) —
 * counter[0] on OpenAlex, counter[1] on arXiv. Returning fewer than 2 is a schema
 * violation, but the extraction stays total for TypeScript's noUncheckedIndexedAccess.
 */
const counterQueries = (queries: readonly string[]): readonly [string, string] => {
  const [a, b] = queries;
  if (a === undefined || a.trim().length === 0 || b === undefined || b.trim().length === 0) {
    throw new Error(
      `retrieve: expected 2 usable counter queries in the plan, got ${JSON.stringify(queries)} — refusing to run a one-sided counter-evidence search`,
    );
  }
  return [a, b];
};

// ---------------------------------------------------------------------------
// W-G/F-A anchored counter queries (CounterRefine-pattern, answer-conditioned
// expansion adapted to our pre-hypothesis retrieve stage): the measured failure
// mode behind counter-evidence-substantive-hit 0.143 is EMPTY misses (5/7 — the
// judge reads "unrelated") because counter queries carry counter vocabulary but
// drift off the question's topic entities. Deterministic repair: a counter query
// whose content-token containment in the question falls under the floor gets the
// question's UNCOVERED anchor tokens appended — the query keeps its counter
// vocabulary and GAINS the topic anchor, so retrieved documents cannot be
// topically unrelated by construction. Pure function; no LLM call.
// ---------------------------------------------------------------------------
/** Containment floor: |queryTokens ∩ anchorTokens| / |anchorTokens|. */
export const COUNTER_ANCHOR_MIN = 0.3;
/** Max anchor tokens appended to a drifting query (keeps queries engine-friendly). */
export const COUNTER_ANCHOR_APPEND_MAX = 4;

export const anchorContainment = (query: string, anchorText: string): number => {
  const anchor = contentTokens(anchorText);
  if (anchor.size === 0) return 1; // nothing to anchor against — vacuously anchored
  const q = contentTokens(query);
  let shared = 0;
  for (const t of anchor) if (q.has(t)) shared += 1;
  return shared / anchor.size;
};

export const anchorCounterQueries = (
  counter: readonly [string, string],
  anchorText: string,
): readonly [string, string] => {
  const anchor = contentTokens(anchorText);
  const repair = (q: string): string => {
    if (anchor.size === 0 || anchorContainment(q, anchorText) >= COUNTER_ANCHOR_MIN) return q;
    // First-appearance order (Set insertion order) keeps the repair deterministic.
    const missing = [...anchor].filter((t) => !q.toLowerCase().includes(t)).slice(0, COUNTER_ANCHOR_APPEND_MAX);
    return missing.length === 0 ? q : `${q} ${missing.join(' ')}`;
  };
  return [repair(counter[0]), repair(counter[1])];
};

/**
 * D-015: build one search per (planned query x family). ALL planned discovery and
 * supporting queries execute now — the old code silently dropped discovery[1] and
 * supporting[1]. Counter targets stay FIRST: the quota selector (not search order)
 * now protects counter-evidence seats, but running them first also keeps the
 * R-05 ordering guarantee intact for receipts.
 * Crossref joins discovery/supporting as the third family (2026-08-22, D-029b):
 * OpenAlex keyless now has a hard daily budget ("Insufficient budget … Resets at
 * midnight UTC", live-observed) and arXiv covers ML/physics only — Crossref
 * (keyless, stable) restores genuine source redundancy, especially for biomed.
 *
 * W6/F1 (2026-08-22): counter[1] reroutes arxiv→crossref. Measured on 46 runs:
 * arXiv returned zero results for 82.3% of executed searches (AND-intersection
 * emptiness on 8-12-term keyword phrases) while crossref returned zero for 0%
 * (68/68 historical counter queries replayed live: mean 6.0 results) — the old
 * routing left counter-evidence effectively single-sourced on OpenAlex and the
 * D-029b crossref redundancy never covered counter queries. arXiv still serves
 * discovery/supporting (with the W6/F2 cascade below recovering its zeros).
 */
const buildTargets = (plan: QueryPlan, anchorText: string): readonly SearchTarget[] => {
  const [counterOpenalex, counterCrossref] = anchorCounterQueries(counterQueries(plan.counter), anchorText);
  // Three counter lists: openalex + europepmc carry abstracts (claim-capable
  // counter-evidence); crossref adds DOI-breadth. Observed failure behind the
  // 2026-08-22 vitamin-D run: with openalex budget-exhausted, the only abstract
  // source for counter queries was gone — 1/15 relations were counter-directional.
  const targets: SearchTarget[] = [
    { purpose: 'counter_evidence', text: counterOpenalex, family: 'openalex' },
    { purpose: 'counter_evidence', text: counterOpenalex, family: 'europepmc' },
    { purpose: 'counter_evidence', text: counterCrossref, family: 'crossref' },
  ];
  for (const q of plan.discovery) {
    targets.push({ purpose: 'discovery', text: q, family: 'openalex' });
    targets.push({ purpose: 'discovery', text: q, family: 'arxiv' });
    targets.push({ purpose: 'discovery', text: q, family: 'crossref' });
  }
  for (const q of plan.supporting) {
    targets.push({ purpose: 'supporting', text: q, family: 'openalex' });
    targets.push({ purpose: 'supporting', text: q, family: 'arxiv' });
    targets.push({ purpose: 'supporting', text: q, family: 'crossref' });
  }
  return targets;
};

/** R-05 enforcement: schema guarantees >=1 counter query; this guarantees orientation. */
const enforceCounterEvidence = (plan: QueryPlan): void => {
  if (!plan.counter.some((q) => COUNTER_TERM_RE.test(q))) {
    throw new Error(
      `retrieve/R-05: no counter-evidence-facing query in plan.counter=${JSON.stringify(plan.counter)} — ` +
        'refusing to run a counter-evidence-blind search (limitation/failed replication/contradiction/negative-result vocabulary required)',
    );
  }
};

/** Cross-query dedup key: DOI first (case-insensitive), then arXiv id, then first identifier. */
const primaryKey = (rec: RawSourceRecord): string | null => {
  const id =
    rec.identifiers.find((i) => i.kind === 'doi') ??
    rec.identifiers.find((i) => i.kind === 'arxiv') ??
    rec.identifiers[0];
  if (!id) return null;
  return `${id.kind}:${id.kind === 'doi' ? id.value.toLowerCase() : id.value}`;
};

/**
 * Cross-source fuzzy merge key (ASySD-style blocking, deterministic, zero deps):
 * the same work can surface from one family with a DOI and from another with
 * only a native id — identifier dedup misses it and the pool double-counts
 * evidence. Normalized title + publication year merges those. Short titles
 * (below the floor) never fuzzy-merge: they collide across genuinely different
 * works. Fuzzy merge never OVERRIDES a primary-key match; it only catches the
 * identifier-less duplicate of an already-pooled work.
 */
const FUZZY_MIN_TITLE_LEN = 20;

// RU-10 fix (zh blind spot): CJK titles normalized to EMPTY under [^a-z0-9] —
// Chinese documents could never fuzzy-merge. Han-script runs are kept.
export const normalizeTitle = (t: string): string =>
  t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9一-鿿]+/g, ' ').trim().replace(/\s+/g, ' ');

const fuzzyTitleKey = (rec: RawSourceRecord): string | null => {
  const norm = normalizeTitle(rec.title);
  if (norm.length < FUZZY_MIN_TITLE_LEN) return null;
  return `fz:${norm}|${rec.publicationYear ?? ''}`;
};

/** One unique document in the pre-selection pool, with its multi-list provenance. */
export interface PoolEntry {
  readonly key: string;
  readonly record: RawSourceRecord;
  readonly family: SourceFamily;
  readonly firstSeen: number;
  readonly purposes: Set<RetrievalQuery['purpose']>;
  ranks: { target: number; rank: number }[];
}

const isCounterOrigin = (e: PoolEntry): boolean => e.purposes.has('counter_evidence');

/** Reciprocal Rank Fusion score over every list that returned the document (k=60). */
export const rrfScore = (e: PoolEntry): number =>
  e.ranks.reduce((sum, r) => sum + 1 / (RRF_K + r.rank + 1), 0);

/**
 * Deterministic fused order: RRF score desc, then total list appearances desc, then
 * counter-origin first, then first-seen target asc, then key asc. No ties unresolved.
 */
export const fusedOrder = (pool: readonly PoolEntry[]): PoolEntry[] =>
  [...pool].sort((a, b) => {
    const sa = rrfScore(a);
    const sb = rrfScore(b);
    if (sa !== sb) return sb - sa;
    if (a.ranks.length !== b.ranks.length) return b.ranks.length - a.ranks.length;
    const ca = isCounterOrigin(a) ? 1 : 0;
    const cb = isCounterOrigin(b) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

/**
 * Cap selection with the counter-evidence quota floor: at most `cap` documents, of
 * which at least min(counterMin, available) are counter-origin. Swapped-in counter
 * documents displace the lowest-ranked non-counter selections; the surviving set
 * keeps the incoming (rerank-or-RRF) relative order. Pure and deterministic.
 */
export const selectFinal = (
  ordered: readonly PoolEntry[],
  cap: number,
  counterMin: number,
): PoolEntry[] => {
  if (ordered.length <= cap) return [...ordered];
  const floor = Math.min(counterMin, ordered.filter(isCounterOrigin).length);
  const selected = ordered.slice(0, cap);
  const counterSeats = () => selected.filter(isCounterOrigin).length;
  for (let guard = 0; guard < cap && counterSeats() < floor; guard++) {
    const outIdx = [...selected.keys()].reverse().find((i) => !isCounterOrigin(selected[i]!));
    if (outIdx === undefined) break; // selection already all counter-origin
    const inEntry = ordered.find((e) => isCounterOrigin(e) && !selected.includes(e));
    if (inEntry === undefined) break; // no counter-origin document left to add
    selected[outIdx] = inEntry;
  }
  const pos = new Map(ordered.map((e, i) => [e.key, i] as const));
  return selected.sort((a, b) => definedPos(pos, a.key) - definedPos(pos, b.key));
};

const definedPos = (pos: Map<string, number>, key: string): number => {
  const p = pos.get(key);
  if (p === undefined) throw new Error(`retrieve: pool key ${key} missing from order map`);
  return p;
};

/**
 * Validate the model's rerank permutation: every input index exactly once.
 * Returns the ordered entries; throws on any incompleteness (caller falls back).
 */
const applyRerank = (out: RerankOut, candidates: readonly PoolEntry[]): PoolEntry[] => {
  const valid = out.ranked.filter((r) => r.index >= 0 && r.index < candidates.length);
  const seen = new Set<number>();
  for (const r of valid) {
    if (seen.has(r.index)) throw new Error(`duplicate rerank index ${r.index}`);
    seen.add(r.index);
  }
  for (let i = 0; i < candidates.length; i++) {
    if (!seen.has(i)) throw new Error(`rerank permutation incomplete: missing index ${i} of ${candidates.length}`);
  }
  return valid.map((r) => candidates[r.index]!);
};

/**
 * W6/F4 (RankGPT EXTRACT, rank_gpt.py:234-244): bottom-up sliding-window plan for
 * pools larger than one window. Window size w, step s (s = w/2 keeps RankGPT's
 * overlap-ratio). Windows are generated from the BOTTOM ([n-w, n)) upward in steps
 * of s to [0, w), and processed in that order — the head window runs LAST so the
 * entries a lower window floated up get re-judged with maximal context (upstream
 * chaining behavior). n <= w collapses to one full window. Upstream's edge bug
 * (w > n silently skips reranking) is structurally impossible here.
 */
/**
 * RU-9 GO1b cache-aware layout: the rerank payload renders a STABLE PREFIX
 * (questionText — identical across every window) followed by the VARIABLE TAIL
 * (the window's candidates, list order, insertion-stable keys). Consecutive
 * bottom-up windows share their leading items, so provider prefix caches can
 * reuse the question + shared-item span. Pure + deterministic: the same slice
 * always renders byte-identically (snapshot-locked in tests/cache-layout).
 */
export const renderRerankPayload = (questionText: string, slice: readonly PoolEntry[]): Record<string, unknown> => ({
  questionText,
  candidates: slice.map((e, i) => ({
    index: i,
    title: e.record.title,
    ...(e.record.publicationYear !== undefined ? { year: e.record.publicationYear } : {}),
    ...(e.record.venue !== undefined ? { venue: e.record.venue } : {}),
    ...(e.record.publicationType !== undefined ? { publicationType: e.record.publicationType } : {}),
    abstractExcerpt: (e.record.abstractText ?? '').slice(0, 450),
    originatingPurposes: [...e.purposes],
  })),
});

export const rerankWindowPlan = (n: number, w: number, s: number): readonly [number, number][] => {
  if (n <= w) return [[0, n]];
  const windows: [number, number][] = [];
  for (let start = n - w; start > 0; start -= s) windows.push([start, start + w]);
  windows.push([0, w]);
  return windows;
};

/**
 * W6/F4 windowed rerank core (pure apart from rerankOne): applies each window's
 * validated permutation onto `working` in bottom-up order. INVARIANTS (unit-
 * pinned per W6 audit P2-4): the result is a permutation of the input (every
 * entry exactly once, same multiset), and any rerankOne failure propagates so
 * the caller falls back to the deterministic RRF order — partial window results
 * are discarded, never half-spliced.
 */
export const applyWindowedRerank = async (
  working: readonly PoolEntry[],
  windows: readonly (readonly [number, number])[],
  rerankOne: (slice: readonly PoolEntry[]) => Promise<PoolEntry[]>,
): Promise<PoolEntry[]> => {
  const out = [...working];
  for (const [start, end] of windows) {
    const slice = out.slice(start, end);
    const permuted = await rerankOne(slice);
    if (permuted.length !== slice.length) {
      throw new Error(`rerank window [${start},${end}) returned ${permuted.length} of ${slice.length} entries`);
    }
    out.splice(start, end - start, ...permuted);
  }
  return out;
};

/**
 * RawSourceRecord -> SourceDocument. The normalized payload is ALWAYS archived
 * content-addressed; the artifact is stored over canonicalJson, the same basis
 * as snapshotHash, so the artifact hash equals contentHash. fullTextRef is only
 * set for full_text-depth records (the deepest content the record carries).
 * Narrow ctx contract: only run identity + artifact store are consumed, so
 * non-stage callers (server counter-search) can supply exactly that.
 */
export const toDocument = async (
  ctx: Pick<StageContext, 'run' | 'artifacts'>,
  family: SourceFamily,
  rec: RawSourceRecord,
  rwTable?: RetractionWatchTable,
): Promise<SourceDocument> => {
  const contentHash = snapshotHash(family, rec);
  const retraction = retractionInfo(rec, rwTable);
  // Store the artifact over the SAME volatile-excluded canonical payload that contentHash
  // addresses, so a third party can retrieve the snapshot by the bundle's declared hash.
  const artifact = await ctx.artifacts.put(canonicalJson(excludeVolatile(family, rec.normalized)));
  return SourceDocument.parse({
    id: newId('src'),
    runId: ctx.run.id,
    family,
    identifiers: rec.identifiers,
    title: rec.title,
    ...(rec.publicationYear !== undefined ? { publicationYear: rec.publicationYear } : {}),
    authors: rec.authors,
    ...(rec.venue !== undefined ? { venue: rec.venue } : {}),
    contentDepth: rec.contentDepth,
    accessState: rec.accessState,
    contentHash,
    retrievedAt: new Date().toISOString(),
    parseStatus: rec.abstractText !== undefined && rec.abstractText.length > 0 ? 'ok' : 'partial',
    ...(rec.abstractText !== undefined ? { abstractText: rec.abstractText } : {}),
    ...(rec.contentDepth === 'full_text' ? { fullTextRef: artifact.ref } : {}),
    ...(rec.license !== undefined ? { license: rec.license } : {}),
    ...(rec.oaUrl !== undefined ? { oaUrl: rec.oaUrl } : {}),
    ...(rec.publicationType !== undefined ? { publicationType: rec.publicationType } : {}),
    // Best-effort search-time hint (RU-R GO2); resolve-time verification stays authoritative.
    ...(retraction !== undefined ? { retractionStatus: retraction.status } : {}),
    // RU-R frontier candidate 2: Retraction Watch reasons + honest reading ride
    // the hint tier (present only when the offline table produced the status).
    ...(retraction?.reasons !== undefined && retraction.reasons.length > 0
      ? { retractionReasons: [...retraction.reasons], retractionClass: classifyRetractionReasons(retraction.reasons) }
      : {}),
  });
};

/**
 * W6/F2: deterministic arXiv zero-result recovery variants. arXiv's `all:t AND …`
 * engine returns empty for most 8-12-term keyword phrases (82.3% of historical
 * searches; AND-intersection emptiness — NOT a syntax defect). Live probe
 * (spikes/output/arxiv-truncate-probe.json, 30 historical zero queries):
 * first-6-terms 100% zero, first-4 53.3% zero (mean 1.4), first-2 6.7% zero
 * (mean 5.0). Cascade keeps the full query first (proven matches stay
 * maximally specific), then k4 (specific recovery), then k2 (near-total
 * fallback; drift bounded by single-list RRF contribution + rerank + cap).
 * Same mechanism family as open-deep-research legacy/utils.py:1274-1283
 * (deterministic query mutation on empty results) and node-DeepResearch's
 * 2-5-word query discipline (schemas.ts:198).
 */
export const arxivRecoveryVariants = (query: string): readonly string[] => {
  const terms = query.trim().split(/\s+/);
  const candidates = [terms.slice(0, 4).join(' '), terms.slice(0, 2).join(' ')];
  const variants: string[] = [];
  for (const c of candidates) {
    if (c !== query.trim() && c.length > 0 && !variants.includes(c)) variants.push(c);
  }
  return variants;
};

export const retrieveStage: StageHandler = {
  stage: 'retrieve',

  /** Idempotent skip: a run keeps its first corpus snapshot. */
  async applicable(ctx) {
    return ctx.store.listObjects('corpus_snapshot', ctx.run.id).length === 0;
  },

  async execute(ctx: StageContext): Promise<StageOutcome> {
    throwIfCancelled(ctx);
    const question = ctx.store.getObject('question', ctx.run.questionId);
    if (!question) {
      throw new Error(`retrieve: question ${ctx.run.questionId} not found in store`);
    }

    const planRes = await callStructured<QueryPlan>(ctx, {
      stage: 'retrieve',
      purpose: 'query-planning',
      systemPrompt: SYSTEM_PROMPT,
      payload: {
        questionText: question.text,
        scope: question.scope,
        goalType: question.goalType,
      },
      schema: QueryPlan,
      temperature: 0.2,
    });
    const plan = planRes.data;
    enforceCounterEvidence(plan);
    const targets = buildTargets(plan, `${question.text} ${question.background}`);

    const executedQueries: RetrievalQuery[] = [];
    const failuresByFamily = new Map<SourceFamily, string[]>();
    const pool = new Map<string, PoolEntry>();
    /** fz-key -> pooled entry: lets an identifier-less duplicate find the titled work it repeats. */
    const fuzzyIndex = new Map<string, PoolEntry>();
    let attempted = 0;
    let succeeded = 0;
    let duplicates = 0;
    let fuzzyMerges = 0;
    let minhashMerges = 0;
    let droppedNoIdentifier = 0;
    let variantSearches = 0;
    let failoverSearches = 0;
    /** Per record-bearing search: share of records NEW to the pool at flush time (saturation input). */
    const noveltyRates: number[] = [];

    type PendingReceipt = Parameters<StageContext['recordReceipt']>[0];

    /** Records one search yields (returned, NOT recorded — the ordered flush owns writes). */
    interface SearchYield {
      count: number;
      family: SourceFamily;
      receipt: PendingReceipt;
      records: Array<{ rank: number; record: RawSourceRecord }>;
    }

    /**
     * Execute one search (planned or recovery variant): NETWORK IO ONLY. Receipts and
     * pool mutations are returned as data and applied in target order by the flush
     * phase, so bounded-concurrency execution cannot reorder the audit trail.
     */
    const runSearch = async (
      t: SearchTarget,
      queryText: string,
      isVariant: boolean,
    ): Promise<SearchYield> => {
      // Structured cancellation checkpoint: a user cancel (or lease loss) must
      // stop the search loop here, not after the remaining planned queries,
      // variants, and the citation chase have all spent their round trips.
      assertNotCancelled(ctx, 'retrieve');
      const redactionNote = isVariant
        ? 'arxiv recovery variant search; query text and per-record content hashes retained; payloads archived content-addressed'
        : 'query text and per-record content hashes retained; payloads archived content-addressed';
      // RU-10 GO1 read-through cache: fresh hits skip the HTTP round entirely;
      // stale-on-source-error serves the expired entry with an honest receipt flag.
      let res;
      let cacheState: 'miss' | 'hit' | 'stale' | 'replay' = 'miss';
      if (ctx.responseCache !== undefined) {
        const wrapped = await cachedSearch(ctx.responseCache, t.family, queryText, SEARCH_LIMIT, Date.now(),
          () => ctx.sourceFor(t.family).search(queryText, { limit: SEARCH_LIMIT }),
          { onErrorStale: (e) => isSourceAdapterError(e) && /429|rate|budget/i.test(e instanceof Error ? e.message : String(e)) },
        );
        res = wrapped.result;
        cacheState = wrapped.replay ? 'replay' : wrapped.stale ? 'stale' : 'hit';
      } else {
        res = await ctx.sourceFor(t.family).search(queryText, { limit: SEARCH_LIMIT });
      }
      return {
        count: res.records.length,
        family: t.family,
        receipt: {
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'retrieve',
          redactionNote,
          sourceRetrieval: {
            family: t.family,
            query: queryText,
            httpStatus: res.httpStatus,
            ...(cacheState !== 'miss' ? { cache: cacheState } : {}),
            resultCount: res.records.length,
            contentHashes: res.records.map((r) => snapshotHash(t.family, r)),
          },
        },
        records: res.records.map((record, rank) => ({ rank, record })),
      };
    };

    /** Receipt a FAILED search attempt — attempts are provenance facts (W6 audit P3-1). */
    const failedReceipt = (
      family: SourceFamily,
      queryText: string,
      e: unknown,
      variant: boolean,
    ): PendingReceipt => ({
      kind: 'source_retrieval',
      executionMode: 'live',
      stage: 'retrieve',
      redactionNote: variant
        ? 'arxiv recovery variant search; query text and per-record content hashes retained; payloads archived content-addressed'
        : family === 'europepmc'
          ? 'failover search after openalex failure; query text retained; no records'
          : 'query text and per-record content hashes retained; payloads archived content-addressed',
      sourceRetrieval: {
        family,
        query: queryText,
        httpStatus: isSourceAdapterError(e) ? e.httpStatus : 0,
        resultCount: 0,
        contentHashes: [],
      },
    });

    /** One target's full fallback chain, executed as ONE parallelizable unit. */
    interface TargetOutcome {
      /** Receipts in execution order within this target. */
      receipts: PendingReceipt[];
      /** Successful searches whose records pool at flush time (in order). */
      yields: SearchYield[];
      familyFailure?: { family: SourceFamily; message: string };
      /** europepmc failover succeeded: the extra executed query + recovered count. */
      failover?: { query: RetrievalQuery; recovered: number };
      notes: string[];
      /** Cancellation observed mid-chain: flush what completed, then abort the stage. */
      cancelledMidChain?: boolean;
      /** Replay-mode cache miss on this target's main search (explicit-failure input). */
      replayMiss?: boolean;
    }

    const runTarget = async (
      t: SearchTarget,
    ): Promise<TargetOutcome> => {
      const out: TargetOutcome = { receipts: [], yields: [], notes: [] };
      try {
        const main = await runSearch(t, t.text, false);
        out.receipts.push(main.receipt);
        out.yields.push(main);
        // W6/F2: arXiv AND-emptiness recovery — only when the FULL query came
        // back empty; each variant is its own receipted search and an extra RRF
        // list (a recovered doc ranks via the variant list it came from).
        if (t.family === 'arxiv' && main.count === 0) {
          for (const variant of arxivRecoveryVariants(t.text)) {
            try {
              variantSearches += 1; // synchronous counter, single-threaded event loop
              const v = await runSearch(t, variant, true);
              out.receipts.push(v.receipt);
              out.yields.push(v);
              if (v.count > 0) break; // first recovering variant wins
            } catch (e) {
              if (isCancellationError(e)) { out.cancelledMidChain = true; return out; }
              // A failed variant attempt is receipted and the cascade CONTINUES to
              // the next variant — one transient error must not kill recovery (P3-1).
              out.receipts.push(failedReceipt(t.family, variant, e, true));
              out.notes.push(`retrieve: arxiv recovery variant failed for "${t.text}" -> "${variant}": ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
        return out;
      } catch (e) {
        // Cancellation aborts the stage FIRST — a cancel mid-cascade must never
        // be bookkept as a family failure nor write a contradicting 0-result
        // receipt for a query that already succeeded (W6 audit P2-2).
        if (isCancellationError(e)) { out.cancelledMidChain = true; return out; }
        // Cache-exclusive replay: a miss on a PLANNED search is an explicit
        // failure of the replay claim — no live fallback, no failover (every
        // family serves the same cache). The stage-level guard below refuses
        // the whole replay when any planned search is missing.
        if (e instanceof ReplayCacheMissError) {
          out.replayMiss = true;
          out.familyFailure = { family: t.family, message: `${t.purpose}: ${e.message}` };
          out.receipts.push(failedReceipt(t.family, t.text, e, false));
          out.notes.push(`retrieve/replay: planned search missing from the response cache: "${t.text}" (${t.family})`);
          return out;
        }
        // Single-source failure stays visible (familyFailures + receipt) and the
        // stage continues; only total failure aborts (below).
        const msg = e instanceof Error ? e.message : String(e);
        out.familyFailure = { family: t.family, message: `${t.purpose}: ${msg}` };
        out.receipts.push(failedReceipt(t.family, t.text, e, false));
        out.notes.push(`retrieve: source ${t.family} failed for ${t.purpose} query: ${msg}`);
        // W-A failover (observed mode: OpenAlex keyless daily-budget exhaustion on the
        // 2026-08-22 vitamin-D run): an openalex outage must not leave its queries
        // unsearched — exactly ONE bounded retry on the keyless abstract-bearing
        // europepmc family, receipted like any real search. No cascade, no retry loop.
        if (t.family === 'openalex') {
          try {
            const fo = await runSearch({ purpose: t.purpose, text: t.text, family: 'europepmc' }, t.text, false);
            out.receipts.push(fo.receipt);
            out.yields.push(fo);
            out.failover = { query: { purpose: t.purpose, text: t.text, family: 'europepmc' }, recovered: fo.count };
            out.notes.push(`retrieve: failover openalex->europepmc for ${t.purpose} query recovered ${fo.count} record(s)`);
          } catch (e2) {
            if (isCancellationError(e2)) { out.cancelledMidChain = true; return out; }
            out.receipts.push(failedReceipt('europepmc', t.text, e2, false));
            out.notes.push(`retrieve: failover openalex->europepmc failed for "${t.text}": ${e2 instanceof Error ? e2.message : String(e2)}`);
          }
        }
        return out;
      }
    };

    /**
     * Apply one search's records to the pool (deterministic: called in target order).
     * Returns the search's novelty outcome: how many records were NEW pool entries
     * vs already-known (merged) works — the input of the saturation observation.
     */
    const poolYield = (
      purpose: RetrievalQuery['purpose'],
      targetIdx: number,
      family: SourceFamily,
      records: Array<{ rank: number; record: RawSourceRecord }>,
    ): { added: number; records: number } => {
      let added = 0;
      for (const { rank, record } of records) {
        const key = primaryKey(record);
        if (key === null) {
          droppedNoIdentifier += 1;
          ctx.log(`retrieve: dropping record without identifiers: "${record.title}"`);
          continue;
        }
        const fz = fuzzyTitleKey(record);
        let existing = pool.get(key) ?? (fz !== null ? fuzzyIndex.get(fz) : undefined);
        if (existing === undefined) {
          // RU-10 GO2: minhash second-chance merge — catches near-duplicates the
          // identifier + title-blocking gates miss (paraphrased titles, CJK
          // variants). Pairwise over the bounded pool (≤62 entries — no LSH
          // banding needed); threshold 0.8 = high-precision merge, never merges
          // topically-similar-but-distinct papers.
          const recShingles = shingle(`${record.title} ${record.abstractText ?? ''}`);
          // Evidence floor: a 3-word title yields ONE 3-gram — identical short
          // titles collide across genuinely different works (the existing
          // short-title guard's premise), so minhash needs real text mass.
          const MINHASH_MIN_SHINGLES = 8;
          const sig = recShingles.size >= MINHASH_MIN_SHINGLES
            ? minhashSignature(recShingles, MINHASH_CFG)
            : null;
          for (const candidate of sig === null ? [] : pool.values()) {
            const candSig = minhashSignature(shingle(`${candidate.record.title} ${candidate.record.abstractText ?? ''}`), MINHASH_CFG);
            // Threshold 0.5 is CALIBRATED on measured separation (word-3-gram
            // shingles: near-verbatim republications 0.59-0.74; paraphrases 0.12;
            // distinct papers <0.1) — clean margin on both sides.
            if (sig !== null && jaccardFromSignatures(sig, candSig) >= 0.5) {
              existing = candidate;
              minhashMerges += 1;
              break;
            }
          }
        }
        if (existing) {
          if (existing.key === key) duplicates += 1;
          else if (existing !== pool.get(key)) {
            if (fz !== null && fuzzyIndex.get(fz) === existing) fuzzyMerges += 1;
          }
          existing.purposes.add(purpose);
          existing.ranks.push({ target: targetIdx, rank });
          continue;
        }
        const entry: PoolEntry = {
          key,
          record,
          family,
          firstSeen: targetIdx,
          purposes: new Set([purpose]),
          ranks: [{ target: targetIdx, rank }],
        };
        pool.set(key, entry);
        if (fz !== null && !fuzzyIndex.has(fz)) fuzzyIndex.set(fz, entry);
        added += 1;
      }
      return { added, records: records.length };
    };

    if (targets.length > 0) {
      // B3 milestone: the plan is real and its size is a REAL total — the
      // wait narrative can say "检索 14 项计划查询" and count them down.
      ctx.progress?.(0, targets.length, {
        reason: 'query_plan_ready',
        detail: { plannedQueries: targets.length, counterQueries: targets.filter((x) => x.purpose === 'counter_evidence').length },
      });
    }

    // Bounded overlap of the independent target chains (WP4/W8 lineage): network IO
    // runs concurrently; EVERY persisted effect (receipts, pool entries, executed
    // queries, family failures, progress, logs) is applied afterwards in TARGET order,
    // keeping the audit trail byte-identical to the sequential loop.
    const outcomes = await mapBounded(targets, STAGE_CONCURRENCY, (t) => runTarget(t));
    for (const [targetIdx, t] of targets.entries()) {
      const out = outcomes[targetIdx]!;
      executedQueries.push({ purpose: t.purpose, text: t.text, family: t.family });
      attempted += 1;
      for (const receipt of out.receipts) ctx.recordReceipt(receipt);
      for (const y of out.yields) {
        const novelty = poolYield(t.purpose, targetIdx, y.family, y.records);
        if (y.records.length > 0) noveltyRates.push(novelty.added / y.records.length);
      }
      // `succeeded` counts EXECUTED main queries (zero-result searches still executed —
      // arXiv emptiness is the recovery trigger, not a failure).
      if (out.familyFailure === undefined) succeeded += 1;
      if (out.familyFailure !== undefined) {
        const list = failuresByFamily.get(out.familyFailure.family) ?? [];
        list.push(out.familyFailure.message);
        failuresByFamily.set(out.familyFailure.family, list);
      }
      if (out.failover !== undefined) {
        failoverSearches += 1;
        executedQueries.push(out.failover.query);
      }
      for (const note of out.notes) ctx.log(note);
      ctx.progress?.(targetIdx + 1, targets.length);
      if (out.cancelledMidChain === true) throwIfCancelled(ctx); // cancellation point: prior targets fully flushed
    }

    // Cache-exclusive replay refuses PARTIAL replay: one missing planned search
    // means the corpus cannot reproduce the recorded run — fail explicitly
    // instead of silently producing a different corpus (frontier candidate 3).
    if (ctx.responseCache?.mode === 'replay') {
      const missed = targets.filter((_, i) => outcomes[i]?.replayMiss === true);
      if (missed.length > 0) {
        throw new Error(
          `retrieve/replay: ${missed.length} of ${targets.length} planned search(es) missing from the response cache — ` +
            `exact replay refused (missing: ${missed.map((t) => `${t.family}:"${t.text}"`).join('; ')})`,
        );
      }
    }

    // R1: user-provided seeds, loaded early so the empty-corpus guards below
    // know the researcher already supplied evidence — a corpus of seeds alone
    // is legitimate; the failure disclosure then lives in the summary.
    const userSeeds = ctx.store
      .listObjects('source_document', ctx.run.id)
      .filter((d) => d.family === 'user_provided');

    if (succeeded === 0 && userSeeds.length === 0) {
      const reason = [...failuresByFamily.entries()]
        .map(([family, msgs]) => `${family}: ${[...new Set(msgs)].join(' | ')}`)
        .join('; ');
      throw new Error(
        `retrieve: all ${attempted} source searches failed — refusing to fabricate an empty-success corpus (${reason})`,
      );
    }
    if (pool.size === 0 && userSeeds.length === 0) {
      throw new Error(
        `retrieve: all ${succeeded}/${attempted} searches succeeded but returned no identifiable documents — refusing to fabricate an empty corpus`,
      );
    }

    // ---- citation-graph expansion (bounded enrichment, RU-R GO1) ----
    // Keyword search cannot reach works only connected THROUGH the citation graph:
    // foundational method papers (backward references) and follow-ups/replications/
    // critiques (forward citations). Bounded: seeds capped, per-seed fetches capped,
    // whole chase stops at CHASE_MAX_NEW pool additions. Failures are visible
    // (fusion.citationChase.failure + receipts) and never block the corpus — this
    // is enrichment. Chase ops ride the same response cache as planned searches
    // (frontier candidate 3 prerequisite): repeat runs cost zero chase HTTP, and
    // cache-exclusive replay covers them; uncached contexts keep legacy behavior.
    interface ChaseOutcome {
      seeds: number;
      backward: number;
      forward: number;
      added: number;
      hop2?: { seed: string; added: number };
      failure?: string;
    }
    /**
     * Cached wrapper for one chase op (refs:/cites:/batch: keys hash into the
     * same source_response_cache table; limit 0 marks no-limit semantics).
     * Returns the cache receipt mark when a cache context served it.
     */
    const chaseCall = async <T>(
      callKey: string,
      live: () => Promise<T>,
    ): Promise<{ value: T; cache?: 'hit' | 'stale' | 'replay' }> => {
      if (ctx.responseCache === undefined) return { value: await live() };
      const wrapped = await cachedValue(ctx.responseCache, 'openalex', callKey, 0, Date.now(), live);
      return { value: wrapped.result, cache: wrapped.replay ? 'replay' : wrapped.stale ? 'stale' : 'hit' };
    };
    let chase: ChaseOutcome | undefined;
    let openalexCitations: import('../../shared/ports.js').CitationChaseAdapter | undefined;
    try {
      openalexCitations = ctx.sourceFor('openalex').citations;
    } catch {
      openalexCitations = undefined; // family not wired in this context — chase skipped honestly
    }
    if (openalexCitations !== undefined) {
      const seeds = planCitationChase(fusedOrder([...pool.values()]));
      if (seeds.length > 0) {
        const poolKeysBeforeChase = new Set(pool.keys());
        const outcome: ChaseOutcome = { seeds: seeds.length, backward: 0, forward: 0, added: 0 };
        let chaseListIdx = targets.length; // chase lists get their own RRF list indices
        chaseLoop: for (const seed of seeds) {
          if (outcome.added >= CHASE_MAX_NEW) break;
          // Same cancellation discipline as the planned searches: the chase
          // iterates one network round trip per seed and must honor a cancel.
          assertNotCancelled(ctx, 'retrieve');
          // Backward: seed's referenced works, first N in citation order, one batch resolve.
          // Every executed chase search is receipted (0 results included — attempts are
          // provenance facts, same P3-1 discipline as planned searches).
          try {
            const refsRes = await chaseCall(`refs:${seed.workRef}`, () => openalexCitations.referencedWorkIds(seed.workRef));
            const refIds = refsRes.value.slice(0, CHASE_REFERENCES_PER_SEED);
            let batchRes: { value: RawSourceRecord[]; cache?: 'hit' | 'stale' | 'replay' } = { value: [] };
            if (refIds.length > 0) {
              batchRes = await chaseCall(`batch:${refIds.join(',')}`, () => openalexCitations.worksByIds(refIds));
            }
            const records = batchRes.value;
            const refsCache = refsRes.cache ?? batchRes.cache;
            outcome.backward += records.length;
            executedQueries.push({ purpose: 'citation_chase', text: `refs:${seed.workRef}`, family: 'openalex' });
            // Success implies HTTP 200 by the adapter contract (non-200 throws).
            ctx.recordReceipt({
              kind: 'source_retrieval',
              executionMode: 'live',
              stage: 'retrieve',
              redactionNote: 'citation-chase backward refs: query ref, result count, content hashes',
              sourceRetrieval: {
                family: 'openalex',
                query: `refs:${seed.workRef}`,
                httpStatus: 200,
                ...(refsCache !== undefined ? { cache: refsCache } : {}),
                resultCount: records.length,
                contentHashes: records.map((r) => snapshotHash('openalex', r)),
              },
            });
            if (records.length > 0) {
              const idx = chaseListIdx++;
              const novelty = poolYield('citation_chase', idx, 'openalex', records.map((record, rank) => ({ rank, record })));
              outcome.added += novelty.added;
            }
          } catch (e) {
            if (isCancellationError(e)) throw e;
            if (e instanceof ReplayCacheMissError) {
              outcome.failure = `replay cache miss at ${seed.workRef} — chase additions of the recorded run are not replayable (pre-caching run or evicted entry)`;
              ctx.recordReceipt(failedReceipt('openalex', `refs:${seed.workRef}`, e, false)); // attempts are provenance facts
              ctx.log(`retrieve: citation chase ${outcome.failure}`);
              break chaseLoop;
            }
            if (isChaseAbortError(e)) {
              outcome.failure = `aborted at ${seed.workRef}: ${e instanceof Error ? e.message : String(e)}`;
              ctx.recordReceipt(failedReceipt('openalex', `refs:${seed.workRef}`, e, false)); // attempts are provenance facts
              ctx.log(`retrieve: citation chase ${outcome.failure}`);
              break chaseLoop;
            }
            ctx.recordReceipt(failedReceipt('openalex', `refs:${seed.workRef}`, e, false));
            ctx.log(`retrieve: citation chase backward failed for ${seed.workRef}: ${e instanceof Error ? e.message : String(e)}`);
          }
          if (outcome.added >= CHASE_MAX_NEW) break;
          // Forward: works citing the seed, most-cited first (deterministic sort).
          try {
            const citesRes = await chaseCall(`cites:${seed.workRef}`, () => openalexCitations.citingWorks(seed.workRef, CHASE_CITING_PER_SEED));
            const records = citesRes.value;
            outcome.forward += records.length;
            executedQueries.push({ purpose: 'citation_chase', text: `cites:${seed.workRef}`, family: 'openalex' });
            ctx.recordReceipt({
              kind: 'source_retrieval',
              executionMode: 'live',
              stage: 'retrieve',
              redactionNote: 'citation-chase forward cites: query ref, result count, content hashes',
              sourceRetrieval: {
                family: 'openalex',
                query: `cites:${seed.workRef}`,
                httpStatus: 200,
                ...(citesRes.cache !== undefined ? { cache: citesRes.cache } : {}),
                resultCount: records.length,
                contentHashes: records.map((r) => snapshotHash('openalex', r)),
              },
            });
            if (records.length > 0) {
              const idx = chaseListIdx++;
              const novelty = poolYield('citation_chase', idx, 'openalex', records.map((record, rank) => ({ rank, record })));
              outcome.added += novelty.added;
            }
          } catch (e) {
            if (isCancellationError(e)) throw e;
            if (e instanceof ReplayCacheMissError) {
              outcome.failure = `replay cache miss at ${seed.workRef} — chase additions of the recorded run are not replayable (pre-caching run or evicted entry)`;
              ctx.recordReceipt(failedReceipt('openalex', `cites:${seed.workRef}`, e, false));
              ctx.log(`retrieve: citation chase ${outcome.failure}`);
              break chaseLoop;
            }
            if (isChaseAbortError(e)) {
              outcome.failure = `aborted at ${seed.workRef}: ${e instanceof Error ? e.message : String(e)}`;
              ctx.recordReceipt(failedReceipt('openalex', `cites:${seed.workRef}`, e, false)); // attempts are provenance facts
              ctx.log(`retrieve: citation chase ${outcome.failure}`);
              break chaseLoop;
            }
            ctx.recordReceipt(failedReceipt('openalex', `cites:${seed.workRef}`, e, false));
            ctx.log(`retrieve: citation chase forward failed for ${seed.workRef}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        // ---- hop 2 (RU-R GO2): backward-only depth-2 chase off the first ----
        // hop-1-added entry — the methodology BEHIND the method paper. One seed,
        // <=2 refs, same receipt/abort discipline; only when budget remains.
        if (outcome.failure === undefined && outcome.added < CHASE_MAX_NEW) {
          const chaseAdded = [...pool.values()].filter((e) => !poolKeysBeforeChase.has(e.key));
          const hop2Seed = planHop2Seed(chaseAdded);
          if (hop2Seed !== null) {
            outcome.hop2 = { seed: hop2Seed.workRef, added: 0 };
            try {
              const refsRes = await chaseCall(`refs2:${hop2Seed.workRef}`, () => openalexCitations.referencedWorkIds(hop2Seed.workRef));
              const refIds = refsRes.value.slice(0, CHASE_HOP2_REFERENCES_PER_SEED);
              let batchRes: { value: RawSourceRecord[]; cache?: 'hit' | 'stale' | 'replay' } = { value: [] };
              if (refIds.length > 0) {
                batchRes = await chaseCall(`batch:${refIds.join(',')}`, () => openalexCitations.worksByIds(refIds));
              }
              const records = batchRes.value;
              const refs2Cache = refsRes.cache ?? batchRes.cache;
              outcome.backward += records.length;
              executedQueries.push({ purpose: 'citation_chase', text: `refs2:${hop2Seed.workRef}`, family: 'openalex' });
              ctx.recordReceipt({
                kind: 'source_retrieval',
                executionMode: 'live',
                stage: 'retrieve',
                redactionNote: 'citation-chase hop-2 backward refs: query ref, result count, content hashes',
                sourceRetrieval: {
                  family: 'openalex',
                  query: `refs2:${hop2Seed.workRef}`,
                  httpStatus: 200,
                  ...(refs2Cache !== undefined ? { cache: refs2Cache } : {}),
                  resultCount: records.length,
                  contentHashes: records.map((r) => snapshotHash('openalex', r)),
                },
              });
              if (records.length > 0) {
                const idx = chaseListIdx++;
                const novelty = poolYield('citation_chase', idx, 'openalex', records.map((record, rank) => ({ rank, record })));
                outcome.added += novelty.added;
                outcome.hop2.added += novelty.added;
              }
            } catch (e) {
              if (isCancellationError(e)) throw e;
              if (e instanceof ReplayCacheMissError) {
                outcome.failure = `replay cache miss at hop2 ${hop2Seed.workRef} — hop-2 addition of the recorded run is not replayable`;
                ctx.recordReceipt(failedReceipt('openalex', `refs2:${hop2Seed.workRef}`, e, false));
                ctx.log(`retrieve: citation chase ${outcome.failure}`);
              } else if (isChaseAbortError(e)) {
                outcome.failure = `aborted at hop2 ${hop2Seed.workRef}: ${e instanceof Error ? e.message : String(e)}`;
                ctx.recordReceipt(failedReceipt('openalex', `refs2:${hop2Seed.workRef}`, e, false)); // attempts are provenance facts
                ctx.log(`retrieve: citation chase ${outcome.failure}`);
              } else {
                ctx.recordReceipt(failedReceipt('openalex', `refs2:${hop2Seed.workRef}`, e, false));
                ctx.log(`retrieve: citation chase hop-2 failed for ${hop2Seed.workRef}: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
        }
        chase = outcome;
      }
    }

    // ---- D-015 fusion: deterministic RRF order, then (under cap pressure) LLM listwise rerank ----
    // W6/F4: pools above one window rerank via the RankGPT bottom-up sliding window
    // (w=24, s=12) — each window is a full permutation over its slice, renumbered
    // locally; a lower window's floated-up entries are re-judged by the next window.
    const fused = fusedOrder([...pool.values()]);
    let finalOrder: PoolEntry[] = fused;
    let rerankApplied = false;
    let rerankFailure: string | undefined;
    let rerankWindows: number | undefined;
    if (fused.length > MAX_DOCUMENTS) {
      const candidates = fused.slice(0, RERANK_POOL);
      const windows = rerankWindowPlan(candidates.length, RERANK_WINDOW, RERANK_WINDOW / 2);
      try {
        const working = await applyWindowedRerank(candidates, windows, async (slice) => {
          throwIfCancelled(ctx);
          const res = await callStructured<RerankOut>(ctx, {
            stage: 'retrieve',
            purpose: 'listwise-rerank',
            systemPrompt: RERANK_SYSTEM_PROMPT,
            payload: renderRerankPayload(question.text, slice),
            schema: RerankOut,
            temperature: 0.1,
          });
          return applyRerank(res.data, slice);
        });
        finalOrder = [...working, ...fused.slice(RERANK_POOL)];
        rerankApplied = true;
        if (windows.length > 1) rerankWindows = windows.length;
      } catch (e) {
        // Cancellation aborts the stage — never degrade a user cancel into
        // "rerank failed, corpus completed anyway" (W6 audit P1-1).
        if (isCancellationError(e)) throw e;
        // Fail-VISIBLE fallback: the corpus still builds on the deterministic RRF order;
        // the failure is recorded in the snapshot and summary, never silently dropped.
        rerankFailure = e instanceof Error ? e.message : String(e);
        ctx.log(`retrieve: listwise rerank failed — falling back to RRF order (${rerankFailure})`);
      }
    }

    // ---- RU-R GO2: retracted documents never COMPETE for cap seats ----
    // A retracted paper surfacing high in fusion must not displace valid evidence
    // from the cap; the demotion keeps visibility over silent drop (retracted
    // docs are appended only when the pool cannot otherwise fill the cap, and
    // the status persists on the document for downstream demotion). Corrected /
    // expression-of-concern / reinstated docs stay eligible — they remain citable.
    const rwTable: RetractionWatchTable | undefined = ctx.responseCache?.retractions;
    const retractedKeys = new Set(
      [...pool.values()].filter((e) => retractionInfo(e.record, rwTable)?.status === 'retracted').map((e) => e.key),
    );
    const rwRetracted = [...pool.values()].filter(
      (e) => retractionInfo(e.record, rwTable)?.basis === 'retraction_watch',
    ).length;
    const eligible = finalOrder.filter((e) => !retractedKeys.has(e.key));
    const retractedOrdered = finalOrder.filter((e) => retractedKeys.has(e.key));
    const selected = selectFinal(eligible, MAX_DOCUMENTS, COUNTER_MIN_SEATS);
    const fillCount = Math.max(0, MAX_DOCUMENTS - selected.length);
    const retractedKept = retractedOrdered.slice(0, fillCount);
    const retractedDemoted = retractedOrdered.length - retractedKept.length;
    if (retractedKept.length > 0) selected.push(...retractedKept);
    const counterSeatsKept = selected.filter(isCounterOrigin).length;
    const saturation = saturationMetrics(noveltyRates);
    const diversity = diversitySnapshot(
      selected.map((e) => ({
        family: e.family,
        ...(e.record.publicationYear !== undefined ? { publicationYear: e.record.publicationYear } : {}),
        ...(e.record.publicationType !== undefined ? { publicationType: e.record.publicationType } : {}),
      })),
    );

    const documents: SourceDocument[] = [];
    for (const entry of selected) documents.push(await toDocument(ctx, entry.family, entry.record, rwTable));

    // R1 entry upgrade: user-provided seeds (family 'user_provided', created at
    // run creation) join the corpus as GUARANTEED entries — they bypass the
    // search pool and the cap (the researcher chose them explicitly), deduped
    // against searched documents by primary identifier so a seeded paper the
    // search also found is not double-counted.
    const identifierKey = (ids: readonly { kind: string; value: string }[]): string => {
      const id = ids.find((i) => i.kind === 'doi') ?? ids.find((i) => i.kind === 'arxiv') ?? ids[0];
      return id === undefined ? '' : `${id.kind}:${id.kind === 'doi' ? id.value.toLowerCase() : id.value}`;
    };
    const searchedKeys = new Set(
      documents.flatMap((d) => d.identifiers.filter((i) => i.kind === 'doi' || i.kind === 'arxiv').map((i) => identifierKey([i]))),
    );
    const seeds = userSeeds.filter((d) => {
      const key = identifierKey(d.identifiers.filter((i) => i.kind === 'doi' || i.kind === 'arxiv'));
      return key === '' || !searchedKeys.has(key);
    });
    documents.push(...seeds);

    // RU-10 GO4: seeds persist into the researcher's cross-run library —
    // idempotent by content key; the run's corpus snapshot stays per-run.
    for (const s of seeds) {
      ctx.store.putCorpusItem({
        title: s.title,
        identifiers: s.identifiers,
        ...(s.abstractText !== undefined ? { text: s.abstractText } : {}),
        ...(s.publicationYear !== undefined ? { year: s.publicationYear } : {}),
        ...(s.authors !== undefined ? { authors: s.authors } : {}),
        firstSeenRun: ctx.run.id,
      });
    }

    for (const doc of documents) ctx.store.putObject('source_document', doc);
    const familyFailures = [...failuresByFamily.entries()].map(([family, msgs]) => ({
      family,
      reason: [...new Set(msgs)].join(' | '),
    }));
    const corpus = CorpusSnapshot.parse({
      id: newId('corp'),
      runId: ctx.run.id,
      queries: executedQueries,
      documentIds: documents.map((d) => d.id),
      createdAt: new Date().toISOString(),
      familyFailures,
      fusion: {
        algorithm: 'rrf-k60+llm-listwise-rerank-v1',
        poolSize: pool.size,
        rerankApplied,
        ...(rerankFailure !== undefined ? { rerankFailure } : {}),
        counterSeatsKept,
        ...(retractedDemoted > 0 ? { retractedDemoted } : {}),
        ...(variantSearches > 0 ? { variantSearches } : {}),
        ...(failoverSearches > 0 ? { failoverSearches } : {}),
        ...(rerankWindows !== undefined ? { rerankWindows } : {}),
        ...(chase !== undefined
          ? {
              citationChase: {
                seeds: chase.seeds,
                backward: chase.backward,
                forward: chase.forward,
                added: chase.added,
                ...(chase.hop2 !== undefined ? { hop2: chase.hop2 } : {}),
                ...(chase.failure !== undefined ? { failure: chase.failure } : {}),
              },
            }
          : {}),
        ...(saturation.searches > 0 ? { saturation } : {}),
        diversity,
        selection: `cap ${selected.length} of pool ${pool.size} (RRF${rerankApplied ? ' + listwise rerank' : rerankFailure !== undefined ? ' after failed rerank' : ''})`,
      },
    });
    ctx.store.putObject('corpus_snapshot', corpus);

    const parts = [
      `retrieved ${documents.length} documents from ${succeeded}/${attempted} searches over a ${pool.size}-document pool (queries: ${executedQueries.length})`,
      `fusion: ${corpus.fusion?.selection ?? 'n/a'}`,
      `counter-evidence seats kept: ${counterSeatsKept}${selected.length < fused.length ? ` of ${Math.min(COUNTER_MIN_SEATS, fused.filter(isCounterOrigin).length)} reserved` : ''}`,
    ];
    if (rerankFailure !== undefined) parts.push(`listwise rerank FAILED — deterministic RRF order used (${rerankFailure})`);
    if (retractedDemoted > 0) {
      parts.push(
        `${retractedDemoted} retracted document(s) demoted out of cap competition` +
          (rwRetracted > 0 ? ` (${rwRetracted} via offline Retraction Watch table)` : ''),
      );
    }
    if (variantSearches > 0) parts.push(`${variantSearches} arXiv recovery variant search(es) (zero-result cascade)`);
    if (chase !== undefined) {
      parts.push(
        `citation chase: ${chase.seeds} seed(s), backward ${chase.backward}, forward ${chase.forward}, +${chase.added} new pool doc(s)` +
          (chase.hop2 !== undefined ? `, hop-2 off ${chase.hop2.seed} +${chase.hop2.added}` : '') +
          (chase.failure !== undefined ? ` — ${chase.failure}` : ''),
      );
    }
    if (saturation.searches > 0) {
      parts.push(
        `search novelty mean=${saturation.meanNovelty} tail=${saturation.tailNovelty}` +
          (saturation.saturated ? ' (SATURATED — a later round must change strategy, not repeat queries)' : ''),
      );
    }
    parts.push(`corpus mix: ${diversitySummaryLine(diversity)}`);
    if (failoverSearches > 0) parts.push(`${failoverSearches} openalex->europepmc failover search(es)`);
    if (duplicates > 0) parts.push(`${duplicates} duplicate record(s) merged by identifier`);
    if (fuzzyMerges > 0) parts.push(`${fuzzyMerges} duplicate record(s) merged by normalized title+year (cross-source)`);
    if (minhashMerges > 0) parts.push(`${minhashMerges} near-duplicate record(s) merged by MinHash (paraphrased/CJK titles)`);
    if (droppedNoIdentifier > 0) parts.push(`${droppedNoIdentifier} record(s) without identifiers dropped`);
    if (selected.length < fused.length) parts.push(`truncated at cap ${MAX_DOCUMENTS}`);
    if (seeds.length > 0) parts.push(`${seeds.length} user-provided source(s) included (guaranteed, provenance=user_provided)`);
    if (familyFailures.length > 0) parts.push(`family failures: ${familyFailures.map((f) => f.family).join(', ')}`);
    return { kind: 'done', summary: parts.join('; ') };
  },
};
