/**
 * V2 Domain Contract Set — legal state-transition validators.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md
 *   §3.2 (task attempt), §3.3 (receipt standing), §3.4 (review case).
 *
 * Fail-closed: every illegal transition throws with a V2ReasonCode-derived
 * error tag. No silent coercion, no "default to current state."
 *
 * 模型中立 · 零容忍合规.
 */

import type {
  TaskAttemptState,
  ReceiptStanding,
  ReviewCaseState,
} from './contract_enums.ts';
import { TERMINAL_TASK_ATTEMPT_STATES } from './contract_enums.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true iff the given task attempt state is terminal (doc19 §3.2). */
export function isTerminalTaskAttemptState(state: TaskAttemptState): boolean {
  return (TERMINAL_TASK_ATTEMPT_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// §3.2 Task attempt transition table
// ---------------------------------------------------------------------------

/**
 * Complete legal-edge map for TaskAttempt (doc19 §3.2).
 * Keyed by source state → set of allowed target states.
 * Absence from the map or absence of target in the set = illegal.
 */
const TASK_ATTEMPT_TRANSITIONS: Readonly<Record<TaskAttemptState, readonly TaskAttemptState[]>> =
  Object.freeze({
    QUEUED: ['PREPARING', 'CANCEL_REQUESTED', 'EXPIRED'],
    PREPARING: ['RUNNING', 'CANCEL_REQUESTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'EXPIRED'],
    RUNNING: [
      'PAUSED',
      'CANCEL_REQUESTED',
      'SUCCEEDED',
      'SUCCEEDED_WITH_GAPS',
      'FAILED_RETRYABLE',
      'FAILED_TERMINAL',
      'EXPIRED',
    ],
    PAUSED: ['RUNNING', 'CANCEL_REQUESTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'EXPIRED'],
    CANCEL_REQUESTED: [
      'CANCELED',
      'SUCCEEDED',
      'SUCCEEDED_WITH_GAPS',
      'FAILED_RETRYABLE',
      'FAILED_TERMINAL',
      'EXPIRED',
    ],
    // Terminal states — no outgoing edges.
    SUCCEEDED: [],
    SUCCEEDED_WITH_GAPS: [],
    FAILED_RETRYABLE: [],
    FAILED_TERMINAL: [],
    CANCELED: [],
    EXPIRED: [],
  });

/**
 * Assert that a task attempt transition is legal (doc19 §3.2).
 * @throws Error with TASK_ILLEGAL_TRANSITION tag if illegal.
 *
 * Note: task.retry creates a NEW attempt in QUEUED under the same logical taskId;
 * it does not reopen a terminal attempt. That is a separate API, not a transition.
 */
export function assertTaskAttemptTransition(
  from: TaskAttemptState,
  to: TaskAttemptState,
): void {
  if (from === to) {
    throw new Error(
      `TASK_ILLEGAL_TRANSITION: self-transition ${from} → ${to} is not legal`,
    );
  }
  const allowed = TASK_ATTEMPT_TRANSITIONS[from];
  if (isTerminalTaskAttemptState(from)) {
    throw new Error(
      `TASK_ILLEGAL_TRANSITION: ${from} is terminal; no outgoing edge to ${to}`,
    );
  }
  if (!allowed.includes(to)) {
    throw new Error(
      `TASK_ILLEGAL_TRANSITION: ${from} → ${to} is not in the legal edge set`,
    );
  }
}

// ---------------------------------------------------------------------------
// §3.3 Receipt standing transition table
// ---------------------------------------------------------------------------

const RECEIPT_STANDING_TRANSITIONS: Readonly<Record<ReceiptStanding, readonly ReceiptStanding[]>> =
  Object.freeze({
    ACTIVE: ['SUPERSEDED', 'WITHDRAWN'],
    SUPERSEDED: ['WITHDRAWN'],
    WITHDRAWN: [], // Terminal.
  });

/**
 * Assert that a receipt standing transition is legal (doc19 §3.3).
 * @throws Error with RECEIPT_ILLEGAL_TRANSITION tag if illegal.
 */
export function assertReceiptStandingTransition(
  from: ReceiptStanding,
  to: ReceiptStanding,
): void {
  if (from === to) {
    throw new Error(
      `RECEIPT_ILLEGAL_TRANSITION: self-transition ${from} → ${to}`,
    );
  }
  const allowed = RECEIPT_STANDING_TRANSITIONS[from];
  if (allowed.length === 0) {
    throw new Error(
      `RECEIPT_ILLEGAL_TRANSITION: ${from} is terminal; no outgoing edge to ${to}`,
    );
  }
  if (!allowed.includes(to)) {
    throw new Error(
      `RECEIPT_ILLEGAL_TRANSITION: ${from} → ${to} is not in the legal edge set`,
    );
  }
}

// ---------------------------------------------------------------------------
// §3.4 Review case transition table
// ---------------------------------------------------------------------------

const REVIEW_CASE_TRANSITIONS: Readonly<Record<ReviewCaseState, readonly ReviewCaseState[]>> =
  Object.freeze({
    DRAFT: ['SUBMITTED', 'WITHDRAWN'],
    SUBMITTED: ['RESPONSE_NEEDED', 'RESOLVED', 'WITHDRAWN'],
    RESPONSE_NEEDED: ['RESPONDED', 'RESOLVED', 'WITHDRAWN'],
    RESPONDED: ['RESPONSE_NEEDED', 'RESOLVED', 'WITHDRAWN'],
    RESOLVED: [], // Terminal; appeal opens a new linked case.
    WITHDRAWN: [], // Terminal.
  });

/**
 * Assert that a review case transition is legal (doc19 §3.4).
 * @throws Error with REVIEW_ILLEGAL_TRANSITION tag if illegal.
 */
export function assertReviewCaseTransition(
  from: ReviewCaseState,
  to: ReviewCaseState,
): void {
  if (from === to) {
    throw new Error(
      `REVIEW_ILLEGAL_TRANSITION: self-transition ${from} → ${to}`,
    );
  }
  const allowed = REVIEW_CASE_TRANSITIONS[from];
  if (allowed.length === 0) {
    throw new Error(
      `REVIEW_ILLEGAL_TRANSITION: ${from} is terminal; appeal/later evidence opens a new linked case, not ${to}`,
    );
  }
  if (!allowed.includes(to)) {
    throw new Error(
      `REVIEW_ILLEGAL_TRANSITION: ${from} → ${to} is not in the legal edge set`,
    );
  }
}
