import { z } from 'zod';
import { CorpusSnapshot, SourceDocument, newId } from '../../domain/index.js';
import type { RetrievalQuery, SourceFamily } from '../../domain/source.js';
import { canonicalJson } from '../../shared/crypto.js';
import type { RawSourceRecord } from '../../shared/ports.js';
import { isSourceAdapterError } from '../../sources/error.js';
import { snapshotHash, excludeVolatile } from '../../sources/snapshot.js';
import { callStructured } from '../llm.js';
import type { StageContext, StageHandler, StageOutcome } from '../types.js';
import { throwIfCancelled } from './guard.js';

/** Hard corpus cap (contract): excess documents are truncated, visibly noted in the summary. */
export const MAX_DOCUMENTS = 12;
/** D-015: per-search result limit — every PLANNED query executes, so the pool is multi-list. */
const SEARCH_LIMIT = 6;
/** Reciprocal Rank Fusion constant (SIGIR 2009 standard k=60). */
const RRF_K = 60;
/** Max pool entries sent to the LLM listwise rerank (RankGPT pattern, single window). */
const RERANK_POOL = 24;
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
 */
const COUNTER_TERM_RE = new RegExp(
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
- Counter queries MUST carry explicit counter-evidence vocabulary (e.g. "failed replication", "limitations", "contradictory findings", "negative result").`;

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

/**
 * D-015: build one search per (planned query x family). ALL planned discovery and
 * supporting queries execute now — the old code silently dropped discovery[1] and
 * supporting[1]. Counter targets stay FIRST: the quota selector (not search order)
 * now protects counter-evidence seats, but running them first also keeps the
 * R-05 ordering guarantee intact for receipts.
 */
const buildTargets = (plan: QueryPlan): readonly SearchTarget[] => {
  const [counterOpenalex, counterArxiv] = counterQueries(plan.counter);
  const targets: SearchTarget[] = [
    { purpose: 'counter_evidence', text: counterOpenalex, family: 'openalex' },
    { purpose: 'counter_evidence', text: counterArxiv, family: 'arxiv' },
  ];
  for (const q of plan.discovery) {
    targets.push({ purpose: 'discovery', text: q, family: 'openalex' });
    targets.push({ purpose: 'discovery', text: q, family: 'arxiv' });
  }
  for (const q of plan.supporting) {
    targets.push({ purpose: 'supporting', text: q, family: 'openalex' });
    targets.push({ purpose: 'supporting', text: q, family: 'arxiv' });
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
 * RawSourceRecord -> SourceDocument. The normalized payload is ALWAYS archived
 * content-addressed; the artifact is stored over canonicalJson, the same basis
 * as snapshotHash, so the artifact hash equals contentHash. fullTextRef is only
 * set for full_text-depth records (the deepest content the record carries).
 */
export const toDocument = async (
  ctx: StageContext,
  family: SourceFamily,
  rec: RawSourceRecord,
): Promise<SourceDocument> => {
  const contentHash = snapshotHash(family, rec);
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
  });
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
    const targets = buildTargets(plan);

    const executedQueries: RetrievalQuery[] = [];
    const failuresByFamily = new Map<SourceFamily, string[]>();
    const pool = new Map<string, PoolEntry>();
    let attempted = 0;
    let succeeded = 0;
    let duplicates = 0;
    let droppedNoIdentifier = 0;

    for (const [targetIdx, t] of targets.entries()) {
      throwIfCancelled(ctx);
      executedQueries.push({ purpose: t.purpose, text: t.text, family: t.family });
      attempted += 1;
      try {
        const res = await ctx.sourceFor(t.family).search(t.text, { limit: SEARCH_LIMIT });
        succeeded += 1;
        ctx.recordReceipt({
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'retrieve',
          redactionNote: 'query text and per-record content hashes retained; payloads archived content-addressed',
          sourceRetrieval: {
            family: t.family,
            query: t.text,
            httpStatus: res.httpStatus,
            resultCount: res.records.length,
            contentHashes: res.records.map((r) => snapshotHash(t.family, r)),
          },
        });
        for (const [rank, rec] of res.records.entries()) {
          const key = primaryKey(rec);
          if (key === null) {
            droppedNoIdentifier += 1;
            ctx.log(`retrieve: dropping record without identifiers: "${rec.title}"`);
            continue;
          }
          const existing = pool.get(key);
          if (existing) {
            duplicates += 1;
            existing.purposes.add(t.purpose);
            existing.ranks.push({ target: targetIdx, rank });
            continue;
          }
          pool.set(key, {
            key,
            record: rec,
            family: t.family,
            firstSeen: targetIdx,
            purposes: new Set([t.purpose]),
            ranks: [{ target: targetIdx, rank }],
          });
        }
      } catch (e) {
        // Single-source failure stays visible (familyFailures + receipt) and the
        // stage continues; only total failure aborts (below).
        const msg = e instanceof Error ? e.message : String(e);
        const list = failuresByFamily.get(t.family) ?? [];
        list.push(`${t.purpose}: ${msg}`);
        failuresByFamily.set(t.family, list);
        ctx.recordReceipt({
          kind: 'source_retrieval',
          executionMode: 'live',
          stage: 'retrieve',
          redactionNote: 'query text and per-record content hashes retained; payloads archived content-addressed',
          sourceRetrieval: {
            family: t.family,
            query: t.text,
            httpStatus: isSourceAdapterError(e) ? e.httpStatus : 0,
            resultCount: 0,
            contentHashes: [],
          },
        });
        ctx.log(`retrieve: source ${t.family} failed for ${t.purpose} query: ${msg}`);
      }
    }

    if (succeeded === 0) {
      const reason = [...failuresByFamily.entries()]
        .map(([family, msgs]) => `${family}: ${[...new Set(msgs)].join(' | ')}`)
        .join('; ');
      throw new Error(
        `retrieve: all ${attempted} source searches failed — refusing to fabricate an empty-success corpus (${reason})`,
      );
    }
    if (pool.size === 0) {
      throw new Error(
        `retrieve: all ${succeeded}/${attempted} searches succeeded but returned no identifiable documents — refusing to fabricate an empty corpus`,
      );
    }

    // ---- D-015 fusion: deterministic RRF order, then (under cap pressure) LLM listwise rerank ----
    const fused = fusedOrder([...pool.values()]);
    let finalOrder: PoolEntry[] = fused;
    let rerankApplied = false;
    let rerankFailure: string | undefined;
    if (fused.length > MAX_DOCUMENTS) {
      const candidates = fused.slice(0, RERANK_POOL);
      try {
        const res = await callStructured<RerankOut>(ctx, {
          stage: 'retrieve',
          purpose: 'listwise-rerank',
          systemPrompt: RERANK_SYSTEM_PROMPT,
          payload: {
            questionText: question.text,
            candidates: candidates.map((e, i) => ({
              index: i,
              title: e.record.title,
              ...(e.record.publicationYear !== undefined ? { year: e.record.publicationYear } : {}),
              ...(e.record.venue !== undefined ? { venue: e.record.venue } : {}),
              abstractExcerpt: (e.record.abstractText ?? '').slice(0, 450),
              originatingPurposes: [...e.purposes],
            })),
          },
          schema: RerankOut,
          temperature: 0.1,
        });
        finalOrder = [...applyRerank(res.data, candidates), ...fused.slice(RERANK_POOL)];
        rerankApplied = true;
      } catch (e) {
        // Fail-VISIBLE fallback: the corpus still builds on the deterministic RRF order;
        // the failure is recorded in the snapshot and summary, never silently dropped.
        rerankFailure = e instanceof Error ? e.message : String(e);
        ctx.log(`retrieve: listwise rerank failed — falling back to RRF order (${rerankFailure})`);
      }
    }

    const selected = selectFinal(finalOrder, MAX_DOCUMENTS, COUNTER_MIN_SEATS);
    const counterSeatsKept = selected.filter(isCounterOrigin).length;

    const documents: SourceDocument[] = [];
    for (const entry of selected) documents.push(await toDocument(ctx, entry.family, entry.record));
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
    if (duplicates > 0) parts.push(`${duplicates} duplicate record(s) merged by identifier`);
    if (droppedNoIdentifier > 0) parts.push(`${droppedNoIdentifier} record(s) without identifiers dropped`);
    if (selected.length < fused.length) parts.push(`truncated at cap ${MAX_DOCUMENTS}`);
    if (familyFailures.length > 0) parts.push(`family failures: ${familyFailures.map((f) => f.family).join(', ')}`);
    return { kind: 'done', summary: parts.join('; ') };
  },
};
