import { describe, it, expect } from 'vitest';
import {
  logLrInterval, sumLogLr, bandOf, qbafStrength, proofStandardOf,
} from '../src/domain/formal.js';
import {
  buildEvidenceBody, countExperimentalAxes,
} from '../src/domain/evidence-body.js';
import {
  diagnosticityScores, removalSensitivity, buildAchAnalysis,
} from '../src/domain/ach.js';
import { newId, EvidenceRelation, ScientificClaim } from '../src/domain/index.js';

/**
 * Wave-S L1 formal semantics + g8/g9 evidence-body/ACH tests. Numeric oracles are
 * hand-computed; the QBAF section asserts direction and convergence properties
 * (the fixed point itself is definitionally what the iteration computes).
 */

describe('LR interval algebra', () => {
  it('neutral structural relations carry no weight; unrated contributes [0,0] disclosed', () => {
    expect(logLrInterval('depends_on', 'strong')).toBeNull();
    expect(logLrInterval('derived_from', 'moderate')).toBeNull();
    expect(logLrInterval('unknown', 'strong')).toBeNull();
    expect(logLrInterval('supports', 'unrated')).toEqual([0, 0]);
  });

  it('supports and contradicts are sign-mirrored', () => {
    const s = logLrInterval('supports', 'strong');
    const c = logLrInterval('contradicts', 'strong');
    expect(s).toEqual([1.0, 2.0]);
    expect(c).toEqual([-2.0, -1.0]);
  });

  it('sums intervals and caps per-source double counting', () => {
    const summary = sumLogLr([
      { relation: 'supports', strength: 'strong', sourceKey: 'srcA' },
      { relation: 'supports', strength: 'strong', sourceKey: 'srcA' },
      { relation: 'supports', strength: 'strong', sourceKey: 'srcA' }, // capped
      { relation: 'supports', strength: 'moderate', sourceKey: 'srcB' },
      { relation: 'depends_on', strength: 'strong', sourceKey: 'srcC' }, // excluded
    ]);
    expect(summary.contributions).toBe(3);
    expect(summary.sourcesCapped).toBe(1);
    expect(summary.excluded).toBe(1);
    expect(summary.low).toBeCloseTo(1.0 + 1.0 + 0.5, 10);
    expect(summary.high).toBeCloseTo(2.0 + 2.0 + 1.0, 10);
  });

  it('Jeffreys-style banding mirrors around zero', () => {
    expect(bandOf(1.2)).toBe('very_strong_support');
    expect(bandOf(0.6)).toBe('strong_support');
    expect(bandOf(0.2)).toBe('moderate_support');
    expect(bandOf(0)).toBe('none');
    expect(bandOf(-0.3)).toBe('weak_counter');
    expect(bandOf(-1.5)).toBe('strong_counter');
  });
});

describe('QBAF gradual semantics + Carneades standards', () => {
  it('support raises, attack lowers, and iteration converges (monotone bounded)', () => {
    const base = qbafStrength(
      [{ id: 'h', base: 0.5 }],
      [],
    );
    expect(base.get('h')).toBe(0.5);
    const supported = qbafStrength(
      [{ id: 'c', base: 0.8 }, { id: 'h', base: 0.5 }],
      [{ from: 'c', to: 'h', weight: 0.5 }],
    );
    expect(supported.get('h')).toBeGreaterThan(0.5);
    expect(supported.get('h')).toBeLessThanOrEqual(1);
    const attacked = qbafStrength(
      [{ id: 'c', base: 0.8 }, { id: 'h', base: 0.5 }],
      [{ from: 'c', to: 'h', weight: -0.5 }],
    );
    expect(attacked.get('h')).toBeLessThan(0.5);
    expect(attacked.get('h')).toBeGreaterThanOrEqual(0);
  });

  it('proof standards are monotone thresholds', () => {
    expect(proofStandardOf(0.49)).toBe('unproven');
    expect(proofStandardOf(0.55)).toBe('scintilla');
    expect(proofStandardOf(0.65)).toBe('preponderance');
    expect(proofStandardOf(0.8)).toBe('clear_and_convincing');
    expect(proofStandardOf(0.95)).toBe('beyond_reasonable_doubt');
  });
});

// ---------------------------------------------------------------------------
// g8/g9 — assembled from synthetic relations/claims (pure functions, no store).

const relation = (over: Partial<EvidenceRelation>): EvidenceRelation => EvidenceRelation.parse({
  id: newId('ev'),
  runId: newId('run'),
  relation: 'supports',
  strength: 'moderate',
  rationale: 'synthetic test relation',
  uncertainties: [],
  createdAt: new Date().toISOString(),
  ...over,
});

const claim = (over: Partial<ScientificClaim> & { id: string }): ScientificClaim => ScientificClaim.parse({
  runId: newId('run'),
  text: 'synthetic claim',
  locators: [{ sourceDocumentId: newId('src'), quote: 'q' }],
  bindingStatus: 'verified',
  alignmentChecked: true,
  uncertainties: [],
  ...over,
});

describe('g8 evidence body', () => {
  const h1 = newId('hyp');
  const c1 = claim({ id: newId('clm'), gradeCertainty: 'high' });
  const c2 = claim({ id: newId('clm'), gradeCertainty: 'low' });
  const srcA = newId('src');
  const srcB = newId('src');

  it('floor = min grade over supporting claims; independent sources counted per source not per claim', () => {
    const body = buildEvidenceBody({
      id: newId('evb'),
      runId: newId('run'),
      hypothesisId: h1,
      relations: [
        relation({ claimId: c1.id, targetHypothesisId: h1, strength: 'strong', sourceDocumentId: srcA }),
        relation({ claimId: c2.id, targetHypothesisId: h1, strength: 'moderate', sourceDocumentId: srcB }),
        relation({ claimId: c2.id, targetHypothesisId: newId('hyp'), strength: 'strong' }), // other hypothesis
      ],
      claims: [c1, c2],
      experimentalAxes: 0,
      now: new Date().toISOString(),
    });
    expect(body.floorCertainty).toBe('low'); // min(high, low)
    expect(body.independentSources).toBe(2);
    expect(body.promotion).toBe('literature_only_unverified'); // positive literature, no experiment
    // hand-computed: strong [1,2] + moderate [0.5,1] → midpoint (1.5+0.75)=2.25 → very_strong
    expect(body.logLrBand).toBe('very_strong_support');
  });

  it('g7 promotion ladder: orthogonal >= single_source > literature-only > none', () => {
    const mk = (axes: number) => buildEvidenceBody({
      id: newId('evb'), runId: newId('run'), hypothesisId: h1,
      relations: [relation({ claimId: c1.id, targetHypothesisId: h1, strength: 'moderate' })],
      claims: [c1], experimentalAxes: axes, now: new Date().toISOString(),
    });
    expect(mk(2).promotion).toBe('orthogonal');
    expect(mk(1).promotion).toBe('single_source');
    expect(mk(0).promotion).toBe('literature_only_unverified');
    const empty = buildEvidenceBody({
      id: newId('evb'), runId: newId('run'), hypothesisId: h1,
      relations: [], claims: [], experimentalAxes: 0, now: new Date().toISOString(),
    });
    expect(empty.promotion).toBe('none');
    expect(empty.independentSources).toBe(0);
  });

  it('countExperimentalAxes counts distinct dataset/model/split values from experiment signals only', () => {
    expect(countExperimentalAxes([
      { source: 'experiment', structured: { dataset: 'openml-1', model: 'rf' } },
      { source: 'experiment', structured: { dataset: 'openml-1', model: 'xgb' } },
      { source: 'experiment', structured: {} },
      { source: 'human_expert', structured: { dataset: 'openml-9' } },
    ])).toBe(3);
    expect(countExperimentalAxes([{ source: 'experiment' }])).toBe(0);
  });
});

describe('g9 ACH diagnosticity + removal sensitivity', () => {
  const h1 = newId('hyp');
  const h2 = newId('hyp');
  const discriminating = newId('clm');
  const noise = newId('clm');

  it('a one-sided claim scores higher diagnosticity than an even one', () => {
    const relations = [
      relation({ claimId: discriminating, targetHypothesisId: h1, relation: 'supports', strength: 'strong' }),
      relation({ claimId: discriminating, targetHypothesisId: h2, relation: 'contradicts', strength: 'strong' }),
      relation({ claimId: noise, targetHypothesisId: h1, relation: 'supports', strength: 'moderate' }),
      relation({ claimId: noise, targetHypothesisId: h2, relation: 'supports', strength: 'moderate' }),
    ];
    const scores = diagnosticityScores(relations);
    expect(scores[0]?.claimId).toBe(discriminating);
    expect(scores[0]?.score).toBeGreaterThan(scores[1]?.score ?? -1);
    expect(scores[1]?.score).toBeCloseTo(0, 6); // even support = undiagnostic
  });

  it('removing the most diagnostic claim can flip the order — sensitivity reports it honestly', () => {
    // h1 leads with the discriminating claim; without it the order flips.
    const relations = [
      relation({ claimId: discriminating, targetHypothesisId: h1, relation: 'supports', strength: 'strong' }),
      relation({ claimId: discriminating, targetHypothesisId: h2, relation: 'contradicts', strength: 'strong' }),
      relation({ claimId: noise, targetHypothesisId: h2, relation: 'supports', strength: 'moderate' }),
    ];
    const sensitivity = removalSensitivity(relations, [h1, h2], { topK: 1 });
    expect(sensitivity.removedTopK).toBe(1);
    expect(sensitivity.orderBefore[0]).toBe(h1);
    expect(sensitivity.orderAfter[0]).toBe(h2);
    expect(sensitivity.inversions).toBe(1);
    expect(sensitivity.stable).toBe(false);
  });

  it('buildAchAnalysis persists the full shape (matrix + sensitivity + method tag)', () => {
    const analysis = buildAchAnalysis({
      id: newId('ach'),
      runId: newId('run'),
      hypothesisIds: [h1, h2],
      relations: [relation({ claimId: discriminating, targetHypothesisId: h1, relation: 'supports', strength: 'moderate' })],
      now: new Date().toISOString(),
    });
    expect(analysis.method).toBe('heuer-diagnosticity-v1');
    expect(analysis.hypothesisIds).toHaveLength(2);
    expect(analysis.removalSensitivity.stable).toBe(true);
  });
});
