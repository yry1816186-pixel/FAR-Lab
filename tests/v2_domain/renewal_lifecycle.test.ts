// tests/v2_domain/renewal_lifecycle.test.ts
//
// IMPL-028: algorithm suite renewal state machine + archival verification.
// TDD RED phase — renewal_lifecycle.ts does NOT exist yet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_ALGORITHM_SUITES } from '../../src/v2_domain/algorithm_registry.ts';
import type { SignatureAlgorithmSuite } from '../../src/v2_domain/algorithm_registry.ts';
import {
  assertSuiteRenewalTransition,
  buildArchivalVerificationRecord,
  isSuiteExpired,
} from '../../src/v2_domain/renewal_lifecycle.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The only frozen suite in v0. */
function suite(): SignatureAlgorithmSuite {
  const s = SIGNATURE_ALGORITHM_SUITES[0];
  assert.ok(s, 'SIGNATURE_ALGORITHM_SUITES must have at least one entry');
  return s;
}

// ---------------------------------------------------------------------------
// assertSuiteRenewalTransition — state machine
// ---------------------------------------------------------------------------

test('assertSuiteRenewalTransition: same suite → throws', () => {
  assert.throws(
    () => assertSuiteRenewalTransition('far.sig.ed25519-sha256.v1', 'far.sig.ed25519-sha256.v1', '2030-06-01T00:00:00Z'),
    { message: /IDENTICAL_SUITE/ },
  );
});

test('assertSuiteRenewalTransition: empty predecessor (initialization) → no throw', () => {
  // fromSuiteId = '' signals initialization; should not throw.
  assert.doesNotThrow(() => {
    assertSuiteRenewalTransition('', 'far.sig.ed25519-sha256.v1', '2029-06-01T00:00:00Z');
  });
});

test('assertSuiteRenewalTransition: predecessor stopSignDate < renewalDate → no throw', () => {
  // stopSignDate = 2030-01-01; renewalDate = 2030-06-01 (after stopSign)
  assert.doesNotThrow(() => {
    assertSuiteRenewalTransition(
      'far.sig.ed25519-sha256.v1',
      'far.sig.ed25519-postquantum.v1',
      '2030-06-01T00:00:00Z',
    );
  });
});

test('assertSuiteRenewalTransition: renewalDate <= stopSignDate → throws RENEWAL_BEFORE_STOP_SIGN', () => {
  // stopSignDate = 2030-01-01; renewalDate = 2029-12-01 (before stopSign)
  assert.throws(
    () => assertSuiteRenewalTransition(
      'far.sig.ed25519-sha256.v1',
      'far.sig.ed25519-postquantum.v1',
      '2029-12-01T00:00:00Z',
    ),
    { message: /RENEWAL_BEFORE_STOP_SIGN/ },
  );
});

test('assertSuiteRenewalTransition: renewalDate exactly stopSignDate → throws RENEWAL_BEFORE_STOP_SIGN', () => {
  // stopSignDate = 2030-01-01T00:00:00Z; renewalDate = exactly that
  assert.throws(
    () => assertSuiteRenewalTransition(
      'far.sig.ed25519-sha256.v1',
      'far.sig.ed25519-postquantum.v1',
      '2030-01-01T00:00:00Z',
    ),
    { message: /RENEWAL_BEFORE_STOP_SIGN/ },
  );
});

// ---------------------------------------------------------------------------
// buildArchivalVerificationRecord — archival verification
// ---------------------------------------------------------------------------

test('buildArchivalVerificationRecord: verifiedAt before stopVerifyDate → allVerifiable true', () => {
  const record = buildArchivalVerificationRecord(
    ['digest-a', 'digest-b'],
    suite(),
    '2034-06-01T00:00:00Z',
  );
  assert.equal(record.suiteId, 'far.sig.ed25519-sha256.v1');
  assert.equal(record.verifiedAt, '2034-06-01T00:00:00Z');
  assert.equal(record.allVerifiable, true);
  assert.deepEqual(record.receiptDigests, ['digest-a', 'digest-b']);
  assert.deepEqual(record.unverifiableDigests, []);
});

test('buildArchivalVerificationRecord: verifiedAt >= stopVerifyDate → allVerifiable false, all digests unverifiable', () => {
  const record = buildArchivalVerificationRecord(
    ['digest-a'],
    suite(),
    '2035-01-01T00:00:00Z',
  );
  assert.equal(record.allVerifiable, false);
  assert.deepEqual(record.unverifiableDigests, ['digest-a']);
});

test('buildArchivalVerificationRecord: empty digests → allVerifiable true (vacuous)', () => {
  const record = buildArchivalVerificationRecord(
    [],
    suite(),
    '2034-06-01T00:00:00Z',
  );
  assert.equal(record.allVerifiable, true);
  assert.deepEqual(record.receiptDigests, []);
  assert.deepEqual(record.unverifiableDigests, []);
});

// ---------------------------------------------------------------------------
// isSuiteExpired — simple date check
// ---------------------------------------------------------------------------

test('isSuiteExpired: atDate < stopVerifyDate → false', () => {
  assert.equal(isSuiteExpired(suite(), '2034-06-01T00:00:00Z'), false);
});

test('isSuiteExpired: atDate >= stopVerifyDate → true', () => {
  assert.equal(isSuiteExpired(suite(), '2035-01-01T00:00:00Z'), true);
});

test('isSuiteExpired: atDate well past stopVerifyDate → true', () => {
  assert.equal(isSuiteExpired(suite(), '2040-01-01T00:00:00Z'), true);
});
