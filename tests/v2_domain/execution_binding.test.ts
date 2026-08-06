// tests/v2_domain/execution_binding.test.ts
//
// IMPL-008 — source/data/code/env/policy/plan/deviation identity binding.
//
// Authority: doc19 §3.1 (ContractBindingSet), WP-05 (executed policy/FEC binding).
// Empty/placeholder hashes and missing plan/deviation data must fail closed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionBinding,
  verifyExecutionBinding,
  assertNoPlaceholderBindings,
  buildDeviationLedger,
} from '../../src/v2_domain/execution_binding.ts';

// ---------------------------------------------------------------------------
// buildExecutionBinding
// ---------------------------------------------------------------------------

test('buildExecutionBinding: binds source/data/code/env/policy identities with digest', () => {
  const binding = buildExecutionBinding({
    sourceHash: 'a'.repeat(64),
    dataHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    environmentHash: 'd'.repeat(64),
    policyId: 'far.policy.standard-v0',
    policyVersion: 1,
    planHash: 'e'.repeat(64),
  });
  assert.ok(binding.bindingDigest.length === 64);
  assert.equal(binding.policyId, 'far.policy.standard-v0');
});

test('buildExecutionBinding: digest is deterministic', () => {
  const input = {
    sourceHash: 'a'.repeat(64),
    dataHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    environmentHash: 'd'.repeat(64),
    policyId: 'p',
    policyVersion: 1,
    planHash: 'e'.repeat(64),
  };
  assert.equal(
    buildExecutionBinding(input).bindingDigest,
    buildExecutionBinding(input).bindingDigest,
  );
});

// ---------------------------------------------------------------------------
// assertNoPlaceholderBindings — fail-closed
// ---------------------------------------------------------------------------

test('assertNoPlaceholderBindings: passes when all hashes are concrete', () => {
  const binding = buildExecutionBinding({
    sourceHash: 'a'.repeat(64),
    dataHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    environmentHash: 'd'.repeat(64),
    policyId: 'p',
    policyVersion: 1,
    planHash: 'e'.repeat(64),
  });
  assert.doesNotThrow(() => assertNoPlaceholderBindings(binding));
});

test('assertNoPlaceholderBindings: throws on empty source hash (placeholder evidence)', () => {
  assert.throws(
    () => assertNoPlaceholderBindings({
      sourceHash: '',  // empty = placeholder
      dataHash: 'b'.repeat(64),
      codeHash: 'c'.repeat(64),
      environmentHash: 'd'.repeat(64),
      policyId: 'p',
      policyVersion: 1,
      planHash: 'e'.repeat(64),
      bindingDigest: 'f'.repeat(64),
    }),
    /PLACEHOLDER_BINDING_DETECTED/,
  );
});

test('assertNoPlaceholderBindings: throws on all-zero hash (placeholder)', () => {
  assert.throws(
    () => assertNoPlaceholderBindings({
      sourceHash: '0'.repeat(64),  // all-zero = placeholder
      dataHash: 'b'.repeat(64),
      codeHash: 'c'.repeat(64),
      environmentHash: 'd'.repeat(64),
      policyId: 'p',
      policyVersion: 1,
      planHash: 'e'.repeat(64),
      bindingDigest: 'f'.repeat(64),
    }),
    /PLACEHOLDER_BINDING_DETECTED/,
  );
});

// ---------------------------------------------------------------------------
// verifyExecutionBinding — independent recomputation
// ---------------------------------------------------------------------------

test('verifyExecutionBinding: valid binding passes', () => {
  const binding = buildExecutionBinding({
    sourceHash: 'a'.repeat(64),
    dataHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    environmentHash: 'd'.repeat(64),
    policyId: 'p',
    policyVersion: 1,
    planHash: 'e'.repeat(64),
  });
  const result = verifyExecutionBinding(binding);
  assert.equal(result.isValid, true);
});

test('verifyExecutionBinding: detects tampered digest', () => {
  const binding = buildExecutionBinding({
    sourceHash: 'a'.repeat(64),
    dataHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    environmentHash: 'd'.repeat(64),
    policyId: 'p',
    policyVersion: 1,
    planHash: 'e'.repeat(64),
  });
  // Tamper the digest.
  const tampered = { ...binding, bindingDigest: 'X'.repeat(64) };
  const result = verifyExecutionBinding(tampered);
  assert.equal(result.isValid, false);
});

// ---------------------------------------------------------------------------
// Deviation ledger
// ---------------------------------------------------------------------------

test('buildDeviationLedger: records deviations with affected-result index', () => {
  const ledger = buildDeviationLedger([
    { deviationId: 'dev-001', description: 'seed not locked', affectedReceiptIds: ['r-001', 'r-002'], severity: 'CRITICAL' },
    { deviationId: 'dev-002', description: 'minor logging gap', affectedReceiptIds: ['r-003'], severity: 'MINOR' },
  ]);
  assert.equal(ledger.entries.length, 2);
  assert.ok(ledger.ledgerDigest.length === 64);
  // Affected-result index must be queryable.
  assert.equal(ledger.affectedReceiptIndex.get('r-001')?.length, 1);
  assert.equal(ledger.affectedReceiptIndex.get('r-002')?.length, 1);
});
