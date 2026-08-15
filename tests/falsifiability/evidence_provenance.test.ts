// tests/falsifiability/evidence_provenance.test.ts
//
// T-003 · Evidence provenance binding 回归测试（2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
//
// 反剧场最深的洞："系统无法区分真算出来的 metricValue 和编的 metricValue"。
// 本测试覆盖 `assertPrimaryEvidenceProvenanceBound` fail-closed 校验器的全部行为契约：
//   - V1 默认 requireExecutionProvenance=false → 恒通过（向后兼容 demo seed fixture）；
//   - requireExecutionProvenance=true：
//     · primary 证据（supportsClaim=true 且 refutesClaim=false）缺/格式错 hash → ok=false；
//     · secondary/control/refutes 证据不强制（hash 缺也通过）；
//     · 全部 primary 绑定合法 hash → 通过。
//   - 错误消息含 claimId 前缀 + 索引列表 + reasonCode 'EVIDENCE_PROVENANCE_UNBOUND'。
//
// Authority: T-003 + F-2-005 +
//            src/falsifiability/evidence_provenance.ts 行为契约注释。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  EVIDENCE_PROVENANCE_UNBOUND_REASON_CODE,
  assertPrimaryEvidenceProvenanceBound,
  computeExecutionProvenanceHash,
  isPrimaryEvidence,
  isValidExecutionProvenanceHash,
} from '../../src/falsifiability/evidence_provenance.ts';
import type { EvidenceRecord } from '../../src/falsifiability/types.ts';

const HEX64 = 'a'.repeat(64);
const INVALID_HASH = 'not-a-hash';

const baseSourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-24T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

/**
 * 构造测试 EvidenceRecord。
 * 注：因 exactOptionalPropertyTypes=true，调用方不能传 `executionProvenanceHash: undefined`，
 * 须用 makeEvidenceWithoutHash 显式构造无 hash 的证据（默认即无 hash·omit 字段）。
 */
function makeEvidence(overrides: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    claim: 'default claim',
    metricValue: 0.9,
    supportsClaim: true,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: baseSourceAnchor,
    ...overrides,
  };
}

/** 构造无 executionProvenanceHash 的证据（字段缺省·非 undefined·exactOptionalPropertyTypes 兼容）。 */
function makeEvidenceWithoutHash(overrides: Omit<Partial<EvidenceRecord>, 'executionProvenanceHash'>): EvidenceRecord {
  return {
    claim: 'default claim',
    metricValue: 0.9,
    supportsClaim: true,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: baseSourceAnchor,
    ...overrides,
  };
}

// ===== isPrimaryEvidence =====

test('isPrimaryEvidence: supportsClaim=true + refutesClaim=false → primary', () => {
  assert.equal(isPrimaryEvidence(makeEvidence({ supportsClaim: true, refutesClaim: false })), true);
});

test('isPrimaryEvidence: refutesClaim=true → 非 primary（反证证据·不进主阈值比较）', () => {
  assert.equal(isPrimaryEvidence(makeEvidence({ supportsClaim: false, refutesClaim: true })), false);
});

test('isPrimaryEvidence: 两者皆 false → 非 primary（无向证据）', () => {
  assert.equal(isPrimaryEvidence(makeEvidence({ supportsClaim: false, refutesClaim: false })), false);
});

// ===== isValidExecutionProvenanceHash =====

test('isValidExecutionProvenanceHash: 64-hex sha256 → true', () => {
  assert.equal(isValidExecutionProvenanceHash(HEX64), true);
});

test('isValidExecutionProvenanceHash: undefined → false', () => {
  assert.equal(isValidExecutionProvenanceHash(undefined), false);
});

test('isValidExecutionProvenanceHash: 非 64-hex（短/含大写/含非 hex）→ false', () => {
  assert.equal(isValidExecutionProvenanceHash('short'), false);
  assert.equal(isValidExecutionProvenanceHash('A'.repeat(64)), false); // 大写非小写 hex
  assert.equal(isValidExecutionProvenanceHash('g'.repeat(64)), false); // g 非 hex
  assert.equal(isValidExecutionProvenanceHash(`${HEX64}extra`), false); // 65 字符
});

// ===== assertPrimaryEvidenceProvenanceBound · V1 默认不强制（向后兼容）=====

test('assertPrimaryEvidenceProvenanceBound: requireExecutionProvenance=false → 恒 ok=true（V1 默认·向后兼容 demo seed）', () => {
  // primary 证据缺 hash，但 requireExecutionProvenance=false → 通过（不破坏 demo seed）
  const evidences = [makeEvidenceWithoutHash({})];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unboundEvidenceIndices, []);
  assert.equal(result.reasonCode, null);
  assert.equal(result.error, null);
});

// ===== assertPrimaryEvidenceProvenanceBound · requireExecutionProvenance=true =====

test('assertPrimaryEvidenceProvenanceBound: requireExecutionProvenance=true + primary 缺 hash → ok=false（fail-closed）', () => {
  const evidences = [
    makeEvidenceWithoutHash({}), // primary 缺 hash
  ];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
    claimId: 'CLAIM-TEST-001',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unboundEvidenceIndices, [0]);
  assert.equal(result.reasonCode, EVIDENCE_PROVENANCE_UNBOUND_REASON_CODE);
  assert.ok(result.error !== null);
  // 错误消息须含 claimId 前缀 + 索引 + reasonCode + 修复指引
  assert.match(result.error!, /\[CLAIM-TEST-001\]/);
  assert.match(result.error!, /EVIDENCE_PROVENANCE_UNBOUND/);
  assert.match(result.error!, /\[0\]/);
  assert.match(result.error!, /executionProvenanceHash/);
  assert.match(result.error!, /requireExecutionProvenance=true/);
  assert.match(result.error!, /computeSandboxRunResult/);
});

test('assertPrimaryEvidenceProvenanceBound: requireExecutionProvenance=true + primary 格式错 hash → ok=false', () => {
  const evidences = [
    makeEvidence({ executionProvenanceHash: INVALID_HASH }),
  ];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unboundEvidenceIndices, [0]);
  assert.equal(result.reasonCode, EVIDENCE_PROVENANCE_UNBOUND_REASON_CODE);
});

test('assertPrimaryEvidenceProvenanceBound: requireExecutionProvenance=true + primary 合法 hash → ok=true', () => {
  const evidences = [
    makeEvidence({ executionProvenanceHash: HEX64 }),
  ];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unboundEvidenceIndices, []);
});

test('assertPrimaryEvidenceProvenanceBound: secondary/control/refutes 证据不强制 provenance（hash 缺也通过）', () => {
  const evidences = [
    // primary 有 hash
    makeEvidence({
      supportsClaim: true,
      refutesClaim: false,
      executionProvenanceHash: HEX64,
    }),
    // refutes 证据无 hash（不强制·R6_REFUTED 处理）
    makeEvidenceWithoutHash({
      claim: 'refuting evidence',
      supportsClaim: false,
      refutesClaim: true,
      metricValue: -0.5,
    }),
    // 无向证据无 hash（不强制）
    makeEvidenceWithoutHash({
      claim: 'neutral evidence',
      supportsClaim: false,
      refutesClaim: false,
    }),
  ];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
  });
  assert.equal(result.ok, true, 'secondary/control/refutes 证据缺 hash 不应触发 fail-closed');
  assert.deepEqual(result.unboundEvidenceIndices, []);
});

test('assertPrimaryEvidenceProvenanceBound: 多 primary 部分缺 hash → 收集所有未绑定索引', () => {
  const evidences = [
    makeEvidence({ claim: 'ev0', executionProvenanceHash: HEX64 }), // primary 绑定
    makeEvidenceWithoutHash({ claim: 'ev1' }), // primary 缺
    makeEvidence({ claim: 'ev2', executionProvenanceHash: INVALID_HASH }), // primary 格式错
    makeEvidence({ claim: 'ev3', executionProvenanceHash: HEX64 }), // primary 绑定
  ];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
    claimId: 'CLAIM-MULTI',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unboundEvidenceIndices, [1, 2]);
  assert.match(result.error!, /\[1, 2\]/);
  assert.match(result.error!, /2 primary evidence\(s\)/);
});

test('assertPrimaryEvidenceProvenanceBound: 空 evidences + requireExecutionProvenance=true → ok=true（无 primary 可校验）', () => {
  const result = assertPrimaryEvidenceProvenanceBound([], {
    requireExecutionProvenance: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unboundEvidenceIndices, []);
});

test('assertPrimaryEvidenceProvenanceBound: claimId 不提供时错误消息无前缀', () => {
  const evidences = [makeEvidenceWithoutHash({})];
  const result = assertPrimaryEvidenceProvenanceBound(evidences, {
    requireExecutionProvenance: true,
    // claimId 不提供
  });
  assert.equal(result.ok, false);
  assert.ok(result.error !== null);
  assert.ok(!result.error!.startsWith('['), '无 claimId 时错误消息不应含 [claimId] 前缀');
  assert.match(result.error!, /^EVIDENCE_PROVENANCE_UNBOUND/);
});

// ===== computeExecutionProvenanceHash =====

test('computeExecutionProvenanceHash: 同输入 → 同输出（确定性·64-hex sha256）', () => {
  const stdout = 'metric_value=0.91\nrun_id=run-001\n';
  const hash1 = computeExecutionProvenanceHash(stdout);
  const hash2 = computeExecutionProvenanceHash(stdout);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('computeExecutionProvenanceHash: 不同输入 → 不同输出', () => {
  const hash1 = computeExecutionProvenanceHash('stdout-A');
  const hash2 = computeExecutionProvenanceHash('stdout-B');
  assert.notEqual(hash1, hash2);
});

test('computeExecutionProvenanceHash: 产出的 hash 通过 isValidExecutionProvenanceHash 校验', () => {
  const hash = computeExecutionProvenanceHash('test stdout');
  assert.equal(isValidExecutionProvenanceHash(hash), true);
});
