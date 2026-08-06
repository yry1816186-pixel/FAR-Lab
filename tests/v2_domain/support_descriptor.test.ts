// tests/v2_domain/support_descriptor.test.ts
//
// IMPL-022/SPEC-010 — distribution support descriptor + offline review exchange.
//
// Authority: doc19 §7.4 (support descriptor), §7.4 (offline review exchange).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_FAULT_CLASSES,
  buildSupportDescriptor,
  verifySupportDescriptor,
  isSupportExpired,
  buildOfflineReviewExchange,
  importOfflineReviewExchange,
} from '../../src/v2_domain/support_descriptor.ts';

// ---------------------------------------------------------------------------
// §7.4 Support fault classes
// ---------------------------------------------------------------------------

test('SUPPORT_FAULT_CLASSES: includes 4 mandatory classes from doc19 §7.4', () => {
  const classes = [...SUPPORT_FAULT_CLASSES];
  const mustInclude = [
    'PRODUCT_FAULT',
    'SCIENTIFIC_METHOD_DISPUTE',
    'SECURITY_PRIVACY_INCIDENT',
    'REVIEW_APPEAL_CORRECTION',
  ];
  for (const c of mustInclude) {
    assert.equal(classes.includes(c as never), true, `support class ${c} must exist`);
  }
});

// ---------------------------------------------------------------------------
// buildSupportDescriptor
// ---------------------------------------------------------------------------

test('buildSupportDescriptor: produces descriptor with all 4 fault class entries', () => {
  const desc = buildSupportDescriptor({
    schemaVersion: 'far.support-descriptor.v1',
    candidateDigest: 'a'.repeat(64),
    protocolCompatibility: 'far.v0',
    lastVerifiedAt: '2026-08-05T00:00:00Z',
    expiryRule: { validUntil: '2027-08-05T00:00:00Z', revalidationPeriodDays: 365 },
    entries: SUPPORT_FAULT_CLASSES.map((faultClass) => ({
      faultClass,
      channelType: 'email',
      locator: `support@example/${faultClass}`,
      onlineRequired: false,
      identityStrength: 'none',
      availability: 'BEST_EFFORT',
      sla: 'NO_SLA',
      owner: 'maintainer@example',
      auditRetentionClass: 'STANDARD',
    })),
  });
  assert.equal(desc.entries.length, 4);
  assert.ok(desc.descriptorDigest.length === 64);
});

test('buildSupportDescriptor: throws if any mandatory fault class is missing', () => {
  assert.throws(
    () => buildSupportDescriptor({
      schemaVersion: 'far.support-descriptor.v1',
      candidateDigest: 'a'.repeat(64),
      protocolCompatibility: 'far.v0',
      lastVerifiedAt: '2026-08-05T00:00:00Z',
      expiryRule: { validUntil: '2027-08-05T00:00:00Z', revalidationPeriodDays: 365 },
      // Omit SECURITY_PRIVACY_INCIDENT
      entries: SUPPORT_FAULT_CLASSES
        .filter((f) => f !== 'SECURITY_PRIVACY_INCIDENT')
        .map((faultClass) => ({
          faultClass,
          channelType: 'email',
          locator: 'x',
          onlineRequired: false,
          identityStrength: 'none',
          availability: 'BEST_EFFORT',
          sla: 'NO_SLA',
          owner: 'o',
          auditRetentionClass: 'STANDARD',
        })),
    }),
    /SUPPORT_FAULT_CLASS_MISSING/,
  );
});

// ---------------------------------------------------------------------------
// verifySupportDescriptor + expiry
// ---------------------------------------------------------------------------

test('verifySupportDescriptor: valid descriptor passes', () => {
  const desc = buildSupportDescriptor({
    schemaVersion: 'far.support-descriptor.v1',
    candidateDigest: 'a'.repeat(64),
    protocolCompatibility: 'far.v0',
    lastVerifiedAt: '2026-08-05T00:00:00Z',
    expiryRule: { validUntil: '2027-08-05T00:00:00Z', revalidationPeriodDays: 365 },
    entries: SUPPORT_FAULT_CLASSES.map((faultClass) => ({
      faultClass,
      channelType: 'email',
      locator: 'x',
      onlineRequired: false,
      identityStrength: 'none',
      availability: 'BEST_EFFORT',
      sla: 'NO_SLA',
      owner: 'o',
      auditRetentionClass: 'STANDARD',
    })),
  });
  const result = verifySupportDescriptor(desc, '2026-08-05T00:00:00Z');
  assert.equal(result.isValid, true);
});

test('isSupportExpired: true past validUntil', () => {
  assert.equal(
    isSupportExpired(
      { validUntil: '2025-01-01T00:00:00Z', revalidationPeriodDays: 365 },
      '2026-08-05T00:00:00Z',
    ),
    true,
  );
});

test('isSupportExpired: false before validUntil', () => {
  assert.equal(
    isSupportExpired(
      { validUntil: '2027-08-05T00:00:00Z', revalidationPeriodDays: 365 },
      '2026-08-05T00:00:00Z',
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// §7.4 Offline review exchange — round-trip
// ---------------------------------------------------------------------------

test('buildOfflineReviewExchange + importOfflineReviewExchange: round-trip preserves review case', () => {
  const exchange = buildOfflineReviewExchange({
    receiptRoot: 'r'.repeat(64),
    reviewCaseId: 'rev-001',
    reviewCaseVersion: 1,
    eventIds: ['evt-1', 'evt-2'],
    actorAssertion: 'reviewer@example',
    targetedComponent: 'statisticalResults',
    requestedRemedy: 'request raw data',
    disclosureRoot: 'd'.repeat(64),
    schemaRange: 'far.v0',
    protocolRange: 'far.receipt.v2',
    createdAt: '2026-08-05T00:00:00Z',
    expiry: '2027-08-05T00:00:00Z',
  });
  assert.ok(exchange.exchangeDigest.length === 64);

  // Import on a separate installation.
  const importResult = importOfflineReviewExchange(exchange, {
    receiptRoot: 'r'.repeat(64),
    disclosureRoot: 'd'.repeat(64),
  });
  assert.equal(importResult.imported, true);
  assert.equal(importResult.reviewCaseId, 'rev-001');
});

test('importOfflineReviewExchange: rejects receipt-root mismatch', () => {
  const exchange = buildOfflineReviewExchange({
    receiptRoot: 'r'.repeat(64),
    reviewCaseId: 'rev-002',
    reviewCaseVersion: 1,
    eventIds: ['evt-1'],
    actorAssertion: 'reviewer',
    targetedComponent: 'claim',
    requestedRemedy: 'clarify',
    disclosureRoot: 'd'.repeat(64),
    schemaRange: 'far.v0',
    protocolRange: 'far.receipt.v2',
    createdAt: '2026-08-05T00:00:00Z',
    expiry: '2027-08-05T00:00:00Z',
  });
  const importResult = importOfflineReviewExchange(exchange, {
    receiptRoot: 'X'.repeat(64), // mismatch
    disclosureRoot: 'd'.repeat(64),
  });
  assert.equal(importResult.imported, false);
  assert.equal(importResult.reasonCode, 'RECEIPT_ROOT_MISMATCH');
});
