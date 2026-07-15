import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResearchDialogueLayer, DEFAULT_MAX_TURNS, DIALOGUE_END_SIGNAL } from '../../src/dialogue/research_dialogue_layer.ts';
import { createInMemoryClarificationStore } from '../../src/dialogue/clarification_stores.ts';
import { createDialogueEventEmitter } from '../../src/dialogue/dialogue_event_emitter.ts';

function makeProvider(messages: string[]): () => string {
  let i = 0;
  return () => {
    if (i >= messages.length) return DIALOGUE_END_SIGNAL;
    return messages[i++] ?? DIALOGUE_END_SIGNAL;
  };
}

test('runDialogue returns a ManifestDraft with framework', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    userId: 'u-1',
    maxTurns: 5,
    userTurnProvider: makeProvider(['I want to generate a hypothesis about star classification']),
  });
  assert.ok(draft.framework.frameworkId.length > 0);
  assert.ok(draft.framework.researchQuestion.length > 0);
  // [I] Suggestion：provenance 加固——framework 须关联真实 dialogue turn
  // （validateFramework 已守 linkedDialogueTurnIds 非空·显式断言防 stub 实现钻空）
  assert.ok(
    draft.framework.linkedDialogueTurnIds.length > 0,
    'framework must derive from dialogue turns (provenance)',
  );
});

test('runDialogue with < 3 turns produces degraded framework', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 1,
    userTurnProvider: makeProvider(['short dialogue']),
  });
  assert.equal(draft.degraded, true);
  assert.notEqual(draft.degradationReason, null);
});

test('runDialogue with >= 3 turns and high confidence produces non-degraded framework', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 5,
    userTurnProvider: makeProvider([
      'I want to generate a hypothesis about variable star classification',
      'I want to generate another hypothesis about light curves',
      'I want to generate a third hypothesis about spectral analysis',
    ]),
  });
  assert.equal(draft.degraded, false);
});

test('runDialogue produces linkedDialogueTurnIds from turns', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 3,
    userTurnProvider: makeProvider(['hypothesis about stars', 'hypothesis about planets', 'hypothesis about galaxies']),
  });
  assert.ok(draft.framework.linkedDialogueTurnIds.length > 0);
});

test('runDialogue emits session_started and session_finalized events', () => {
  const emitter = createDialogueEventEmitter();
  const layer = createResearchDialogueLayer({ eventEmitter: emitter });
  layer.runDialogue({
    maxTurns: 1,
    userTurnProvider: makeProvider(['test']),
  });
  assert.ok(emitter.getByKind('session_started').length > 0);
  assert.ok(emitter.getByKind('session_finalized').length > 0);
});

test('runDialogue emits dialogue_turn_started events for user turns', () => {
  const emitter = createDialogueEventEmitter();
  const layer = createResearchDialogueLayer({ eventEmitter: emitter });
  layer.runDialogue({
    maxTurns: 3,
    userTurnProvider: makeProvider(['turn1', 'turn2', 'turn3']),
  });
  assert.ok(emitter.getByKind('dialogue_turn_started').length >= 3);
});

test('runDialogue emits intent_inferred events', () => {
  const emitter = createDialogueEventEmitter();
  const layer = createResearchDialogueLayer({ eventEmitter: emitter });
  layer.runDialogue({
    maxTurns: 2,
    userTurnProvider: makeProvider(['hypothesis about stars', 'compare methods']),
  });
  assert.ok(emitter.getByKind('intent_inferred').length >= 2);
});

test('runDialogue stores clarification questions when confidence is low', () => {
  const store = createInMemoryClarificationStore();
  const layer = createResearchDialogueLayer({ clarificationStore: store });
  const draft = layer.runDialogue({
    maxTurns: 1,
    userTurnProvider: makeProvider(['ambiguous message']),
  });
  // [I] Critical 修复：countBySession 是方法（返回 number）·非属性——原 `.length`
  // 取的是函数 arity（恒为 0），且 `|| true` 使断言恒真（虚假通过）。
  // 'ambiguous message'→open_ended_exploration→confidence=0.3<0.6（CLARIFICATION_CONFIDENCE_THRESHOLD）
  // →decideClarification 触发→askClarification→store.store，故 store 内应有 ≥1 条 question。
  assert.ok(
    store.countBySession(draft.sourceSessionId) > 0,
    'low-confidence turn must store ≥1 clarification question',
  );
});

test('DEFAULT_MAX_TURNS is 20', () => {
  assert.equal(DEFAULT_MAX_TURNS, 20);
});

test('runDialogue framework primaryIntent is a valid IntentLabel', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 1,
    userTurnProvider: makeProvider(['I want to analyze data from experiments']),
  });
  const validIntents = [
    'hypothesis_generation', 'literature_review', 'experiment_design', 'data_analysis',
    'phenomenon_explanation', 'method_comparison', 'reproducibility_check', 'open_ended_exploration',
  ];
  assert.ok(validIntents.includes(draft.framework.primaryIntent));
});

test('runDialogue with end signal immediately produces framework', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 5,
    userTurnProvider: makeProvider([]),
  });
  assert.ok(draft.framework.frameworkId.length > 0);
});

test('runDialogue framework does not contain判定 related fields (no LLM-as-judge)', () => {
  const layer = createResearchDialogueLayer();
  const draft = layer.runDialogue({
    maxTurns: 2,
    userTurnProvider: makeProvider(['test hypothesis', 'test data analysis']),
  });
  const keys = Object.keys(draft.framework);
  assert.equal(keys.includes('verdictId'), false);
  assert.equal(keys.includes('verdict'), false);
});
