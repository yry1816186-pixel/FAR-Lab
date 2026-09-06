import { describe, expect, it } from 'vitest';
import { deriveScientificWorldModel } from '../src/domain/world-model.js';

const id = (prefix: string, suffix: string) => `${prefix}_${suffix.replace(/[^0-9a-z]/g, 'a').padEnd(20, 'a').slice(0, 20)}`;

describe('scientific world model', () => {
  it('folds claims, competing hypotheses, counter evidence, and provenance deterministically', () => {
    const claimA = { id: id('clm', 'claim-a'), runId: id('run', 'run-a'), text: 'A', locators: [{ sourceDocumentId: id('src', 'source-a'), quote: 'A', locator: 'p1' }], bindingStatus: 'verified' as const, alignmentChecked: true, uncertainties: [] };
    const claimB = { ...claimA, id: id('clm', 'claim-b'), text: 'B' };
    const hypothesisA = { id: id('hyp', 'hyp-a'), runId: claimA.runId, statement: 'H1', mechanism: '', derivation: { strategy: 'evidence_conditioned' as const, rationale: 'r', inputClaimIds: [claimA.id] }, assumptions: [], predictions: [], supportingClaimIds: [claimA.id], counterClaimIds: [], uncertainties: [], noveltyLabel: 'mixed' as const, testability: 'testable_now' as const, createdAt: '2026-01-01T00:00:00.000Z' };
    const hypothesisB = { ...hypothesisA, id: id('hyp', 'hyp-b'), statement: 'H2' };
    const relation = { id: id('ev', 'rel-a'), runId: claimA.runId, relation: 'supports' as const, claimId: claimA.id, targetHypothesisId: hypothesisA.id, rationale: 'supports', strength: 'strong' as const, uncertainties: [], createdAt: '2026-01-01T00:00:00.000Z' };
    const counter = { ...relation, id: id('ev', 'rel-b'), relation: 'contradicts' as const, claimId: claimB.id, targetHypothesisId: hypothesisA.id, rationale: 'counter' };
    const model = deriveScientificWorldModel({ id: id('wm', 'model-a'), runId: claimA.runId, version: 1, computedAt: '2026-01-01T00:00:00.000Z', claims: [claimA, claimB], hypotheses: [hypothesisA, hypothesisB], relations: [relation, counter], revisions: [], sourceEventCount: 2 });
    expect(model.hypotheses[0]).toMatchObject({ hypothesisId: hypothesisA.id, belief: 'leading', supportCount: 1, counterCount: 1 });
    expect(model.facts.find((fact) => fact.claimId === claimB.id)?.status).toBe('contested');
    expect(model.causalRelations).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: 'supports', from: claimA.id, to: hypothesisA.id }),
      expect.objectContaining({ relation: 'contradicts', from: claimB.id, to: hypothesisA.id }),
    ]));
    expect(model.competingExplanations).toEqual(['H1', 'H2']);
    expect(model.beliefRevisions).toEqual([]);
    expect(model.provenance.sourceObjectIds).toHaveLength(6);
  });
});
