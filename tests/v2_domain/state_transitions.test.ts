// tests/v2_domain/state_transitions.test.ts
//
// SPEC-001 / IMPL-002 — V2 Domain Contract Set: legal state-transition validators.
//
// Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md
//   §3.2 (task attempt), §3.3 (receipt standing), §3.4 (review case).
//
// These validators enforce the legal-edge tables. Illegal transitions must
// throw V2ReasonCode — fail-closed, never silent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTaskAttemptTransition,
  assertReceiptStandingTransition,
  assertReviewCaseTransition,
  isTerminalTaskAttemptState,
} from '../../src/v2_domain/state_transitions.ts';

// ---------------------------------------------------------------------------
// §3.2 Task attempt transitions
// ---------------------------------------------------------------------------

test('task: QUEUED → PREPARING is legal', () => {
  assert.doesNotThrow(() => assertTaskAttemptTransition('QUEUED', 'PREPARING'));
});

test('task: QUEUED → SUCCEEDED is illegal (no direct success from queue)', () => {
  assert.throws(
    () => assertTaskAttemptTransition('QUEUED', 'SUCCEEDED'),
    /TASK_ILLEGAL_TRANSITION/,
  );
});

test('task: RUNNING → SUCCEEDED_WITH_GAPS is legal', () => {
  assert.doesNotThrow(() => assertTaskAttemptTransition('RUNNING', 'SUCCEEDED_WITH_GAPS'));
});

test('task: PAUSED → RUNNING is legal (resume validates checkpoint)', () => {
  assert.doesNotThrow(() => assertTaskAttemptTransition('PAUSED', 'RUNNING'));
});

test('task: SUCCEEDED → RUNNING is illegal (terminal)', () => {
  assert.throws(
    () => assertTaskAttemptTransition('SUCCEEDED', 'RUNNING'),
    /TASK_ILLEGAL_TRANSITION.*terminal/,
  );
});

test('task: CANCELED → QUEUED is illegal (terminal, must use task.retry on FAILED_RETRYABLE/EXPIRED)', () => {
  assert.throws(
    () => assertTaskAttemptTransition('CANCELED', 'QUEUED'),
    /TASK_ILLEGAL_TRANSITION/,
  );
});

test('task: isTerminalTaskAttemptState identifies all 6 terminal states', () => {
  assert.equal(isTerminalTaskAttemptState('SUCCEEDED'), true);
  assert.equal(isTerminalTaskAttemptState('SUCCEEDED_WITH_GAPS'), true);
  assert.equal(isTerminalTaskAttemptState('FAILED_RETRYABLE'), true);
  assert.equal(isTerminalTaskAttemptState('FAILED_TERMINAL'), true);
  assert.equal(isTerminalTaskAttemptState('CANCELED'), true);
  assert.equal(isTerminalTaskAttemptState('EXPIRED'), true);
  assert.equal(isTerminalTaskAttemptState('RUNNING'), false);
  assert.equal(isTerminalTaskAttemptState('QUEUED'), false);
});

// ---------------------------------------------------------------------------
// §3.3 Receipt standing transitions
// ---------------------------------------------------------------------------

test('receipt: ACTIVE → SUPERSEDED is legal (requires successor link)', () => {
  assert.doesNotThrow(() => assertReceiptStandingTransition('ACTIVE', 'SUPERSEDED'));
});

test('receipt: ACTIVE → WITHDRAWN is legal (requires authority)', () => {
  assert.doesNotThrow(() => assertReceiptStandingTransition('ACTIVE', 'WITHDRAWN'));
});

test('receipt: SUPERSEDED → WITHDRAWN is legal (later withdrawal)', () => {
  assert.doesNotThrow(() => assertReceiptStandingTransition('SUPERSEDED', 'WITHDRAWN'));
});

test('receipt: WITHDRAWN → ACTIVE is illegal (terminal)', () => {
  assert.throws(
    () => assertReceiptStandingTransition('WITHDRAWN', 'ACTIVE'),
    /RECEIPT_ILLEGAL_TRANSITION.*terminal/,
  );
});

test('receipt: WITHDRAWN → SUPERSEDED is illegal (terminal)', () => {
  assert.throws(
    () => assertReceiptStandingTransition('WITHDRAWN', 'SUPERSEDED'),
    /RECEIPT_ILLEGAL_TRANSITION/,
  );
});

// ---------------------------------------------------------------------------
// §3.4 Review case transitions
// ---------------------------------------------------------------------------

test('review: DRAFT → SUBMITTED is legal', () => {
  assert.doesNotThrow(() => assertReviewCaseTransition('DRAFT', 'SUBMITTED'));
});

test('review: SUBMITTED → RESPONSE_NEEDED is legal', () => {
  assert.doesNotThrow(() => assertReviewCaseTransition('SUBMITTED', 'RESPONSE_NEEDED'));
});

test('review: RESPONDED → RESPONSE_NEEDED is legal (new request = new event)', () => {
  assert.doesNotThrow(() => assertReviewCaseTransition('RESPONDED', 'RESPONSE_NEEDED'));
});

test('review: RESOLVED → SUBMITTED is illegal (terminal; appeal opens new linked case)', () => {
  assert.throws(
    () => assertReviewCaseTransition('RESOLVED', 'SUBMITTED'),
    /REVIEW_ILLEGAL_TRANSITION.*terminal/,
  );
});

test('review: WITHDRAWN → DRAFT is illegal (terminal)', () => {
  assert.throws(
    () => assertReviewCaseTransition('WITHDRAWN', 'DRAFT'),
    /REVIEW_ILLEGAL_TRANSITION/,
  );
});
