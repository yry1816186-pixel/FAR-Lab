/**
 * tests/research/scorecard.test.ts — deterministic scoring + Pareto front.
 *
 * The scorecard is PURE (no LLM): same (candidate, binding, critique) →
 * identical dimensions. These tests pin the deterministic dimensions and the
 * Pareto-dominance rule, and prove the model NEVER emits a single total score
 * (dimensions carry `source` provenance, never collapsed).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDeterministicDimensions,
  computeParetoFront,
  buildScorecard,
} from '../../src/research/scorecard.ts';
import type {
  CitationBinding,
  CritiqueReport,
  HypothesisCandidate,
  HypothesisScorecard,
} from '../../src/research/types.ts';

function candidate(overrides: Partial<HypothesisCandidate> = {}): HypothesisCandidate {
  return {
    id: 'h1',
    statement: 'H1',
    mechanism: 'm1',
    falsificationMethod: { prediction: 'p', metric: 'rmse', comparator: 'lt', value: 0.1 },
    supportingCitations: ['d1'],
    counterEvidenceCitations: ['d2'],
    relationToExistingTheory: 'r',
    alternativeExplanations: ['a'],
    observablePredictions: ['o'],
    distinguishingObservations: ['d'],
    noveltyRelativeToCorpus: 'n',
    assumptions: ['x'],
    risks: ['y'],
    ...overrides,
  };
}

function binding(overrides: Partial<CitationBinding> = {}): CitationBinding {
  return {
    supportingIds: ['d1'],
    counterIds: ['d2'],
    boundSupporting: [],
    boundCounter: [],
    unbound: [],
    allBound: true,
    snapshotId: 'snap',
    ...overrides,
  };
}

describe('computeDeterministicDimensions (pure)', () => {
  it('grades Falsifiability A for a fully-specified falsification method', () => {
    const dims = computeDeterministicDimensions(candidate(), binding());
    const f = dims.find((d) => d.name === 'Falsifiability');
    assert.equal(f?.grade, 'A');
    assert.equal(f?.source, 'deterministic');
  });

  it('grades Falsifiability F for an incomplete method (missing threshold)', () => {
    const c = candidate({
      falsificationMethod: { prediction: 'p', metric: 'rmse', comparator: 'gt' },
    });
    const dims = computeDeterministicDimensions(c, binding());
    assert.equal(dims.find((d) => d.name === 'Falsifiability')?.grade, 'F');
  });

  it('grades EvidenceCoverage by bound-supporting count', () => {
    const empty = computeDeterministicDimensions(candidate(), binding({ boundSupporting: [] }));
    assert.equal(empty.find((d) => d.name === 'EvidenceCoverage')?.grade, 'D');
  });

  it('downgrades Risk to F on a critical finding, C on major, B on minor', () => {
    const critical: CritiqueReport = {
      hypothesisId: 'h1',
      findings: [{ dimension: 'confounding', finding: 'x', severity: 'critical' }],
      sameModelAsGenerator: true,
    };
    const major: CritiqueReport = {
      hypothesisId: 'h1',
      findings: [{ dimension: 'confounding', finding: 'x', severity: 'major' }],
      sameModelAsGenerator: true,
    };
    assert.equal(
      computeDeterministicDimensions(candidate(), binding(), critical).find((d) => d.name === 'Risk')?.grade,
      'F',
    );
    assert.equal(
      computeDeterministicDimensions(candidate(), binding(), major).find((d) => d.name === 'Risk')?.grade,
      'C',
    );
  });

  it('is deterministic (same input → identical dimensions)', () => {
    const a = computeDeterministicDimensions(candidate(), binding());
    const b = computeDeterministicDimensions(candidate(), binding());
    assert.deepEqual(a, b);
  });
});

describe('computeParetoFront (pure)', () => {
  function card(id: string, grades: Record<string, string>): HypothesisScorecard {
    return buildScorecard(
      id,
      Object.entries(grades).map(([name, grade]) => ({
        name: name as HypothesisScorecard['dimensions'][number]['name'],
        grade: grade as HypothesisScorecard['dimensions'][number]['grade'],
        rationale: '',
        source: 'deterministic',
      })),
      [],
      false,
      '',
    );
  }

  it('keeps the dominant hypothesis, drops the dominated one', () => {
    const a = card('a', { Falsifiability: 'A', EvidenceCoverage: 'A' });
    const b = card('b', { Falsifiability: 'A', EvidenceCoverage: 'C' });
    const front = computeParetoFront({ a, b });
    assert.ok(front.has('a'));
    assert.ok(!front.has('b'));
  });

  it('keeps both when they are incomparable (trade-off)', () => {
    const a = card('a', { Falsifiability: 'A', EvidenceCoverage: 'C' });
    const b = card('b', { Falsifiability: 'C', EvidenceCoverage: 'A' });
    const front = computeParetoFront({ a, b });
    assert.ok(front.has('a'));
    assert.ok(front.has('b'));
  });
});
