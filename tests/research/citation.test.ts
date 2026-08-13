/**
 * tests/research/citation.test.ts — deterministic citation binding.
 *
 * A hypothesis may cite only documentIds that RESOLVE in the grounding corpus;
 * an unbound citation cannot be evidence (directive §9.5). This pins the
 * set-membership binding and the deterministic hypothesis-id computation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCorpusSnapshot, CitationResolver } from '../../src/retrieval/index.ts';
import { bindCitations } from '../../src/research/citation.ts';
import { computeHypothesisId } from '../../src/research/hypothesis_generation.ts';
import { DOC_A, DOC_B } from '../../src/research/research_fixtures.ts';
import type { HypothesisCandidate } from '../../src/research/types.ts';

const corpus = createCorpusSnapshot([DOC_A, DOC_B], ['demo']);
const resolver = new CitationResolver(corpus);

function candidate(supporting: readonly string[], counter: readonly string[]): HypothesisCandidate {
  return {
    id: computeHypothesisId('stmt', 'mech'),
    statement: 'stmt',
    mechanism: 'mech',
    falsificationMethod: { prediction: 'p', metric: 'rmse', comparator: 'lt', value: 0.1 },
    supportingCitations: supporting,
    counterEvidenceCitations: counter,
    relationToExistingTheory: 'r',
    alternativeExplanations: ['a'],
    observablePredictions: ['o'],
    distinguishingObservations: ['d'],
    noveltyRelativeToCorpus: 'n',
    assumptions: ['x'],
    risks: ['y'],
  };
}

describe('bindCitations (deterministic)', () => {
  it('binds citations that resolve in the corpus (allBound=true)', () => {
    const b = bindCitations(candidate([DOC_A.documentId], [DOC_B.documentId]), resolver);
    assert.equal(b.allBound, true);
    assert.equal(b.boundSupporting.length, 1);
    assert.equal(b.boundCounter.length, 1);
    assert.equal(b.unbound.length, 0);
  });

  it('flags citations that do NOT resolve (allBound=false)', () => {
    const b = bindCitations(candidate(['fabricated-id'], []), resolver);
    assert.equal(b.allBound, false);
    assert.deepEqual(b.unbound, ['fabricated-id']);
    assert.equal(b.boundSupporting.length, 0);
  });
});

describe('computeHypothesisId (deterministic)', () => {
  it('is content-addressed and stable', () => {
    assert.equal(computeHypothesisId('s', 'm'), computeHypothesisId('s', 'm'));
    assert.notEqual(computeHypothesisId('s', 'm'), computeHypothesisId('s2', 'm'));
  });
});
