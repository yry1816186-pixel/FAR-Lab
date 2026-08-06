/**
 * IMPL-028: Algorithm suite renewal state machine + long-term archival verification.
 *
 * This module provides:
 *   - Suite renewal transition guard (state machine)
 *   - Archival verification record builder (v0 simplified: date-bound)
 *   - Suite expiration check
 *
 * Authority: docs/far-lab-reboot/ — renewal lifecycle & archival verification.
 * 模型中立 · 零容忍合规: no any / @ts-ignore / dual assertions / empty catch.
 */

import { SIGNATURE_ALGORITHM_SUITES } from './algorithm_registry.ts';
import type { SignatureAlgorithmSuite } from './algorithm_registry.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Archival verification record. */
export interface ArchivalVerificationRecord {
  readonly receiptDigests: readonly string[];
  readonly suiteId: string;
  readonly verifiedAt: string;
  readonly allVerifiable: boolean;
  readonly unverifiableDigests: readonly string[];
}

// ---------------------------------------------------------------------------
// assertSuiteRenewalTransition
// ---------------------------------------------------------------------------

/**
 * Guard the algorithm suite renewal transition state machine.
 *
 * Rules:
 *   1. Same suite (fromSuiteId === toSuiteId) → throw IDENTICAL_SUITE
 *   2. Empty predecessor (fromSuiteId === '') → allowed (initialization)
 *   3. Predecessor's stopSignDate < renewalDate → allowed (graceful rotation)
 *   4. renewalDate <= predecessor stopSignDate → throw RENEWAL_BEFORE_STOP_SIGN
 *      (cannot renew while old suite is still the signing authority)
 */
export function assertSuiteRenewalTransition(
  fromSuiteId: string,
  toSuiteId: string,
  renewalDate: string,
): void {
  // Rule 1: identical suite → invalid transition.
  if (fromSuiteId === toSuiteId) {
    throw new Error(
      `IDENTICAL_SUITE: renewal transition from "${fromSuiteId}" to itself is invalid`,
    );
  }

  // Rule 2: empty predecessor → initialization (first suite, no transition check).
  if (fromSuiteId === '') {
    return;
  }

  // Rules 3–4: lookup predecessor suite and validate timing.
  const predecessor = SIGNATURE_ALGORITHM_SUITES.find(
    (s) => s.suiteId === fromSuiteId,
  );
  if (!predecessor) {
    throw new Error(
      `UNKNOWN_PREDECESSOR_SUITE: fromSuiteId "${fromSuiteId}" not found in registry`,
    );
  }

  if (renewalDate <= predecessor.renewalPolicy.stopSignDate) {
    throw new Error(
      `RENEWAL_BEFORE_STOP_SIGN: renewal date "${renewalDate}" must be after predecessor stopSignDate "${predecessor.renewalPolicy.stopSignDate}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// buildArchivalVerificationRecord
// ---------------------------------------------------------------------------

/**
 * Build an archival verification record for receipt digests.
 *
 * v0 simplified: if verifiedAt < stopVerifyDate → all digests verifiable.
 * Otherwise → all digests unverifiable. Future versions will per-digest
 * check against actual signature material availability.
 */
export function buildArchivalVerificationRecord(
  receiptDigests: readonly string[],
  suite: SignatureAlgorithmSuite,
  verifiedAt: string,
): ArchivalVerificationRecord {
  const expired = verifiedAt >= suite.renewalPolicy.stopVerifyDate;
  return {
    receiptDigests,
    suiteId: suite.suiteId,
    verifiedAt,
    allVerifiable: !expired,
    unverifiableDigests: expired ? [...receiptDigests] : [],
  };
}

// ---------------------------------------------------------------------------
// isSuiteExpired
// ---------------------------------------------------------------------------

/**
 * Check whether an algorithm suite is expired at a given date.
 * atDate >= stopVerifyDate → expired (true).
 */
export function isSuiteExpired(
  suite: SignatureAlgorithmSuite,
  atDate: string,
): boolean {
  return atDate >= suite.renewalPolicy.stopVerifyDate;
}
