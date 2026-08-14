/**
 * discovery/novelty/lexical_similarity — DETERMINISTIC lexical novelty
 * measurement (directive §8.3 nearest-neighbor distance + PARAPHRASE_RISK).
 *
 * Zero-entropy discipline: pure functions only — no Date.now, no Math.random,
 * no process.env, no locale-dependent operations (lowercase is the ASCII-safe
 * subset via toLowerCase on already-normalized text; comparisons are
 * code-unit based). Embeddings are deliberately NOT used here (§6.8 ruling:
 * embeddings may enhance later, never adjudicate) — this module is the
 * deterministic floor every later enhancement must sit above.
 *
 * Threshold calibration (directive §8.9 v0 statement): PARAPHRASE_THRESHOLD
 * 0.85 was chosen conservatively from the design intent that a paraphrase flag
 * should fire only when two candidates share most of their lexical surface —
 * false kills (dropping a genuinely distinct candidate) cost more than false
 * keeps (a redundant candidate flows to the critique stage, which it
 * survives only by merit). Sensitivity: ±0.05 moves borderline near-duplicate
 * pairs between keep/flag; a real-distribution calibration on LIVE corpora is
 * registered as a b2+ backlog item and any change goes through an ADR.
 */

/** Common English stopwords — removes high-frequency terms that drown cosine signals. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by',
  'for', 'with', 'about', 'into', 'through', 'during', 'to', 'from', 'in', 'on',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'than', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'too', 'very', 's', 't', 'between', 'each', 'both', 'because', 'we', 'they',
]);

/** Tokenize text into lowercase alphanumeric terms (stopwords removed, length ≥ 2). */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Character n-gram set (sorted unique) for order-insensitive lexical overlap. */
function characterNgrams(text: string, n: number): ReadonlySet<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const grams = new Set<string>();
  if (normalized.length <= n) {
    if (normalized.length > 0) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i + n <= normalized.length; i += 1) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

/** Build term frequencies from tokens. */
export function termFrequencies(tokens: readonly string[]): ReadonlyMap<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/** Inverse document frequency over a reference document set (smoothed, log-scaled). */
export function buildIdf(documents: readonly string[]): ReadonlyMap<string, number> {
  const df = new Map<string, number>();
  for (const doc of documents) {
    for (const term of new Set(tokenize(doc))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const n = documents.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    // Smoothed idf: 0 when a term appears in every document, capped > 0 otherwise.
    idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }
  return idf;
}

/**
 * TF-IDF cosine similarity between two texts given a precomputed idf table.
 * Terms absent from the idf table (unseen in the reference corpus) get a
 * default idf of 1 — deterministic and corpus-agnostic.
 */
export function tfidfCosineSimilarity(
  a: string,
  b: string,
  idf: ReadonlyMap<string, number>,
): number {
  const tfA = termFrequencies(tokenize(a));
  const tfB = termFrequencies(tokenize(b));
  if (tfA.size === 0 || tfB.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, count] of tfA) {
    const w = count * (idf.get(term) ?? 1);
    normA += w * w;
    const countB = tfB.get(term);
    if (countB !== undefined) {
      dot += w * countB * (idf.get(term) ?? 1);
    }
  }
  for (const [term, count] of tfB) {
    const w = count * (idf.get(term) ?? 1);
    normB += w * w;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

/** Jaccard similarity over character n-gram sets (n=3 by default). */
export function jaccardNgramSimilarity(a: string, b: string, n = 3): number {
  const ga = characterNgrams(a, n);
  const gb = characterNgrams(b, n);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersection = 0;
  for (const g of ga) {
    if (gb.has(g)) intersection += 1;
  }
  return intersection / (ga.size + gb.size - intersection);
}

/**
 * Combined paraphrase similarity: an even blend of word-level TF-IDF cosine
 * and character-trigram Jaccard. Rationale: TF-IDF catches shared topical
 * vocabulary (two candidates about the same phenomenon score high even when
 * phrased differently), while trigram Jaccard catches surface-level rewrites
 * (paraphrases reuse morphology). Either signal alone mislabels a distinct
 * class of pairs; the blend is the deterministic v0 compromise.
 */
export function paraphraseSimilarity(
  a: string,
  b: string,
  idf: ReadonlyMap<string, number> = new Map(),
): number {
  return 0.5 * tfidfCosineSimilarity(a, b, idf) + 0.5 * jaccardNgramSimilarity(a, b);
}

/** Paraphrase flag threshold (calibration statement in the module header, §8.9). */
export const PARAPHRASE_THRESHOLD = 0.85;

/**
 * Nearest-neighbor distance of a text to a reference corpus (directive §8.3):
 * 1 − max cosine similarity. 1.0 = shares nothing with the corpus; near 0 =
 * near-duplicate of some corpus document. Empty corpus → 1 (maximally novel
 * by lack of comparison — honest default, corpus-empty runs are flagged
 * elsewhere as evidence-poor).
 */
export function nearestNeighborDistance(
  text: string,
  corpusTexts: readonly string[],
  idf: ReadonlyMap<string, number> = new Map(),
): number {
  if (corpusTexts.length === 0) return 1;
  let maxSim = 0;
  for (const doc of corpusTexts) {
    const sim = tfidfCosineSimilarity(text, doc, idf);
    if (sim > maxSim) maxSim = sim;
  }
  return 1 - maxSim;
}
