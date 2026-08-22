import { describe, it, expect } from 'vitest';
import {
  checkExperimentSpec, mdeFloorFor, MIN_CONFIRMATORY_NTEST,
  ExperimentSpec, newId,
} from '../src/domain/index.js';

/**
 * Wave-S/s2 #6 (g5) — confirmatory statistical-design gate. Injection-fault discipline:
 * each violating spec MUST be caught (green here means the gate discriminates).
 */

const hypId = newId('hyp');

const makeSpec = (over: {
  mde?: number;
  hypothesisBound?: boolean;
  metricKey?: ExperimentSpec['metrics'][number];
  exploratoryNote?: string;
} = {}): ExperimentSpec => ExperimentSpec.parse({
  id: newId('xsp'),
  runId: newId('run'),
  planId: newId('pln'),
  planStepId: newId('task'),
  version: 1,
  question: 'separability',
  datasets: [{
    source: { resolver: 'local', path: 'C:/fixture/whatever.csv' },
    targetColumn: 'label',
    split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
  }],
  models: [
    { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0 },
    { name: 'logistic', builderId: 'logistic_regression', hyperparams: {}, seed: 7 },
  ],
  metrics: [over.metricKey ?? 'accuracy'],
  comparisons: [{
    id: 'cmp',
    metricKey: over.metricKey ?? 'accuracy',
    kind: 'paired_diff',
    modelAIdx: 1,
    modelBIdx: 0,
    direction: 'above',
    threshold: 0,
    thresholdProvenance: 'model-stipulated',
    ...(over.hypothesisBound === false ? {} : { hypothesisId: hypId }),
    primary: true,
    ...(over.mde !== undefined ? { mde: over.mde } : {}),
  }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 200, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  approvals: over.hypothesisBound === false ? [] : [{
    hypothesisId: hypId,
    comparisonIds: ['cmp'],
    decisionRuleSnapshot: 'diff > 0',
    approvedBy: 'gate-test',
    approvedAt: new Date().toISOString(),
  }],
  ...(over.exploratoryNote !== undefined ? { exploratoryNote: over.exploratoryNote } : {}),
  createdAt: new Date().toISOString(),
});

const ctx = (nRows?: number) => ({
  hypothesisIds: [hypId],
  allowLocalDatasets: true,
  ...(nRows !== undefined ? { nRows } : {}),
});

describe('g5 confirmatory MDE gate (Wave-S/s2 #6)', () => {
  it('mdeFloorFor math oracle: 1.96·sqrt(0.5)/sqrt(nTest)', () => {
    expect(mdeFloorFor(100)).toBeCloseTo((1.96 * Math.sqrt(0.5)) / 10, 12);
    expect(mdeFloorFor(30)).toBeCloseTo((1.96 * Math.sqrt(0.5)) / Math.sqrt(30), 12);
    expect(MIN_CONFIRMATORY_NTEST).toBe(30);
  });

  it('injection fault: hypothesis-bound comparison with NO mde is rejected', () => {
    const r = checkExperimentSpec(makeSpec(), ctx());
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('declares no mde');
  });

  it('mde declared, nRows unknown (spec-time): passes, floor deferred with a note', () => {
    const r = checkExperimentSpec(makeSpec({ mde: 0.3 }), ctx());
    expect(r.passed).toBe(true);
    expect(r.statisticalNote).toContain('after dataset acquisition');
  });

  it('injection fault: nTest below the confirmatory floor is rejected once nRows is known', () => {
    // 60 rows × 0.3 = 18 test rows < 30
    const r = checkExperimentSpec(makeSpec({ mde: 0.3 }), ctx(60));
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('too few test rows');
  });

  it('injection fault: declared mde below the attainability floor is rejected ([0,1] metric)', () => {
    // 100 rows → nTest=30 → floor ≈ 0.253; mde 0.2 is under-powered even in the best case
    const r = checkExperimentSpec(makeSpec({ mde: 0.2 }), ctx(100));
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('below the attainability floor');
    // and 0.3 clears it
    expect(checkExperimentSpec(makeSpec({ mde: 0.3 }), ctx(100)).passed).toBe(true);
  });

  it('scale-dependent (regression) metrics are exempt from the unit floor — no fake precision', () => {
    // r2 with classifier builders trips the PRE-EXISTING classifier/regression gate (a
    // different, orthogonal check) — what we assert here is that the g5 FLOOR does not
    // fire for scale-dependent metrics even at a tiny declared mde.
    const r = checkExperimentSpec(
      makeSpec({ mde: 0.001, metricKey: 'r2' }),
      ctx(100),
    );
    expect(r.missing.join(' ')).not.toContain('attainability floor');
    expect(r.missing.join(' ')).not.toContain('too few test rows');
  });

  it('exploratory runs keep the advisory lane: no mde demanded (injection stays honest)', () => {
    const r = checkExperimentSpec(
      makeSpec({ hypothesisBound: false, exploratoryNote: 'purely exploratory re-analysis' }),
      ctx(100),
    );
    expect(r.passed).toBe(true);
    expect(r.missing.join(' ')).not.toContain('mde');
    expect(r.statisticalNote).toBeUndefined();
  });
});
