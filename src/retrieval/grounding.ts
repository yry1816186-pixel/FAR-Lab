/**
 * retrieval/grounding — research-question grounding orchestration (K1 Phase 4).
 *
 * This is the callable "acquisition layer" (directive §9): given a research
 * question, retrieve SUPPORTING literature AND counter-evidence (§16), merge
 * into an immutable CorpusSnapshot, and return a CitationResolver. Downstream
 * hypothesis generation (the agent_loop) cites documentIds from this corpus; the
 * resolver makes unbound citations deterministically detectable.
 *
 * Flow (directive §13 "correct chain"):
 *   research question
 *     → supporting retrieval (the question itself)
 *     → counter-evidence queries (counter_evidence.generateCounterEvidenceQueries)
 *     → counter-evidence retrieval (each, same source)
 *     → merge + dedupe → createCorpusSnapshot
 *     → return { corpus, resolver, provenance of the acquisition }
 *
 * Honesty:
 *   - retrievedAt is the real time of the live fetch (or the fixture's time on
 *     replay) — never fabricated.
 *   - if a retrieval call fails (network/timeout), it FAILS CLOSED: the whole
 *     grounding rejects (the caller must not silently get a partial corpus
 *     masquerading as complete). A per-query soft-fail option is intentionally
 *     NOT provided — partial corpora that omit failed sources would let a
 *     hypothesis look "grounded" while missing the evidence that refutes it.
 *   - fetchMode: 'live' (real fetch) or 'replay' (injected adapter served
 *     fixtures). Surfaced so a caller never mistakes a replay for a live ground.
 */
import { createCorpusSnapshot, type CorpusSnapshot } from './corpus.ts';
import { CitationResolver } from './citation_resolver.ts';
import { generateCounterEvidenceQueries, type CounterEvidenceQuery } from './counter_evidence.ts';
import { selectLiveAdapter } from './index.ts';
import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery } from './types.ts';

/** Options for grounding a research question. */
export interface GroundingOptions {
  /** The research question to ground. */
  readonly question: string;
  /** Which authoritative source to query (default 'openalex'). */
  readonly source?: RetrievalQuery['source'];
  /** Max documents per query (supporting + each counter-evidence query). */
  readonly maxPerQuery?: number;
  /**
   * Optional injected adapter (for hermetic tests / cached-snapshot demos).
   * When omitted, the live adapter for the source is used. When provided,
   * fetchMode is reported as 'replay'.
   */
  readonly adapter?: RetrievalAdapter;
  /** Whether to include counter-evidence queries (default true, §16). */
  readonly includeCounterEvidence?: boolean;
  /**
   * Extra retrieval queries (e.g. the problem decomposition's retrieval
   * subquestions, §9.2→§9.3). Each is a bounded additional snapshot query.
   */
  readonly extraQueries?: readonly string[];
}

/** The result of grounding a research question. */
export interface GroundedCorpus {
  /** The immutable corpus snapshot (supporting + counter-evidence, deduped). */
  readonly corpus: CorpusSnapshot;
  /** A citation resolver bound to the corpus. */
  readonly resolver: CitationResolver;
  /** The supporting query (= the question). */
  readonly supportingQuery: string;
  /** The counter-evidence queries that were issued (empty if disabled). */
  readonly counterEvidenceQueries: readonly CounterEvidenceQuery[];
  /** Per-query document counts (transparency on what each query surfaced). */
  readonly perQueryCounts: ReadonlyArray<{ readonly query: string; readonly count: number }>;
  /** 'live' = real network fetch; 'replay' = injected adapter served fixtures. */
  readonly fetchMode: 'live' | 'replay';
  /** ISO timestamp the grounding was performed. */
  readonly groundedAt: string;
}

/**
 * Ground a research question: retrieve supporting + counter-evidence literature,
 * build an immutable corpus, return a citation resolver. Fail-closed on any
 * retrieval error (a partial corpus would be misleading).
 */
export async function groundResearchQuestion(opts: GroundingOptions): Promise<GroundedCorpus> {
  const source = opts.source ?? 'openalex';
  const maxPerQuery = opts.maxPerQuery ?? 5;
  const includeCounter = opts.includeCounterEvidence ?? true;
  const adapter = opts.adapter ?? selectLiveAdapter(source);
  const fetchMode: 'live' | 'replay' = opts.adapter === undefined ? 'live' : 'replay';
  const groundedAt = new Date().toISOString();

  const perQueryCounts: { query: string; count: number }[] = [];
  const allDocs: RetrievedDocument[] = [];

  // 1. Supporting retrieval (the question itself).
  const supportingQuery: RetrievalQuery = { text: opts.question, maxResults: maxPerQuery, source };
  const supporting = await adapter.retrieve(supportingQuery);
  allDocs.push(...supporting);
  perQueryCounts.push({ query: opts.question, count: supporting.length });

  // 2. Counter-evidence queries (§16).
  const counterQueries: readonly CounterEvidenceQuery[] = includeCounter
    ? generateCounterEvidenceQueries(opts.question)
    : [];
  for (const cq of counterQueries) {
    const docs = await adapter.retrieve({ text: cq.text, maxResults: maxPerQuery, source });
    allDocs.push(...docs);
    perQueryCounts.push({ query: cq.text, count: docs.length });
  }

  // 2b. Extra queries (problem-decomposition retrieval subquestions, §9.2→§9.3).
  const extraQueries = opts.extraQueries ?? [];
  for (const eq of extraQueries) {
    const docs = await adapter.retrieve({ text: eq, maxResults: maxPerQuery, source });
    allDocs.push(...docs);
    perQueryCounts.push({ query: eq, count: docs.length });
  }

  // 3. Merge + dedupe into an immutable corpus snapshot (sourceQueries provenance).
  const sourceQueries = [
    opts.question,
    ...counterQueries.map((c) => c.text),
    ...extraQueries,
  ];
  const corpus = createCorpusSnapshot(allDocs, sourceQueries);
  const resolver = new CitationResolver(corpus);

  return {
    corpus,
    resolver,
    supportingQuery: opts.question,
    counterEvidenceQueries: counterQueries,
    perQueryCounts,
    fetchMode,
    groundedAt,
  };
}
