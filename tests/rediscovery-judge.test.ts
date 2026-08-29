/**
 * Wave-9 D-039 tests: rediscovery judge v2.1 pipeline + deterministic statistics layer.
 * These are DISCRIMINATING tests — each locks a behavior that a real regression would
 * break (variance creep, fail-open scoring, protocol drift, nondeterminism).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { medianPass, buildDecomposeTask, judgeRediscovery } from '../eval/rediscovery-judge.mjs';
import { thresholdMatch, MATCH_DEFAULTS } from '../eval/claim-match.mjs';
import { mulberry32, seedFromString, bootstrapMeanCI, pairedPermutationTest, wilsonInterval, maxAbsSwing, variance, cohensKappa, benjaminiHochberg, clusterStderr, decideDeltaReality, krippendorffAlpha, pooledStderr } from '../eval/stats.mjs';
import { median, mode, majAtK, atLeast, passAtK, namedReductions } from '../eval/reducers.mjs';
import { TASKS, GT_REV } from '../eval/rediscovery-tasks.mjs';

describe('medianPass (D-037 behavior preserved)', () => {
  it('picks the middle pass by claim count for 3 passes', () => {
    expect(medianPass([['a', 'b', 'c', 'd'], ['a'], ['a', 'b']])).toEqual(['a', 'b']);
    expect(medianPass([['a'], ['a', 'b', 'c'], ['x', 'y']])).toEqual(['x', 'y']);
  });
  it('returns the single pass unchanged', () => {
    expect(medianPass([['only']])).toEqual(['only']);
  });
});

describe('buildDecomposeTask fixed-granularity protocol (D-029)', () => {
  const task = buildDecomposeTask('agent text', TASKS[0].gtClaims);
  it('anchors target count to the GT grain', () => {
    expect(task.userPayload.protocol).toContain(`Aim for ${TASKS[0].gtClaims.length - 2}-${TASKS[0].gtClaims.length + 2} claims`);
  });
  it('carries the atomic-unit definition and the exclusion rule', () => {
    expect(task.userPayload.protocol).toContain('one subject + one mechanism + one direction');
    expect(task.userPayload.protocol).toContain('EXCLUDE purely methodological predictions');
  });
  it('embeds two GT-claim grain examples', () => {
    expect(task.userPayload.protocol).toContain(TASKS[0].gtClaims[0]);
    expect(task.userPayload.protocol).toContain(TASKS[0].gtClaims[1]);
  });
});

/** Provider-call recorder: deterministic scripted responses. */
const scriptedCall = (script: Array<{ ok: true; data: unknown } | { ok: false; error: { message: string } }>) => {
  const calls: unknown[] = [];
  let i = 0;
  return {
    calls,
    call: async (req: unknown, validate: (raw: unknown) => unknown) => {
      calls.push(req);
      const step = script[Math.min(i, script.length - 1)];
      i += 1;
      if (!step.ok) return step;
      const validated = validate(step.data);
      if (validated instanceof Error) return { ok: false, error: { message: validated.message } };
      return { ok: true, data: validated };
    },
  };
};

describe('judgeRediscovery pipeline v2.1', () => {
  it('produces identical F1 for identical scripted inputs (deterministic given calls)', async () => {
    const gt = ['Antibiotics disrupt the gut microbiota.', 'Loss of secondary bile acids inhibits C. difficile germination and growth.'];
    const script = () => scriptedCall([
      { ok: true, data: { agentClaims: ['Antibiotic treatment disrupts the gut microbiome.', 'Secondary bile acids inhibit C. difficile spore germination and vegetative growth.'] } },
    ]);
    const a = await judgeRediscovery({ agentText: 'text', gtClaims: gt, call: script().call });
    const b = await judgeRediscovery({ agentText: 'text', gtClaims: gt, call: script().call });
    expect(a.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.f1).toBe(b.f1);
      expect(a.f1).toBeGreaterThan(0.4); // near-paraphrase agent claims must score substantially
    }
  });

  it('fail-visible on decomposition failure (never fabricates a score)', async () => {
    const res = await judgeRediscovery({
      agentText: 'text',
      gtClaims: TASKS[0].gtClaims,
      call: async () => ({ ok: false, error: { message: 'HTTP 402 Insufficient Balance' } }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.stage).toBe('decompose');
  });

  it('rejects malformed decompositions instead of scoring garbage', async () => {
    const res = await judgeRediscovery({
      agentText: 'text',
      gtClaims: TASKS[0].gtClaims,
      call: async () => ({ ok: true, data: { agentClaims: [] } }),
    });
    expect(res.ok).toBe(false); // empty claims fail validation -> fail-visible
  });

  it('adjudication receives the SIMILARITY-BEST counterpart, never a positional fallback (P0 audit regression)', async () => {
    // GT[0] is about sodium azide (unrelated); GT[1] is the real counterpart of the
    // borderline agent claim. The pre-fix bug fed GT[0] to adjudication because
    // borderline entries had no bestIdx and fell back to index 0.
    const gt = [
      'Sodium azide inhibits cytochrome oxidase in the electron transport chain.',
      'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.',
      'Transposons capture and mobilize resistance cassettes onto conjugative plasmids.',
    ];
    const agentClaim = 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.';
    const m = thresholdMatch([agentClaim], gt, MATCH_DEFAULTS);
    expect(m.borderline.length).toBeGreaterThan(0);
    expect(m.borderline[0].bestIdx).toBe(1); // precondition: best counterpart is GT[1], NOT GT[0]
    const seenPairs: Array<{ claim: string; candidate: string | undefined }> = [];
    const call = async (req: { purpose: string; userPayload?: { pairs?: Array<{ claim: string; candidate: string | undefined }> } }, validate: (raw: unknown) => unknown) => {
      if (req.purpose === 'rediscovery:decompose-v21') {
        const v = validate({ agentClaims: [agentClaim] });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      }
      for (const p of req.userPayload?.pairs ?? []) seenPairs.push(p);
      const v = validate({ verdicts: (req.userPayload?.pairs ?? []).map(() => true) });
      return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
    };
    const res = await judgeRediscovery({ agentText: 'text', gtClaims: gt, call });
    expect(res.ok).toBe(true);
    // the agent-side borderline item must have been adjudicated against GT[1]
    const agentSidePair = seenPairs.find((p) => p.claim === agentClaim);
    expect(agentSidePair?.candidate).toBe(gt[1]);
    expect(agentSidePair?.candidate).not.toBe(gt[0]);
  });

  it('partial vote failure: 1-of-5 votes fail -> 4 valid; 2-2 tie does NOT match, 4-0 matches, all-fail is fail-visible', async () => {
    const gt = ['Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.'];
    const agentClaim = 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.';
    const makeCall = (verdictPlan: Array<boolean[] | 'fail'>) => {
      let adjCall = 0;
      return async (req: { purpose: string }, validate: (raw: unknown) => unknown) => {
        if (req.purpose === 'rediscovery:decompose-v21') {
          const v = validate({ agentClaims: [agentClaim] });
          return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
        }
        const plan = verdictPlan[Math.min(adjCall, verdictPlan.length - 1)];
        adjCall += 1;
        if (plan === 'fail') return { ok: false, error: { message: 'HTTP 429' } };
        const v = validate({ verdicts: plan });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      };
    };
    // both sides of the pair are borderline -> each adjudication call carries TWO items
    // vote1 fail, votes2-5 [T,T],[F,F],[F,F],[F,F] -> 2-2 tie among 4 valid -> NOT matched
    const tie = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall(['fail', [true, true], [false, false]]) });
    expect(tie.ok).toBe(true);
    if (tie.ok) {
      expect(tie.counts.agentMatched).toBe(0);
      expect(tie.scoredUnscored.votesFailed).toBe(1);
      expect(tie.adjudicationVotes[0].votesOk).toBe(4);
    }
    // vote1 fail, votes2-5 unanimous yes -> 4-0 among 4 valid -> matched
    const unanim = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall(['fail', [true, true], [true, true]]) });
    expect(unanim.ok).toBe(true);
    if (unanim.ok) expect(unanim.counts.agentMatched).toBe(1);
    // all five fail -> fail-visible error
    const allFail = await judgeRediscovery({ agentText: 't', gtClaims: gt, call: makeCall(['fail', 'fail', 'fail']) });
    expect(allFail.ok).toBe(false);
    if (!allFail.ok) expect(allFail.error.stage).toBe('adjudicate');
  });

  it('misaligned verdicts (wrong length) are discarded as failed votes, not spliced into the decision', async () => {
    const gt = ['Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.'];
    const agentClaim = 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.';
    const call = async (req: { purpose: string }, validate: (raw: unknown) => unknown) => {
      if (req.purpose === 'rediscovery:decompose-v21') {
        const v = validate({ agentClaims: [agentClaim] });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      }
      const v = validate({ verdicts: [true, true, true] }); // wrong length: 3 verdicts for 2 items
      return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
    };
    const res = await judgeRediscovery({ agentText: 't', gtClaims: gt, call });
    expect(res.ok).toBe(false); // all votes discarded by validation -> fail-visible
    if (!res.ok) expect(res.error.stage).toBe('adjudicate');
  });

  it('object-shaped verdict elements ([{k,verdict:"same"}] — live-observed glm shape) are rejected, never silently counted as NO', async () => {
    // 2026-08-29 live finding: glm-5.3 sometimes returns verdicts as objects; the
    // consumer's `x === true` map turned each object into a false vote — whole
    // batches voted 0/5 NO on paraphrase pairs. The validator must discard these
    // as failed votes (fail-visible / unscored), and a single well-formed vote
    // still decides when others are malformed.
    const gt = ['Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.'];
    const agentClaim = 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.';
    let adjCall = 0;
    const call = async (req: { purpose: string }, validate: (raw: unknown) => unknown) => {
      if (req.purpose === 'rediscovery:decompose-v21') {
        const v = validate({ agentClaims: [agentClaim] });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      }
      adjCall += 1;
      // vote 1 and 2: object-shaped (rejected); votes 3-5: bare booleans, unanimous yes
      const raw = adjCall <= 2
        ? { verdicts: [{ k: 0, verdict: 'same' }, { k: 1, verdict: 'same' }] }
        : { verdicts: [true, true] };
      const v = validate(raw);
      return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
    };
    const res = await judgeRediscovery({ agentText: 't', gtClaims: gt, call });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.scoredUnscored.votesFailed).toBe(2); // 2 malformed calls (object-shaped verdicts)
      expect(res.scoredUnscored.votesOk).toBe(8); // accounting is per borderline item: 2 items x 5 votes - 2 failed calls
      expect(res.counts.agentMatched).toBe(1); // the 3 well-formed yes votes decide — NOT the 2 object-shaped "no"s
    }
  });

  it('majority vote decides borderline pairs (3-of-5)', async () => {
    // One agent claim chosen to land in the borderline band vs this GT claim — BOTH
    // sides independently classify as borderline at the calibrated thresholds.
    const gt = ['Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.'];
    const agentClaim = 'Conjugative plasmid transfer is the dominant mechanism driving ARG spread in hospital environments.';
    const m = thresholdMatch([agentClaim], gt, { high: 0.40, low: 0.12 });
    expect(m.borderline.length).toBe(2); // precondition: agent-side AND gt-side both borderline
    let decomposeUsed = 0;
    const call = async (req: { purpose: string }, validate: (raw: unknown) => unknown) => {
      if (req.purpose === 'rediscovery:decompose-v21') {
        decomposeUsed += 1;
        const v = validate({ agentClaims: [agentClaim] });
        return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
      }
      // vote pattern per adjudication call: vote1 yes, vote2 no, vote3 yes -> 2-of-3 yes
      // for both borderline items (verdicts length = items length = 2)
      const raw = { verdicts: [true, true] };
      const v = validate(raw);
      return v instanceof Error ? { ok: false, error: { message: v.message } } : { ok: true, data: v };
    };
    const res = await judgeRediscovery({ agentText: 'text', gtClaims: gt, call });
    expect(decomposeUsed).toBe(3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.counts.agentMatched).toBe(1); // majority yes
      expect(res.counts.gtMatched).toBe(1);
      expect(res.matcher.version).toBe('v2.2-fixed-gt+tfidf+5vote');
    }
  });
});

describe('deterministic statistics layer (eval/stats.mjs)', () => {
  it('mulberry32: same seed -> identical sequence; different seed -> different', () => {
    const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43);
    const seqA = [a(), a(), a()]; const seqB = [b(), b(), b()]; const seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('seedFromString: stable per string, differs across strings', () => {
    expect(seedFromString('run_xyz')).toBe(seedFromString('run_xyz'));
    expect(seedFromString('run_xyz')).not.toBe(seedFromString('run_abc'));
    expect(Number.isInteger(seedFromString('run_xyz'))).toBe(true);
  });

  it('bootstrapMeanCI: bit-identical under same seed; degenerate single-point data pins the CI', () => {
    const vals = [0.3, 0.5, 0.7, 0.9];
    const r1 = bootstrapMeanCI(vals, { seed: 7, iters: 500 });
    const r2 = bootstrapMeanCI(vals, { seed: 7, iters: 500 });
    expect(r1).toEqual(r2);
    expect(r1.mean).toBeCloseTo(0.6, 12);
    const degenerate = bootstrapMeanCI([0.42], { seed: 7, iters: 100 });
    expect(degenerate.lo).toBeCloseTo(0.42, 12);
    expect(degenerate.hi).toBeCloseTo(0.42, 12);
  });

  it('pairedPermutationTest: exact mode on n=2 matches hand enumeration', () => {
    // before=[1,1], after=[0,0]: diffs=[1,1]; observed mean=1. Sign flips give means
    // {1, 0, 0, -1}: |mean| >= 1 in 2 of 4 flips -> p = (2+1)/(4+1) = 0.6
    const r = pairedPermutationTest([1, 1], [0, 0], { seed: 1, iters: 4 });
    expect(r.mode).toBe('exact');
    expect(r.observedDiff).toBeCloseTo(1, 12);
    expect(r.pValue).toBeCloseTo(0.6, 12);
  });

  it('wilsonInterval: known endpoints', () => {
    expect(wilsonInterval(0, 10).lo).toBe(0);
    expect(wilsonInterval(10, 10).hi).toBe(1);
    const w = wilsonInterval(5, 10); // p=0.5, n=10 -> roughly [0.236, 0.764]
    expect(w.lo).toBeGreaterThan(0.2); expect(w.lo).toBeLessThan(0.27);
    expect(w.hi).toBeGreaterThan(0.73); expect(w.hi).toBeLessThan(0.8);
  });

  it('maxAbsSwing and variance', () => {
    expect(maxAbsSwing([0.17, 0.5, 0.0])).toBeCloseTo(0.5, 12);
    expect(maxAbsSwing([0.5])).toBe(0);
    expect(variance([1, 1, 1])).toBe(0);
    expect(variance([0, 2])).toBe(1);
  });

  it('cohensKappa: perfect agreement = 1; independent raters ~ 0 (hand-checkable)', () => {
    expect(cohensKappa(['a', 'a', 'b'], ['a', 'a', 'b']).kappa).toBeCloseTo(1, 12);
    // raterB independent of raterA: po=0.5, pe = 0.5 (both 50/50) -> kappa=0
    const k = cohensKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b']);
    expect(k.agreement).toBeCloseTo(0.5, 12);
    expect(k.kappa).toBeCloseTo(0, 12);
  });

  it('benjaminiHochberg: known step-up result and monotonicity', () => {
    // classic example: p=[0.01,0.04,0.03,0.005] -> BH q = [0.02, 0.04, 0.04, 0.02] (sorted asc)
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
    expect(q[3]).toBeCloseTo(0.02, 12); // smallest p, rank1: 0.005*4/1=0.02
    expect(q[0]).toBeCloseTo(0.02, 12); // 0.01 rank2: 0.01*4/2=0.02 -> min(0.02, later)=0.02
    expect(q[2]).toBeCloseTo(0.04, 12); // 0.03 rank3: 0.04
    expect(q[1]).toBeCloseTo(0.04, 12); // 0.04 rank4: 0.04
    expect(benjaminiHochberg([])).toEqual([]);
  });

  it('clusterStderr: zero within-cluster variance pattern -> se reflects cluster spread', () => {
    // two clusters [1,1] and [3,3]: grand=2; within-cluster products give spread
    const r = clusterStderr([[1, 1], [3, 3]]);
    expect(r.clusters).toBe(2);
    expect(r.se).toBeGreaterThan(0);
    // single cluster degenerates (C<2 -> NaN, honest)
    expect(Number.isNaN(clusterStderr([[1, 2, 3]]).se)).toBe(true);
  });

  it('decideDeltaReality: gate requires CI excluding 0 AND meeting MDE; small N downgraded', () => {
    expect(decideDeltaReality({ delta: 0.3, ciLo: 0.1, ciHi: 0.5, pValue: 0.02, mde: 0.2, n: 30 }).verdict).toBe('REAL');
    expect(decideDeltaReality({ delta: 0.3, ciLo: -0.1, ciHi: 0.5, pValue: 0.2, mde: 0.2, n: 30 }).verdict).toBe('NOT_SIGNIFICANT');
    expect(decideDeltaReality({ delta: 0.1, ciLo: 0.05, ciHi: 0.15, pValue: 0.01, mde: 0.2, n: 30 }).verdict).toBe('NOT_SIGNIFICANT'); // CI ok but below MDE
    const small = decideDeltaReality({ delta: 0.9, ciLo: 0.8, ciHi: 1.0, mde: 0.2, n: 5 });
    expect(small.verdict).toBe('REAL');
    expect(small.warnings.join(' ')).toContain('exploratory');
    expect(decideDeltaReality({ delta: 0.9, ciLo: 0.8, ciHi: 1.0, mde: 0.2, n: 3 }).verdict).toBe('INSUFFICIENT_N');
  });

  it('krippendorffAlpha: perfect=1, anti-agreement negative, nominal hand-check vs kappa', () => {
    expect(krippendorffAlpha([[1, 2, 3, 4], [1, 2, 3, 4]]).alpha).toBeCloseTo(1, 10);
    expect(krippendorffAlpha([[1, 1, 2, 2], [2, 2, 1, 1]]).alpha).toBeLessThan(0);
    // independent balanced raters -> ~0 (same property kappa showed)
    const ind = krippendorffAlpha([[1, 1, 1, 1, 2, 2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2]]);
    expect(Math.abs(ind.alpha)).toBeLessThan(0.15);
    // single-value domain -> NaN (honest degenerate)
    expect(Number.isNaN(krippendorffAlpha([[1, 1], [1, 1]]).alpha)).toBe(true);
    // missing values (null) are excluded per-unit, not imputed
    const withMissing = krippendorffAlpha([[1, null, 3], [1, 2, 3]]);
    expect(withMissing.alpha).toBeCloseTo(1, 10); // the two co-rated units agree perfectly
  });

  it('pooledStderr: identical groups reduce to single-group SE/sqrt(k); degenerate empty -> NaN', () => {
    const g = { mean: 0.5, stderr: 0.1, n: 10 };
    const r = pooledStderr([g, g, g, g]);
    expect(r.n).toBe(40);
    expect(r.se).toBeCloseTo(0.1 / 2, 10); // equal means: pooled SE = sqrt(4*100)/40 = 0.05
    expect(Number.isNaN(pooledStderr([]).se)).toBe(true);
    // divergent group means inflate pooled SE far beyond within-group noise
    // hand-check: means 0/1 (n=10 each), stderr 0.01 -> se = sqrt(10*(0.001+0.25)*2)/20 = 0.112
    const far = pooledStderr([{ mean: 0, stderr: 0.01, n: 10 }, { mean: 1, stderr: 0.01, n: 10 }]);
    expect(far.se).toBeGreaterThan(0.1);
    expect(far.se).toBeLessThan(0.12);
  });

describe('reducers (inspect_ai at_least/mode + lm-eval maj@k pattern)', () => {
  it('median handles odd/even/degenerate', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });

  it('mode: strict majority only; ties are honest undefined', () => {
    expect(mode([true, true, false])).toBe(true);
    expect(mode([true, false])).toBeUndefined();
    expect(mode([])).toBeUndefined();
  });

  it('majAtK: majority over prefix slice', () => {
    expect(majAtK([true, false, true, false], 3)).toBe(true); // [T,F,T] -> T
    expect(majAtK([true, false, true, false], 2)).toBeUndefined(); // [T,F] tie
  });

  it('atLeast: k-of-n gate semantics', () => {
    expect(atLeast([true, false, true], 2)).toBe(true);
    expect(atLeast([true, false, false], 2)).toBe(false);
    expect(atLeast([], 1)).toBe(false);
  });

  it('passAtK: unbiased estimator matches hand-computed cases', () => {
    // n=10, c=1, k=1: 1 - C(9,1)/C(10,1) = 1 - 9/10 = 0.1
    expect(passAtK(10, 1, 1)).toBeCloseTo(0.1, 12);
    // n=10, c=5, k=5: 1 - C(5,5)/C(10,5) = 1 - 1/252
    expect(passAtK(10, 5, 5)).toBeCloseTo(1 - 1 / 252, 12);
    // boundary: c=0 -> 0; c covers all -> 1
    expect(passAtK(10, 0, 3)).toBe(0);
    expect(passAtK(10, 10, 3)).toBe(1);
    expect(passAtK(10, 8, 3)).toBe(1); // c > n-k
  });

  it('namedReductions: one budget -> multiple named readouts', () => {
    const r = namedReductions([true, false, true]);
    expect(r.first).toBe(true);
    expect(r.majAll).toBe(true);
    expect(r.atLeastHalf).toBe(true);
    expect(r.unanimous).toBe(false);
    expect(r.n).toBe(3);
  });
});
});

describe('gold calibration regression (claim-pair-gold.jsonl)', () => {
  const goldPath = resolve(process.cwd(), 'eval/claim-pair-gold.jsonl');
  const gold = readFileSync(goldPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as {
    task: string; side: string; claim: string; counterpart: string | null; bestSim: number; label: boolean;
  });
  const goldV21Path = resolve(process.cwd(), 'eval/claim-pair-gold-v21.jsonl');
  const goldV21 = readFileSync(goldV21Path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as typeof gold[number]);
  const merged = [...gold, ...goldV21];

  it('gold file exists with the recorded protocol (28 true / 76 false, main-agent)', () => {
    expect(gold.length).toBe(104);
    expect(gold.filter((g) => g.label).length).toBe(28);
  });

  it('v2.1-era gold batch exists (below-floor + band zones, 13 true / 40 false)', () => {
    expect(goldV21.length).toBe(53);
    expect(goldV21.filter((g) => g.label).length).toBe(13);
    expect(goldV21.every((g) => g.src === 'rediscovery.jsonl@v2.1-concise-20260829')).toBe(true);
  });

  it('PRODUCTION defaults (MATCH_DEFAULTS) make ZERO deterministic errors on BOTH gold sets — mutation-locked', () => {
    const detYes = merged.filter((g) => g.bestSim >= MATCH_DEFAULTS.high);
    const detNo = merged.filter((g) => g.bestSim < MATCH_DEFAULTS.low);
    // regression guard: the values SHIPPED IN PRODUCTION must not auto-match a false
    // pair nor auto-reject a true pair (verified by mutation: low 0.10->0.12 reddens
    // via the v21 batch's true pairs at 0.110-0.119)
    expect(detYes.every((g) => g.label)).toBe(true);
    expect(detNo.every((g) => !g.label)).toBe(true);
  });

  it('a tighter low threshold than production WOULD kill a true gold pair (mutation evidence)', () => {
    // documents WHY low=0.10: the 08-22 true pair at 0.124 AND the v21 true pairs at
    // 0.110-0.119 all sit just above it
    const wouldKill = merged.filter((g) => g.label && g.bestSim < 0.12);
    expect(wouldKill.length).toBeGreaterThanOrEqual(3);
  });

  it('the old default (0.45/0.18) KILLED a true pair at 0.124 — mutation evidence the calibration mattered', () => {
    const killedByOldLow = gold.filter((g) => g.label && g.bestSim >= 0.12 && g.bestSim < 0.18);
    expect(killedByOldLow.length).toBeGreaterThan(0); // true pairs the old low=0.18 would auto-reject
  });

  it('every TASK carries a non-empty fixed gtClaims (GT decomposition is structural)', () => {
    for (const t of TASKS) {
      expect(t.gtClaims.length).toBeGreaterThanOrEqual(5);
      expect(t.gtClaims.every((c: string) => typeof c === 'string' && c.length > 20)).toBe(true);
    }
    expect(GT_REV).toBe('gt-fixed-2026-08-22');
  });

  // The judge seed files are internal eval data (excluded from the public release by
  // decision D-069); the public tree skips this reproducibility lock VISIBLY instead
  // of failing on absent fixtures.
  const ev1SeedsPresent = ['llm-judge-ev1.jsonl', 'llm-judge-ev1-s2.jsonl', 'llm-judge-ev1-s3.jsonl']
    .every((f) => existsSync(resolve(process.cwd(), 'eval/results', f)));
  (ev1SeedsPresent ? it : it.skip)('EV1 3-seed agreement re-analysis is REPRODUCIBLE and its headline numbers are locked', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('node', ['eval/ev1-judge-agreement.mjs'], { encoding: 'utf8' });
    expect(out).toContain('krippendorff alpha (ordinal, 3 seeds): 0.228'); // quality-dim unreliability locked
    expect(out).toContain('krippendorff alpha (ordinal, 3 seeds): 0.605'); // counter-dim moderate
    // the farlab counter advantage held at EVERY seed (aggregate-level stability claim)
    expect(out).toContain('2.2 CI [2.20, 2.20]');
    expect(out).toContain('1.6 CI [1.60, 1.60]');
    // mutation guard: if the stats layer or data changes these, the test reddens
    expect(out).toContain('exact 3-seed agreement: 3/15');
    expect(out).toContain('exact 3-seed agreement: 7/15');
  });
});

describe('local secrets loader (unlock path)', () => {
  it('loads filled keys, skips empty slots and comments, never overrides existing env', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'farlab-secrets-'));
    const f = join(dir, 'secrets.env');
    writeFileSync(f, '# comment\nTESTKEY_UNSET_A=alpha\nTESTKEY_UNSET_B=\n\nTESTKEY_SET_A=beta\n');
    const prev = process.env.TESTKEY_SET_A;
    process.env.TESTKEY_SET_A = 'existing';
    try {
      const { loadLocalSecrets } = await import('../eval/load-secrets.mjs');
      const r = loadLocalSecrets(f);
      expect(r.loaded).toEqual(['TESTKEY_UNSET_A']); // filled key loaded; empty slot skipped
      expect(process.env.TESTKEY_UNSET_A).toBe('alpha');
      expect(process.env.TESTKEY_SET_A).toBe('existing'); // env wins, file never overrides
      expect(r.loaded.join()).not.toContain('beta'); // names only, values never reported
    } finally {
      if (prev === undefined) delete process.env.TESTKEY_SET_A; else process.env.TESTKEY_SET_A = prev;
      delete process.env.TESTKEY_UNSET_A;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('absent file -> env-only mode, no throw', async () => {
    const { loadLocalSecrets } = await import('../eval/load-secrets.mjs');
    const r = loadLocalSecrets('Z:/definitely/not/here/secrets.env');
    expect(r.loaded).toEqual([]);
  });
});
