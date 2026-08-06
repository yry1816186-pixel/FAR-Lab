// tests/v2_domain/audit_lineage.test.ts
//
// IMPL-015/016 — correction/supersession/withdrawal audit lineage + retention/legal-hold.
//
// Authority: doc19 §3.3 (receipt standing), §3.4 (review), WP-06 (lifecycle).
//
// Invariant: human concern NEVER mutates a receipt. Correction creates a NEW linked receipt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSupersession,
  buildWithdrawal,
  buildRetentionAction,
  assertLegalHoldNotViolated,
  isLegalHoldActive,
} from '../../src/v2_domain/audit_lineage.ts';

// ---------------------------------------------------------------------------
// §3.3 Supersession — creates successor link, old receipt immutable
// ---------------------------------------------------------------------------

test('buildSupersession: creates linked record with successor + authority', () => {
  const record = buildSupersession({
    supersededReceiptId: 'r-001',
    successorReceiptId: 'r-002',
    authority: 'author@example',
    reason: 'methodology correction: fixed seed binding',
    supersededAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(record.supersededReceiptId, 'r-001');
  assert.equal(record.successorReceiptId, 'r-002');
  assert.equal(record.authority, 'author@example');
  assert.ok(record.lineageDigest.length === 64);
});

test('buildSupersession: throws if successor === superseded (self-link forbidden)', () => {
  assert.throws(
    () => buildSupersession({
      supersededReceiptId: 'r-001',
      successorReceiptId: 'r-001',
      authority: 'a',
      reason: 'x',
      supersededAt: '2026-08-05T00:00:00Z',
    }),
    /SUPERSESSION_SELF_LINK/,
  );
});

test('buildSupersession: digest is deterministic', () => {
  const input = {
    supersededReceiptId: 'r-001',
    successorReceiptId: 'r-002',
    authority: 'a',
    reason: 'x',
    supersededAt: '2026-08-05T00:00:00Z',
  };
  assert.equal(buildSupersession(input).lineageDigest, buildSupersession(input).lineageDigest);
});

// ---------------------------------------------------------------------------
// §3.3 Withdrawal — requires authority, old receipt still byte-addressable
// ---------------------------------------------------------------------------

test('buildWithdrawal: creates withdrawal record with authority + reason', () => {
  const record = buildWithdrawal({
    receiptId: 'r-003',
    authority: 'governance-council',
    reason: 'independent verification found critical defect',
    withdrawnAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(record.receiptId, 'r-003');
  assert.equal(record.authority, 'governance-council');
  assert.ok(record.lineageDigest.length === 64);
});

// ---------------------------------------------------------------------------
// Retention / legal-hold — legal-hold blocks deletion
// ---------------------------------------------------------------------------

test('buildRetentionAction: creates retention record with action type', () => {
  const record = buildRetentionAction({
    receiptId: 'r-004',
    action: 'LEGAL_HOLD',
    authority: 'legal@example',
    reason: 'pending investigation',
    actedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(record.action, 'LEGAL_HOLD');
  assert.equal(isLegalHoldActive([record], 'r-004'), true);
});

test('isLegalHoldActive: false when no legal-hold record exists', () => {
  assert.equal(isLegalHoldActive([], 'r-004'), false);
});

test('isLegalHoldActive: false when legal-hold was released', () => {
  const hold = buildRetentionAction({
    receiptId: 'r-004',
    action: 'LEGAL_HOLD',
    authority: 'legal',
    reason: 'pending',
    actedAt: '2026-08-05T00:00:00Z',
  });
  const release = buildRetentionAction({
    receiptId: 'r-004',
    action: 'RELEASE_LEGAL_HOLD',
    authority: 'legal',
    reason: 'investigation closed',
    actedAt: '2026-08-05T01:00:00Z',
  });
  // Release after hold → legal hold no longer active.
  assert.equal(isLegalHoldActive([hold, release], 'r-004'), false);
});

test('assertLegalHoldNotViolated: throws on PURGE when legal-hold active', () => {
  const hold = buildRetentionAction({
    receiptId: 'r-005',
    action: 'LEGAL_HOLD',
    authority: 'legal',
    reason: 'pending',
    actedAt: '2026-08-05T00:00:00Z',
  });
  assert.throws(
    () => assertLegalHoldNotViolated('r-005', 'PURGE', [hold]),
    /LEGAL_HOLD_BLOCKS_DELETION/,
  );
});

test('assertLegalHoldNotViolated: does not throw on ARCHIVE when legal-hold active', () => {
  const hold = buildRetentionAction({
    receiptId: 'r-006',
    action: 'LEGAL_HOLD',
    authority: 'legal',
    reason: 'pending',
    actedAt: '2026-08-05T00:00:00Z',
  });
  // ARCHIVE preserves bytes; legal-hold only blocks PAYLOAD_REMOVED/PURGE.
  assert.doesNotThrow(() => assertLegalHoldNotViolated('r-006', 'ARCHIVE', [hold]));
});

test('assertLegalHoldNotViolated: throws on PAYLOAD_REMOVED when legal-hold active', () => {
  const hold = buildRetentionAction({
    receiptId: 'r-007',
    action: 'LEGAL_HOLD',
    authority: 'legal',
    reason: 'pending',
    actedAt: '2026-08-05T00:00:00Z',
  });
  assert.throws(
    () => assertLegalHoldNotViolated('r-007', 'PAYLOAD_REMOVED', [hold]),
    /LEGAL_HOLD_BLOCKS_DELETION/,
  );
});
