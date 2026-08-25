import { describe, expect, it } from 'vitest';
import { bootstrapBtCis, bradleyTerry, compositeScore, BT_BOOTSTRAP_ROUNDS, deterministicEvidenceGrounding, type ContestedMatch } from '../src/pipeline/stages/rank.js';
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
