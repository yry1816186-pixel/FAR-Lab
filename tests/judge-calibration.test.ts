/**
 * Judge-band calibration tests (2026-09-06). DISCRIMINATING locks:
 *  - the shipped signals' zero-gold-error gate (a signal firing on a gold-FALSE
 *    band pair would mint a leniency FP once the profile is enabled — mutation-lock);
 *  - default-off: profile 'none' keeps majority semantics identical (protocol
 *    changes ONLY by explicit opt-in, and the opt-in is stamped in the artifact);
 *  - rescue semantics: lowers the bar, never mints (0 yes stays false; 1 yes below
 *    the v1 threshold stays false);
 *  - det-false precedence is intrinsic (a direction-opposed pair can never rescue).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  complementRescueSignal, subjectComplementSignal, superlativeComplementSignal,
  CALIBRATION_PROFILES, resolveCalibration, bandCalibrationMatch,
} from '../eval/judge-calibration.mjs';
import { thresholdMatch, MATCH_DEFAULTS, deterministicBandVerdict } from '../eval/claim-match.mjs';
import { judgeRediscovery } from '../eval/rediscovery-judge.mjs';

// Recorded max-judge FNs (adjudication-accuracy.json 2026-09-05, qwen3.7-max 5-vote):
// the concrete strict-side family the signals were calibrated against.
const FN_SUBJECT_COMPLEMENT = [
  'Reduced concentrations of inhibitory secondary bile acids remove a chemical barrier to C. difficile germination.',
  'Loss of secondary bile acids inhibits C. difficile germination and growth.',
];
const FN_SUPERLATIVE = [
  'Distal mismatch bubbles do not propagate to the HNH-sensing interface.',
  'Mismatch tolerance is highest distal to the PAM.',
];

describe('complement-rescue signals (validated 2026-09-06 offline probe)', () => {
  it('subject-complement fires on the recorded subject-negation FN pair', () => {
    expect(subjectComplementSignal(FN_SUBJECT_COMPLEMENT[0], FN_SUBJECT_COMPLEMENT[1])).toBe(true);
  });
  it('superlative-complement fires on the recorded superlative FN pair', () => {
    expect(superlativeComplementSignal(FN_SUPERLATIVE[0], FN_SUPERLATIVE[1])).toBe(true);
  });
  it('union covers both recorded FN shapes', () => {
    expect(complementRescueSignal(...FN_SUBJECT_COMPLEMENT)).toBe(true);
    expect(complementRescueSignal(...FN_SUPERLATIVE)).toBe(true);
  });
  it('abstains on plain paraphrase and unrelated pairs (no negation/complement structure)', () => {
    expect(complementRescueSignal('Antibiotics disrupt the gut microbiota.', 'Antibiotic treatment disturbs gut microbial communities.')).toBe(false);
    expect(complementRescueSignal('A restores X.', 'B reduces Y.')).toBe(false);
  });
  it('mutation-lock: ZERO fires on gold-FALSE band pairs; fires exist on gold-TRUE (157-pair gold)', () => {
    const rows = ['eval/claim-pair-gold.jsonl', 'eval/claim-pair-gold-v21.jsonl']
      .flatMap((f) => readFileSync(resolve(process.cwd(), f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const band = rows.filter((r) => r.bestSim >= 0.10 && r.bestSim < 0.40 && r.claim && r.counterpart
      && deterministicBandVerdict(r.claim, r.counterpart) !== false);
    const onFalse = band.filter((r) => r.label === false && complementRescueSignal(r.claim, r.counterpart));
    const onTrue = band.filter((r) => r.label === true && complementRescueSignal(r.claim, r.counterpart));
    expect(onFalse).toEqual([]); // zero-gold-error gate: any fire here is an FP mint once enabled
    expect(onTrue.length).toBeGreaterThanOrEqual(3); // rescue potential exists (lock >= probe's 3)
  });
});

describe('profile registry and resolution', () => {
  it('default is none and none is inactive (protocol cannot drift silently)', () => {
    expect(CALIBRATION_PROFILES.none.active).toBe(false);
    expect(resolveCalibration(undefined)).toBe(CALIBRATION_PROFILES.none);
    expect(resolveCalibration('none').rescueThreshold).toBeNull();
  });
  it('complement-minority-v1 declares its threshold and is frozen', () => {
    const p = resolveCalibration('complement-minority-v1');
    expect(p.active).toBe(true);
    expect(p.rescueThreshold).toBe(2);
    expect(Object.isFrozen(CALIBRATION_PROFILES)).toBe(true);
    expect(Object.isFrozen(p)).toBe(true);
  });
  it('unknown profile name fails visibly (a typo must never silently fall back)', () => {
    expect(() => resolveCalibration('complement-minority')).toThrow(/unknown judge calibration profile/);
  });
});

describe('bandCalibrationMatch aggregation semantics', () => {
  const profile = resolveCalibration('complement-minority-v1');
  it('inactive profile never fires — caller keeps majority semantics', () => {
    const r = bandCalibrationMatch({ profile: CALIBRATION_PROFILES.none, claim: FN_SUBJECT_COMPLEMENT[0], counterpart: FN_SUBJECT_COMPLEMENT[1], yesCount: 4, validCount: 5 });
    expect(r).toEqual({ fired: false, matched: null });
  });
  it('never mints: 0 yes votes stays unmatched even when the signal fires', () => {
    const r = bandCalibrationMatch({ profile, claim: FN_SUBJECT_COMPLEMENT[0], counterpart: FN_SUBJECT_COMPLEMENT[1], yesCount: 0, validCount: 5 });
    expect(r.fired).toBe(true);
    expect(r.matched).toBe(false);
  });
  it('v1 threshold is 2: 1 yes stays unmatched, 2 yes rescues (majority-of-5 would need 3)', () => {
    const one = bandCalibrationMatch({ profile, claim: FN_SUPERLATIVE[0], counterpart: FN_SUPERLATIVE[1], yesCount: 1, validCount: 5 });
    expect(one.matched).toBe(false);
    const two = bandCalibrationMatch({ profile, claim: FN_SUPERLATIVE[0], counterpart: FN_SUPERLATIVE[1], yesCount: 2, validCount: 5 });
    expect(two.matched).toBe(true);
    expect(two.threshold).toBe(2);
  });
  it('det-false precedence is intrinsic: a pair the S2 pre-layer proves different can never be rescued', () => {
    // same direction (restore), negation parity differs ("does not" vs bare), and the
    // superlative signal fires textually ("highest" + shared tokens) — the det-false
    // rule owns this pair and the rescue must refuse it even at 4-of-5 yes votes.
    const opposed = ['A does not restore mismatch tolerance at the interface.', 'A restores mismatch tolerance with highest fidelity.'];
    expect(deterministicBandVerdict(opposed[0], opposed[1])).toBe(false);
    expect(superlativeComplementSignal(opposed[0], opposed[1])).toBe(true); // signal fires textually...
    const r = bandCalibrationMatch({ profile, claim: opposed[0], counterpart: opposed[1], yesCount: 4, validCount: 5 });
    expect(r.fired).toBe(false); // ...but precedence forbids the rescue
    expect(r.matched).toBeNull();
  });
  it('signal not firing returns majority semantics to the caller', () => {
    const r = bandCalibrationMatch({ profile, claim: 'A restores X.', counterpart: 'B reduces Y.', yesCount: 2, validCount: 5 });
    expect(r).toEqual({ fired: false, matched: null });
  });
  it('monotonicity: the rescue only LOWERS the bar — a 1-valid-vote majority (threshold 1) is never un-matched', () => {
    // 1 valid vote saying yes: majority threshold is 1, rescue threshold is 2 — the
    // effective threshold must be min(2, 1) = 1 so the signaled pair stays MATCHED.
    // (A naive yesCount >= 2 here would have INTRODUCED strictness under a profile
    // whose only purpose is measured leniency — self-review fix 2026-09-06.)
    const one = bandCalibrationMatch({ profile, claim: FN_SUBJECT_COMPLEMENT[0], counterpart: FN_SUBJECT_COMPLEMENT[1], yesCount: 1, validCount: 1 });
    expect(one.fired).toBe(true);
    expect(one.matched).toBe(true);
    expect(one.threshold).toBe(1);
    const zero = bandCalibrationMatch({ profile, claim: FN_SUBJECT_COMPLEMENT[0], counterpart: FN_SUBJECT_COMPLEMENT[1], yesCount: 0, validCount: 1 });
    expect(zero.matched).toBe(false);
  });
});

describe('judgeRediscovery calibration integration (mock provider)', () => {
  // GT corpus reproduces the gold-era tf-idf context: with these shared-vocabulary
  // fillers the subject-complement FN pair lands IN-BAND (sim ~0.27) with the real
  // counterpart as the best match (verified empirically; a 2-claim corpus gives
  // ~0.41 — above the band top — because shared terms carry corpus-distinctive idf).
  const gt = [
    FN_SUBJECT_COMPLEMENT[1],
    'Secondary bile acids inhibit C. difficile germination in the murine gut.',
    'Primary bile acids promote germination of C. difficile spores.',
    'Antibiotic treatment depletes bile acid metabolizing taxa.',
  ];
  const agentClaim = FN_SUBJECT_COMPLEMENT[0];
  const m = thresholdMatch([agentClaim], gt, MATCH_DEFAULTS);
  it('precondition: the pair is borderline (in-band) against the real counterpart', () => {
    expect(m.borderline.length).toBeGreaterThan(0);
    const agentBorderline = m.borderline.find((b) => b.side === 'agent');
    expect(agentBorderline).toBeDefined();
    expect(agentBorderline?.bestIdx).toBe(0); // counterpart is GT[0], the FN pair's other side
  });
  const makeCall = (voteYesCounts: number[]) => {
    let adjCall = 0;
    return async (req: { purpose: string; userPayload?: { pairs?: unknown[] } }, validate: (raw: unknown) => unknown) => {
      if (req.purpose === 'rediscovery:decompose-v21') {
        const v = validate({ agentClaims: [agentClaim] });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      }
      const nPairs = req.userPayload?.pairs?.length ?? 0;
      const yesCount = voteYesCounts[Math.min(adjCall, voteYesCounts.length - 1)];
      const callIdx = adjCall; // 0-based vote index
      adjCall += 1;
      // item 0 votes yes on the first yesCount calls, no afterwards; other items always no
      const v = validate({ verdicts: Array.from({ length: nPairs }, (_, idx) => (idx === 0 ? callIdx < yesCount : false)) });
      return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
    };
  };
  it('default (no calibration param): 2-of-5 yes votes lose the majority — unmatched, profile stamped none', async () => {
    const res = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall([2, 2, 2, 2, 2]) });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.calibration).toEqual({ profile: 'none', fired: 0, flipped: 0 });
      expect(res.counts.agentMatched).toBe(0);
      const agentVote = res.adjudicationVotes.find((v) => v.basis === 'majority');
      expect(agentVote).toBeDefined();
    }
  });
  it('complement-minority-v1: the same 2-of-5 yes votes rescue the signaled pair — matched, fired/flipped stamped', async () => {
    const res = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall([2, 2, 2, 2, 2]), calibration: 'complement-minority-v1' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.calibration.profile).toBe('complement-minority-v1');
      expect(res.calibration.fired).toBeGreaterThan(0);
      expect(res.calibration.flipped).toBeGreaterThan(0);
      expect(res.counts.agentMatched).toBe(1);
      const rescued = res.adjudicationVotes.find((v) => v.basis === 'complement-rescue');
      expect(rescued?.calibrationSignal).toBe('subject-complement');
      expect(rescued?.calibrationThreshold).toBe(2);
    }
  });
  it('unanimous no (0-of-5) stays unmatched under the rescue profile (never mints)', async () => {
    const res = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall([0, 0, 0, 0, 0]), calibration: 'complement-minority-v1' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.calibration.fired).toBeGreaterThan(0);
      expect(res.calibration.flipped).toBe(0);
      expect(res.counts.agentMatched).toBe(0);
    }
  });
  it('unknown profile name fails visibly at pipeline entry (never silently uncalibrated)', async () => {
    const call = makeCall([3, 3, 3, 3, 3]);
    await expect(judgeRediscovery({ agentText: 't', gtClaims: gt, call, calibration: 'typo-profile' })).rejects.toThrow(/unknown judge calibration profile/);
  });
});
