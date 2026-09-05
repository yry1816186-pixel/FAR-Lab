/**
 * Deterministic lexical direction of a scientific assertion (2026-09-05).
 *
 * Ported from eval/claim-match.mjs (S1 negation arm, validated with zero gold
 * errors on the 157-pair claim-matching gold set) so the pipeline and the
 * eval instrument share one lexicon, then extended with the negation-aware
 * effective-direction rule and (same day, measured miss class) the
 * null-effect reading for cross-paper pair anchoring.
 *
 * Semantics (all deterministic, no judgment):
 * - subject-negated assertions ("loss of X inhibits Y") abstain — the
 *   operator's subject flips the effective polarity, so no verdict is safe;
 * - mixed up+down operators inside one text abstain (ambiguous);
 * - an explicit null-effect phrase AND a direction operator co-occurring in
 *   one text abstain (which quantity each applies to is unknowable lexically);
 * - "not" and other short negators never reach the lexicons (content token
 *   length floor), so negation is detected separately on the raw text.
 */

// Tokenizer: length floor only. The direction lexicons and every stopword list
// in use (eval matcher's, evidence.ts's CROSS_STOPWORDS) are disjoint, so
// stopword stripping cannot change direction detection here — keeping this
// module free of any pipeline-layer import.
const directionTokens = (text: string): Set<string> =>
  new Set(normalizeLigatures(String(text ?? '').toLowerCase()).split(/[^a-z0-9]+/).filter((t) => t.length > 3));

// PDF-derived abstracts carry Unicode ligatures ("eﬀects", "ﬁnd") — measured
// live 2026-09-05 on the econ probe corpus; fold them before any matching.
const LIGATURES: Array<[RegExp, string]> = [
  [/ﬀ/g, 'ff'], [/ﬁ/g, 'fi'], [/ﬂ/g, 'fl'], [/ﬃ/g, 'ffi'], [/ﬄ/g, 'ffl'],
];
const normalizeLigatures = (s: string): string => {
  let out = s;
  for (const [re, rep] of LIGATURES) out = out.replace(re, rep);
  return out;
};

const DIRECTION_UP = new Set([
  'increase', 'increases', 'increased', 'increasing', 'promote', 'promotes', 'promoted', 'promoting',
  'enhance', 'enhances', 'enhanced', 'enhancing', 'activate', 'activates', 'activated', 'activating',
  'induce', 'induces', 'induced', 'inducing', 'restore', 'restores', 'restored', 'restoring',
  'raise', 'raises', 'raised', 'raising', 'stimulate', 'stimulates', 'stimulated', 'stimulating',
  'augment', 'augments', 'augmented', 'augmenting', 'elevate', 'elevates', 'elevated', 'elevating',
  'improve', 'improves', 'improved', 'improving', 'boost', 'boosts', 'boosted', 'boosting',
  'accelerate', 'accelerates', 'accelerated', 'accelerating', 'upregulate', 'upregulates', 'upregulated', 'upregulating',
]);

const DIRECTION_DOWN = new Set([
  'reduce', 'reduces', 'reduced', 'reducing', 'decrease', 'decreases', 'decreased', 'decreasing',
  'inhibit', 'inhibits', 'inhibited', 'inhibiting', 'lower', 'lowers', 'lowered', 'lowering',
  'suppress', 'suppresses', 'suppressed', 'suppressing', 'disrupt', 'disrupts', 'disrupted', 'disrupting',
  'prevent', 'prevents', 'prevented', 'preventing', 'eliminate', 'eliminates', 'eliminated', 'eliminating',
  'deplete', 'depletes', 'depleted', 'depleting', 'block', 'blocks', 'blocked', 'blocking',
  'remove', 'removes', 'removed', 'removing', 'kill', 'kills', 'killed', 'killing',
  'impair', 'impairs', 'impaired', 'impairing', 'diminish', 'diminishes', 'diminished', 'diminishing',
  'attenuate', 'attenuates', 'attenuated', 'attenuating', 'abolish', 'abolishes', 'abolished', 'abolishing',
  'abrogate', 'abrogates', 'abrogated', 'abrogating',
]);

const SUBJECT_NEGATION = [
  'loss of', 'depletion of', 'absence of', 'lack of', 'without',
  'removal of', 'inhibition of', 'inhibitor of', 'inhibitors of',
  'reduced', 'deficient in', 'deficiency of',
];

// Same curated negator set as the matcher's PREDICATE_NEGATION (157-pair
// zero-error provenance); operates on the raw lowercase text.
const PREDICATE_NEGATION = /\b(?:not|cannot|can\s?not|doesn'?t|does\s?not|don'?t|didn'?t|did\s?not|fails?\s+to|failed\s+to|unable\s+to|neither|nor)\b/;

// "not only X but also Y" AFFIRMS X — the negator is idiomatic, not predicate
// negation (live-measured 2026-09-05: "cannot only eliminate offshoring but
// also..." read as negated). Blank the idiom before negation testing.
const NOT_ONLY_IDIOM = /\b(?:not|cannot|can\s?not)\s+(?:only|just|merely)\b/g;

// Explicit null-outcome phrasing. Deliberately tight: every alternative must
// assert absence of an effect/difference on an outcome quantity. Looser nulls
// ("no evidence of publication bias", "no association found" about a third
// quantity) are excluded — a null reading on the WRONG quantity is worse than
// no reading. The live anchor probe (2026-09-05, econ corpus) measured this
// miss class: "No negative employment effects..." vs "reduces employment...".
const NULL_EFFECT = /\b(?:no (?:significant |detectable |measurable |statistically significant |negative |positive |adverse |apparent )?(?:[a-z-]+ )?(?:effect|effects|difference|differences|impact|impacts|change)|not significantly different|did not differ|does not differ|indistinguishable from)\b/;

export type AssertionReading =
  | { kind: 'directional'; dir: 1 | -1; negated: boolean; operators: string[] }
  | { kind: 'null'; phrase: string };

/**
 * Lexical reading of one assertion, or null when no safe reading exists
 * (no operator, mixed signals, or subject negation).
 */
export const assertionDirection = (text: string): AssertionReading | null => {
  const low = normalizeLigatures(String(text ?? '').toLowerCase());
  if (SUBJECT_NEGATION.some((p) => low.includes(p))) return null;
  const nullMatch = NULL_EFFECT.exec(low);
  const up: string[] = [];
  const down: string[] = [];
  for (const t of directionTokens(text)) {
    if (DIRECTION_UP.has(t)) up.push(t);
    else if (DIRECTION_DOWN.has(t)) down.push(t);
  }
  // A null phrase and a direction operator in one text: which quantity the
  // null applies to is not lexically decidable — abstain.
  if (nullMatch !== null && (up.length > 0 || down.length > 0)) return null;
  if (nullMatch !== null) return { kind: 'null', phrase: nullMatch[0] };
  if (up.length > 0 && down.length > 0) return null;
  if (up.length === 0 && down.length === 0) return null;
  const negated = PREDICATE_NEGATION.test(low.replace(NOT_ONLY_IDIOM, ' '));
  return { kind: 'directional', dir: up.length > 0 ? 1 : -1, negated, operators: up.length > 0 ? up : down };
};

/** +1 or -1 effective direction; negation flips it ("does not increase" = -1). */
const effective = (d: Extract<AssertionReading, { kind: 'directional' }>): 1 | -1 =>
  (d.dir * (d.negated ? -1 : 1) as 1 | -1);

export interface DirectionPairAnchor {
  /** True when the two assertions conflict (opposite directions, or effect vs its asserted absence). */
  opposite: boolean;
  /** Anchor string riding the adjudication payload (evidence, never a verdict). */
  context: string;
}

/**
 * Deterministic direction anchor for a cross-paper claim pair — the lexical
 * sibling of stat-forensics' ciPairContext numeric anchor (Lane-06). Fires only
 * when BOTH sides carry a safe reading; the caller has already prefiltered the
 * pair for topical overlap (shared referents), without which lexical
 * opposition is meaningless.
 */
export const directionPairContext = (a: string, b: string): DirectionPairAnchor | null => {
  const ra = assertionDirection(a);
  const rb = assertionDirection(b);
  if (ra === null || rb === null) return null;
  // null-vs-null: corroboration of absence.
  if (ra.kind === 'null' && rb.kind === 'null') {
    return {
      opposite: false,
      context: `both assert absence of effect ("${ra.phrase}" / "${rb.phrase}") — corroboration of a null finding`,
    };
  }
  // null-vs-directional: an asserted effect against its asserted absence is
  // the canonical scientific conflict. A NEGATED direction ("does not
  // increase") is itself null-or-opposite — not safely opposite a null.
  if (ra.kind === 'null' || rb.kind === 'null') {
    if (ra.kind === 'null' && rb.kind === 'directional') {
      if (rb.negated) return null;
      return {
        opposite: true,
        context: `null-vs-effect opposition: one claim asserts "${ra.phrase}" while the other asserts ` +
          `${rb.operators.join('/')} — an asserted effect against its asserted absence is direct contradiction evidence`,
      };
    }
    if (rb.kind === 'null' && ra.kind === 'directional') {
      if (ra.negated) return null;
      return {
        opposite: true,
        context: `null-vs-effect opposition: one claim asserts "${rb.phrase}" while the other asserts ` +
          `${ra.operators.join('/')} — an asserted effect against its asserted absence is direct contradiction evidence`,
      };
    }
    return null;
  }
  const opposite = effective(ra) !== effective(rb);
  return {
    opposite,
    context: opposite
      ? `directional opposition: claimA asserts ${ra.negated ? 'negated ' : ''}${ra.operators.join('/')}` +
        ` while claimB asserts ${rb.negated ? 'negated ' : ''}${rb.operators.join('/')}` +
        ' — opposite assertions about a shared-subject relationship are direct contradiction evidence'
      : `same effective direction: claimA (${ra.negated ? 'negated ' : ''}${ra.operators.join('/')}) and ` +
        `claimB (${rb.negated ? 'negated ' : ''}${rb.operators.join('/')}) point the same way — corroboration evidence`,
  };
};
