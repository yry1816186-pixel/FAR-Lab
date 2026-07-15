import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIALOGUE_EVENT_KINDS,
  createDialogueEventEmitter,
  clarificationAskedEvent,
  dialogueTurnCompletedEvent,
  dialogueTurnStartedEvent,
  intentInferredEvent,
  sessionFinalizedEvent,
  sessionStartedEvent,
} from '../../src/dialogue/dialogue_event_emitter.ts';

test('DIALOGUE_EVENT_KINDS has exactly 6 values', () => {
  assert.equal(DIALOGUE_EVENT_KINDS.length, 6);
  assert.deepEqual([...DIALOGUE_EVENT_KINDS], [
    'session_started', 'session_finalized', 'dialogue_turn_started',
    'dialogue_turn_completed', 'intent_inferred', 'clarification_asked',
  ]);
});

test('emitter emit creates an event with eventId and isoTimestamp', () => {
  const emitter = createDialogueEventEmitter();
  const event = emitter.emit(sessionStartedEvent('s-1', null));
  assert.ok(event.eventId.length > 0);
  assert.ok(event.isoTimestamp.length > 0);
  assert.equal(event.eventKind, 'session_started');
});

test('emitter getEvents returns all events', () => {
  const emitter = createDialogueEventEmitter();
  emitter.emit(sessionStartedEvent('s-1', null));
  emitter.emit(sessionFinalizedEvent('s-1', 'f-1'));
  assert.equal(emitter.getEvents().length, 2);
});

test('emitter getBySession filters by session', () => {
  const emitter = createDialogueEventEmitter();
  emitter.emit(sessionStartedEvent('s-1', null));
  emitter.emit(sessionStartedEvent('s-2', null));
  assert.equal(emitter.getBySession('s-1').length, 1);
  assert.equal(emitter.getBySession('s-2').length, 1);
});

test('emitter getByKind filters by eventKind', () => {
  const emitter = createDialogueEventEmitter();
  emitter.emit(sessionStartedEvent('s-1', null));
  emitter.emit(intentInferredEvent('s-1', 'hypothesis_generation', 0.8));
  emitter.emit(intentInferredEvent('s-1', 'data_analysis', 0.6));
  assert.equal(emitter.getByKind('intent_inferred').length, 2);
  assert.equal(emitter.getByKind('session_started').length, 1);
});

test('emitter count returns total event count', () => {
  const emitter = createDialogueEventEmitter();
  emitter.emit(sessionStartedEvent('s-1', null));
  emitter.emit(dialogueTurnStartedEvent('s-1', 1));
  emitter.emit(clarificationAskedEvent('s-1', 'scope'));
  assert.equal(emitter.count(), 3);
});

test('sessionStartedEvent has correct payload', () => {
  const base = sessionStartedEvent('s-1', 'user-1');
  assert.equal(base.eventKind, 'session_started');
  assert.equal(base.sessionId, 's-1');
  assert.equal(base.payload.userId, 'user-1');
});

test('dialogueTurnStartedEvent has turnNo in payload', () => {
  const base = dialogueTurnStartedEvent('s-1', 5);
  assert.equal(base.payload.turnNo, 5);
});

test('intentInferredEvent has intentLabel and confidence', () => {
  const base = intentInferredEvent('s-1', 'data_analysis', 0.75);
  assert.equal(base.payload.intentLabel, 'data_analysis');
  assert.equal(base.payload.confidence, 0.75);
});

test('clarificationAskedEvent has questionType', () => {
  const base = clarificationAskedEvent('s-1', 'metric');
  assert.equal(base.payload.questionType, 'metric');
});

test('dialogueTurnCompletedEvent has turnId and intentHypothesisId', () => {
  const base = dialogueTurnCompletedEvent('s-1', 't-1', 'h-1');
  assert.equal(base.payload.turnId, 't-1');
  assert.equal(base.payload.intentHypothesisId, 'h-1');
});

test('events are append-only (getEvents returns copy)', () => {
  const emitter = createDialogueEventEmitter();
  emitter.emit(sessionStartedEvent('s-1', null));
  const events1 = emitter.getEvents();
  emitter.emit(sessionFinalizedEvent('s-1', 'f-1'));
  const events2 = emitter.getEvents();
  assert.equal(events1.length, 1);
  assert.equal(events2.length, 2);
});
