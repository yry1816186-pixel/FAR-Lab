// tests/v2_domain/domain_contract_enums.test.ts
//
// SPEC-001 / IMPL-002 — V2 Domain Contract Set: canonical state vocabulary.
//
// Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3-§4.
//
// This test enforces that the V2 domain contract enums EXIST and contain the
// exact frozen values from doc 19. RED before implementation: module does not
// exist → import fails → test fails for the right reason (missing feature).
//
// Non-goal: this is a candidate freeze, not a multi-council approval. The enums
// are the machine authority the reboot package deferred. See PROGRESS note.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_LIFECYCLE_STATES,
  PREFLIGHT_RESULT_STATES,
  TASK_ATTEMPT_STATES,
  RECEIPT_STANDING_VALUES,
  PRESERVATION_STATUS_VALUES,
  REVIEW_CASE_STATES,
  REVIEW_RESOLUTION_OUTCOMES,
  DEPLOYMENT_PROFILE_VALUES,
  ASSURANCE_DIMENSIONS,
  CANONICAL_OPERATION_IDS,
  LEGACY_TERM_ALIASES,
  V2_REASON_CODES,
} from '../../src/v2_domain/contract_enums.ts';

// ---------------------------------------------------------------------------
// §3.1 Draft lifecycle — exactly 2 values, one edge
// ---------------------------------------------------------------------------

test('DRAFT_LIFECYCLE_STATES: exactly EDITABLE | DISCARDED (doc19 §3.1)', () => {
  assert.deepEqual([...DRAFT_LIFECYCLE_STATES], ['EDITABLE', 'DISCARDED']);
});

test('PREFLIGHT_RESULT_STATES: exactly PREFLIGHT_BLOCKED | PREFLIGHT_READY (doc19 §3.1)', () => {
  assert.deepEqual([...PREFLIGHT_RESULT_STATES], ['PREFLIGHT_BLOCKED', 'PREFLIGHT_READY']);
});

// ---------------------------------------------------------------------------
// §3.2 Task attempt — complete legal state set (8 states)
// ---------------------------------------------------------------------------

test('TASK_ATTEMPT_STATES: 8 canonical values from doc19 §3.2 transition table', () => {
  const expected = [
    'QUEUED',
    'PREPARING',
    'RUNNING',
    'PAUSED',
    'CANCEL_REQUESTED',
    'SUCCEEDED',
    'SUCCEEDED_WITH_GAPS',
    'FAILED_RETRYABLE',
    'FAILED_TERMINAL',
    'CANCELED',
    'EXPIRED',
  ];
  assert.deepEqual([...TASK_ATTEMPT_STATES].sort(), expected.sort());
  // CANCELED is the sole serialized spelling (not CANCELLED).
  assert.equal(TASK_ATTEMPT_STATES.includes('CANCELED'), true);
  assert.equal(
    (TASK_ATTEMPT_STATES as readonly string[]).includes('CANCELLED'),
    false,
    'CANCELLED must never be serialized; only CANCELED',
  );
  assert.equal(
    (TASK_ATTEMPT_STATES as readonly string[]).includes('TIMED_OUT'),
    false,
    'TIMED_OUT is never a state; EXPIRED + reason code instead',
  );
});

// ---------------------------------------------------------------------------
// §3.3 Receipt standing — 3 values, specific legal edges
// ---------------------------------------------------------------------------

test('RECEIPT_STANDING_VALUES: exactly ACTIVE | SUPERSEDED | WITHDRAWN (doc19 §3.3)', () => {
  assert.deepEqual([...RECEIPT_STANDING_VALUES], ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN']);
  // Forbidden aliases must NOT appear.
  const forbidden = ['COMPILED', 'READY_TO_SEAL', 'ISSUED', 'PUBLISHED', 'EXPORTED', 'SHARED'];
  for (const f of forbidden) {
    assert.equal(
      (RECEIPT_STANDING_VALUES as readonly string[]).includes(f),
      false,
      `${f} must not be a receipt standing value`,
    );
  }
});

test('PRESERVATION_STATUS_VALUES: exactly AVAILABLE | ARCHIVED | PAYLOAD_REMOVED (doc19 §3.3)', () => {
  assert.deepEqual([...PRESERVATION_STATUS_VALUES], ['AVAILABLE', 'ARCHIVED', 'PAYLOAD_REMOVED']);
});

// ---------------------------------------------------------------------------
// §3.4 Review case — 5 states + 4 resolution outcomes
// ---------------------------------------------------------------------------

test('REVIEW_CASE_STATES: 5 canonical values (doc19 §3.4)', () => {
  const expected = ['DRAFT', 'SUBMITTED', 'RESPONSE_NEEDED', 'RESPONDED', 'RESOLVED', 'WITHDRAWN'];
  assert.deepEqual([...REVIEW_CASE_STATES].sort(), expected.sort());
});

test('REVIEW_RESOLUTION_OUTCOMES: exactly 4 values (doc19 §3.4)', () => {
  assert.deepEqual([...REVIEW_RESOLUTION_OUTCOMES], ['UPHELD', 'AMENDED', 'REJECTED_WITH_REASON', 'UNRESOLVED']);
});

// ---------------------------------------------------------------------------
// §4 Qualified profile types — every "profile" field must be qualified
// ---------------------------------------------------------------------------

test('DEPLOYMENT_PROFILE_VALUES: O/L approved, I/H blocked (doc19 §4)', () => {
  assert.deepEqual([...DEPLOYMENT_PROFILE_VALUES], ['O_OFFLINE_VERIFIER', 'L_LOCAL_AUTHOR', 'I_INSTITUTION_PRIVATE', 'H_HOSTED']);
  // v0: only O and L are enabled; I and H are declared but blocked.
  // The blocking is a policy decision, not an enum absence.
});

test('ASSURANCE_DIMENSIONS: exactly 6 independent dimensions (doc19 §4)', () => {
  const expected = [
    'provenance',
    'integrity',
    'identity',
    'processConformance',
    'executionReproduction',
    'scientificVerdict',
  ];
  assert.deepEqual([...ASSURANCE_DIMENSIONS], expected);
  // No dimension may collapse into a single "verified" badge.
  assert.equal(
    (ASSURANCE_DIMENSIONS as readonly string[]).includes('verified'),
    false,
    'no single "verified" badge dimension',
  );
});

// ---------------------------------------------------------------------------
// §5 Canonical operation IDs — semantic authority for CLI/API/Web
// ---------------------------------------------------------------------------

test('CANONICAL_OPERATION_IDS: non-empty, includes key operations from doc19 §5', () => {
  const mustInclude = [
    'system.capabilities',
    'project.create',
    'receipt.list',
    'draft.create',
    'draft.preflight',
    'draft.compile',
    'receipt.get',
    'receipt.verify',
    'receipt.replay',
    'receipt.supersede',
    'receipt.withdraw',
    'export.create',
    'task.get',
    'task.cancel',
    'task.retry',
    'review.create',
    'review.resolve',
    'system.doctor',
  ];
  const ops = [...CANONICAL_OPERATION_IDS] as readonly string[];
  for (const id of mustInclude) {
    assert.equal(ops.includes(id), true, `canonical operation ${id} must exist`);
  }
});

// ---------------------------------------------------------------------------
// §3.6 Legacy term aliases — accepted only in explicit legacy reader
// ---------------------------------------------------------------------------

test('LEGACY_TERM_ALIASES: maps legacy terms to canonical (doc19 §3.6)', () => {
  const aliases = LEGACY_TERM_ALIASES;
  // CANCELLING/CANCELLED → CANCEL_REQUESTED/CANCELED
  assert.equal(aliases['CANCELLED'], 'CANCELED');
  assert.equal(aliases['CANCELLING'], 'CANCEL_REQUESTED');
  // TIMED_OUT → EXPIRED (never a state itself)
  assert.equal(aliases['TIMED_OUT'], 'EXPIRED');
  // COMPILED/ISSUED/SEALED → receipt SEALED standing
  assert.equal(aliases['SEALED'], 'ACTIVE');
});

// ---------------------------------------------------------------------------
// Reason codes — V2 fail-closed vocabulary
// ---------------------------------------------------------------------------

test('V2_REASON_CODES: includes doc19 legal transition rejection codes', () => {
  const codes = [...V2_REASON_CODES];
  // doc19 §3.2: TASK_RETRY_NOT_ALLOWED
  assert.equal(codes.includes('TASK_RETRY_NOT_ALLOWED'), true);
  // doc19 §3.2: deadline reasons
  assert.equal(codes.includes('TASK_QUEUE_DEADLINE_EXCEEDED'), true);
  assert.equal(codes.includes('TASK_EXECUTION_DEADLINE_EXCEEDED'), true);
  // doc19 §3.1: legacy preflight subject incomplete
  assert.equal(codes.includes('LEGACY_PREFLIGHT_SUBJECT_INCOMPLETE'), true);
  // doc19 §3.3: legacy standing unknown
  assert.equal(codes.includes('LEGACY_STANDING_UNKNOWN'), true);
  // doc19 §6: viewer tamper warning
  assert.equal(codes.includes('UNVERIFIED_PRESENTATION'), true);
});
