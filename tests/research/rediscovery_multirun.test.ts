/**
 * tests/research/rediscovery_multirun.test.ts — the §4.2 N>=5 rule:
 * below N=5 the framework REFUSES to emit means (INSUFFICIENT_N); at N>=5 it
 * emits a bootstrap 95% percentile CI whose method/seed/iterations are
 * recorded so any third party can recompute it, plus the static power caveat.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bootstrapCi,
  mulberry32,
  multiRunReport,
  renderMultiRunReport,
  replayRediscoverySpec,
} from '../../src/research/evaluation/rediscovery/engine.ts';
import type { RediscoveryReport } from '../../src/research/evaluation/rediscovery/types.ts';
import { LEAKAGE_DISCLAIMER, POWER_CAVEAT } from '../../src/research/evaluation/rediscovery/types.ts';
import { REDISCOVERY_SPECS } from '../../src/research/evaluation/rediscovery/targets.ts';

/** Small helper: a synthetic report with a given hit rate (for pure tests). */
function fakeReport(hitRate: number, domain = 'd', specId = `s-${hitRate}`): RediscoveryReport {
  const total = 2;
  const matched = Math.round(hitRate * total);
  return {
    specId,
    domain,
    cutoffDate: '2000-01-01',
    runMode: 'RECORDED_REPLAY',
    corpusStats: { inputDocumentCount: 1, retainedDocumentCount: 1, droppedPostCutoffDocumentCount: 0, cutoffDate: '2000-01-01' },
    targetResults: [],
    hitRate,
    matchLevelCounts: { L1_KEYWORD: matched, L2_CITATION: 0, L3_SEMANTIC: 0, NO_MATCH: total - matched },
    leakageAssessment: {
      disclaimer: LEAKAGE_DISCLAIMER,
      directRecallProbe: { status: 'NOT_RUN_OFFLINE', probeQuestions: [], results: null },
      pretrainingLeakageRisk: 'CANNOT_BE_EXCLUDED_OFFLINE',
    },
    replayChecksum: `fake-${specId}`,
    generatedAt: '2026-08-15T00:00:00.000Z',
  };
}

describe('multiRunReport N>=5 rule (§4.2 补遗)', () => {
  it('N=4 → INSUFFICIENT_N, no mean, renderer says SUPPRESSED', () => {
    const report = multiRunReport([fakeReport(1, 'a', 's1'), fakeReport(0.5, 'a', 's2'), fakeReport(0, 'b', 's3'), fakeReport(0.5, 'b', 's4')]);
    assert.equal(report.status, 'INSUFFICIENT_N');
    assert.equal(report.n, 4);
    assert.equal(report.minimumN, 5);
    assert.equal(report.overallHitRate, null);
    const text = renderMultiRunReport(report);
    assert.ok(text.includes('INSUFFICIENT_N'));
    assert.ok(text.includes('SUPPRESSED'));
    assert.ok(text.includes(LEAKAGE_DISCLAIMER), 'leakage disclaimer is mandatory even when suppressed');
  });

  it('N=5 → REPORTED with bootstrap CI recording method, seed, iterations, unit', () => {
    const runs = [fakeReport(1, 'a', 's1'), fakeReport(0.5, 'a', 's2'), fakeReport(0, 'b', 's3'), fakeReport(0.5, 'b', 's4'), fakeReport(1, 'c', 's5')];
    const report = multiRunReport(runs, { seed: 1234, iterations: 2000, generatedAt: '2026-08-15T00:00:00.000Z' });
    assert.equal(report.status, 'REPORTED');
    assert.ok(report.overallHitRate);
    assert.equal(report.overallHitRate.mean, 0.6);
    assert.equal(report.overallHitRate.n, 5);
    const ci = report.overallHitRate.ci95;
    assert.equal(ci.method, 'percentile-bootstrap');
    assert.equal(ci.iterations, 2000);
    assert.equal(ci.seed, 1234);
    assert.equal(ci.unit, 'run');
    assert.ok(ci.lower <= ci.upper);
    assert.ok(ci.lower >= 0 && ci.upper <= 1);
    assert.ok(report.powerCaveat === POWER_CAVEAT);
    const text = renderMultiRunReport(report);
    assert.ok(text.includes('bootstrap 95% CI'));
    assert.ok(text.includes('seed 1234'));
    assert.ok(text.includes('directional signals'), 'power caveat must be rendered');
  });

  it('N=0 still renders honestly (no crash, no mean)', () => {
    const report = multiRunReport([]);
    assert.equal(report.status, 'INSUFFICIENT_N');
    assert.equal(report.overallHitRate, null);
    const text = renderMultiRunReport(report);
    assert.ok(text.includes('INSUFFICIENT_N'));
  });
});

describe('bootstrap CI reproducibility', () => {
  it('same seed and iterations → byte-identical CI', () => {
    const values = [0, 0.5, 1, 0.5, 0.25];
    const a = bootstrapCi(values, { seed: 42, iterations: 5000 });
    const b = bootstrapCi(values, { seed: 42, iterations: 5000 });
    assert.deepEqual(a, b);
  });

  it('degenerate all-equal sample collapses to a point CI', () => {
    const ci = bootstrapCi([0, 0, 0, 0, 0], { seed: 7, iterations: 1000 });
    assert.equal(ci.lower, 0);
    assert.equal(ci.upper, 0);
  });

  it('numeric audit: seeded MC CI matches the EXACT enumerated bootstrap distribution', () => {
    // For n=5 the exact percentile bootstrap is enumerable: 5^5 = 3125
    // equally likely ordered resamples. The seeded Monte-Carlo CI must agree
    // with the exact bounds — this is what "reproducible from seed+method+
    // iterations" means in practice. (At 40k iterations the 2.5% tail of this
    // discrete distribution can miss by one lattice step; 100k pins it.)
    const values = [0, 0.5, 1, 0.5, 0.25];
    const exact: number[] = [];
    for (const a of values) for (const b of values) for (const c of values)
      for (const d of values) for (const e of values) exact.push((a + b + c + d + e) / 5);
    exact.sort((x, y) => x - y);
    const exactLower = exact[Math.floor(0.025 * exact.length)]!;
    const exactUpper = exact[Math.ceil(0.975 * exact.length) - 1]!;
    assert.equal(exactLower, 0.2);
    assert.equal(exactUpper, 0.75);
    const ours = bootstrapCi(values, { seed: 42, iterations: 100000 });
    assert.ok(Math.abs(ours.lower - exactLower) <= 0.02, `lower: ${ours.lower} vs exact ${exactLower}`);
    assert.ok(Math.abs(ours.upper - exactUpper) <= 0.02, `upper: ${ours.upper} vs exact ${exactUpper}`);
  });

  it('mulberry32 is deterministic for a given seed and varies across seeds', () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    assert.equal(a1(), a2());
    const b = mulberry32(43);
    assert.notEqual(a1(), b());
  });
});

describe('multi-run aggregation over real replays', () => {
  it('aggregates five real replays (one spec repeated with distinct run ids)', async () => {
    const spec = REDISCOVERY_SPECS.find((s) => s.specId === 'rediscovery-gravitational-wave-2015')!;
    const runs: RediscoveryReport[] = [];
    for (let i = 0; i < 5; i += 1) {
      runs.push(await replayRediscoverySpec(spec, { runIndex: i }));
    }
    const report = multiRunReport(runs, { seed: 2026, iterations: 2000, generatedAt: '2026-08-15T00:00:00.000Z' });
    assert.equal(report.status, 'REPORTED');
    // Every replay of this spec hits 1/2 targets (the intentional miss).
    assert.equal(report.overallHitRate?.mean, 0.5);
    assert.equal(report.perDomain[0]?.domain, 'gravitational_wave_astronomy');
    assert.equal(report.perDomain[0]?.matched, 5);
    assert.equal(report.perDomain[0]?.targets, 10);
  });

  it('four real replays across all shipped domains stay INSUFFICIENT_N', async () => {
    const runs: RediscoveryReport[] = [];
    for (const spec of REDISCOVERY_SPECS) {
      runs.push(await replayRediscoverySpec(spec));
    }
    assert.equal(runs.length, 4);
    const report = multiRunReport(runs);
    assert.equal(report.status, 'INSUFFICIENT_N');
    assert.equal(report.overallHitRate, null);
    assert.equal(report.perDomain.length, 4);
  });
});
