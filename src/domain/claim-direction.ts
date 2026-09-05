/**
 * Deterministic lexical direction of a scientific assertion (2026-09-05).
 *
 * Ported from eval/claim-match.mjs (S1 negation arm, validated with zero gold
 * errors on the 157-pair claim-matching gold set) so the pipeline and the
 * eval instrument share one lexicon, then extended with the negation-aware
 * effective-direction rule for cross-paper pair anchoring.
 *
 * Semantics (all deterministic, no judgment):
 * - subject-negated assertions ("loss of X inhibits Y") abstain — the
 *   operator's subject flips the effective polarity, so no verdict is safe;
 * - mixed up+down operators inside one text abstain (ambiguous);
 * - "not" and other short negators never reach the lexicons (content token
 *   length floor), so negation is detected separately on the raw text.
 */

// Tokenizer: length floor only. The direction lexicons and every stopword list
// in use (eval matcher's, evidence.ts's CROSS_STOPWORDS) are disjoint, so
// stopword stripping cannot change direction detection here — keeping this
// module free of any pipeline-layer import.
const directionTokens = (text: string): Set<string> =>
  new Set(String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));

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

const SUBJECT_NEGATION = [
  'loss of', 'depletion of', 'absence of', 'lack of', 'without',
  'removal of', 'inhibition of', 'inhibitor of', 'inhibitors of',
  'reduced', 'deficient in', 'deficiency of',
];

// Same curated negator set as the matcher's PREDICATE_NEGATION (157-pair
// zero-error provenance); operates on the raw lowercase text.
const PREDICATE_NEGATION = /\b(?:not|cannot|can\s?not|doesn'?t|does\s?not|don'?t|didn'?t|did\s?not|fails?\s+to|failed\s+to|unable\s+to|neither|nor)\b/;

export interface AssertionDirection {
  /** +1 increase-class, -1 decrease-class (of the asserted verb, pre-negation). */
  dir: 1 | -1;
  /** The assertion carries an explicit negator ("does not increase"). */
  negated: boolean;
  /** Matched operators, for disclosure wording. */
  operators: string[];
}

/**
 * Lexical direction of one assertion, or null when no safe direction reading
 * exists (no operator, mixed operators, or subject negation).
 */
export const assertionDirection = (text: string): AssertionDirection | null => {
  const low = String(text ?? '').toLowerCase();
  if (SUBJECT_NEGATION.some((p) => low.includes(p))) return null;
  const up: string[] = [];
  const down: string[] = [];
  for (const t of directionTokens(text)) {
    if (DIRECTION_UP.has(t)) up.push(t);
    else if (DIRECTION_DOWN.has(t)) down.push(t);
  }
  if (up.length > 0 && down.length > 0) return null;
  if (up.length === 0 && down.length === 0) return null;
  const negated = PREDICATE_NEGATION.test(low);
  return { dir: up.length > 0 ? 1 : -1, negated, operators: up.length > 0 ? up : down };
};

/** +1 or -1 effective direction; negation flips it ("does not increase" = -1). */
const effective = (d: AssertionDirection): 1 | -1 => (d.dir * (d.negated ? -1 : 1) as 1 | -1);

export interface DirectionPairAnchor {
  /** True when the two assertions point at opposite effective directions. */
  opposite: boolean;
  /** Anchor string riding the adjudication payload (evidence, never a verdict). */
  context: string;
}

/**
 * Deterministic direction anchor for a cross-paper claim pair — the lexical
 * sibling of stat-forensics' ciPairContext numeric anchor (Lane-06). Fires only
 * when BOTH sides carry a safe direction reading; the caller has already
 * prefiltered the pair for topical overlap (shared referents), without which
 * lexical opposition is meaningless.
 */
export const directionPairContext = (a: string, b: string): DirectionPairAnchor | null => {
  const da = assertionDirection(a);
  const db = assertionDirection(b);
  if (da === null || db === null) return null;
  const opposite = effective(da) !== effective(db);
  return {
    opposite,
    context: opposite
      ? `directional opposition: claimA asserts ${da.negated ? 'negated ' : ''}${da.operators.join('/')}` +
        ` while claimB asserts ${db.negated ? 'negated ' : ''}${db.operators.join('/')}` +
        ' — opposite assertions about a shared-subject relationship are direct contradiction evidence'
      : `same effective direction: claimA (${da.negated ? 'negated ' : ''}${da.operators.join('/')}) and ` +
        `claimB (${db.negated ? 'negated ' : ''}${db.operators.join('/')}) point the same way — corroboration evidence`,
  };
};
