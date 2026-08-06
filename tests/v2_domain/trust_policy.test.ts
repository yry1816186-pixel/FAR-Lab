// tests/v2_domain/trust_policy.test.ts
//
// IMPL-010: signer identity, trust-time evaluation, renewal context.
// TDD RED phase — trust_policy.ts does NOT exist yet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_ALGORITHM_SUITES } from '../../src/v2_domain/algorithm_registry.ts';
import type { SignatureAlgorithmSuite } from '../../src/v2_domain/algorithm_registry.ts';
import {
  evaluateTrustTimeContext,
  evaluateSignatureSubject,
} from '../../src/v2_domain/trust_policy.ts';

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
// evaluateTrustTimeContext — historical context
// ---------------------------------------------------------------------------

test('evaluateTrustTimeContext: historical — signedAt before stopSignDate → valid', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2029-06-02T00:00:00Z',
    suite(),
    'historical',
  );
  assert.equal(result.contextKind, 'historical');
  assert.equal(result.isValid, true);
  assert.equal(result.reasonCode, undefined);
});

test('evaluateTrustTimeContext: historical — signedAt >= stopSignDate → invalid, SUITE_STOP_SIGN_EXCEEDED', () => {
  const result = evaluateTrustTimeContext(
    '2030-01-01T00:00:00Z', // exactly stopSignDate
    '2030-01-02T00:00:00Z',
    suite(),
    'historical',
  );
  assert.equal(result.contextKind, 'historical');
  assert.equal(result.isValid, false);
  assert.equal(result.reasonCode, 'SUITE_STOP_SIGN_EXCEEDED');
});

test('evaluateTrustTimeContext: historical — signedAt after stopSignDate → invalid', () => {
  const result = evaluateTrustTimeContext(
    '2031-06-01T00:00:00Z',
    '2031-06-02T00:00:00Z',
    suite(),
    'historical',
  );
  assert.equal(result.isValid, false);
  assert.equal(result.reasonCode, 'SUITE_STOP_SIGN_EXCEEDED');
});

// ---------------------------------------------------------------------------
// evaluateTrustTimeContext — current context
// ---------------------------------------------------------------------------

test('evaluateTrustTimeContext: current — evaluatedAt before stopVerifyDate → valid', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2034-06-01T00:00:00Z',
    suite(),
    'current',
  );
  assert.equal(result.contextKind, 'current');
  assert.equal(result.isValid, true);
  assert.equal(result.reasonCode, undefined);
});

test('evaluateTrustTimeContext: current — evaluatedAt >= stopVerifyDate → invalid, SUITE_STOP_VERIFY_EXCEEDED', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2035-01-01T00:00:00Z', // exactly stopVerifyDate
    suite(),
    'current',
  );
  assert.equal(result.contextKind, 'current');
  assert.equal(result.isValid, false);
  assert.equal(result.reasonCode, 'SUITE_STOP_VERIFY_EXCEEDED');
});

test('evaluateTrustTimeContext: current — evaluatedAt after stopVerifyDate → invalid', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2036-01-01T00:00:00Z',
    suite(),
    'current',
  );
  assert.equal(result.isValid, false);
  assert.equal(result.reasonCode, 'SUITE_STOP_VERIFY_EXCEEDED');
});

// ---------------------------------------------------------------------------
// evaluateTrustTimeContext — renewal context (v0 simplified)
// ---------------------------------------------------------------------------

test('evaluateTrustTimeContext: renewal — evaluatedAt before stopVerifyDate → valid', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2034-06-01T00:00:00Z',
    suite(),
    'renewal',
  );
  assert.equal(result.contextKind, 'renewal');
  assert.equal(result.isValid, true);
  assert.equal(result.reasonCode, undefined);
});

test('evaluateTrustTimeContext: renewal — evaluatedAt >= stopVerifyDate → invalid', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2035-01-01T00:00:00Z',
    suite(),
    'renewal',
  );
  assert.equal(result.isValid, false);
  assert.equal(result.reasonCode, 'SUITE_STOP_VERIFY_EXCEEDED');
});

// ---------------------------------------------------------------------------
// evaluateTrustTimeContext — revocationFreshnessMet field present
// ---------------------------------------------------------------------------

test('evaluateTrustTimeContext: returns revocationFreshnessMet boolean', () => {
  const result = evaluateTrustTimeContext(
    '2029-06-01T00:00:00Z',
    '2034-06-01T00:00:00Z',
    suite(),
    'historical',
  );
  assert.equal(typeof result.revocationFreshnessMet, 'boolean');
});

// ---------------------------------------------------------------------------
// evaluateSignatureSubject — authorized signer
// ---------------------------------------------------------------------------

test('evaluateSignatureSubject: authorized signer → isAuthorized true', () => {
  const result = evaluateSignatureSubject(
    'alice',
    ['alice', 'bob'],
    '2029-06-01T00:00:00Z',
  );
  assert.equal(result.isAuthorized, true);
  assert.equal(result.signerId, 'alice');
  assert.equal(result.evaluatedAt, '2029-06-01T00:00:00Z');
});

test('evaluateSignatureSubject: unauthorized signer → isAuthorized false', () => {
  const result = evaluateSignatureSubject(
    'eve',
    ['alice', 'bob'],
    '2029-06-01T00:00:00Z',
  );
  assert.equal(result.isAuthorized, false);
  assert.equal(result.signerId, 'eve');
});

test('evaluateSignatureSubject: empty authorizedSigners → fail-closed, isAuthorized false', () => {
  const result = evaluateSignatureSubject(
    'alice',
    [],
    '2029-06-01T00:00:00Z',
  );
  assert.equal(result.isAuthorized, false);
});
