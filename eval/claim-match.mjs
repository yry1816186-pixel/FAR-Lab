/**
 * Deterministic claim matching for the rediscovery eval (judge-hardening, 2026-08-22).
 *
 * Evidence: same-run re-judging swung task F1 by up to ±0.5 (arg 0.17→0.50→0.00, crc
 * 1.00→0.48→0.58) — the LLM pairwise-match step alone swamps the effects the eval
 * measures. This module makes matching DETERMINISTIC: content-token Jaccard with
 * HIGH/LOW thresholds decides most pairs; only the borderline band goes back to an
 * (externally batched, majority-voted) LLM adjudication. Pure functions — unit-tested
 * and offline-calibratable against recorded judge outputs (claim-match-calibrate.mjs).
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'if', 'then', 'than',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'without', 'into', 'onto',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
  'as', 'because', 'while', 'during', 'before', 'after', 'above', 'below', 'between', 'through',
  'more', 'most', 'less', 'least', 'very', 'such', 'some', 'any', 'each', 'every', 'both', 'all',
  'there', 'here', 'when', 'where', 'why', 'how', 'which', 'who', 'whom', 'what',
  'also', 'however', 'therefore', 'thus', 'hence', 'via', 'due', 'using', 'used', 'use',
]);

/** Lowercase, strip punctuation/digits-only tokens, drop stopwords, crude plural fold. */
export const contentTokens = (s) => {
  const raw = String(s ?? '').toLowerCase().match(/[a-z][a-z-]{1,}/g) ?? [];
  const out = new Set();
  for (let t of raw) {
    if (STOPWORDS.has(t)) continue;
    if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) t = t.slice(0, -1);
    out.add(t);
  }
  return out;
};

/** Jaccard over content-token sets: |A∩B| / |A∪B|. */
export const jaccard = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
};

/**
 * TF-IDF cosine similarity over the claim corpus: document frequency is computed
 * across ALL claims on both sides, so corpus-distinctive scientific terms (T790M,
 * taurocholate, plasmid) dominate the weight while ubiquitous phrasing washes out.
 * Calibration (2026-08-22): lifts near-paraphrase pairs (0.27 Jaccard → ~0.55 cosine)
 * while unrelated pairs stay near 0.
 */
export const tfidfCosine = (docsTokens) => {
  const df = new Map();
  for (const tokens of docsTokens) for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docsTokens.length;
  const idf = (t) => Math.log((1 + N) / (1 + (df.get(t) ?? 0))) + 1;
  const vectors = docsTokens.map((tokens) => {
    const v = new Map();
    for (const t of tokens) v.set(t, idf(t));
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
  const sim = (i, j) => {
    const a = vectors[i];
    const b = vectors[j];
    if (a === undefined || b === undefined) return 0;
    let dot = 0;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    for (const [t, w] of small) { const w2 = big.get(t); if (w2 !== undefined) dot += w * w2; }
    return dot;
  };
  return sim;
};

/**
 * Threshold matching (the deterministic core).
 * For each claim on one side, the best similarity on the other side decides:
 *   best ≥ high  -> matched (index recorded)
 *   best <  low  -> unmatched (-1)
 *   otherwise    -> BORDERLINE (null; caller adjudicates with the LLM)
 * Symmetric for both sides, independent per claim (mirrors the LLM instruction
 * that several claims may map to the same counterpart).
 */
/**
 * Production matching thresholds. Calibrated against main-agent gold sets under a
 * ZERO-gold-error constraint (claim-match-calibrate.mjs):
 *  - 2026-08-22: claim-pair-gold.jsonl (104 pairs, verbose-decomposition era) → 0.40/0.12
 *  - 2026-08-29: + claim-pair-gold-v21.jsonl (53 pairs sampled from the BELOW-FLOOR and
 *    borderline zones of the v2.1 concise decomposition — a zone the 08-22 gold never
 *    sampled). Three true pairs sit at 0.110-0.119, so low=0.12 auto-rejected them;
 *    low drops to 0.10 (zero gold errors on 157 pairs; true min 0.110). high stays
 *    0.40 (false max 0.340). A length-robust containment signal was tested and
 *    REJECTED: gold true/false containment distributions overlap 0.20-0.63 (no
 *    zero-error cutoff exists). Exported so tests can lock the PRODUCTION values
 *    (a mutation here must redden the gold regression test).
 */
export const MATCH_DEFAULTS = Object.freeze({ high: 0.40, low: 0.10 });

// ---- deterministic band pre-layer (S2, 2026-09-05) ----
// The recorded band measurement (adjudication-accuracy.json 2026-08-29, glm-5.3
// 5-vote, n=109) showed accuracy 0.826 with two systematic error families:
// leniency FPs (16 — the judge blesses topical pairs as same-finding) and
// strictness FNs (3 — complement/negation phrasings the judge splits on).
// These rules move borderline pairs OUT of the LLM band when a GENERAL
// scientific invariant already decides them, under the same ZERO-gold-error
// constraint as the thresholds (validated on all 157 gold pairs: 6 fired,
// 0 errors, 3 of the 16 recorded FPs killed — see tests/claim-match.test.ts
// 'deterministic band pre-layer'). Rules only ever classify a pair as a
// DIFFERENT finding (false); they never assert sameness, and they never fire
// outside the [low, high) band (the extremes are already zero-error locked).

// Directional verbs in post-contentTokens fold form (crude plural fold strips
// a trailing 's'; tense variants stay distinct, so each is listed).
const DIRECTION_UP = new Set([
  'increase', 'increases', 'increased', 'promote', 'promotes', 'promoted',
  'enhance', 'enhances', 'enhanced', 'activate', 'activates', 'activated',
  'induce', 'induces', 'induced', 'restore', 'restores', 'restored',
  'raise', 'raises', 'raised', 'stimulate', 'stimulates', 'stimulated',
  'augment', 'augments', 'augmented', 'elevate', 'elevates', 'elevated',
  'improve', 'improves', 'improved', 'boost', 'boosts', 'boosted',
  'accelerate', 'accelerates', 'accelerated', 'upregulate', 'upregulates', 'upregulated',
]);
const DIRECTION_DOWN = new Set([
  'reduce', 'reduces', 'reduced', 'decrease', 'decreases', 'decreased',
  'inhibit', 'inhibits', 'inhibited', 'lower', 'lowers', 'lowered',
  'suppress', 'suppresses', 'suppressed', 'disrupt', 'disrupts', 'disrupted',
  'prevent', 'prevents', 'prevented', 'eliminate', 'eliminates', 'eliminated',
  'deplete', 'depletes', 'depleted', 'block', 'blocks', 'blocked',
  'remove', 'removes', 'removed', 'kill', 'kills', 'killed',
  'impair', 'impairs', 'impaired', 'diminish', 'diminishes', 'diminished',
  'attenuate', 'attenuates', 'attenuated', 'abolish', 'abolishes', 'abolished',
  'abrogate', 'abrogates', 'abrogated',
]);
// When the operator's SUBJECT is a negated entity ("loss of X inhibits Y"),
// the effective polarity is not the verb's polarity — abstain the whole claim.
const SUBJECT_NEGATION = [
  'loss of', 'depletion of', 'absence of', 'lack of', 'without',
  'removal of', 'inhibition of', 'inhibitor of', 'inhibitors of',
  'reduced', 'deficient in', 'deficiency of',
];
// Correlation-kind vs causal-kind assertion markers: an association phrased on
// one side against a mechanism phrased on the other is a different KIND of
// finding (the gold protocol: operationalized prediction/correlation = false).
const CORRELATION_KIND = [
  'correlates with', 'correlated with', 'correlation between', 'correlation with',
  'associated with', 'association between', 'inversely correlated',
  'positively correlated', 'negatively correlated', 'dose-response', 'monotonic',
  'predicts', 'biomarker for',
];
const CAUSAL_KIND = [
  'causes', 'caused by', 'due to', 'results in', 'resulted in', 'leads to', 'led to',
  'driven by', 'drives', 'mediates', 'mediated by', 'promotes', 'promoted',
  'inhibits', 'inhibited', 'restores', 'restored', 'prevents', 'prevented',
  'induces', 'induced', 'reduces', 'reduced', 'increases', 'increased',
  'disrupts', 'disrupted', 'depletes', 'depleted', 'eliminates', 'eliminated',
  'is required for', 'are required for', 'depends on', 'dependent on',
];

const claimDirection = (text) => {
  const low = String(text ?? '').toLowerCase();
  if (SUBJECT_NEGATION.some((p) => low.includes(p))) return null;
  const tokens = contentTokens(text);
  let up = 0;
  let down = 0;
  for (const t of tokens) {
    if (DIRECTION_UP.has(t)) up += 1;
    else if (DIRECTION_DOWN.has(t)) down += 1;
  }
  if (up > 0 && down > 0) return null; // mixed directions inside one claim — ambiguous
  if (up > 0) return 1;
  if (down > 0) return -1;
  return null; // no directional operator
};

const hasAny = (low, phrases) => phrases.some((p) => low.includes(p));

/**
 * Deterministic verdict for a BORDERLINE pair (S2 pre-layer).
 * Returns false when a general scientific invariant proves the pair asserts
 * DIFFERENT findings (opposing directions, or correlation vs mechanism);
 * returns null to abstain (send to the LLM band unchanged). Never returns
 * true — sameness stays the LLM band's job.
 */
export const deterministicBandVerdict = (claim, counterpart) => {
  const da = claimDirection(claim);
  if (da !== null) {
    const db = claimDirection(counterpart);
    if (db !== null && da !== db) return false; // "A restores X" vs "A reduces X"
  }
  const la = String(claim ?? '').toLowerCase();
  const lb = String(counterpart ?? '').toLowerCase();
  const aCorr = hasAny(la, CORRELATION_KIND);
  const aCausal = hasAny(la, CAUSAL_KIND);
  const bCorr = hasAny(lb, CORRELATION_KIND);
  const bCausal = hasAny(lb, CAUSAL_KIND);
  if ((aCorr && !aCausal && bCausal && !bCorr) || (aCausal && !aCorr && bCorr && !bCausal)) {
    return false; // "X correlates with Y" vs "X causes Y" — different finding kinds
  }
  return null;
};

export const thresholdMatch = (agentClaims, gtClaims, { high = MATCH_DEFAULTS.high, low = MATCH_DEFAULTS.low } = {}) => {
  const agentTokens = agentClaims.map(contentTokens);
  const gtTokens = gtClaims.map(contentTokens);
  const allDocs = [...agentTokens, ...gtTokens];
  const sim = tfidfCosine(allDocs);
  const bestFor = (i, otherOffset, otherLen) => {
    let bestIdx = -1;
    let bestSim = 0;
    for (let j = 0; j < otherLen; j += 1) {
      const s = sim(i, otherOffset + j);
      if (s > bestSim) { bestSim = s; bestIdx = j; }
    }
    return { bestIdx, bestSim };
  };
  const decide = ({ bestIdx, bestSim }) => {
    // bestIdx is retained on EVERY outcome (including borderline) — adjudication
    // needs the actual best counterpart, never a positional fallback (audit P0 #1)
    if (bestSim >= high) return { match: bestIdx, sim: bestSim, bestIdx };
    if (bestSim < low) return { match: -1, sim: bestSim, bestIdx };
    return { match: null, sim: bestSim, bestIdx };
  };
  const agentSide = agentTokens.map((_, i) => decide(bestFor(i, agentTokens.length, gtTokens.length)));
  const gtSide = gtTokens.map((_, j) => decide(bestFor(agentTokens.length + j, 0, agentTokens.length)));
  const borderline = [];
  agentSide.forEach((r, i) => { if (r.match === null) borderline.push({ side: 'agent', i, bestSim: r.sim, bestIdx: r.bestIdx }); });
  gtSide.forEach((r, j) => { if (r.match === null) borderline.push({ side: 'gt', i: j, bestSim: r.sim, bestIdx: r.bestIdx }); });
  return { agentSide, gtSide, borderline };
};

/** Resolve borderline entries with adjudicated booleans (from the LLM batch), then count. */
export const finalizeCounts = (agentClaims, gtClaims, matchResult, adjudications) => {
  // adjudications: [{side, i, matched}] parallel to matchResult.borderline order
  const agentMatch = matchResult.agentSide.map((r) => r.match ?? -1);
  const gtMatch = matchResult.gtSide.map((r) => r.match ?? -1);
  matchResult.borderline.forEach((b, k) => {
    const adj = adjudications[k];
    const matched = adj !== undefined && adj.matched === true;
    if (b.side === 'agent' && matched) agentMatch[b.i] = 0; // any gt index suffices for counting
    else if (b.side === 'gt' && matched) gtMatch[b.i] = 0;
  });
  const agentMatched = agentMatch.filter((i) => i >= 0).length;
  const gtMatched = gtMatch.filter((i) => i >= 0).length;
  const precision = agentClaims.length > 0 ? agentMatched / agentClaims.length : 0;
  const recall = gtClaims.length > 0 ? gtMatched / gtClaims.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { agentMatched, gtMatched, precision, recall, f1 };
};
