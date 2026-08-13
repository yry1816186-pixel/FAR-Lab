/**
 * tests/research/revision.test.ts — immutable, versioned revisions (directive §9.10).
 *
 * Revisions are versioned (1-based), parent-referenced (rollback-able), and
 * deterministic. A feedback signal is a typed object, never a bare chat-log
 * append; metrics are never forced to monotonically improve.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildFeedbackSignal, createRevision } from '../../src/research/revision.ts';

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
});
