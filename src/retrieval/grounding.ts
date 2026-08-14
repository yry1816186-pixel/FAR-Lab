/**
 * retrieval/grounding — research-question grounding orchestration (K1 Phase 4).
 *
 * This is the callable "acquisition layer" (directive §9): given a research
 * question, retrieve SUPPORTING literature AND counter-evidence (§16), merge
 * into an immutable CorpusSnapshot, and return a CitationResolver. Downstream
 * hypothesis generation cites documentIds from this corpus; the resolver makes
 * unbound citations deterministically detectable.
 *
 * Flow (directive §13 "correct chain"):
 *   research question
 *     → supporting retrieval (the question itself)
 *     → counter-evidence queries (counter_evidence.generateCounterEvidenceQueries)
 *     → counter-evidence retrieval (each, same source set)
 *     → merge + dedupe → createCorpusSnapshot
 *     → return { corpus, resolver, provenance of the acquisition }
 *
 * Multi-source (directive §9.3): a run MAY ground across ≥2 independent source
 * families (OpenAlex / Crossref / arXiv). Every query is issued against every
 * requested source and the results are merged + deduped — one aggregation is
 * never presented as cross-validation (each source's counts stay visible in
 * perQueryCounts). A single-source run is the default; representative live
 * runs use at least two families.
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
import type { DocumentSource, RetrievedDocument, RetrievalAdapter, RetrievalQuery } from './types.ts';

/** Options for grounding a research question. */
export interface GroundingOptions {
  /** The research question to ground. */
  readonly question: string;
  /** Which authoritative source to query (default 'openalex'). */
  readonly source?: RetrievalQuery['source'];
  /**
   * Multiple independent source families to query in one grounding run
   * (directive §9.3). When set, it REPLACES `source` — every query is issued
   * against every listed source and results merge into one corpus.
   */
  readonly sources?: readonly DocumentSource[];
  /** Max documents per query per source (supporting + counter + extra). */
  readonly maxPerQuery?: number;
  /**
   * Optional injected adapter (for hermetic tests / cached-snapshot demos).
   * When omitted, the live adapter for each source is used. When provided,
   * fetchMode is reported as 'replay' and it serves ALL queries (any `sources`
   * list is ignored — a replay adapter has exactly one source).
   */
  readonly adapter?: RetrievalAdapter;
  /**
   * Per-source injected adapters (hermetic multi-source tests). When provided,
   * each source uses its own adapter and fetchMode is 'replay'.
   */
  readonly adapters?: Readonly<Partial<Record<DocumentSource, RetrievalAdapter>>>;
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
  /** Per-query-per-source document counts (transparency on what each surfaced). */
  readonly perQueryCounts: ReadonlyArray<{
    readonly query: string;
    readonly source: string;
    readonly count: number;
  }>;
  /** The source families actually used. */
  readonly sourcesUsed: readonly string[];
  /** 'live' = real network fetch; 'replay' = injected adapter served fixtures. */
  readonly fetchMode: 'live' | 'replay';
  /** ISO timestamp the grounding was performed. */
  readonly groundedAt: string;
}

/** Resolve the adapter for one source (live, single replay, or per-source replay). */
function adapterFor(
  source: DocumentSource,
  injected: RetrievalAdapter | undefined,
  perSource: Readonly<Partial<Record<DocumentSource, RetrievalAdapter>>> | undefined,
): { adapter: RetrievalAdapter; fetchMode: 'live' | 'replay' } {
  if (injected !== undefined) {
    return { adapter: injected, fetchMode: 'replay' };
  }
  const mapped = perSource?.[source];
  if (mapped !== undefined) {
    return { adapter: mapped, fetchMode: 'replay' };
  }
  return { adapter: selectLiveAdapter(source), fetchMode: 'live' };
}

/**
 * Ground a research question: retrieve supporting + counter-evidence literature
 * (optionally across multiple source families), build an immutable corpus,
 * return a citation resolver. Fail-closed on any retrieval error (a partial
 * corpus would be misleading).
 */
export async function groundResearchQuestion(opts: GroundingOptions): Promise<GroundedCorpus> {
  const defaultSource: DocumentSource = 'openalex';
  const maxPerQuery = opts.maxPerQuery ?? 5;
  const includeCounter = opts.includeCounterEvidence ?? true;
  const injected = opts.adapter;
  const sources: readonly DocumentSource[] =
    injected !== undefined
      ? [injected.source]
      : opts.sources !== undefined && opts.sources.length > 0
        ? [...new Set(opts.sources)]
        : [opts.source ?? defaultSource];
  const groundedAt = new Date().toISOString();

  const perQueryCounts: { query: string; source: string; count: number }[] = [];
  const allDocs: RetrievedDocument[] = [];
  let anyReplay = injected !== undefined;

  /** Issue one query against every source family (fail-closed on any error). */
  const runQuery = async (text: string): Promise<void> => {
    for (const source of sources) {
      const { adapter, fetchMode } = adapterFor(source, injected, opts.adapters);
      if (fetchMode === 'replay') anyReplay = true;
      const query: RetrievalQuery = { text, maxResults: maxPerQuery, source };
      const docs = await adapter.retrieve(query);
      allDocs.push(...docs);
      perQueryCounts.push({ query: text, source: `${source}${fetchMode === 'replay' ? ':replay' : ''}`, count: docs.length });
    }
  };

  // 1. Supporting retrieval (the question itself).
  await runQuery(opts.question);

  // 2. Counter-evidence queries (§16).
  const counterQueries: readonly CounterEvidenceQuery[] = includeCounter
    ? generateCounterEvidenceQueries(opts.question)
    : [];
  for (const cq of counterQueries) {
    await runQuery(cq.text);
  }

  // 2b. Extra queries (problem-decomposition retrieval subquestions, §9.2→§9.3).
  const extraQueries = opts.extraQueries ?? [];
  for (const eq of extraQueries) {
    await runQuery(eq);
  }

  // 3. Merge + dedupe into an immutable corpus snapshot (sourceQueries provenance).
  const sourceQueries = [
    opts.question,
    ...counterQueries.map((c) => c.text),
    ...extraQueries,
  ];
  const corpus = createCorpusSnapshot(allDocs, sourceQueries);
  const resolver = new CitationResolver(corpus);

  const sourcesUsed = [...new Set(perQueryCounts.map((p) => p.source))];

  return {
    corpus,
    resolver,
    supportingQuery: opts.question,
    counterEvidenceQueries: counterQueries,
    perQueryCounts,
    sourcesUsed,
    fetchMode: anyReplay ? 'replay' : 'live',
    groundedAt,
  };
}
