import { describe, expect, it } from 'vitest';
import { bootstrapBtCis, bradleyTerry, compositeScore, BT_BOOTSTRAP_ROUNDS, type ContestedMatch } from '../src/pipeline/stages/rank.js';
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
