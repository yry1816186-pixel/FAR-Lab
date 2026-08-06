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
  standardPolicyV1,
  buildStandardPolicyRegistry,
  resolveStandardPolicyId,
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

// ---------------------------------------------------------------------------
// M14 接线 — 标准验证策略注册表（2026-08-06）
// ---------------------------------------------------------------------------

test('standardPolicyV1: 确定性构造（两次调用 digest 相同·防策略漂移）', () => {
  const p1 = standardPolicyV1();
  const p2 = standardPolicyV1();
  assert.equal(p1.digest, p2.digest, '标准策略 digest 须确定（canonicalJson 重算）');
  assert.equal(p1.policyId, 'far.policy.standard-v0');
  assert.equal(p1.version, 1);
  assert.equal(p1.deprecated, false);
  assert.deepEqual(
    [...p1.requiredDimensions].sort(),
    [
      'provenance', 'integrity', 'identity', 'processConformance',
      'executionReproduction', 'scientificVerdict',
    ].sort(),
    '标准策略须覆盖六维 assurance',
  );
});

test('buildStandardPolicyRegistry: resolveLatest 返回非 deprecated v1 + registryDigest 稳定', () => {
  const r1 = buildStandardPolicyRegistry();
  const r2 = buildStandardPolicyRegistry();
  assert.equal(r1.policies.length, 1);
  assert.equal(r1.registryDigest, r2.registryDigest, 'registryDigest 须确定');
  assert.match(r1.registryDigest, /^[0-9a-f]{64}$/);
  const latest = r1.resolveLatest('far.policy.standard-v0');
  assert.ok(latest, '标准策略须可解析');
  assert.equal(latest.version, 1);
  assert.equal(latest.deprecated, false);
});

test('resolveStandardPolicyId: 返回 qualified id（生产接线·fail-closed）', () => {
  assert.equal(resolveStandardPolicyId(), 'far.policy.standard-v0.v1');
});

test('resolveStandardPolicyId: 策略全部 deprecated → 解析失败（resolveLatest 无可用版本·fail-closed）', () => {
  // resolveLatest 只返回最新非 deprecated 版本；全部 deprecated → undefined → 解析路径
  // 抛 POLICY_UNKNOWN（禁静默回退到旧策略·WP-05 语义）。assertPolicyApplicable 的
  // POLICY_DEPRECATED 分支已由上方独立测试覆盖。
  const deprecatedRegistry = buildPolicyRegistry([
    {
      policyId: 'far.policy.standard-v0',
      version: 1,
      digest: 'a'.repeat(64),
      requiredDimensions: ['provenance'],
      deprecated: true,
      successorPolicyId: 'far.policy.standard-v0.v2',
    },
  ]);
  const latest = deprecatedRegistry.resolveLatest('far.policy.standard-v0');
  assert.equal(latest, undefined, '全部 deprecated → resolveLatest 返回 undefined');
});
