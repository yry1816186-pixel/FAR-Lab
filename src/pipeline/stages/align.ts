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

/**
 * Compatibility-normalize, lowercase, unify typographic quotes/dashes to ASCII,
 * and collapse all whitespace runs. NFKC makes full-width Latin/digits and their
 * ASCII forms comparable while preserving Han/Kana/Hangul text.
 */
export const normalizeForAlignment = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2043\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const CJK_CODE_POINT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_CODE_POINT = /[\p{L}\p{N}\p{M}]/u;

/**
 * Deterministic cross-platform tokenizer for near-verbatim alignment.
 *
 * Latin-like scripts stay in word runs, matching the original behavior. CJK
 * scripts have no mandatory whitespace boundaries, so ordered code-point bigrams
 * become tokens (a one-code-point run remains a unigram). This deliberately avoids
 * Intl.Segmenter/ICU-version drift: the scientific verdict must not change because
 * Windows and Linux ship different dictionaries. Punctuation is ignored inside a
 * CJK run so punctuation drift survives, while bigrams retain enough adjacency to
 * keep a reordered bag of the same characters from passing as near-verbatim.
 */
const tokenize = (normalized: string): string[] => {
  const tokens: string[] = [];
  let word = '';
  let cjk: string[] = [];
  const flushWord = (): void => {
    if (word.length > 0) tokens.push(word);
    word = '';
  };
  const flushCjk = (): void => {
    if (cjk.length === 1) tokens.push(cjk[0]!);
    else for (let index = 0; index + 1 < cjk.length; index += 1) tokens.push(`${cjk[index]}${cjk[index + 1]}`);
    cjk = [];
  };

  for (const codePoint of normalized) {
    if (CJK_CODE_POINT.test(codePoint)) {
      flushWord();
      cjk.push(codePoint);
    } else if (WORD_CODE_POINT.test(codePoint)) {
      flushCjk();
      word += codePoint;
    } else {
      flushWord();
      // Punctuation and whitespace are intentionally transparent within a CJK
      // sequence. A later Latin/number word or EOF closes the CJK run.
    }
  }
  flushWord();
  flushCjk();
  return tokens;
};

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
