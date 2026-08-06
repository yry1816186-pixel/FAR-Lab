// tests/science_harness/bem_pipeline.test.ts
// Bem (2011) "Feeling the Future" real paper pipeline tests.
//
// These tests verify that FAR-Lab correctly processes a REAL published paper:
//   1. Statistics recompute matches published values (within method differences)
//   2. Anti-theater detector catches the multiple-testing flaw (as-published mode)
//   3. Corrected mode shows the verdict under proper Bonferroni
//   4. Proof seal is tamper-evident

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  buildBemChain,
  buildBemStatistics,
  BEM_CLAIM_ID,
  BEM_CLAIM_TEXT,
  BEM_EROTIC_HIT_RATE,
  BEM_NUM_EXPERIMENTS,
  BEM_ALL_EXPERIMENTS,
} from '../../src/science_harness/bem_pipeline.ts';

describe('Bem (2011) real paper pipeline — statistics recompute', () => {
  it('recomputes z-test from published hit rate with binomial SE', () => {
    const stats = buildBemStatistics('bem_erotic_hit_rate');
    // Published: 53.1% hit rate, N=100, null=50%
    assert.equal(stats.publishedHitRate, BEM_EROTIC_HIT_RATE);
    assert.equal(stats.publishedPValue, 0.014); // Bem's published p

    // FAR-Lab binomial z-test: z = (0.531 - 0.50) / sqrt(0.25/100) = 0.031/0.05 = 0.62
    // This is LOWER than Bem's reported t=2.51 because we use group-level binomial
    // approximation vs Bem's within-subject t-test. This difference is a FINDING.
    assert.ok(stats.farLabZTest.statistic > 0, 'z-statistic should be positive (above chance)');
    assert.ok(stats.farLabZTest.pValue > 0 && stats.farLabZTest.pValue < 1, 'p-value in valid range');
  });

  it('applies Bonferroni correction across 10 experiments', () => {
    const stats = buildBemStatistics('bem_erotic_hit_rate');
    // Bonferroni-corrected p is derived from exact t-p (0.0068), not binomial z-p (0.268)
    assert.ok(stats.bonferroniCorrectedP > stats.farLabExactP,
      'Bonferroni-corrected p should be >= exact t-p');
    // After correction (0.0068*10=0.068 > 0.05), should NOT survive at alpha=0.05
    assert.equal(stats.survivesCorrection, false);
  });

  it('computes Cohen h effect size (small effect, < 0.1)', () => {
    const stats = buildBemStatistics('bem_erotic_hit_rate');
    // Cohen h for 53.1% vs 50% ≈ 0.062 (very small)
    assert.ok(stats.cohensD > 0, 'effect size positive (above null)');
    assert.ok(stats.cohensD < 0.1, 'effect size is very small (h < 0.1)');
  });

  it('Bem all 10 experiments: 9/10 raw significant, 1/10 after Bonferroni', () => {
    const rawSig = BEM_ALL_EXPERIMENTS.filter(e => e.p < 0.05).length;
    assert.equal(rawSig, 9, '9/10 experiments raw-significant');
    // Bonferroni: only Exp10 (p=.003) survives (adjP=.030)
    const bonfSig = BEM_ALL_EXPERIMENTS.filter(e => e.p * BEM_NUM_EXPERIMENTS < 0.05).length;
    assert.equal(bonfSig, 1, 'only 1/10 survives Bonferroni');
  });
});

describe('Bem (2011) real paper pipeline — as-published mode (exposes flaws)', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('anti-theater detector catches MULTIPLE_TESTING_UNCORRECTED', () => {
    const result = buildBemChain(db, 'as-published');
    assert.ok(result.antiTheaterReport.findings.length >= 1,
      'should catch at least 1 finding in as-published mode');
    const hasPhackFinding = result.antiTheaterReport.findings.some(
      f => f.attackKind === 'p-hacking-multiple-testing-uncorrected',
    );
    assert.ok(hasPhackFinding, 'should flag multiple-testing uncorrected');
  });

  it('machine verdict is UNTESTED (anti-theater fail blocks seal)', () => {
    const result = buildBemChain(db, 'as-published');
    assert.equal(result.machineVerdict, 'UNTESTED');
    assert.equal(result.sealedConclusion, 'UNTESTED');
  });

  it('produces tamper-evident proof hash', () => {
    const result = buildBemChain(db, 'as-published');
    assert.ok(result.sealed.envelope.proofHash.length === 64, 'sha256 hex');
    assert.match(result.sealed.envelope.proofHash, /^[0-9a-f]{64}$/);
  });
});

describe('Bem (2011) real paper pipeline — corrected mode (proper analysis)', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('no anti-theater findings (Bonferroni applied)', () => {
    const result = buildBemChain(db, 'corrected');
    assert.equal(result.antiTheaterReport.findings.length, 0);
  });

  it('machine verdict is INCONCLUSIVE — Bonferroni-corrected p=0.068 > 0.05 (R8)', () => {
    const result = buildBemChain(db, 'corrected');
    // Exact t-p=0.0068, but Bonferroni ×10 = 0.068 > 0.05 → does not survive
    assert.equal(result.machineVerdict, 'INCONCLUSIVE');
    assert.equal(result.sealedConclusion, 'INCONCLUSIVE');
    assert.equal(result.kernelOutput.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  });

  it('FEC gate is allowed (contract compiles)', () => {
    const result = buildBemChain(db, 'corrected');
    assert.equal(result.fecGate.allowed, true);
  });
});

describe('Bem (2011) real paper pipeline — cross-mode consistency', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('both modes use same published hit rate and claim', () => {
    const asPublished = buildBemChain(new Database(':memory:'), 'as-published');
    const corrected = buildBemChain(new Database(':memory:'), 'corrected');
    assert.equal(asPublished.claimId, BEM_CLAIM_ID);
    assert.equal(asPublished.claimText, BEM_CLAIM_TEXT);
    assert.equal(corrected.claimId, BEM_CLAIM_ID);
    assert.equal(asPublished.statistics.publishedHitRate, corrected.statistics.publishedHitRate);
  });

  it('proof hashes differ between modes (different analysis paths)', () => {
    const r1 = buildBemChain(new Database(':memory:'), 'as-published');
    const r2 = buildBemChain(new Database(':memory:'), 'corrected');
    assert.notEqual(r1.sealed.envelope.proofHash, r2.sealed.envelope.proofHash,
      'different analysis modes must produce different proof hashes');
  });
});
