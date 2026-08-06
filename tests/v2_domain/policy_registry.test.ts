// tests/v2_domain/policy_registry.test.ts
//
// IMPL-014 — policy/detector registry + affected-result index.
//
// Authority: doc19 §4 (verificationPolicy), WP-05 (executed policy/FEC binding).
// When a policy/detector defect is found, it must deterministically enumerate
// all affected receipts (no silent impact).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolicyRegistry,
  findAffectedReceipts,
  assertPolicyApplicable,
  type VersionedPolicy,
} from '../../src/v2_domain/policy_registry.ts';

// ---------------------------------------------------------------------------
// Policy registry
// ---------------------------------------------------------------------------

test('buildPolicyRegistry: produces registry with versioned policies + digest', () => {
  const policies: VersionedPolicy[] = [
    { policyId: 'far.policy.standard-v0', version: 1, digest: 'a'.repeat(64), requiredDimensions: ['provenance', 'integrity'], deprecated: false },
    { policyId: 'far.policy.full-v0', version: 1, digest: 'b'.repeat(64), requiredDimensions: ['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'], deprecated: false },
  ];
  const registry = buildPolicyRegistry(policies);
  assert.equal(registry.policies.length, 2);
  assert.ok(registry.registryDigest.length === 64);
});

test('buildPolicyRegistry: rejects duplicate policyId+version', () => {
  assert.throws(
    () => buildPolicyRegistry([
      { policyId: 'p', version: 1, digest: 'a'.repeat(64), requiredDimensions: ['provenance'], deprecated: false },
      { policyId: 'p', version: 1, digest: 'b'.repeat(64), requiredDimensions: ['integrity'], deprecated: false },
    ]),
    /POLICY_DUPLICATE/,
  );
});

test('buildPolicyRegistry: latest version lookup returns highest version', () => {
  const registry = buildPolicyRegistry([
    { policyId: 'p', version: 1, digest: 'a'.repeat(64), requiredDimensions: ['provenance'], deprecated: false },
    { policyId: 'p', version: 2, digest: 'b'.repeat(64), requiredDimensions: ['provenance', 'integrity'], deprecated: false },
  ]);
  // Lookup by ID returns latest non-deprecated version.
  const lookup = registry.resolveLatest('p');
  assert.ok(lookup);
  assert.equal(lookup.version, 2);
});

// ---------------------------------------------------------------------------
// assertPolicyApplicable — fail-closed
// ---------------------------------------------------------------------------

test('assertPolicyApplicable: passes when policy is registered and non-deprecated', () => {
  const registry = buildPolicyRegistry([
    { policyId: 'p', version: 1, digest: 'a'.repeat(64), requiredDimensions: ['provenance'], deprecated: false },
  ]);
  assert.doesNotThrow(() => assertPolicyApplicable(registry, 'p', 1));
});

test('assertPolicyApplicable: throws on deprecated policy', () => {
  const registry = buildPolicyRegistry([
    { policyId: 'p', version: 1, digest: 'a'.repeat(64), requiredDimensions: ['provenance'], deprecated: true },
  ]);
  assert.throws(
    () => assertPolicyApplicable(registry, 'p', 1),
    /POLICY_DEPRECATED/,
  );
});

test('assertPolicyApplicable: throws on unknown policy', () => {
  const registry = buildPolicyRegistry([]);
  assert.throws(
    () => assertPolicyApplicable(registry, 'nonexistent', 1),
    /POLICY_UNKNOWN/,
  );
});

// ---------------------------------------------------------------------------
// findAffectedReceipts — policy defect impact enumeration
// ---------------------------------------------------------------------------

test('findAffectedReceipts: returns all receipts bound to a defective policy', () => {
  const receiptBindings = [
    { receiptId: 'r-001', policyId: 'far.policy.standard-v0', version: 1 },
    { receiptId: 'r-002', policyId: 'far.policy.standard-v0', version: 1 },
    { receiptId: 'r-003', policyId: 'far.policy.full-v0', version: 1 },
  ];
  const affected = findAffectedReceipts(receiptBindings, 'far.policy.standard-v0', 1);
  assert.equal(affected.length, 2);
  assert.ok(affected.includes('r-001'));
  assert.ok(affected.includes('r-002'));
  assert.equal(affected.includes('r-003'), false);
});

test('findAffectedReceipts: empty result when no receipts match', () => {
  const affected = findAffectedReceipts([], 'p', 1);
  assert.equal(affected.length, 0);
});

test('findAffectedReceipts: version-specific (v1 defect does not affect v2 receipts)', () => {
  const receiptBindings = [
    { receiptId: 'r-001', policyId: 'p', version: 1 },
    { receiptId: 'r-002', policyId: 'p', version: 2 },
  ];
  const affected = findAffectedReceipts(receiptBindings, 'p', 1);
  assert.equal(affected.length, 1);
  assert.equal(affected[0], 'r-001');
});
