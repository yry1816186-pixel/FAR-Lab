/**
 * Deterministic quote↔abstract alignment gate for build_evidence (D-006 / R-03).
 *
 * Pure string/set mathematics — deliberately NO model involvement: a claim may be
 * marked `verified` only when its quote is grounded in content the system actually
 * retrieved. Anything that does not align fails closed to `resolved_unaligned`.
 */

/**
 * Word-level Jaccard bar a fuzzy (near-verbatim but not an exact substring) quote must
 * clear. 0.8 means at most ~1 in 5 words may differ in the best-matching abstract span:
 * tolerant to tokenization noise (hyphenation, ligatures, quote encodings, spacing),
 * while real paraphrases — which typically replace >=30% of content words — always fail.
 */
export const ALIGNMENT_JACCARD_THRESHOLD = 0.8;

export type AlignmentVerdict = 'verbatim' | 'fuzzy' | 'unaligned';

export interface AlignmentCheckResult {
  verdict: AlignmentVerdict;
  /**
   * Word-level Jaccard between the quote and the best-matching same-length token
   * window of the abstract. (Raw quote-vs-whole-abstract Jaccard would be
   * ~|quote|/|abstract| for any short excerpt, making a 0.8 bar unreachable; so
   * similarity is measured where an excerpt claims to live: one contiguous span.)
   */
  jaccard: number;
}

/** Lowercase, unify typographic quotes/dashes to ASCII, collapse all whitespace runs. */
export const normalizeForAlignment = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2043\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (normalized: string): string[] =>
  normalized.split(/[^a-z0-9]+/).filter((t) => t.length > 0);

const jaccardOf = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0; // empty input can never be "aligned"
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
};

const bestWindowJaccard = (quoteTokens: string[], abstractTokens: string[]): number => {
  if (quoteTokens.length === 0 || abstractTokens.length === 0) return 0;
  const quoteSet = new Set(quoteTokens);
  const windowSize = quoteTokens.length;
  if (abstractTokens.length <= windowSize) return jaccardOf(quoteSet, new Set(abstractTokens));
  let best = 0;
  for (let start = 0; start + windowSize <= abstractTokens.length; start += 1) {
    const windowSet = new Set(abstractTokens.slice(start, start + windowSize));
    const j = jaccardOf(quoteSet, windowSet);
    if (j > best) best = j;
    if (best === 1) break; // cannot do better
  }
  return best;
};

/** Pass = 'verbatim' | 'fuzzy'; 'unaligned' must fail closed upstream (never verified). */
export const checkQuoteAlignment = (
  quote: string,
  abstractText: string,
  threshold: number = ALIGNMENT_JACCARD_THRESHOLD,
): AlignmentCheckResult => {
  const normalizedQuote = normalizeForAlignment(quote);
  const normalizedAbstract = normalizeForAlignment(abstractText);
  const jaccard = bestWindowJaccard(tokenize(normalizedQuote), tokenize(normalizedAbstract));
  if (normalizedQuote.length > 0 && normalizedAbstract.includes(normalizedQuote)) {
    return { verdict: 'verbatim', jaccard };
  }
  if (jaccard >= threshold) return { verdict: 'fuzzy', jaccard };
  return { verdict: 'unaligned', jaccard };
};
