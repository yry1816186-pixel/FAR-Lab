/**
 * retrieval/counter_evidence — deterministic counter-evidence query generation
 * (directive §16: "Counter-Evidence First").
 *
 * The system must attack its own hypotheses. Given a primary research query
 * (the one that would surface SUPPORTING evidence), this module emits a set of
 * ADVERSARIAL queries designed to surface contradiction, null results,
 * non-replication, criticism, and competing explanations. These are pure string
 * transforms — deterministic, no LLM, no network. The retrieval layer then
 * fetches each against the same authoritative sources.
 *
 * Honesty: these are heuristic query templates, not a guarantee that
 * counter-evidence exists. They widen the search to include the adversarial
 * direction; whether refutation is actually found is reported by the corpus
 * contents, not assumed.
 */

/** The adversarial strategy a counter-evidence query targets. */
export type CounterEvidenceStrategy =
  | 'failure'
  | 'null_result'
  | 'criticism'
  | 'alternative'
  | 'non_replication';

/** A generated counter-evidence query. */
export interface CounterEvidenceQuery {
  readonly text: string;
  readonly strategy: CounterEvidenceStrategy;
}

/** Adversarial qualifier templates (appended to the primary query terms). */
const COUNTER_QUALIFIERS: ReadonlyArray<{ readonly strategy: CounterEvidenceStrategy; readonly suffix: string }> = [
  { strategy: 'non_replication', suffix: 'failure to replicate' },
  { strategy: 'null_result', suffix: 'null result' },
  { strategy: 'failure', suffix: 'no effect' },
  { strategy: 'criticism', suffix: 'criticism' },
  { strategy: 'alternative', suffix: 'alternative explanation' },
];

/**
 * Generate deterministic counter-evidence queries from a primary research query.
 * Returns one query per adversarial strategy. The primary terms are preserved
 * (whitespace-normalized) so the search stays on-topic but pivots to the
 * adversarial framing.
 */
export function generateCounterEvidenceQueries(primaryQuery: string): readonly CounterEvidenceQuery[] {
  const base = primaryQuery.replace(/\s+/g, ' ').trim();
  if (base.length === 0) return [];
  return COUNTER_QUALIFIERS.map(({ strategy, suffix }) => ({
    text: `${base} ${suffix}`,
    strategy,
  }));
}
