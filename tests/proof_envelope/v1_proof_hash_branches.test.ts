/**
 * V1 proof_hash 分支覆盖补强测试。
 *
 * 目标分支：
 *   - proof_hash.ts:47（tie-breaker：同 ruleId 不同 outcome 的 checks 排序确定性）
 *   - proof_hash.ts:59-60（stableStringify===undefined 防御性 throw·不可达代码·跳过）
 *
 * 零容忍：无 any / @ts-ignore / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeProofHash } from '../../src/proof_envelope/proof_hash.ts';
import type {
  ProofCheckResult,
  ProofValidatorRule,
  CheckOutcome,
  ProofEnvelope,
} from '../../src/proof_envelope/types.ts';
import type { FalsificationSpec, SourceAnchor } from '../../src/falsifiability/types.ts';

// ========== 构建器 ==========

function makeCheck(
  ruleId: ProofValidatorRule,
  outcome: CheckOutcome,
  overrides: { ruleName?: string; detail?: string } = {},
): ProofCheckResult {
  return {
    ruleId,
    ruleName: overrides.ruleName ?? ruleId,
    outcome,
    detail: overrides.detail ?? `detail-${ruleId}-${outcome}`,
  };
}

/** 构造最小合法 Omit<ProofEnvelope,'proofHash'>（跳过 rulesetUri 可选字段）。 */
function makeEnvelopeWithoutHash(checks: readonly ProofCheckResult[]): Omit<ProofEnvelope, 'proofHash'> {
  const spec: FalsificationSpec = {
    prediction: 'pred',
    metric: 'acc',
    falsificationThreshold: 0.5,
    thresholdSemantics: 'gt',
  };
  const anchor: SourceAnchor = {
    gitCommitSha: 'b'.repeat(40),
    dashscopeRequestId: null,
    isoTimestamp: '2026-06-28T00:00:00.000Z',
    rawResponseHash: 'c'.repeat(64),
  };
  return {
    envelopeId: 'env-tb',
    claimId: 'claim-tb',
    verdictNodeId: 'vn-tb',
    conclusion: 'REFUTED',
    prevProofHash: 'a'.repeat(64),
    checks,
    knownFailures: [],
    falsificationSpec: spec,
    sourceAnchor: anchor,
    reproHash: 'd'.repeat(64),
    sealedBy: 'deterministic_sealer',
    sealedAt: '2026-06-28T00:00:00.000Z',
    createdAt: '2026-06-28T00:00:00.000Z',
  };
}

// ============================================================================
// Tie-breaker: 同 ruleId 不同 outcome → 排序确定性（覆盖 :47）
// ============================================================================

test('computeProofHash: 同 ruleId 不同 outcome → 不同输入顺序产出同一 hash (tie-breaker 行 47)', () => {
  // 两个 check 都对应 RULE-PE-001（同 ruleId），但 outcome 分别为 FAIL / PASS。
  // sort 比较器：ruleCmp===0（同 ruleId） → 进入 tie-breaker compareStringsDeterministic(a.outcome, b.outcome)。
  // code-unit 序：'F'(70) < 'P'(80)，故 FAIL 在前、PASS 在后，归一化为确定性序。
  const failCheck = makeCheck('RULE-PE-001', 'FAIL');
  const passCheck = makeCheck('RULE-PE-001', 'PASS');

  // 顺序 A: FAIL 在前，PASS 在后
  const envA = makeEnvelopeWithoutHash([failCheck, passCheck]);
  // 顺序 B: PASS 在前，FAIL 在后（不同输入顺序）
  const envB = makeEnvelopeWithoutHash([passCheck, failCheck]);

  const hashA = computeProofHash(envA);
  const hashB = computeProofHash(envB);

  assert.equal(hashA, hashB, '同 ruleId 不同 outcome 不同输入顺序应产出同一 hash');
});

test('computeProofHash: 同 ruleId PASS+WARN 排序确定性 (tie-breaker 覆盖行 47)', () => {
  // 验证不同 outcome 组合也在 tie-breaker 路径正确归一化。
  // code-unit 序：'P'(80) < 'W'(87)，故 PASS 在前、WARN 在后。
  const passCheck = makeCheck('RULE-PE-003', 'PASS');
  const warnCheck = makeCheck('RULE-PE-003', 'WARN');

  const envA = makeEnvelopeWithoutHash([warnCheck, passCheck]);
  const envB = makeEnvelopeWithoutHash([passCheck, warnCheck]);

  assert.equal(computeProofHash(envA), computeProofHash(envB));
});

test('computeProofHash: 三个同 ruleId 不同 outcome → 全排列确定性 (tie-breaker 行 47)', () => {
  // 三个同 ruleId（RULE-PE-005）+ 三个不同 outcome → 任意排列归一化后同 hash。
  const fail = makeCheck('RULE-PE-005', 'FAIL');
  const pass = makeCheck('RULE-PE-005', 'PASS');
  const warn = makeCheck('RULE-PE-005', 'WARN');

  const hash1 = computeProofHash(makeEnvelopeWithoutHash([fail, pass, warn]));
  const hash2 = computeProofHash(makeEnvelopeWithoutHash([warn, fail, pass]));
  const hash3 = computeProofHash(makeEnvelopeWithoutHash([pass, warn, fail]));

  assert.equal(hash1, hash2);
  assert.equal(hash2, hash3);
});

test('computeProofHash: tie-breaker 有真实差异 → 不同 outcome 组合产出不同 hash', () => {
  // 验证 tie-breaker 不是"全同化"— 不同 outcome 组合理应产生不同 hash。
  // [RULE-PE-001/FAIL, RULE-PE-001/FAIL] vs [RULE-PE-001/FAIL, RULE-PE-001/PASS]
  // detail 字段不同也应导致 hash 不同。
  const fail1 = makeCheck('RULE-PE-001', 'FAIL', { detail: '' });
  const fail2 = makeCheck('RULE-PE-001', 'FAIL', { detail: 'different' });

  const envSameOutcome = makeEnvelopeWithoutHash([fail1, fail2]);

  const fail3 = makeCheck('RULE-PE-001', 'FAIL');
  const pass1 = makeCheck('RULE-PE-001', 'PASS');
  const envDiffOutcome = makeEnvelopeWithoutHash([fail3, pass1]);

  // 内容不同的 checks → hash 应不同（若 tie-breaker 跳过排序导致差异则 hash 相同）
  assert.notEqual(
    computeProofHash(envSameOutcome),
    computeProofHash(envDiffOutcome),
    '不同 outcome 组合应产出不同 hash',
  );
});

test('computeProofHash: tie-breaker 在已知 ruleId 排序后仍正确归一化 checks', () => {
  // 构造混合场景：部分同 ruleId（触发 tie-breaker），部分不同 ruleId（触发 ruleCmp）。
  // 验证整体确定性——任何排列归一化后 hash 一致。
  const c1 = makeCheck('RULE-PE-001', 'FAIL'); // 001/FAIL
  const c2 = makeCheck('RULE-PE-001', 'PASS'); // 001/PASS (tie-breaker)
  const c3 = makeCheck('RULE-PE-002', 'WARN'); // 002/WARN

  const envA = makeEnvelopeWithoutHash([c1, c2, c3]);
  const envB = makeEnvelopeWithoutHash([c2, c3, c1]);
  const envC = makeEnvelopeWithoutHash([c3, c1, c2]);

  const hashA = computeProofHash(envA);
  assert.equal(hashA, computeProofHash(envB));
  assert.equal(hashA, computeProofHash(envC));
});

// ============================================================================
// 已有测试覆盖但未覆盖「同 ruleId + 不同 outcome」的场景（旧测试用的是不同 ruleId）
// 边界保证
// ============================================================================

test('computeProofHash: knownFailures 排序确定性', () => {
  const envA = makeEnvelopeWithoutHash([]);
  const envB = makeEnvelopeWithoutHash([]);

  // 用 Object.assign 覆盖 knownFailures（不同顺序）
  const envOrder1 = { ...envA, knownFailures: ['z-failure', 'a-failure'] };
  const envOrder2 = { ...envB, knownFailures: ['a-failure', 'z-failure'] };

  assert.equal(computeProofHash(envOrder1), computeProofHash(envOrder2));
});
