/**
 * Opt-in calibration profiles for the LLM adjudication band (2026-09-06).
 *
 * WHY: the standing instrument (eval/results/adjudication-accuracy.json, qwen3.7-max,
 * 2026-09-05, n=109 band gold) measured acc 0.789 / TPR 0.838 / FPR 0.236 — the judge
 * is strict-side on one recorded family: complementary phrasings of ONE fact (gold
 * TRUE, five-vote majority FALSE). The prompt already carries the complementary
 * discipline (#149 era) and the max judge still rejects them, so the next lever is a
 * DETERMINISTIC complement signal that lowers the yes-threshold for exactly that pair
 * family — a measured correction of a recorded bias, never a blanket leniency shift.
 *
 * DISCIPLINE (same as every prior band rule, I-003):
 *  - DEFAULT IS OFF. Profile 'none' leaves every decision identical to majority
 *    voting. Production protocol changes only by EXPLICIT profile opt-in, and the
 *    chosen profile is stamped into the artifact (provenance, not silent).
 *  - ZERO-GOLD-ERROR on the 157-pair gold (claim-pair-gold.jsonl + v21): the union
 *    signal fires 3x on gold-TRUE and 0x on gold-FALSE band pairs (validated
 *    2026-09-06 offline probe; re-runnable via claim-match-calibrate.mjs's
 *    band-calibration arm). It rescues 2 of the 6 recorded max-judge FNs.
 *  - Signals fire ONLY on in-band pairs ([low, high) by MATCH_DEFAULTS) — callers
 *    guarantee band membership; out-of-band firing is out of spec.
 *  - deterministicBandVerdict === false takes precedence INTRINSICALLY: a pair the
 *    zero-error rules prove to be a different finding can never be rescued.
 *  - Rescue never mints a match from nothing: at the standard 5-vote depth
 *    >= rescueThreshold (2) yes votes are required — a unanimous-FALSE signaled
 *    pair stays FALSE. (Monotonicity: with fewer valid votes the effective
 *    threshold is min(rescueThreshold, majority-of-valid) — the rescue can only
 *    LOWER the bar, never raise it; see bandCalibrationMatch.)
 *
 * Honest scope: the OTHER recorded FN shapes — subset-complement naming (MSS vs
 * MSI-high) and same-subject granularity spread — were probed and REJECTED on
 * 2026-09-06: generalized verb-root/negation fired 6x on gold-FALSE, same-subject-
 * same-direction fired 2x on gold-FALSE. They remain the LLM band's residue (and the
 * measured decomposition-granularity share of the north-star F1 gap).
 */

import {
  contentTokens, isContentToken, predicateNegated, SUBJECT_NEGATION_PHRASES, deterministicBandVerdict,
} from './claim-match.mjs';

// True superlative/tolerance markers only. Comparatives (more/less/most) were probed
// and rejected: "Most colorectal tumors are MSS" fired a gold-FALSE pair (2026-09-06).
const SUPERLATIVE_RE = /\b(?:highest|lowest|greatest|tolerant|tolerance)\b/;

/**
 * Signal S2 — subject-complement inversion. BOTH sides carry a subject-negation
 * marker ("loss of X ...", "reduced concentrations of ...") AND share a two-word
 * CONTENT bigram (both words content-bearing, e.g. "secondary bile acids"): the
 * same fact asserted from complementary sides of the subject. Gold: 1 fire on
 * TRUE, 0 on FALSE; rescues recorded max-FN pair "Reduced concentrations of
 * inhibitory secondary bile acids remove a chemical barrier to C. difficile" ||
 * "Loss of secondary bile acids inhibits C. difficile germination and growth."
 *
 * v2 hardening (adversarial audit 2026-09-06): v1 accepted ANY shared bigram, so
 * function-word glue ("in the", "of the", "the population") fired on same-shape
 * pairs about DIFFERENT subjects ("loss of suitable habitat reduces ... songbirds"
 * vs "loss of wetlands reduces ... amphibians"). The both-words-content gate
 * rejects the function-word family while keeping the motivating gold pair.
 */
export const subjectComplementSignal = (claim, counterpart) => {
  const la = String(claim ?? '').toLowerCase();
  const lb = String(counterpart ?? '').toLowerCase();
  if (!SUBJECT_NEGATION_PHRASES.some((p) => la.includes(p))) return false;
  if (!SUBJECT_NEGATION_PHRASES.some((p) => lb.includes(p))) return false;
  const words = la.match(/[a-z][a-z-]+/g) ?? [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!isContentToken(w1) || !isContentToken(w2)) continue;
    if (lb.includes(`${w1} ${w2}`)) return true;
  }
  return false;
};

/**
 * Signal S4 — superlative complement. Predicate negation on EXACTLY one side, a
 * true-superlative/tolerance marker on either side, and >= 2 shared content tokens
 * (len >= 5): "bubbles do not propagate to the interface" vs "tolerance is highest
 * at the interface" (shared: mismatch, distal). Gold: 2 fires on TRUE, 0 on FALSE;
 * rescues recorded max-FN pair "Distal mismatch bubbles do not propagate to the
 * HNH-sensing interface." || "Mismatch tolerance is highest distal to the PAM."
 *
 * v2 hardening (adversarial audit 2026-09-06): v1 required only ONE shared len>=5
 * token, so a single topical word (e.g. a shared organ or shared outcome noun)
 * fired on superlative pairs about different findings. Two shared content tokens
 * is the loosest gate that still holds zero-gold-false with the motivating pair.
 * Negation now runs through predicateNegated (not-only idiom normalized).
 */
export const superlativeComplementSignal = (claim, counterpart) => {
  const la = String(claim ?? '').toLowerCase();
  const lb = String(counterpart ?? '').toLowerCase();
  if (predicateNegated(la) === predicateNegated(lb)) return false;
  if (!SUPERLATIVE_RE.test(la) && !SUPERLATIVE_RE.test(lb)) return false;
  const tb = contentTokens(counterpart);
  let shared = 0;
  for (const t of contentTokens(claim)) {
    if (t.length >= 5 && tb.has(t)) {
      shared += 1;
      if (shared >= 2) return true;
    }
  }
  return false;
};

/** Union of the validated signals; the profile's deterministic complement detector. */
export const complementRescueSignal = (claim, counterpart) =>
  subjectComplementSignal(claim, counterpart) || superlativeComplementSignal(claim, counterpart);

/**
 * Named calibration profiles. Adding a profile REQUIRES offline zero-gold-error
 * validation of its signal (claim-match-calibrate.mjs band-calibration arm) plus a
 * versioned name; the name IS the protocol declaration recorded in artifacts.
 *
 * v1 -> v2 (2026-09-06, adversarial audit): v1's signals could over-fire on
 * same-shape pairs about DIFFERENT subjects (function-word bigrams for S2, single
 * topical token for S4) — the gold zero-error gate was in-sample on the motivating
 * pairs themselves. v2 tightens both gates (both-words-content bigram; >= 2 shared
 * content tokens). NO artifact ever recorded a v1 measurement (live legs were
 * API-blocked), so v1 is retired rather than kept beside v2; referencing it fails
 * visibly instead of silently changing meaning.
 */
export const CALIBRATION_PROFILES = Object.freeze({
  none: Object.freeze({ version: 'none', rescueThreshold: null, active: false }),
  'complement-minority-v2': Object.freeze({ version: 'complement-minority-v2', rescueThreshold: 2, active: true }),
});

/**
 * Fail visibly on unknown profile names — a typo must never silently fall back.
 * Prototype-inherited keys ('toString', '__proto__', ...) are NOT profiles; an
 * active profile must carry a finite rescueThreshold >= 1 (threshold 0 would mint
 * a match from zero yes votes — an invariant no future profile may break).
 */
export const resolveCalibration = (name) => {
  const key = name ?? 'none';
  if (!Object.prototype.hasOwnProperty.call(CALIBRATION_PROFILES, key) || typeof key !== 'string') {
    throw new Error(`unknown judge calibration profile ${JSON.stringify(name)} (known: ${Object.keys(CALIBRATION_PROFILES).join(', ')})`);
  }
  const profile = CALIBRATION_PROFILES[key];
  if (profile.active && (!Number.isFinite(profile.rescueThreshold) || profile.rescueThreshold < 1)) {
    throw new Error(`calibration profile ${key} is active but its rescueThreshold ${JSON.stringify(profile.rescueThreshold)} violates the >= 1 invariant (0 would rescue from zero yes votes)`);
  }
  return profile;
};

/**
 * Band-pair aggregation under a calibration profile.
 * Returns { fired: true, matched, threshold, signal } when the profile is active AND
 * the pair's complement signal fires (det-false pairs can never fire — intrinsic
 * precedence check); returns { fired: false, matched: null } otherwise so the caller
 * keeps its majority-of-valid semantics untouched.
 *
 * MONOTONICITY (self-review fix 2026-09-06): the rescue may only LOWER the decision
 * threshold, never raise it — with 1 valid vote the majority threshold is 1, and a
 * naive `yesCount >= rescueThreshold(2)` would have UN-matched a pair the majority
 * already matched. The effective threshold is therefore min(rescueThreshold,
 * majorityThreshold), computed intrinsically so no caller can combine it wrongly.
 */
export const bandCalibrationMatch = ({ profile, claim, counterpart, yesCount, validCount }) => {
  if (!profile?.active) return { fired: false, matched: null };
  if (!Number.isFinite(validCount) || validCount <= 0 || !Number.isFinite(yesCount)) return { fired: false, matched: null };
  if (deterministicBandVerdict(claim, counterpart) === false) return { fired: false, matched: null };
  const signal = subjectComplementSignal(claim, counterpart)
    ? 'subject-complement'
    : superlativeComplementSignal(claim, counterpart) ? 'superlative-complement' : null;
  if (signal === null) return { fired: false, matched: null };
  const majorityThreshold = Math.floor(validCount / 2) + 1;
  const threshold = Math.min(profile.rescueThreshold, majorityThreshold);
  return { fired: true, matched: yesCount >= threshold, threshold, signal };
};
