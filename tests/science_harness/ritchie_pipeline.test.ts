// tests/science_harness/ritchie_pipeline.test.ts
// Ritchie, Wiseman & French (2012) failed replication pipeline tests.
//
// Ritchie et al. is a FAILED REPLICATION of Bem (2011): three independent labs,
// none reached significance in Bem's direction. The scientifically correct verdict
// is INCONCLUSIVE (R8 — tested but null result), NOT REFUTED. Ritchie et al.
// themselves wrote "failed to replicate," not "refuted." Labeling a non-significant
// null result as REFUTED would commit the "absence of evidence = evidence of absence" error.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  buildRitchieChain,
  buildRitchieStatistics,
  RITCHIE_CLAIM_ID,
  RITCHIE_EXPERIMENTS,
} from '../../src/science_harness/ritchie_pipeline.ts';

describe('Ritchie (2012) failed replication — statistics recompute', () => {
  it('three labs: exact p-values from t-distribution', () => {
    const stats = buildRitchieStatistics('bem_erotic_hit_rate');
    assert.equal(stats.publishedTStats.length, 3);
    assert.equal(stats.farLabExactPs.length, 3);
    // Two labs have negative t → p > 0.5 (point estimate opposite direction)
    const highPs = stats.farLabExactPs.filter(p => p > 0.5);
    assert.ok(highPs.length >= 2, 'at least 2 labs should have p > 0.5 (point estimate opposite)');
  });

  it('direction is neutral — failed replication, neither supports nor refutes', () => {
    const stats = buildRitchieStatistics('bem_erotic_hit_rate');
    // Combined test is non-significant → honest direction is 'neutral', not 'refutes'.
    assert.equal(stats.meanDirection, 'neutral');
  });

  it('combined Fisher p is non-significant (failed replication)', () => {
    const stats = buildRitchieStatistics('bem_erotic_hit_rate');
    assert.ok(stats.combinedP > 0 && stats.combinedP < 1, 'combined p in valid range');
    // All three p's are large → Fisher combined is large → non-significant.
    assert.ok(stats.combinedP > 0.05, 'combined p should be non-significant (failed replication)');
  });

  it('per-study Cohen d = 2t/√df (standard t→d conversion)', () => {
    const stats = buildRitchieStatistics('bem_erotic_hit_rate');
    // Regression guard: effect size must be the standardized mean difference,
    // NOT the meaningless mean of t-statistics (the pre-fix bug).
    const expected = RITCHIE_EXPERIMENTS.map(e => (2 * e.tStat) / Math.sqrt(e.df));
    stats.cohensDPerStudy.forEach((d, i) => {
      const exp = expected[i];
      assert.ok(exp !== undefined && Math.abs(d - exp) < 1e-12, `Cohen d lab ${i}: ${d} vs ${exp}`);
    });
    // Pooled d is the mean of the per-study d values.
    const expectedPooled = expected.reduce((a, b) => a + b, 0) / expected.length;
    assert.ok(Math.abs(stats.pooledCohensD - expectedPooled) < 1e-12);
    // Sanity: pooled d is small and slightly against Bem (two of three labs negative).
    assert.ok(stats.pooledCohensD < 0 && stats.pooledCohensD > -0.2);
  });

  it('confidence interval is real and crosses zero (honest small-k uncertainty)', () => {
    const stats = buildRitchieStatistics('bem_erotic_hit_rate');
    const ci = stats.statisticalResult.confidenceInterval;
    assert.ok(ci, 'CI must be defined');
    const [lo, hi] = ci;
    // Regression guard: CI must NOT be the [0,0] placeholder.
    assert.notEqual(Math.abs(lo) + Math.abs(hi), 0, 'CI must not be the [0,0] placeholder');
    // With k=3 studies the CI is wide and straddles zero (cannot rule out a small effect).
    assert.ok(lo < 0 && hi > 0, `CI [${lo}, ${hi}] should cross zero`);
  });
});

describe('Ritchie (2012) failed replication — verdict kernel', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('produces INCONCLUSIVE (failed replication → R8, not REFUTED)', () => {
    const result = buildRitchieChain(db);
    // Pinned verdict: three labs failed to replicate; combined p non-significant;
    // the honest verdict is INCONCLUSIVE (R8_INSUFFICIENT_POWER_OR_NULL).
    assert.equal(result.machineVerdict, 'INCONCLUSIVE');
    assert.equal(result.kernelOutput.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  });

  it('evidence direction is neutral (neither supports nor refutes)', () => {
    const result = buildRitchieChain(db);
    assert.equal(result.statistics.meanDirection, 'neutral');
    assert.equal(result.kernelOutput.statisticalReport.supports, false);
    assert.equal(result.kernelOutput.statisticalReport.refutes, false);
  });

  it('no anti-theater findings (clean replication design)', () => {
    const result = buildRitchieChain(db);
    assert.equal(result.antiTheaterReport.findings.length, 0);
  });

  it('FEC gate is allowed (contract compiles)', () => {
    const result = buildRitchieChain(db);
    assert.equal(result.fecGate.allowed, true);
  });

  it('produces tamper-evident proof hash', () => {
    const result = buildRitchieChain(db);
    assert.match(result.sealed.envelope.proofHash, /^[0-9a-f]{64}$/);
  });

  it('Ritchie claim differs from Bem claim (different paper, same metric)', () => {
    const result = buildRitchieChain(db);
    assert.equal(result.claimId, RITCHIE_CLAIM_ID);
    assert.notEqual(result.claimId, 'C-BEM-2011-EXP1');
  });
});
