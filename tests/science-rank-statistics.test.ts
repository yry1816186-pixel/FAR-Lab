import { describe, expect, it } from 'vitest';
import { bootstrapBtCis, bradleyTerry, compositeScore, leaderBandOrder, weightSensitivity, BT_BOOTSTRAP_ROUNDS, deterministicEvidenceGrounding, type ContestedMatch } from '../src/pipeline/stages/rank.js';
import { stateFromReports } from '../src/app/campaign-driver.js';
import type { ExperimentRun } from '../src/domain/index.js';

/**
 * SCIENCE lane benchmark (2026-08-24) — ranking/campaign statistical layer.
 *
 * 1. BT bootstrap CIs (NEW): standings previously self-described as "without
 *    confidence intervals"; the seeded percentile bootstrap now measures them.
 * 2. primary_falsified contract (BUG FIX): a completed run whose mechanical
 *    verdict is 'falsifies' previously reached unit state 'completed', so the
 *    stop rule could NEVER fire on a statistical falsification (only on infra
 *    crashes, with the wrong meaning).
 * 3. Composite weight-perturbation stability: "fixed weights, do not tune"
 *    was comment-only; now it is a regression-checked property.
 */

const id = (prefix: string, body: string): string => `${prefix}_${body.padEnd(22, '0')}`;

describe('Bradley-Terry bootstrap confidence intervals', () => {
  const ids = [id('hyp', 'a'), id('hyp', 'b'), id('hyp', 'c')];
  const sweep: ContestedMatch[] = [
    { aId: ids[0]!, bId: ids[1]!, outcome: 'a' },
    { aId: ids[0]!, bId: ids[1]!, outcome: 'a' },
    { aId: ids[0]!, bId: ids[1]!, outcome: 'a' },
    { aId: ids[0]!, bId: ids[1]!, outcome: 'a' },
    { aId: ids[0]!, bId: ids[2]!, outcome: 'a' },
    { aId: ids[0]!, bId: ids[2]!, outcome: 'a' },
    { aId: ids[1]!, bId: ids[2]!, outcome: 'b' },
    { aId: ids[1]!, bId: ids[2]!, outcome: 'tie' },
  ];

  it('deterministic under the fixed seed: two calls are byte-identical', () => {
    const x = bootstrapBtCis(ids, sweep);
    const y = bootstrapBtCis(ids, sweep);
    expect([...x.entries()]).toEqual([...y.entries()]);
  });

  it('a dominant candidate CI lies strictly above a dominated one (10-0 sweep)', () => {
    const two = [id('hyp', 'dom'), id('hyp', 'sub')];
    const tenZero: ContestedMatch[] = Array.from({ length: 10 }, () => ({ aId: two[0]!, bId: two[1]!, outcome: 'a' as const }));
    const cis = bootstrapBtCis(two, tenZero);
    expect(cis.get(two[0]!)!.ciLow).toBeGreaterThan(cis.get(two[1]!)!.ciHigh);
    // the point estimate sits inside its own interval
    const bt = new Map(bradleyTerry(two, tenZero).map((s) => [s.hypothesisId, s.btScore] as const));
    expect(cis.get(two[0]!)!.ciLow).toBeLessThanOrEqual(bt.get(two[0]!)!);
    expect(cis.get(two[0]!)!.ciHigh).toBeGreaterThanOrEqual(bt.get(two[0]!)!);
  });

  it('uncontested candidates get no interval (their score is a constant, not a measurement)', () => {
    const withIdle = [...ids, id('hyp', 'idle')];
    const cis = bootstrapBtCis(withIdle, sweep);
    expect(cis.has(id('hyp', 'idle'))).toBe(false);
    expect(cis.size).toBe(3);
  });

  it('rounds default is the documented constant', () => {
    expect(BT_BOOTSTRAP_ROUNDS).toBe(1000);
  });
});

describe('campaign driver: primary_falsified contract (bug fix)', () => {
  const fakeRun = (status: ExperimentRun['status']): ExperimentRun =>
    ({ id: id('exp', 'r'), runId: id('run', 't'), specHash: 'x', datasetFingerprint: 'y', status } as unknown as ExperimentRun);

  it('BEFORE-lock semantics are gone: completed + falsifies verdict maps to failed/falsified', () => {
    const out = stateFromReports(fakeRun('completed'), ['supports', 'falsifies']);
    expect(out.state).toBe('failed');
    expect(out.falsified).toBe(true);
  });

  it('completed without falsification stays completed; canceled stays canceled; operational failure is NOT falsified', () => {
    expect(stateFromReports(fakeRun('completed'), ['supports'])).toEqual({ state: 'completed', falsified: false });
    expect(stateFromReports(fakeRun('completed'), ['inconclusive'])).toEqual({ state: 'completed', falsified: false });
    expect(stateFromReports(fakeRun('canceled'), ['falsifies'])).toEqual({ state: 'canceled', falsified: false });
    expect(stateFromReports(fakeRun('failed'), ['falsifies'])).toEqual({ state: 'failed', falsified: false });
  });
});

describe('composite weight-perturbation stability (property)', () => {
  const dims = [
    { dimension: 'evidence_grounding', value: 0.8 },
    { dimension: 'falsifiability', value: 0.7 },
    { dimension: 'testability', value: 0.9 },
    { dimension: 'counter_evidence_exposure', value: 0.6 },
    { dimension: 'scientific_plausibility', value: 0.75 },
    { dimension: 'novelty', value: 0.5 },
    { dimension: 'methodological_soundness', value: 0.7 },
  ];
  const strong = [...dims];
  const weak = dims.map((d) => ({ ...d, value: d.value - 0.3 }));

  it('a clearly-better hypothesis keeps the higher composite under ±10% weight perturbation', () => {
    // deterministic perturbation grid: multiply each weight by {0.9, 1.0, 1.1}
    const base = compositeScore(strong)!.value;
    const baseWeak = compositeScore(weak)!.value;
    expect(base).toBeGreaterThan(baseWeak);
    const names = dims.map((d) => d.dimension);
    for (const factor of [0.9, 1.0, 1.1]) {
      for (const name of names) {
        // perturb via a synthetic dimension list that shifts ONE weight's leverage:
        // compositeScore applies fixed weights, so emulate perturbation by scaling the
        // dimension VALUE (weight*v) — equivalent for a linear weighted average.
        const perturbedStrong = strong.map((d) => (d.dimension === name ? { ...d, value: Math.min(1, d.value * factor) } : d));
        const perturbedWeak = weak.map((d) => (d.dimension === name ? { ...d, value: Math.min(1, d.value * factor) } : d));
        expect(compositeScore(perturbedStrong)!.value).toBeGreaterThan(compositeScore(perturbedWeak)!.value);
      }
    }
  });

  it('excluded dimensions leave the denominator: fewer included dims never inflates the composite silently', () => {
    const partial = dims.slice(0, 3);
    const out = compositeScore(partial)!;
    expect(out.included).toEqual(['evidence_grounding', 'falsifiability', 'testability']);
    expect(out.excluded.length).toBe(4);
  });
});

describe('weightSensitivity — measured weight-vector stability (persisted on the tournament)', () => {
  const id = (t: string): string => `hyp_${t.padEnd(22, '0')}`;
  const allDims = (v: number) => [
    { dimension: 'evidence_grounding', value: v },
    { dimension: 'falsifiability', value: v },
    { dimension: 'testability', value: v },
    { dimension: 'counter_evidence_exposure', value: v },
    { dimension: 'scientific_plausibility', value: v },
    { dimension: 'novelty', value: v },
    { dimension: 'methodological_soundness', value: v },
  ];

  it('dominant candidate: order is invariant — medianTau=1, top1 always stable', () => {
    const a = { id: id('dom'), dims: allDims(0.9) };
    const b = { id: id('mid'), dims: allDims(0.5) };
    const c = { id: id('low'), dims: allDims(0.2) };
    const s = weightSensitivity([a, b, c], [a.id, b.id, c.id])!;
    expect(s.medianTau).toBe(1);
    expect(s.worstTau).toBe(1);
    expect(s.top1StableRate).toBe(1);
    expect(s.method).toContain('±20%');
  });

  it('order-flipping pair: stability degrades measurably (top1StableRate < 1)', () => {
    // EXACT baseline composite tie with DIFFERENT dimension patterns (A leans on
    // evidence_grounding; B is uniform): every perturbation breaks the tie, and
    // which way it breaks depends on the weight draw — the measurable case.
    const aDims = allDims(0.55).map((d) => (d.dimension === 'evidence_grounding' ? { ...d, value: 1.0 } : d));
    const bDims = allDims(0.64);
    expect(compositeScore(aDims)!.value).toBe(compositeScore(bDims)!.value);
    const a = { id: id('efa'), dims: aDims };
    const b = { id: id('uni'), dims: bDims };
    const s = weightSensitivity([a, b], [a.id, b.id], { rounds: 64 })!;
    expect(s.rounds).toBe(64);
    expect(s.top1StableRate).toBeGreaterThan(0);
    expect(s.top1StableRate).toBeLessThan(1);
    expect(s.medianTau).toBeLessThan(1);
  });

  it('deterministic under the fixed seed; null below 2 scoreable candidates', () => {
    const a = { id: id('aaa'), dims: allDims(0.9) };
    const b = { id: id('bbb'), dims: allDims(0.4) };
    const s1 = weightSensitivity([a, b], [a.id, b.id])!;
    const s2 = weightSensitivity([a, b], [a.id, b.id])!;
    expect(s1).toEqual(s2);
    expect(weightSensitivity([a], [a.id])).toBeNull();
    const nullDim = allDims(0.5).map((d) => ({ ...d, value: null as unknown as number }));
    expect(weightSensitivity([{ id: id('nnn'), dims: nullDim }, b], [id('nnn'), b.id])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lane-06 (2026-08-25): deterministic evidence grounding ladder. The
// evidence_grounding composite dimension (weight 0.20, the largest) is no longer
// an uncalibrated LLM self-score — it is the deterministic evidence-body value.
// ---------------------------------------------------------------------------

describe('deterministicEvidenceGrounding ladder (evidence_body -> dimension value)', () => {
  const body = (over: Partial<import('../src/domain/index.js').EvidenceBody>): import('../src/domain/index.js').EvidenceBody =>
    ({
      id: id('evb', 'x'), runId: id('run', 'x'), hypothesisId: id('hyp', 'x'),
      independentSources: 2, sumLogLrLow: 0.4, sumLogLrHigh: 0.9,
      logLrBand: 'strong_support', qbafScore: 0.7, proofStandard: 'scintilla_evidence',
      experimentalAxes: 0, promotion: 'literature_only_unverified',
      disclosure: 'fixture body', createdAt: '2026-08-25T00:00:00.000Z',
      ...over,
    }) as import('../src/domain/index.js').EvidenceBody;

  it('zero independent sources ground at exactly 0 — nothing grounds the hypothesis', () => {
    const g = deterministicEvidenceGrounding(body({ independentSources: 0 }));
    expect(g.value).toBe(0);
    expect(g.rationale).toContain('zero evidential relations');
  });

  it('value is the mean of the band base and the QBAF score, rounding to 1e-3', () => {
    // strong_support base 0.75, QBAF 0.7 -> 0.725
    expect(deterministicEvidenceGrounding(body({})).value).toBe(0.725);
    // moderate_support base 0.55, QBAF 0.5 -> 0.525
    expect(deterministicEvidenceGrounding(body({ logLrBand: 'moderate_support', qbafScore: 0.5 })).value).toBe(0.525);
  });

  it('counter bands ground below neutral: net counter-evidence is worse than no evidence', () => {
    const neutral = deterministicEvidenceGrounding(body({ logLrBand: 'none', qbafScore: 0.5 })).value;
    const weakCounter = deterministicEvidenceGrounding(body({ logLrBand: 'weak_counter', qbafScore: 0.5 })).value;
    const strongCounter = deterministicEvidenceGrounding(body({ logLrBand: 'strong_counter', qbafScore: 0.5 })).value;
    expect(neutral).toBeGreaterThan(weakCounter);
    expect(weakCounter).toBeGreaterThan(strongCounter);
    expect(strongCounter).toBe(0.25); // mean(0.0, 0.5)
  });

  it('the band ladder is monotone across the support direction', () => {
    const bands = ['very_strong_counter', 'strong_counter', 'moderate_counter', 'weak_counter', 'none', 'weak_support', 'moderate_support', 'strong_support', 'very_strong_support'] as const;
    let prev = -1;
    for (const b of bands) {
      const v = deterministicEvidenceGrounding(body({ logLrBand: b, qbafScore: 0.5 })).value;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // and the strongest support with maximal QBAF stays inside [0,1]
    const top = deterministicEvidenceGrounding(body({ logLrBand: 'very_strong_support', qbafScore: 1 })).value;
    expect(top).toBeLessThanOrEqual(1);
  });
});

describe('leaderBandOrder (CI-honest final ordering, 2026-09-03)', () => {
  const item = (hid: string, composite: number, grounding: number | null = null) =>
    ({ hyp: { id: hid }, composite, evidenceGrounding: grounding });
  const standing = (hid: string, btScore: number) =>
    ({ hypothesisId: hid, btScore, wins: 0, losses: 0, ties: 0, contested: 0 });

  it('CI-overlapping leaders are ordered by evidence grounding first (best-evidenced leads), not raw BT', () => {
    // live shape (egfr v3 run): BT max 10.26 but the top-8 CIs all overlap — raw BT
    // put a lower-grounding item above a better-evidenced one; the band rule must not.
    const items = [item('hyp_a', 0.682, 0.55), item('hyp_b', 0.7985, 0.72), item('hyp_c', 0.8105, 0.81), item('hyp_d', 0.65, 0.6)];
    const standings = new Map([
      ['hyp_a', standing('hyp_a', 10.26)],
      ['hyp_b', standing('hyp_b', 0.88)],
      ['hyp_c', standing('hyp_c', 0.58)],
      ['hyp_d', standing('hyp_d', 0.001)],
    ]);
    const cis = new Map([
      ['hyp_a', { ciLow: 0.32, ciHigh: 11.63 }],
      ['hyp_b', { ciLow: 0.03, ciHigh: 10.05 }],
      ['hyp_c', { ciLow: 0.03, ciHigh: 5.25 }],
      ['hyp_d', { ciLow: 0.0, ciHigh: 0.005 }], // disjoint from the leader CI
    ]);
    const { ordered, bandSize } = leaderBandOrder(items, standings, cis);
    expect(bandSize).toBe(3); // a, b, c overlap the leader; d is separable
    expect(ordered.map((x) => x.hyp.id)).toEqual(['hyp_c', 'hyp_b', 'hyp_a', 'hyp_d']);
  });

  it('grounding ties inside the band fall through to composite then id (deterministic)', () => {
    const items = [item('hyp_z', 0.4, 0.5), item('hyp_y', 0.9, 0.5), item('hyp_x', 0.5, 0.5)];
    const standings = new Map(items.map((i) => [i.hyp.id, standing(i.hyp.id, 1)]));
    const cis = new Map(items.map((i) => [i.hyp.id, { ciLow: 0.5, ciHigh: 1.5 }]));
    const { ordered } = leaderBandOrder(items, standings, cis);
    expect(ordered.map((x) => x.hyp.id)).toEqual(['hyp_y', 'hyp_x', 'hyp_z']); // composite desc -> id asc
  });

  it('null grounding ranks below any measured grounding inside the band (never first by default)', () => {
    const items = [item('hyp_null', 0.9, null), item('hyp_measured', 0.3, 0.2)];
    const standings = new Map([['hyp_null', standing('hyp_null', 2)], ['hyp_measured', standing('hyp_measured', 1)]]);
    const cis = new Map([['hyp_null', { ciLow: 0.5, ciHigh: 3 }], ['hyp_measured', { ciLow: 0.2, ciHigh: 2 }]]);
    const { ordered } = leaderBandOrder(items, standings, cis);
    expect(ordered.map((x) => x.hyp.id)).toEqual(['hyp_measured', 'hyp_null']);
  });

  it('missing CIs degrade to plain BT ordering (previous behavior, no laundering either way)', () => {
    const items = [item('hyp_low', 0.9), item('hyp_high', 0.1)];
    const standings = new Map([['hyp_low', standing('hyp_low', 0.2)], ['hyp_high', standing('hyp_high', 4)]]);
    const { ordered, bandSize } = leaderBandOrder(items, standings, undefined);
    expect(bandSize).toBe(0);
    expect(ordered.map((x) => x.hyp.id)).toEqual(['hyp_high', 'hyp_low']);
  });
});
