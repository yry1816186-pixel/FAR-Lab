// tests/v2_domain/receipt_verify_v2.test.ts
//
// Integration: V2 receipt verification — wires domain types into a demoable path.
// Shows the six independent assurance dimensions, not a single "verified" badge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runV2ReceiptVerification,
  formatV2VerificationForDisplay,
  V2_DEMO_SAMPLE,
} from '../../src/v2_domain/receipt_verify_v2.ts';

// ---------------------------------------------------------------------------
// runV2ReceiptVerification — end-to-end V2 verification on a sample receipt
// ---------------------------------------------------------------------------

test('runV2ReceiptVerification: returns all 6 assurance dimensions for sample receipt', () => {
  const result = runV2ReceiptVerification(V2_DEMO_SAMPLE);
  assert.equal(result.dimensions.provenance.outcome, 'PASS');
  assert.equal(result.dimensions.integrity.outcome, 'PASS');
  assert.equal(result.dimensions.identity.outcome, 'NOT_APPLICABLE'); // keyless v0
  assert.equal(result.dimensions.processConformance.outcome, 'PASS');
  assert.equal(result.dimensions.executionReproduction.outcome, 'NOT_APPLICABLE'); // no replay
  assert.equal(result.dimensions.scientificVerdict.outcome, 'WARN'); // fixture-only = honest warning
  assert.equal(result.reviewSummary, 'NONE');
  assert.equal(result.receiptStanding, 'ACTIVE');
});

test('runV2ReceiptVerification: tampered receipt → integrity FAIL', () => {
  const tampered = {
    ...V2_DEMO_SAMPLE,
    manifestMembers: V2_DEMO_SAMPLE.manifestMembers.map((m) =>
      m.kind === 'claim' ? { ...m, digest: 'X'.repeat(64) } : m,
    ),
  };
  const result = runV2ReceiptVerification(tampered);
  assert.equal(result.dimensions.integrity.outcome, 'FAIL');
  assert.ok(result.dimensions.integrity.reasonCodes.length > 0);
});

test('runV2ReceiptVerification: missing manifest member → fail-closed', () => {
  const incomplete = {
    ...V2_DEMO_SAMPLE,
    manifestMembers: V2_DEMO_SAMPLE.manifestMembers.filter((m) => m.kind !== 'antiTheaterReport'),
  };
  const result = runV2ReceiptVerification(incomplete);
  assert.equal(result.dimensions.integrity.outcome, 'FAIL');
  assert.ok(result.dimensions.integrity.reasonCodes.includes('MANDATORY_MEMBER_MISSING'));
});

// ---------------------------------------------------------------------------
// formatV2VerificationForDisplay — human-readable output for CLI/demo
// ---------------------------------------------------------------------------

test('formatV2VerificationForDisplay: renders six dimensions without collapsing to one badge', () => {
  const result = runV2ReceiptVerification(V2_DEMO_SAMPLE);
  const output = formatV2VerificationForDisplay(result);
  // Must show each dimension individually — no single "VERIFIED" collapse.
  assert.ok(output.includes('provenance'));
  assert.ok(output.includes('integrity'));
  assert.ok(output.includes('identity'));
  assert.ok(output.includes('processConformance'));
  assert.ok(output.includes('executionReproduction'));
  assert.ok(output.includes('scientificVerdict'));
  // Must NOT contain a single "VERIFIED" or "PASSED" badge.
  assert.equal(output.includes('VERIFIED'), false, 'must not collapse to single VERIFIED badge');
  // Must include the limitation notice (honest boundary).
  assert.ok(output.includes('fixture') || output.includes('synthetic') || output.includes('limitation'));
});
