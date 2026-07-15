import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntentHypothesis, IntentLabel, ClarificationDecision } from '../../src/dialogue/dialogue_types.ts';
import {
  CLARIFICATION_CONFIDENCE_THRESHOLD,
  createClarificationDialogManager,
  decideClarification,
  getFallbackQuestion,
  getQuestionTypeForIntent,
} from '../../src/dialogue/clarification_dialog_manager.ts';
import { createInMemoryClarificationStore } from '../../src/dialogue/clarification_stores.ts';

function makeHyp(overrides: Partial<IntentHypothesis> = {}): IntentHypothesis {
  return {
    hypothesisId: 'h-1',
    sessionId: 's-1',
    turnId: 't-1',
    intentLabel: 'hypothesis_generation',
    confidence: 0.8,
    rationale: 'test rationale',
    status: 'pending',
    createdAt: '2026-06-27T00:00:00Z',
    updatedAt: '2026-06-27T00:00:00Z',
    ...overrides,
  };
}

// ===== 选择路径（decideClarification 阈值判定） =====

test('decideClarification returns needClarification=false when confidence >= threshold', () => {
  const decision = decideClarification(makeHyp({ confidence: 0.7 }));
  assert.equal(decision.needClarification, false);
  assert.equal(decision.questionType, null);
  assert.equal(decision.question, null);
});

test('decideClarification returns needClarification=true when confidence < threshold', () => {
  const decision = decideClarification(makeHyp({ confidence: 0.4 }));
  assert.equal(decision.needClarification, true);
  assert.notEqual(decision.questionType, null);
  assert.notEqual(decision.question, null);
});

test('decideClarification returns needClarification=false at confidence === threshold (boundary)', () => {
  const decision = decideClarification(makeHyp({ confidence: CLARIFICATION_CONFIDENCE_THRESHOLD }));
  assert.equal(decision.needClarification, false);
});

test('decideClarification returns needClarification=true when confidence === 0', () => {
  const decision = decideClarification(makeHyp({ confidence: 0 }));
  assert.equal(decision.needClarification, true);
});

test('decideClarification returns needClarification=false when confidence === 1', () => {
  const decision = decideClarification(makeHyp({ confidence: 1 }));
  assert.equal(decision.needClarification, false);
});

test('decideClarification honors custom threshold', () => {
  const highThreshold = 0.9;
  const decision = decideClarification(makeHyp({ confidence: 0.8 }), highThreshold);
  assert.equal(decision.needClarification, true);
  const decision2 = decideClarification(makeHyp({ confidence: 0.95 }), highThreshold);
  assert.equal(decision2.needClarification, false);
});

// ===== 确认路径（confirmed / rejected 跳过） =====

test('decideClarification skips clarification when status is confirmed', () => {
  const decision = decideClarification(makeHyp({ status: 'confirmed', confidence: 0.1 }));
  assert.equal(decision.needClarification, false);
});

test('decideClarification skips clarification when status is rejected', () => {
  const decision = decideClarification(makeHyp({ status: 'rejected', confidence: 0.1 }));
  assert.equal(decision.needClarification, false);
});

// ===== 生成路径（intentLabel → questionType 映射） =====

test('getQuestionTypeForIntent maps hypothesis_generation to scope', () => {
  assert.equal(getQuestionTypeForIntent('hypothesis_generation'), 'scope');
});

test('getQuestionTypeForIntent maps experiment_design to metric', () => {
  assert.equal(getQuestionTypeForIntent('experiment_design'), 'metric');
});

test('getQuestionTypeForIntent maps data_analysis to baseline', () => {
  assert.equal(getQuestionTypeForIntent('data_analysis'), 'baseline');
});

test('getQuestionTypeForIntent maps method_comparison to method', () => {
  assert.equal(getQuestionTypeForIntent('method_comparison'), 'method');
});

test('getQuestionTypeForIntent maps reproducibility_check to dataset', () => {
  assert.equal(getQuestionTypeForIntent('reproducibility_check'), 'dataset');
});

// ===== 回退路径（askClarification 存储 / null 守卫 / 全覆盖） =====

test('askClarification returns null when needClarification is false', () => {
  const store = createInMemoryClarificationStore();
  const manager = createClarificationDialogManager(store);
  const decision: ClarificationDecision = {
    needClarification: false,
    questionType: null,
    question: null,
  };
  const result = manager.askClarification('s-1', 't-1', decision);
  assert.equal(result, null);
  assert.equal(store.countBySession('s-1'), 0);
});

test('askClarification stores question and returns it when needClarification is true', () => {
  const store = createInMemoryClarificationStore();
  const manager = createClarificationDialogManager(store);
  const decision: ClarificationDecision = {
    needClarification: true,
    questionType: 'scope',
    question: 'What is the scope?',
  };
  const result = manager.askClarification('s-1', 't-1', decision);
  assert.notEqual(result, null);
  assert.equal(result?.questionType, 'scope');
  assert.equal(result?.question, 'What is the scope?');
  assert.equal(store.countBySession('s-1'), 1);
  const stored = store.getBySession('s-1');
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.question, 'What is the scope?');
});

test('askClarification returns null when questionType is null despite needClarification true', () => {
  const store = createInMemoryClarificationStore();
  const manager = createClarificationDialogManager(store);
  const decision: ClarificationDecision = {
    needClarification: true,
    questionType: null,
    question: null,
  };
  const result = manager.askClarification('s-1', 't-1', decision);
  assert.equal(result, null);
  assert.equal(store.countBySession('s-1'), 0);
});

test('decideClarification covers all 8 intent labels producing valid questionType', () => {
  const intents: readonly IntentLabel[] = [
    'hypothesis_generation',
    'literature_review',
    'experiment_design',
    'data_analysis',
    'phenomenon_explanation',
    'method_comparison',
    'reproducibility_check',
    'open_ended_exploration',
  ];
  for (const intent of intents) {
    const decision = decideClarification(makeHyp({ intentLabel: intent, confidence: 0.2 }));
    assert.equal(decision.needClarification, true, `intent ${intent} should need clarification`);
    assert.notEqual(decision.questionType, null, `intent ${intent} should have questionType`);
    assert.notEqual(decision.question, null, `intent ${intent} should have question`);
  }
});

test('getFallbackQuestion returns non-empty string for every question type', () => {
  const questionTypes = ['scope', 'metric', 'baseline', 'dataset', 'method', 'general'] as const;
  for (const qt of questionTypes) {
    const q = getFallbackQuestion(qt);
    assert.ok(q.length > 0, `fallback question for ${qt} should be non-empty`);
  }
});
