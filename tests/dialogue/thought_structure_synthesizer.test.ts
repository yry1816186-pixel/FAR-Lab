import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DialogueTurn, IntentHypothesis } from '../../src/dialogue/dialogue_types.ts';
import {
  DEGRADATION_PROMPT,
  MIN_CONFIDENCE_FOR_SYNTHESIS,
  MIN_TURNS_FOR_SYNTHESIS,
  UNFALSIFIABLE_MARKER,
  aggregatePrimaryIntent,
  createThoughtStructureSynthesizer,
  shouldDegrade,
} from '../../src/dialogue/thought_structure_synthesizer.ts';

function makeTurn(overrides: Partial<DialogueTurn> = {}): DialogueTurn {
  return {
    turnId: 't-1', sessionId: 's-1', turnNo: 1, role: 'user',
    content: 'test', intentHypothesisId: null, clarificationQuestionId: null,
    toolCallSeq: null, createdAt: '2026-06-27T00:00:00Z', ...overrides,
  };
}

function makeHyp(overrides: Partial<IntentHypothesis> = {}): IntentHypothesis {
  return {
    hypothesisId: 'h-1', sessionId: 's-1', turnId: 't-1',
    intentLabel: 'hypothesis_generation', confidence: 0.8, rationale: 'test',
    status: 'pending', createdAt: '2026-06-27T00:00:00Z', updatedAt: '2026-06-27T00:00:00Z',
    ...overrides,
  };
}

test('shouldDegrade returns true when user turns < 3', () => {
  const turns = [makeTurn({ role: 'user' }), makeTurn({ role: 'assistant' })];
  const result = shouldDegrade(turns, [makeHyp()]);
  assert.equal(result.degraded, true);
  assert.match(result.reason ?? '', /insufficient_turns/);
});

test('shouldDegrade returns true when all confidence < 0.5', () => {
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const h = [makeHyp({ confidence: 0.3 }), makeHyp({ confidence: 0.2 })];
  const result = shouldDegrade(turns, h);
  assert.equal(result.degraded, true);
  assert.match(result.reason ?? '', /all_confidence_below_threshold/);
});

test('shouldDegrade returns true when no hypotheses', () => {
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const result = shouldDegrade(turns, []);
  assert.equal(result.degraded, true);
  assert.match(result.reason ?? '', /no_intent_hypotheses/);
});

test('shouldDegrade returns false when turns >= 3 and some confidence >= 0.5', () => {
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const h = [makeHyp({ confidence: 0.3 }), makeHyp({ confidence: 0.8 })];
  const result = shouldDegrade(turns, h);
  assert.equal(result.degraded, false);
});

test('DEGRADATION_PROMPT is non-empty string', () => {
  assert.ok(DEGRADATION_PROMPT.length > 0);
  assert.match(DEGRADATION_PROMPT, /DEGRADATION_NOTICE/);
});

test('MIN_TURNS_FOR_SYNTHESIS is 3', () => {
  assert.equal(MIN_TURNS_FOR_SYNTHESIS, 3);
});

test('MIN_CONFIDENCE_FOR_SYNTHESIS is 0.5', () => {
  assert.equal(MIN_CONFIDENCE_FOR_SYNTHESIS, 0.5);
});

test('aggregatePrimaryIntent returns open_ended_exploration for empty hypotheses', () => {
  assert.equal(aggregatePrimaryIntent([]), 'open_ended_exploration');
});

test('aggregatePrimaryIntent prefers confirmed hypotheses', () => {
  const h = [makeHyp({ intentLabel: 'data_analysis', status: 'pending', confidence: 0.9 }), makeHyp({ intentLabel: 'hypothesis_generation', status: 'confirmed', confidence: 0.8 })];
  assert.equal(aggregatePrimaryIntent(h), 'hypothesis_generation');
});

test('synthesizeFramework injects DEGRADATION_PROMPT at openIssues[0] when degraded', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ role: 'user', turnNo: 1 })];
  const framework = synth.synthesizeFramework({ sessionId: 's-1', turns, hypotheses: [makeHyp()] });
  assert.equal(framework.openIssues.length > 0, true);
  assert.equal(framework.openIssues[0], DEGRADATION_PROMPT);
});

test('synthesizeFramework does not inject DEGRADATION_PROMPT when not degraded', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const h = [makeHyp({ confidence: 0.8 })];
  const framework = synth.synthesizeFramework({ sessionId: 's-1', turns, hypotheses: h });
  assert.equal(framework.openIssues.length === 0 || framework.openIssues[0] !== DEGRADATION_PROMPT, true);
});

test('synthesizeFramework derives linkedDialogueTurnIds from turns', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ turnId: 't-a' }), makeTurn({ turnId: 't-b', role: 'assistant' })];
  const framework = synth.synthesizeFramework({ sessionId: 's-1', turns, hypotheses: [makeHyp()] });
  assert.deepEqual([...framework.linkedDialogueTurnIds], ['t-a', 't-b']);
});

test('synthesizeFramework throws on empty turns', () => {
  const synth = createThoughtStructureSynthesizer();
  assert.throws(
    () => synth.synthesizeFramework({ sessionId: 's-1', turns: [], hypotheses: [] }),
    /turns must not be empty/,
  );
});

test('synthesizeWithDegradation returns ManifestDraft with degraded flag', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ role: 'user', turnNo: 1 })];
  const draft = synth.synthesizeWithDegradation({ sessionId: 's-1', turns, hypotheses: [makeHyp()] });
  assert.equal(draft.degraded, true);
  assert.notEqual(draft.degradationReason, null);
});

test('synthesizeWithDegradation returns non-degraded draft when sufficient context', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const draft = synth.synthesizeWithDegradation({ sessionId: 's-1', turns, hypotheses: [makeHyp({ confidence: 0.9 })] });
  assert.equal(draft.degraded, false);
  assert.equal(draft.degradationReason, null);
});

test('falsifiableAngle is UNFALSIFIABLE_FROM_DIALOGUE for open_ended_exploration', () => {
  const synth = createThoughtStructureSynthesizer();
  const turns = [makeTurn({ role: 'user', turnNo: 1 }), makeTurn({ role: 'user', turnNo: 2 }), makeTurn({ role: 'user', turnNo: 3 })];
  const h = [makeHyp({ intentLabel: 'open_ended_exploration', confidence: 0.8 })];
  const framework = synth.synthesizeFramework({ sessionId: 's-1', turns, hypotheses: h });
  assert.equal(framework.falsifiableAngle, UNFALSIFIABLE_MARKER);
});
