/**
 * tests/research/revision.test.ts — immutable, versioned revisions (directive §9.10).
 *
 * Revisions are versioned (1-based), parent-referenced (rollback-able), and
 * deterministic. A feedback signal is a typed object, never a bare chat-log
 * append; metrics are never forced to monotonically improve.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFeedbackSignal,
  compareResearchPlans,
  createRevision,
} from '../../src/research/revision.ts';
import type { ResearchPlan } from '../../src/research/types.ts';

/** A minimal plan builder for diff tests. */
function plan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    objectives: ['o1'],
    primaryHypothesisId: 'h1',
    alternativeHypothesisIds: [],
    preregisteredPredictions: ['p1'],
    dataRequirements: [],
    inclusionExclusionCriteria: [],
    variables: [],
    design: 'design-a',
    analysisDag: ['step1'],
    tools: ['python'],
    statisticalMethods: ['pearson'],
    sampleSizeRationale: 'n>=30',
    multiplicityHandling: 'single test',
    missingOutlierStrategy: 'listwise',
    stoppingConditions: ['stop if n<30'],
    checkpoints: ['after selection'],
    budget: 'compute-only',
    risks: ['risk1'],
    reproducibility: ['seed everything'],
    nextRoundDecisionRules: [],
    humanApprovalRequired: ['publication'],
    ...overrides,
  } satisfies ResearchPlan;
}

describe('buildFeedbackSignal (pure)', () => {
  it('defaults to no triggers and no score change', () => {
    const fb = buildFeedbackSignal({ source: 'human', actor: 'r1', text: 'note' });
    assert.deepEqual(fb.triggers, ['none']);
    assert.equal(fb.changesScore, false);
    assert.deepEqual(fb.affectsHypothesisIds, []);
  });

  it('carries explicit triggers + affected hypotheses', () => {
    const fb = buildFeedbackSignal({
      source: 'tool',
      actor: 'bge-reranker',
      text: 'low entailment',
      affectsHypothesisIds: ['h1'],
      triggers: ['plan_rewrite'],
    });
    assert.deepEqual(fb.affectsHypothesisIds, ['h1']);
    assert.deepEqual(fb.triggers, ['plan_rewrite']);
  });
});

describe('createRevision (pure)', () => {
  const fb = buildFeedbackSignal({ source: 'human', actor: 'r1', text: 'revise plan' });

  it('assigns a 1-based number and null parent for the first revision', () => {
    const rev = createRevision({
      parentRevisionId: null,
      number: 1,
      feedback: fb,
      changes: {
        hypothesisChanges: { added: [], removed: [], downgraded: ['h1'] },
        planChanges: ['plan rewritten'],
        metricChanges: [],
        unresolvedConflicts: [],
      },
    });
    assert.equal(rev.number, 1);
    assert.equal(rev.parentRevisionId, null);
    assert.deepEqual(rev.hypothesisChanges.downgraded, ['h1']);
  });

  it('is deterministic for identical inputs (fixed timestamp)', () => {
    const a = createRevision({
      parentRevisionId: 'parent',
      number: 2,
      feedback: fb,
      changes: {
        hypothesisChanges: { added: [], removed: [], downgraded: [] },
        planChanges: [],
        metricChanges: [],
        unresolvedConflicts: [],
      },
      createdAt: '2026-08-13T00:00:00.000Z',
    });
    const b = createRevision({
      parentRevisionId: 'parent',
      number: 2,
      feedback: fb,
      changes: {
        hypothesisChanges: { added: [], removed: [], downgraded: [] },
        planChanges: [],
        metricChanges: [],
        unresolvedConflicts: [],
      },
      createdAt: '2026-08-13T00:00:00.000Z',
    });
    assert.equal(a.id, b.id);
  });

  it('freezes before/after plan snapshots when provided', () => {
    const before = plan();
    const after = plan({ design: 'design-b' });
    const rev = createRevision({
      parentRevisionId: null,
      number: 1,
      feedback: fb,
      changes: {
        hypothesisChanges: { added: [], removed: [], downgraded: [] },
        planChanges: ['design updated'],
        metricChanges: [],
        unresolvedConflicts: [],
      },
      beforePlan: before,
      afterPlan: after,
    });
    assert.equal(rev.beforePlan, before);
    assert.equal(rev.afterPlan, after);
  });
});

describe('compareResearchPlans (pure diff)', () => {
  it('reports identical plans honestly (never invents changes)', () => {
    const a = plan();
    const b = plan();
    const diff = compareResearchPlans(a, b);
    assert.equal(diff.identical, true);
    assert.equal(diff.stringFieldChanges.length, 0);
    assert.equal(Object.keys(diff.arrayFieldChanges).length, 0);
  });

  it('detects string-field changes with before/after values', () => {
    const a = plan();
    const b = plan({ design: 'design-b', multiplicityHandling: 'bonferroni' });
    const diff = compareResearchPlans(a, b);
    assert.equal(diff.identical, false);
    assert.deepEqual(
      diff.stringFieldChanges.map((c) => c.field).sort(),
      ['design', 'multiplicityHandling'],
    );
    assert.equal(diff.stringFieldChanges.find((c) => c.field === 'design')?.before, 'design-a');
  });

  it('detects array-field additions and removals deterministically', () => {
    const a = plan({ objectives: ['o1', 'o2'] });
    const b = plan({ objectives: ['o2', 'o3'] });
    const diff = compareResearchPlans(a, b);
    const objectives = diff.arrayFieldChanges['objectives'];
    assert.ok(objectives !== undefined);
    assert.deepEqual([...objectives.added].sort(), ['o3']);
    assert.deepEqual([...objectives.removed].sort(), ['o1']);
    assert.deepEqual(objectives.unchanged, ['o2']);
  });

  it('flags a primary-hypothesis change even if nothing else changed', () => {
    const a = plan();
    const b = plan({ primaryHypothesisId: 'h2' });
    const diff = compareResearchPlans(a, b);
    assert.equal(diff.primaryHypothesisChanged, true);
    assert.equal(diff.identical, false);
  });
});
