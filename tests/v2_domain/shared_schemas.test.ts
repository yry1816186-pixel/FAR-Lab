// tests/v2_domain/shared_schemas.test.ts
//
// IMPL-005 — shared state/reason/error/event schemas + verification result builder.
//
// Authority: doc19 §4 (6 independent dimensions), §5 (machine envelope).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSURANCE_DIMENSIONS,
} from '../../src/v2_domain/contract_enums.ts';
import {
  buildVerificationResult,
  isReviewContested,
  DEFAULT_DIMENSION_NOT_APPLICABLE,
  type AssuranceDimensionResult,
} from '../../src/v2_domain/shared_schemas.ts';

// ---------------------------------------------------------------------------
// §4 buildVerificationResult — always 6 dimensions, never collapsed
// ---------------------------------------------------------------------------

test('buildVerificationResult: always includes all 6 assurance dimensions', () => {
  const result = buildVerificationResult({
    resultId: 'vr-001',
    receiptId: 'r-001',
    verificationPolicyId: 'far.policy.standard-v0.v1',
    evaluatedAt: '2026-08-05T00:00:00Z',
    dimensionResults: {
      provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      identity: { dimension: 'identity', outcome: 'SKIP', reasonCodes: [], detail: 'keyless v0' },
      processConformance: { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      executionReproduction: { dimension: 'executionReproduction', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'no replay requested' },
      scientificVerdict: { dimension: 'scientificVerdict', outcome: 'WARN', reasonCodes: ['VERIFICATION_POLICY_REQUIRED_DIMENSION_MISSING'], detail: 'fixture only' },
    },
    receiptStanding: 'ACTIVE',
    preservationStatus: 'AVAILABLE',
  });

  // All 6 dimensions MUST be present — no collapse.
  for (const dim of ASSURANCE_DIMENSIONS) {
    assert.ok(result.dimensions[dim], `dimension ${dim} must be present`);
  }
  assert.equal(result.resultVersion, 1);
  assert.equal(result.reviewSummary, 'NONE');
});

test('buildVerificationResult: throws if any of the 6 dimensions is missing (fail-closed)', () => {
  assert.throws(
    () => buildVerificationResult({
      resultId: 'vr-002',
      receiptId: 'r-002',
      verificationPolicyId: 'far.policy.standard-v0.v1',
      evaluatedAt: '2026-08-05T00:00:00Z',
      // Omit 'scientificVerdict'
      dimensionResults: {
        provenance: DEFAULT_DIMENSION_NOT_APPLICABLE('provenance'),
        integrity: DEFAULT_DIMENSION_NOT_APPLICABLE('integrity'),
        identity: DEFAULT_DIMENSION_NOT_APPLICABLE('identity'),
        processConformance: DEFAULT_DIMENSION_NOT_APPLICABLE('processConformance'),
        executionReproduction: DEFAULT_DIMENSION_NOT_APPLICABLE('executionReproduction'),
      } as Partial<Record<string, AssuranceDimensionResult>>,
      receiptStanding: 'ACTIVE',
      preservationStatus: 'AVAILABLE',
    }),
    /MISSING_ASSURANCE_DIMENSION/,
  );
});

test('DEFAULT_DIMENSION_NOT_APPLICABLE: produces NOT_APPLICABLE placeholder', () => {
  const d = DEFAULT_DIMENSION_NOT_APPLICABLE('identity');
  assert.equal(d.outcome, 'NOT_APPLICABLE');
  assert.equal(d.reasonCodes.length, 0);
});

// ---------------------------------------------------------------------------
// §3.4 isReviewContested
// ---------------------------------------------------------------------------

test('isReviewContested: true when at least one unresolved challenge exists', () => {
  assert.equal(isReviewContested([{ state: 'RESPONSE_NEEDED' }, { state: 'RESOLVED' }]), true);
});

test('isReviewContested: false when all resolved', () => {
  assert.equal(isReviewContested([{ state: 'RESOLVED' }, { state: 'RESOLVED' }]), false);
});

test('isReviewContested: false for empty review set', () => {
  assert.equal(isReviewContested([]), false);
});
