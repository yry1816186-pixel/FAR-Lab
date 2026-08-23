import { describe, expect, it } from 'vitest';
import {
  buildAchNetMatrix,
  buildCrosstab,
  buildDimensionMatrix,
  buildHypothesisBalances,
  buildRadar,
  crosstabCellText,
  crosstabCellTone,
} from '../web/src/viz/compare-viz';
import type {
  AchAnalysis,
  EvidenceBody,
  EvidenceRelation,
  HypothesisCandidate,
  HypothesisScorecard,
  TournamentMatch,
} from '../web/src/api/types';

const hyp = (id: string, statement = `${id} 陈述`): HypothesisCandidate => ({
  id,
  runId: 'run_test',
  version: 0,
  statement,
  mechanism: '',
  derivation: { strategy: 's', rationale: 'r' },
  noveltyLabel: 'plausible_novel',
  testability: 'testable_in_principle',
  createdAt: '2026-08-23T00:00:00Z',
});

const card = (hypId: string, rank: number, dims: [string, number | null][]): HypothesisScorecard => ({
  id: `sc_${hypId}`,
  runId: 'run_test',
  hypothesisId: hypId,
  dimensions: dims.map(([dimension, value]) => ({
    dimension: dimension as HypothesisScorecard['dimensions'][number]['dimension'],
    value,
    rationale: '',
    producer: 'test',
    calibration: 'uncalibrated_llm_judgment',
  })),
  overallRationale: '',
  rankedOutOf: 3,
  rank,
});

// n/10 (not 0.1*n) keeps the doubles identical to the decimal literals asserted below
const D = (n: number): [string, number] => ([`dim_${n}`, n / 10]);

describe('buildRadar', () => {
  it('overlays hypotheses on the intersection of scored dimensions', () => {
    const h1 = hyp('a');
    const h2 = hyp('b');
    const s1 = card('a', 1, [D(1), D(2), D(3), D(4)]);
    const s2 = card('b', 2, [D(2), D(3), D(4), ['dim_5', 0.9]]);
    const r = buildRadar([h1, h2], [s1, s2]);
    expect(r.spec).toBeDefined();
    expect(r.spec!.indicators.map((i) => i.name)).toEqual(['dim_2', 'dim_3', 'dim_4']); // first card's order
    expect(r.spec!.series.map((s) => s.values)).toEqual([[0.2, 0.3, 0.4], [0.2, 0.3, 0.4]]);
    expect(r.spec!.series[0]!.label).toMatch(/^#1 a/);
  });

  it('refuses when common scored dimensions < 3 (never fakes zeros)', () => {
    const s1 = card('a', 1, [D(1), D(2)]);
    const s2 = card('b', 2, [D(1), D(2)]);
    const r = buildRadar([hyp('a'), hyp('b')], [s1, s2]);
    expect(r.spec).toBeUndefined();
    expect(r.refusal!.kind).toBe('few_common_dims');
    expect(r.refusal!.commonDims).toEqual(['dim_1', 'dim_2']);
  });

  it('null scores drop OUT of the intersection, and the shrunken set refuses if < 3', () => {
    const s1 = card('a', 1, [D(1), D(2), D(3)]);
    const s2 = card('b', 2, [D(1), ['dim_2', null], D(3)]);
    const r = buildRadar([hyp('a'), hyp('b')], [s1, s2]);
    expect(r.spec).toBeUndefined();
    expect(r.refusal!.commonDims).toEqual(['dim_1', 'dim_3']);
  });

  it('refuses when a compared hypothesis has no scorecard', () => {
    const r = buildRadar([hyp('a'), hyp('b')], [card('a', 1, [D(1), D(2), D(3)])]);
    expect(r.refusal!.kind).toBe('few_scored');
  });
});

describe('buildDimensionMatrix', () => {
  it('orders rows by rank, unions columns in first-seen pipeline order, keeps null honest', () => {
    const h1 = hyp('a');
    const h2 = hyp('b');
    const s2 = card('b', 1, [D(2), D(3)]);
    const s1 = card('a', 2, [D(1), D(2), ['dim_3', null]]);
    const m = buildDimensionMatrix([h1, h2], [s1, s2]);
    expect(m.rows.map((r) => r.hypId)).toEqual(['b', 'a']); // rank order, not input order
    expect(m.dims).toEqual(['dim_2', 'dim_3', 'dim_1']); // union, first-seen across ranked cards
    expect(m.rows[1]!.values).toEqual([0.2, null, 0.1]);
  });
});

describe('buildAchNetMatrix', () => {
  const ach: AchAnalysis = {
    id: 'ach_1',
    runId: 'run_test',
    hypothesisIds: ['a', 'b'],
    diagnosticity: [
      { claimId: 'clm_1', score: 1.5, netByHypothesis: { a: 0.8, b: -0.4 } },
      { claimId: 'clm_2', score: 0.9, netByHypothesis: { a: -0.2 } },
      { claimId: 'clm_3', score: 0.1, netByHypothesis: { a: 0 } },
    ],
    removalSensitivity: { removedTopK: 1, orderBefore: [], orderAfter: [], inversions: 0, stable: true },
    method: 'test',
    createdAt: '2026-08-23T00:00:00Z',
  };

  it('sorts by diagnosticity desc, keeps absent bindings null and real zeros zero, scales to max |net|', () => {
    const m = buildAchNetMatrix(ach, ['a', 'b'], 2);
    expect(m.rows.map((r) => r.claimId)).toEqual(['clm_1', 'clm_2']);
    expect(m.rows[0]!.net).toEqual([0.8, -0.4]);
    expect(m.rows[1]!.net).toEqual([-0.2, null]); // b has no binding → null, not 0
    expect(m.scale).toBeCloseTo(0.8);
  });

  it('a real computed zero stays a visible zero', () => {
    const m = buildAchNetMatrix(ach, ['a'], 3);
    expect(m.rows[2]!.net).toEqual([0]);
  });
});

describe('buildCrosstab', () => {
  const matches: TournamentMatch[] = [
    { aId: 'a', bId: 'b', aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: '', producer: 't', outcome: 'a' },
    { aId: 'c', bId: 'a', aFirstVerdict: 'a', bFirstVerdict: 'a', rationale: '', producer: 't', outcome: 'a' }, // c beats a
    { aId: 'b', bId: 'c', aFirstVerdict: 'b', bFirstVerdict: 'tie', rationale: '', producer: 't', outcome: 'tie' },
    { aId: 'a', bId: 'b', aFirstVerdict: 'b', bFirstVerdict: 'b', rationale: '', producer: 't', outcome: 'b' }, // rematch: b wins
  ];

  it('counts every match once from the ROW perspective, both pair orders, and aggregates rematches', () => {
    const ct = buildCrosstab([{ hypothesisId: 'a' }, { hypothesisId: 'b' }, { hypothesisId: 'c' }], matches);
    const cell = (r: string, c: string) => ct.cells.get(`${r}\u0000${c}`);
    expect(cell('a', 'b')).toEqual({ wins: 1, losses: 1, ties: 0, noContest: 0 }); // a won match1, lost match4
    expect(cell('b', 'a')).toEqual({ wins: 1, losses: 1, ties: 0, noContest: 0 }); // symmetric mirror
    expect(cell('a', 'c')).toEqual({ wins: 0, losses: 1, ties: 0, noContest: 0 }); // reversed-order match
    expect(cell('b', 'c')).toEqual({ wins: 0, losses: 0, ties: 1, noContest: 0 });
  });

  it('no_contest marks both sides without touching W/L/T', () => {
    const ct = buildCrosstab([{ hypothesisId: 'a' }, { hypothesisId: 'b' }], [
      { aId: 'a', bId: 'b', aFirstVerdict: 'incomparable', bFirstVerdict: 'incomparable', rationale: '', producer: 't', outcome: 'no_contest' },
    ]);
    expect(ct.cells.get('a\u0000b')).toEqual({ wins: 0, losses: 0, ties: 0, noContest: 1 });
    expect(crosstabCellText(ct.cells.get('a\u0000b'))).toBe('·');
    expect(crosstabCellTone(ct.cells.get('a\u0000b'))).toBe('muted');
  });

  it('cell text and tone reflect the row player record', () => {
    const c = { wins: 2, losses: 1, ties: 1, noContest: 0 };
    expect(crosstabCellText(c)).toBe('2✓ 1△ 1✗');
    expect(crosstabCellTone(c)).toBe('err'); // any visible loss errs from the row perspective
    expect(crosstabCellTone({ wins: 1, losses: 0, ties: 0, noContest: 0 })).toBe('ok');
  });
});

describe('buildHypothesisBalances', () => {
  const rel = (id: string, relation: EvidenceRelation['relation'], target?: string): EvidenceRelation => ({
    id,
    runId: 'run_test',
    relation,
    targetHypothesisId: target,
    rationale: '',
    createdAt: '2026-08-23T00:00:00Z',
  });
  const body = (hypId: string): EvidenceBody => ({
    id: `eb_${hypId}`,
    runId: 'run_test',
    hypothesisId: hypId,
    independentSources: 3,
    sumLogLrLow: -0.2,
    sumLogLrHigh: 1.4,
    logLrBand: 'strong_support',
    qbafScore: 0.61,
    proofStandard: 'scintilla',
    experimentalAxes: 0,
    promotion: 'none',
    disclosure: '',
    createdAt: '2026-08-23T00:00:00Z',
  });

  it('splits by canonical polarity and attaches the evidence body', () => {
    const m = buildHypothesisBalances(
      [body('a')],
      [rel('r1', 'supports', 'a'), rel('r2', 'replicates', 'a'), rel('r3', 'contradicts', 'a'), rel('r4', 'qualifies', 'a'), rel('r5', 'supports', undefined)],
    );
    expect(m.get('a')).toEqual({ supports: 2, counters: 1, body: body('a') }); // neutral + unbound excluded
    expect(m.has('b')).toBe(false);
  });
});
