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

import { contentTokens, PREDICATE_NEGATION_RE, SUBJECT_NEGATION_PHRASES, deterministicBandVerdict } from './claim-match.mjs';

// True superlative/tolerance markers only. Comparatives (more/less/most) were probed
// and rejected: "Most colorectal tumors are MSS" fired a gold-FALSE pair (2026-09-06).
const SUPERLATIVE_RE = /\b(?:highest|lowest|greatest|tolerant|tolerance)\b/;

/**
 * Signal S2 — subject-complement inversion. BOTH sides carry a subject-negation
 * marker ("loss of X ...", "reduced concentrations of ...") AND share a two-word
 * head noun ("secondary bile acids"): the same fact asserted from complementary
 * sides of the subject. Gold: 1 fire on TRUE, 0 on FALSE; rescues recorded max-FN
 * pair "Reduced concentrations of inhibitory secondary bile acids remove a chemical
 * barrier to C. difficile" || "Loss of secondary bile acids inhibits C. difficile
 * germination and growth."
 */
export const subjectComplementSignal = (claim, counterpart) => {
  const la = String(claim ?? '').toLowerCase();
  const lb = String(counterpart ?? '').toLowerCase();
  if (!SUBJECT_NEGATION_PHRASES.some((p) => la.includes(p))) return false;
  if (!SUBJECT_NEGATION_PHRASES.some((p) => lb.includes(p))) return false;
  const words = la.match(/[a-z][a-z-]+/g) ?? [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (lb.includes(bigram)) return true;
  }
  return false;
};

/**
 * Signal S4 — superlative complement. Predicate negation on EXACTLY one side, a
 * true-superlative/tolerance marker on either side, and a shared content token
 * (len >= 5): "bubbles do not propagate to the interface" vs "tolerance is highest
 * at the interface". Gold: 2 fires on TRUE, 0 on FALSE; rescues recorded max-FN
 * pair "Distal mismatch bubbles do not propagate to the HNH-sensing interface." ||
 * "Mismatch tolerance is highest distal to the PAM."
 */
export const superlativeComplementSignal = (claim, counterpart) => {
  const la = String(claim ?? '').toLowerCase();
  const lb = String(counterpart ?? '').toLowerCase();
  if (PREDICATE_NEGATION_RE.test(la) === PREDICATE_NEGATION_RE.test(lb)) return false;
  if (!SUPERLATIVE_RE.test(la) && !SUPERLATIVE_RE.test(lb)) return false;
  const tb = contentTokens(counterpart);
  for (const t of contentTokens(claim)) {
    if (t.length >= 5 && tb.has(t)) return true;
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
 */
export const CALIBRATION_PROFILES = Object.freeze({
  none: Object.freeze({ version: 'none', rescueThreshold: null, active: false }),
  'complement-minority-v1': Object.freeze({ version: 'complement-minority-v1', rescueThreshold: 2, active: true }),
});

/** Fail visibly on unknown profile names — a typo must never silently fall back. */
export const resolveCalibration = (name) => {
  const profile = CALIBRATION_PROFILES[name ?? 'none'];
  if (profile === undefined) {
    throw new Error(`unknown judge calibration profile ${JSON.stringify(name)} (known: ${Object.keys(CALIBRATION_PROFILES).join(', ')})`);
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
