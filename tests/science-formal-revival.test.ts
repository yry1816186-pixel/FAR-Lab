import { describe, expect, it } from 'vitest';
import {
  buildAchAnalysis, buildEvidenceBody, logLrInterval, finalGradeCertainty, hasExplicitQuantity,
  relationStrength, crossRelationStrength,
} from '../src/domain/index.js';
import type { EvidenceRelation, ScientificClaim } from '../src/domain/index.js';

/**
 * SCIENCE lane benchmark (2026-08-24) — formal-evidence-layer revival.
 *
 * BEFORE (locked as a property below): every production relation write point
 * hard-coded strength 'unrated', and logLrInterval maps 'unrated' to [0,0] for
 * EVERY relation type — so Σlog-LR was [0,0]/band 'none', QBAF was the 0.5 base
 * constant, Carneades always 'scintilla', and ACH diagnosticity always empty,
 * on every live run. AFTER: relationStrength (deterministic, disclosed) feeds
 * the ladder; the math layer finally measures. These tests fail on any return
 * to the inert regime.
 */

const NOW = '2026-08-24T00:00:00.000Z';

/** Branded fixture ids (prefix_ + >=20 lowercase chars per ids.ts). */
const id = (prefix: string, body: string): string => `${prefix}_${body.padEnd(22, '0')}`;

const RUN = id('run', 't');

const claim = (body: string, grade: ScientificClaim['gradeCertainty'], quant: boolean): ScientificClaim => ({
  id: id('clm', body),
  runId: RUN,
  text: quant ? `${body} raises the metric by 30 percent` : `${body} suggests a qualitative improvement overall`,
  locators: [{ sourceDocumentId: id('src', body), quote: 'verbatim fixture quote' }],
  bindingStatus: 'verified',
  alignmentChecked: true,
  uncertainties: [],
  ...(grade !== undefined ? { gradeCertainty: grade } : {}),
});

describe('deterministic relation strength (strength-v1)', () => {
  it('BEFORE-lock: unrated still maps to [0,0] for every relation type — the inert regime is detectable', () => {
    for (const relation of ['supports', 'contradicts', 'weakens', 'replicates', 'fails_to_replicate'] as const) {
      expect(logLrInterval(relation, 'unrated')).toEqual([0, 0]);
    }
  });

  it('ladder: unverified binding and certainty floor carry zero weight; high caps at moderate for literature', () => {
    expect(relationStrength({ gradeCertainty: 'high', bindingVerified: false, quantitative: true }).strength).toBe('unrated');
    expect(relationStrength({ gradeCertainty: 'very_low', bindingVerified: true, quantitative: true }).strength).toBe('unrated');
    expect(relationStrength({ gradeCertainty: undefined, bindingVerified: true, quantitative: true }).strength).toBe('unrated');
    expect(relationStrength({ gradeCertainty: 'high', bindingVerified: true, quantitative: true }).strength).toBe('moderate');
    // 'high' implies the GRADE imprecision domain passed (quantitative); the grade is
    // the authority, so the defensive mapping still grades high as moderate — never weak.
    expect(relationStrength({ gradeCertainty: 'high', bindingVerified: true, quantitative: false }).strength).toBe('moderate');
    expect(relationStrength({ gradeCertainty: 'moderate', bindingVerified: true, quantitative: true }).strength).toBe('moderate');
    expect(relationStrength({ gradeCertainty: 'moderate', bindingVerified: true, quantitative: false }).strength).toBe('weak');
    expect(relationStrength({ gradeCertainty: 'low', bindingVerified: true, quantitative: false }).strength).toBe('weak');
    // literature never reaches 'strong' from these inputs by construction
  });

  it('every mapping carries an auditable derivation string', () => {
    const out = relationStrength({ gradeCertainty: 'low', bindingVerified: true, quantitative: false });
    expect(out.derivation).toContain('strength-v1');
    expect(out.derivation).toContain('grade=low');
  });

  it('cross-relation strength takes the weaker endpoint', () => {
    const strong = { gradeCertainty: 'high' as const, bindingVerified: true, quantitative: true };
    const floored = { gradeCertainty: 'very_low' as const, bindingVerified: true, quantitative: true };
    const out = crossRelationStrength(strong, floored);
    expect(out.strength).toBe('unrated'); // a floored endpoint licenses NO attack weight
    expect(out.derivation).toContain('weaker endpoint');
    expect(crossRelationStrength(strong, strong).strength).toBe('moderate');
  });
});

describe('GRADE inconsistency rescore inputs', () => {
  it('finalGradeCertainty: one contradiction signal steps the ladder down; retraction still floors', () => {
    const base = { verifiedBinding: true, quantitative: true, recentSource: true, forensicFails: 0 };
    expect(finalGradeCertainty({ ...base, contradictionSignals: 0, retractedOrEoc: false }).certainty).toBe('high');
    expect(finalGradeCertainty({ ...base, contradictionSignals: 1, retractedOrEoc: false }).certainty).toBe('moderate');
    // any positive signal count steps the ladder ONCE (domain semantics: signals>0 => inconsistency)
    expect(finalGradeCertainty({ ...base, contradictionSignals: 3, retractedOrEoc: false }).certainty).toBe('moderate');
    expect(finalGradeCertainty({ ...base, contradictionSignals: 0, retractedOrEoc: true }).certainty).toBe('very_low');
    expect(finalGradeCertainty({ ...base, contradictionSignals: 1, forensicFails: 1, retractedOrEoc: false }).certainty).toBe('low');
  });

  it('hasExplicitQuantity is the single quantity probe (digits, percents, effect words)', () => {
    expect(hasExplicitQuantity('raises yield by 30 percent')).toBe(true);
    expect(hasExplicitQuantity('a 2-fold increase')).toBe(true);
    expect(hasExplicitQuantity('a qualitative improvement overall')).toBe(false);
  });
});

describe('evidence body: the formal layer measures again', () => {
  const rel = (
    body: string, claimBody: string, hypBody: string,
    relation: EvidenceRelation['relation'], strength: EvidenceRelation['strength'],
  ): EvidenceRelation => ({
    id: id('ev', body), runId: RUN, relation, claimId: id('clm', claimBody),
    targetHypothesisId: id('hyp', hypBody),
    rationale: 'fixture', strength, uncertainties: [], createdAt: NOW,
  });

  const claims = [
    claim('a', 'high', true),
    claim('b', 'moderate', true),
    claim('c', 'very_low', true),
  ];

  it('AFTER: graded relations produce a non-degenerate Σlog-LR band, QBAF ≠ 0.5, reachable literature promotion', () => {
    const relations = [
      rel('e1', 'a', 'h1', 'supports', 'moderate'),
      rel('e2', 'b', 'h1', 'supports', 'moderate'),
    ];
    const body = buildEvidenceBody({
      id: id('evb', 'b1'), runId: RUN, hypothesisId: id('hyp', 'h1'), relations, claims,
      experimentalAxes: 0, now: NOW,
    });
    expect(body.sumLogLrLow).toBeGreaterThan(0);
    expect(body.logLrBand).not.toBe('none');
    expect(body.qbafScore).toBeGreaterThan(0.5);
    expect(body.promotion).toBe('literature_only_unverified'); // was UNREACHABLE pre-revival
    expect(body.disclosure).toContain('independent source');
  });

  it('counter-evidence moves the body the other way (sign discipline survives the revival)', () => {
    const relations = [
      rel('e1', 'a', 'h2', 'supports', 'moderate'),
      rel('e2', 'c', 'h2', 'contradicts', 'weak'),
    ];
    const body = buildEvidenceBody({
      id: id('evb', 'b2'), runId: RUN, hypothesisId: id('hyp', 'h2'), relations, claims,
      experimentalAxes: 0, now: NOW,
    });
    expect(body.qbafScore).toBeLessThan(0.75); // attacked, not raised
  });

  it('contradiction closure: claim-claim cross relations propagate inside the QBAF graph', () => {
    const cross: EvidenceRelation = {
      id: id('ev', 'ex'), runId: RUN, relation: 'contradicts',
      claimId: id('clm', 'c'), targetClaimId: id('clm', 'a'),
      rationale: 'fixture conflict', strength: 'moderate', uncertainties: [], createdAt: NOW,
    };
    const supporting = [rel('e1', 'a', 'h3', 'supports', 'moderate')];
    const without = buildEvidenceBody({
      id: id('evb', 'b3a'), runId: RUN, hypothesisId: id('hyp', 'h3'), relations: supporting, claims,
      experimentalAxes: 0, now: NOW,
    });
    const withConflict = buildEvidenceBody({
      id: id('evb', 'b3b'), runId: RUN, hypothesisId: id('hyp', 'h3'), relations: [...supporting, cross], claims,
      experimentalAxes: 0, now: NOW,
    });
    // The SAME hypothesis evidence, plus one claim-claim contradiction touching its
    // supporting claim, must score strictly lower — conflicts are never averaged away.
    expect(withConflict.qbafScore).toBeLessThan(without.qbafScore);
    expect(withConflict.disclosure).toContain('claim-claim conflict/support edge');
    // Σlog-LR is unchanged by the cross edge (no double counting of endpoint links)
    expect(withConflict.sumLogLrLow).toBe(without.sumLogLrLow);
    expect(withConflict.sumLogLrHigh).toBe(without.sumLogLrHigh);
  });

  it('AFTER: ACH diagnosticity is non-empty and discriminates once strengths are graded', () => {
    const relations = [
      rel('e1', 'a', 'hx', 'supports', 'moderate'),
      rel('e2', 'a', 'hy', 'contradicts', 'weak'),
      rel('e3', 'b', 'hx', 'supports', 'weak'),
      rel('e4', 'b', 'hy', 'supports', 'weak'),
    ];
    const ach = buildAchAnalysis({
      id: id('ach', 'a1'), runId: RUN,
      hypothesisIds: [id('hyp', 'hx'), id('hyp', 'hy')], relations, now: NOW,
    });
    expect(ach.diagnosticity.length).toBeGreaterThan(0); // was ALWAYS empty pre-revival
    expect(ach.diagnosticity[0]!.score).toBeGreaterThan(0);
  });
});
