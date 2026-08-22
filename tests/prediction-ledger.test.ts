import { describe, it, expect } from 'vitest';
import {
  VERDICT_CLASSES, UNIFORM_PROBS, rpsScore, brierScore, clampedLogScore,
  probsFromExpected, settleEntry, calibrationReport, LedgerEntry, type LedgerEntry as LedgerEntryT,
} from '../src/domain/prediction.js';
import { newId } from '../src/domain/index.js';

/**
 * Wave-S L4 self-calibration loop. Scoring-rule oracles are hand-computed on the 4-class
 * ordered verdict space (supports/inconclusive/weakens/falsifies); the settlement path is
 * immutable and idempotent; reports refuse to draw conclusions under n<30.
 */

describe('proper scoring rules (4 ordered classes)', () => {
  it('RPS is 0 for a perfect forecast and maximal for a maximally wrong one', () => {
    const perfect = [1, 0, 0, 0];
    expect(rpsScore(perfect, 0)).toBe(0);
    // predict supports (1,0,0,0), truth falsifies (index 3): |1-0|² + |1-0|² + |1-1|² = 3
    expect(rpsScore(perfect, 3)).toBe(3);
  });

  it('RPS penalizes near-misses less than far-misses (ordered classes)', () => {
    const forecast = [1, 0, 0, 0];
    const near = rpsScore(forecast, 1); // truth: inconclusive
    const far = rpsScore(forecast, 3); // truth: falsifies
    expect(near).toBeLessThan(far);
  });

  it('uniform forecast has a known RPS (ignorance baseline)', () => {
    // one-hot at index 0: cumO = 1,1,1 over i=0..2; cumP = .25,.5,.75
    // (.25-1)² + (.5-1)² + (.75-1)² = .5625 + .25 + .0625 = .875
    expect(rpsScore(UNIFORM_PROBS, 0)).toBeCloseTo(0.875, 12);
  });

  it('brier and clamped log score a confident miss harder than a hedged one', () => {
    const confident = [0.99, 0, 0, 0.01];
    const hedged = [0.4, 0.3, 0.2, 0.1];
    expect(brierScore(confident, 1)).toBeGreaterThan(brierScore(hedged, 1));
    expect(clampedLogScore(confident, 1)).toBeGreaterThan(clampedLogScore(hedged, 1));
    // clamp prevents infinity on a zero-probability outcome
    expect(Number.isFinite(clampedLogScore([1, 0, 0, 0], 3))).toBe(true);
  });
});

describe('mode-assertion probability convention', () => {
  it('expected supports/weakens/falsifies map to the disclosed 0.55 mode vector', () => {
    const p = probsFromExpected('supports H1');
    expect(p[0]).toBeCloseTo(0.55, 12);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(probsFromExpected('weakens the hypothesis')[2]).toBeCloseTo(0.55, 12);
    expect(probsFromExpected('falsifies if <0.4')[3]).toBeCloseTo(0.55, 12);
    // 'unclear' IS a mode assertion (predicts no verdict), not ignorance
    expect(probsFromExpected('unclear relationship')[1]).toBeCloseTo(0.55, 12);
    // unmatched phrasing falls back to uniform — never silently confident
    const u = probsFromExpected('modulates bidirectionally');
    expect(u.every((x) => x === 0.25)).toBe(true);
  });
});

const entry = (over: Partial<LedgerEntryT> = {}): LedgerEntryT => LedgerEntry.parse({
  id: newId('prd'),
  runId: newId('run'),
  kind: 'expected_relation',
  stage: 'plan',
  predictor: 'plan-structured-preregistration',
  assertion: { hypothesisId: 'hyp_x', expectedRelation: 'increases' },
  probs: probsFromExpected('increases'),
  predictedAt: '2026-08-23T00:00:00.000Z',
  settlesWith: 'experiment_verdict',
  ...over,
});

describe('settlement', () => {
  it('settle scores against the ignorance baseline and records the outcome', () => {
    const e = entry();
    const settled = settleEntry(e, { outcomeClass: 'supports', settledAt: '2026-08-23T01:00:00.000Z' });
    expect(settled.settledAt).toBeDefined();
    expect(settled.scores).toBeDefined();
    // mode vector put 0.55 on supports; uniform baseline rps is higher → positive skill
    expect(settled.scores?.skillVsUniform).toBeGreaterThan(0);
    const baseline = rpsScore(UNIFORM_PROBS, 0);
    expect(settled.scores?.rps).toBeLessThan(baseline);
    // original entry untouched (immutable settlement)
    expect(e.settledAt).toBeUndefined();
    expect(e.scores).toBeUndefined();
  });

  it('a wrong confident prediction earns negative skill (shown as-is, never hidden)', () => {
    const settled = settleEntry(entry(), { outcomeClass: 'falsifies', settledAt: '2026-08-23T01:00:00.000Z' });
    expect(settled.scores?.skillVsUniform).toBeLessThan(0);
  });

  it('settlement is idempotent: a settled or voided entry never re-scores', () => {
    const first = settleEntry(entry(), { outcomeClass: 'supports', settledAt: '2026-08-23T01:00:00.000Z' });
    const again = settleEntry(first, { outcomeClass: 'falsifies', settledAt: '2026-08-23T02:00:00.000Z' });
    expect(again).toBe(first);
  });

  it('unknown outcome classes are rejected loudly', () => {
    expect(() => settleEntry(entry(), { outcomeClass: 'kinda-supports' as never, settledAt: '2026-08-23T01:00:00.000Z' })).toThrow();
  });
});

describe('calibration report', () => {
  it('stratifies by kind and flags n<30 as insufficient evidence (no curve from thin data)', () => {
    const settled = Array.from({ length: 5 }, () =>
      settleEntry(entry(), { outcomeClass: 'supports', settledAt: '2026-08-23T01:00:00.000Z' }));
    const open = entry({ kind: 'rank_order', predictor: 'rank-tournament-bt', probs: undefined });
    const report = calibrationReport([...settled, open]);
    expect(report.settledTotal).toBe(5);
    expect(report.openTotal).toBe(1);
    const stratum = report.stratified.find((s) => s.kind === 'expected_relation');
    expect(stratum?.n).toBe(5);
    expect(stratum?.insufficientEvidence).toBe(true);
  });

  it('VERDICT_CLASSES keep their canonical order (ordered scoring depends on it)', () => {
    expect(VERDICT_CLASSES).toEqual(['supports', 'inconclusive', 'weakens', 'falsifies']);
  });
});
