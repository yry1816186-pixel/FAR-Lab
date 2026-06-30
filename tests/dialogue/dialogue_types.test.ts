import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLARIFICATION_QUESTION_TYPES,
  DIALOGUE_TURN_ROLES,
  INTENT_HYPOTHESIS_STATUSES,
  INTENT_LABELS,
  RESEARCH_SESSION_STATUSES,
  isIntentLabel,
} from '../../src/dialogue/dialogue_types.ts';

test('INTENT_LABELS has exactly 8 values matching 02 §3.8 CHECK', () => {
  assert.equal(INTENT_LABELS.length, 8);
});

test('INTENT_LABELS contains all 8 expected values', () => {
  const expected = [
    'hypothesis_generation',
    'literature_review',
    'experiment_design',
    'data_analysis',
    'phenomenon_explanation',
    'method_comparison',
    'reproducibility_check',
    'open_ended_exploration',
  ];
  assert.deepEqual([...INTENT_LABELS], expected);
});

test('isIntentLabel returns true for valid labels', () => {
  assert.equal(isIntentLabel('hypothesis_generation'), true);
  assert.equal(isIntentLabel('open_ended_exploration'), true);
});

test('isIntentLabel returns false for invalid labels', () => {
  assert.equal(isIntentLabel('invalid_intent'), false);
  assert.equal(isIntentLabel(''), false);
});

test('RESEARCH_SESSION_STATUSES has exactly 5 values', () => {
  assert.equal(RESEARCH_SESSION_STATUSES.length, 5);
  assert.deepEqual([...RESEARCH_SESSION_STATUSES], [
    'created', 'active', 'paused', 'finalized', 'archived',
  ]);
});

test('DIALOGUE_TURN_ROLES has exactly 3 values', () => {
  assert.equal(DIALOGUE_TURN_ROLES.length, 3);
  assert.deepEqual([...DIALOGUE_TURN_ROLES], ['user', 'assistant', 'system']);
});

test('INTENT_HYPOTHESIS_STATUSES has exactly 3 values', () => {
  assert.equal(INTENT_HYPOTHESIS_STATUSES.length, 3);
  assert.deepEqual([...INTENT_HYPOTHESIS_STATUSES], ['pending', 'confirmed', 'rejected']);
});

test('CLARIFICATION_QUESTION_TYPES has exactly 6 values', () => {
  assert.equal(CLARIFICATION_QUESTION_TYPES.length, 6);
  assert.deepEqual([...CLARIFICATION_QUESTION_TYPES], [
    'scope', 'metric', 'baseline', 'dataset', 'method', 'general',
  ]);
});

test('INTENT_LABELS has no duplicates', () => {
  const set = new Set(INTENT_LABELS);
  assert.equal(set.size, INTENT_LABELS.length);
});

test('all INTENT_LABELS are lowercase snake_case', () => {
  for (const label of INTENT_LABELS) {
    assert.match(label, /^[a-z][a-z_]*$/, `label "${label}" is not lowercase snake_case`);
  }
});
