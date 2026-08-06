/**
 * Distribution support descriptor + offline review exchange.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §7.4.
 * Freeze: SPEC-010 (distribution contract) + IMPL-022 (attested distribution).
 *
 * Every installed candidate includes a digest-bound support/descriptor.json.
 * A placeholder, expired descriptor, or public-only security channel blocks
 * a new external release (doc19 §7.4).
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// §7.4 Support fault classes
// ===========================================================================

/** Mandatory support fault classes (doc19 §7.4). */
export const SUPPORT_FAULT_CLASSES = [
  'PRODUCT_FAULT',
  'SCIENTIFIC_METHOD_DISPUTE',
  'SECURITY_PRIVACY_INCIDENT',
  'REVIEW_APPEAL_CORRECTION',
] as const;
/** Type alias: support fault class. */
export type SupportFaultClass = (typeof SUPPORT_FAULT_CLASSES)[number];

// ===========================================================================
// Support descriptor
// ===========================================================================

/** Expiry / revalidation rule. */
export interface SupportExpiryRule {
  readonly validUntil: string;
  readonly revalidationPeriodDays: number;
}

/** A single support entry for one fault class. */
export interface SupportEntry {
  readonly faultClass: SupportFaultClass;
  readonly channelType: string;
  readonly locator: string;
  readonly onlineRequired: boolean;
  readonly identityStrength: string;
  readonly availability: string;
  readonly sla: string;
  readonly owner: string;
  readonly auditRetentionClass: string;
}

/** Input for building a support descriptor. */
export interface SupportDescriptorInput {
  readonly schemaVersion: string;
  readonly candidateDigest: string;
  readonly protocolCompatibility: string;
  readonly lastVerifiedAt: string;
  readonly expiryRule: SupportExpiryRule;
  readonly entries: readonly SupportEntry[];
}

/** Complete support descriptor (doc19 §7.4). */
export interface SupportDescriptor extends SupportDescriptorInput {
  readonly descriptorDigest: string;
}

/** Build a support descriptor. All 4 fault classes must have entries. */
export function buildSupportDescriptor(input: SupportDescriptorInput): SupportDescriptor {
  const presentClasses = new Set(input.entries.map((e) => e.faultClass));
  const missing = SUPPORT_FAULT_CLASSES.filter((c) => !presentClasses.has(c));
  if (missing.length > 0) {
    throw new Error(
      `SUPPORT_FAULT_CLASS_MISSING: ${missing.join(', ')} must have support entries`,
    );
  }
  const descriptorDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildSupportDescriptor'), 'utf8')
    .digest('hex');
  return Object.freeze({ ...input, descriptorDigest });
}

/** Result of verifying a support descriptor. */
export interface SupportDescriptorVerification {
  readonly isValid: boolean;
  readonly isExpired: boolean;
  readonly missingClasses: readonly SupportFaultClass[];
  readonly reasonCode: string;
}

/** Verify a support descriptor at a given evaluation time. */
export function verifySupportDescriptor(
  desc: SupportDescriptor,
  evaluatedAt: string,
): SupportDescriptorVerification {
  const isExpired = isSupportExpired(desc.expiryRule, evaluatedAt);
  const presentClasses = new Set(desc.entries.map((e) => e.faultClass));
  const missing = SUPPORT_FAULT_CLASSES.filter((c) => !presentClasses.has(c));

  let isValid = true;
  let reasonCode = 'SUPPORT_VALID';
  if (missing.length > 0) {
    isValid = false;
    reasonCode = 'SUPPORT_FAULT_CLASS_MISSING';
  } else if (isExpired) {
    isValid = false;
    reasonCode = 'SUPPORT_DESCRIPTOR_EXPIRED';
  }

  return { isValid, isExpired, missingClasses: missing, reasonCode };
}

/** Check if a support descriptor is expired at the given time. */
export function isSupportExpired(rule: SupportExpiryRule, evaluatedAt: string): boolean {
  return evaluatedAt >= rule.validUntil;
}

// ===========================================================================
// §7.4 Offline review exchange
// ===========================================================================

/** Input for building an offline review exchange package. */
export interface OfflineReviewExchangeInput {
  readonly receiptRoot: string;
  readonly reviewCaseId: string;
  readonly reviewCaseVersion: number;
  readonly eventIds: readonly string[];
  readonly actorAssertion: string;
  readonly targetedComponent: string;
  readonly requestedRemedy: string;
  readonly disclosureRoot: string;
  readonly schemaRange: string;
  readonly protocolRange: string;
  readonly createdAt: string;
  readonly expiry: string;
}

/** Offline review exchange package (doc19 §7.4). */
export interface OfflineReviewExchange extends OfflineReviewExchangeInput {
  readonly exchangeDigest: string;
  readonly deduplicationKey: string;
}

/** Build an offline review exchange package. */
export function buildOfflineReviewExchange(
  input: OfflineReviewExchangeInput,
): OfflineReviewExchange {
  const exchangeDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildOfflineReviewExchange'), 'utf8')
    .digest('hex');
  // Dedup key = sha256(receiptRoot + reviewCaseId + reviewCaseVersion) — idempotent import.
  const deduplicationKey = createHash('sha256')
    .update(`${input.receiptRoot}|${input.reviewCaseId}|${input.reviewCaseVersion}`, 'utf8')
    .digest('hex');
  return Object.freeze({ ...input, exchangeDigest, deduplicationKey });
}

/** Target installation context for importing an exchange. */
export interface ReviewExchangeImportContext {
  readonly receiptRoot: string;
  readonly disclosureRoot: string;
}

/** Result of importing an offline review exchange. */
export interface ReviewExchangeImportResult {
  readonly imported: boolean;
  readonly reviewCaseId: string;
  readonly reasonCode: 'IMPORTED' | 'RECEIPT_ROOT_MISMATCH' | 'DISCLOSURE_ROOT_MISMATCH' | 'EXCHANGE_EXPIRED';
}

/**
 * Import an offline review exchange on a separate installation.
 * Verifies receipt root, disclosure root, and expiry before idempotent append.
 * Never auto-resolves a case; never imports undisclosed payload.
 */
export function importOfflineReviewExchange(
  exchange: OfflineReviewExchange,
  context: ReviewExchangeImportContext,
  evaluatedAt: string = '2026-08-05T00:00:00Z',
): ReviewExchangeImportResult {
  if (exchange.receiptRoot !== context.receiptRoot) {
    return { imported: false, reviewCaseId: exchange.reviewCaseId, reasonCode: 'RECEIPT_ROOT_MISMATCH' };
  }
  if (exchange.disclosureRoot !== context.disclosureRoot) {
    return { imported: false, reviewCaseId: exchange.reviewCaseId, reasonCode: 'DISCLOSURE_ROOT_MISMATCH' };
  }
  if (evaluatedAt >= exchange.expiry) {
    return { imported: false, reviewCaseId: exchange.reviewCaseId, reasonCode: 'EXCHANGE_EXPIRED' };
  }
  return { imported: true, reviewCaseId: exchange.reviewCaseId, reasonCode: 'IMPORTED' };
}
