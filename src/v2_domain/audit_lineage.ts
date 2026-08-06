/**
 * Audit lineage: correction/supersession/withdrawal + retention/legal-hold.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.3,
 *   WP-06 (procedural lifecycle and privacy rights).
 * Freeze: IMPL-015/016.
 *
 * Invariant (doc19 §3.3): human concern NEVER mutates a receipt. Correction creates
 * a NEW linked receipt. Withdrawal discourages reliance but cannot erase copies.
 * Legal-hold blocks PAYLOAD_REMOVED/PURGE but not ARCHIVE (bytes preserved).
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// §3.3 Supersession record
// ===========================================================================

/** Supersession record (doc19 §3.3). One immutable successor link required. */
export interface SupersessionRecord {
  readonly recordKind: 'SUPERSESSION';
  readonly supersededReceiptId: string;
  readonly successorReceiptId: string;
  readonly authority: string;
  readonly reason: string;
  readonly supersededAt: string;
  readonly lineageDigest: string;
}

/** Input for building a supersession. */
export interface SupersessionInput {
  readonly supersededReceiptId: string;
  readonly successorReceiptId: string;
  readonly authority: string;
  readonly reason: string;
  readonly supersededAt: string;
}

/**
 * Build a supersession record. The old receipt remains byte-addressable;
 * only its standing changes to SUPERSEDED.
 * @throws SUPERSESSION_SELF_LINK if successor === superseded.
 */
export function buildSupersession(input: SupersessionInput): SupersessionRecord {
  if (input.supersededReceiptId === input.successorReceiptId) {
    throw new Error(
      'SUPERSESSION_SELF_LINK: successor receipt must differ from superseded receipt',
    );
  }
  const lineageDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildSupersession'), 'utf8')
    .digest('hex');
  return Object.freeze({
    recordKind: 'SUPERSESSION' as const,
    ...input,
    lineageDigest,
  });
}

// ===========================================================================
// §3.3 Withdrawal record
// ===========================================================================

/** Withdrawal record (doc19 §3.3). Requires attributed authority + reason. */
export interface WithdrawalRecord {
  readonly recordKind: 'WITHDRAWAL';
  readonly receiptId: string;
  readonly authority: string;
  readonly reason: string;
  readonly withdrawnAt: string;
  readonly lineageDigest: string;
}

/** Input for building a withdrawal. */
export interface WithdrawalInput {
  readonly receiptId: string;
  readonly authority: string;
  readonly reason: string;
  readonly withdrawnAt: string;
}

/** Build a withdrawal record. Withdrawal discourages reliance but cannot erase copies. */
export function buildWithdrawal(input: WithdrawalInput): WithdrawalRecord {
  if (input.authority.length === 0) {
    throw new Error('WITHDRAW_REQUIRES_AUTHORITY: authority must be attributed');
  }
  const lineageDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildWithdrawal'), 'utf8')
    .digest('hex');
  return Object.freeze({
    recordKind: 'WITHDRAWAL' as const,
    ...input,
    lineageDigest,
  });
}

// ===========================================================================
// Retention / legal-hold
// ===========================================================================

/** Retention action types. */
export const RETENTION_ACTIONS = [
  'LEGAL_HOLD',
  'RELEASE_LEGAL_HOLD',
  'ARCHIVE',
  'RESTORE_FROM_ARCHIVE',
  'PAYLOAD_REMOVED',
  'PURGE',
] as const;
/** Type alias: retention action. */
export type RetentionAction = (typeof RETENTION_ACTIONS)[number];

/** Actions that remove payload bytes (blocked by legal-hold). */
const DESTRUCTIVE_ACTIONS: ReadonlySet<string> = new Set(['PAYLOAD_REMOVED', 'PURGE']);

/** Retention action record (doc19 §3.3, WP-06). */
export interface RetentionActionRecord {
  readonly recordKind: 'RETENTION';
  readonly receiptId: string;
  readonly action: RetentionAction;
  readonly authority: string;
  readonly reason: string;
  readonly actedAt: string;
  readonly lineageDigest: string;
}

/** Input for building a retention record. */
export interface RetentionActionInput {
  readonly receiptId: string;
  readonly action: RetentionAction;
  readonly authority: string;
  readonly reason: string;
  readonly actedAt: string;
}

/** Build a retention action record. */
export function buildRetentionAction(input: RetentionActionInput): RetentionActionRecord {
  const lineageDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildRetentionAction'), 'utf8')
    .digest('hex');
  return Object.freeze({
    recordKind: 'RETENTION' as const,
    ...input,
    lineageDigest,
  });
}

/**
 * Determine if a legal-hold is currently active for a receipt.
 * A legal-hold is active if the most recent LEGAL_HOLD/RELEASE_LEGAL_HOLD action
 * for that receipt is LEGAL_HOLD.
 */
export function isLegalHoldActive(
  records: readonly RetentionActionRecord[],
  receiptId: string,
): boolean {
  // Filter to this receipt's hold/release records, sorted by actedAt (chronological).
  const holdRecords = records
    .filter((r) => r.receiptId === receiptId)
    .filter((r) => r.action === 'LEGAL_HOLD' || r.action === 'RELEASE_LEGAL_HOLD')
    .sort((a, b) => a.actedAt.localeCompare(b.actedAt));

  if (holdRecords.length === 0) {
    return false;
  }
  // The last record determines active state.
  const last = holdRecords[holdRecords.length - 1];
  return last?.action === 'LEGAL_HOLD';
}

/**
 * Assert that a proposed action does not violate an active legal-hold.
 * Legal-hold blocks PAYLOAD_REMOVED and PURGE (destructive actions).
 * ARCHIVE is allowed (preserves bytes).
 * @throws LEGAL_HOLD_BLOCKS_DELETION if a destructive action is attempted under hold.
 */
export function assertLegalHoldNotViolated(
  receiptId: string,
  proposedAction: RetentionAction,
  records: readonly RetentionActionRecord[],
): void {
  if (!DESTRUCTIVE_ACTIONS.has(proposedAction)) {
    return; // Non-destructive actions always allowed.
  }
  if (isLegalHoldActive(records, receiptId)) {
    throw new Error(
      `LEGAL_HOLD_BLOCKS_DELETION: receipt ${receiptId} has an active legal-hold; action ${proposedAction} is blocked`,
    );
  }
}
