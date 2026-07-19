/**
 * ProofEnvelope V2 Validator 10 条规则逐条覆盖测试（04 §2.4 全表 RULE-PE-001..010）。
 *
 * 每条规则覆盖 PASS（合法）+ 至少一个 FAIL/WARN（触发条件）路径。
 * RULE-PE-010 跨语言 byte-equal 由 cross_lang.test.ts 独立验证；本文件验证 self-check 路径。
 *
 * Authority: FAR_LAB_MASTER_PLAN/04 §2.4（Validator 规则全表）+ §2.2（V2 字段适配）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SealProofEnvelopeV2Input } from '../../../src/proof_envelope/v2/types.ts';
import type { ProtocolFreeze } from '../../../src/fec/fec_contract.ts';
import { computeFecHash } from '../../../src/fec/compiler.ts';
import { makeValidEnvelopeV2Core } from './fixtures.ts';
import {
  PROOF_VALIDATOR_RULES_V2,
  hasAntiTheaterViolationV2,
  sealProofEnvelopeV2,
  summarizeChecksV2,
  validateProofEnvelopeV2,
} from '../../../src/proof_envelope/v2/index.ts';
import type { ProofCheckResultV2 } from '../../../src/proof_envelope/v2/index.ts';

/** 改了 fecSnapshot VC 字段后重算 fecHash（保持 freeze.fecHash + envelope.fecHash + protocolFreeze 一致）。 */
function rehash(core: SealProofEnvelopeV2Input): SealProofEnvelopeV2Input {
  const fecHash = computeFecHash(core.fecSnapshot);
  const freeze: ProtocolFreeze = { ...core.fecSnapshot.freeze, fecHash };
  return {
    ...core,
    fecHash,
    fecSnapshot: { ...core.fecSnapshot, freeze },
    protocolFreeze: freeze,
  };
}

function seal(overrides?: Parameters<typeof makeValidEnvelopeV2Core>[0]) {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core(overrides)).envelope;
}

function outcomeOf(ruleId: ProofCheckResultV2['ruleId'], checks: readonly ProofCheckResultV2[]): ProofCheckResultV2['outcome'] | undefined {
  return checks.find((c) => c.ruleId === ruleId)?.outcome;
}

test('合法 envelope：恰好 10 rules 且全 PASS', () => {
  const checks = validateProofEnvelopeV2(seal());
  assert.equal(PROOF_VALIDATOR_RULES_V2.length, 10);
  assert.equal(checks.length, 10);
  for (const c of checks) {
    assert.equal(c.outcome, 'PASS', `${c.ruleId} (${c.ruleName}) 应 PASS，实际 ${c.outcome}：${c.detail}`);
  }
});

// RULE-PE-001 claim_non_empty
test('RULE-PE-001: claim.id 空 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2(rehash({ ...base, claim: { ...base.claim, id: '' } })).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-001', checks), 'FAIL');
});

test('RULE-PE-001: claim.naturalLanguage 空白 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2(rehash({ ...base, claim: { ...base.claim, naturalLanguage: '   ' } })).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-001', checks), 'FAIL');
});

// RULE-PE-002 fec_snapshot_present
test('RULE-PE-002: fecSnapshot.measurableImplication 空 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2(rehash({ ...base, fecSnapshot: { ...base.fecSnapshot, measurableImplication: '' } })).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-002', checks), 'FAIL');
});

test('RULE-PE-002: fecSnapshot.contractVersion 非 FEC/2.0 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  // 字面量类型 contractVersion: 'FEC/2.0' 无法编译期表达 'FEC/1.0'；
  // 用 structuredClone + mutable 单层断言运行时篡改，触发 RULE-PE-002 contractVersion 分支。
  const tamperedFec = structuredClone(base.fecSnapshot);
  (tamperedFec as { contractVersion: string }).contractVersion = 'FEC/1.0';
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2(rehash({ ...base, fecSnapshot: tamperedFec })).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-002', checks), 'FAIL');
});

// RULE-PE-003 falsification_metric_present
test('RULE-PE-003: metric.metricKey 空 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2(rehash({ ...base, fecSnapshot: { ...base.fecSnapshot, metric: { ...base.fecSnapshot.metric, metricKey: '' } } })).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-003', checks), 'FAIL');
});

// RULE-PE-004 dataset_anchor_present
test('RULE-PE-004: datasetBindings 空 → FAIL', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2({ ...base, datasetBindings: [] }).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-004', checks), 'FAIL');
});

test('RULE-PE-004: sourceAnchor.resolved=false → WARN', () => {
  const base = makeValidEnvelopeV2Core();
  const checks = validateProofEnvelopeV2(
    sealProofEnvelopeV2({
      ...base,
      datasetBindings: [{ ...base.datasetBindings[0]!, sourceAnchor: { resolved: false, resolverRef: '' } }],
    }).envelope,
  );
  assert.equal(outcomeOf('RULE-PE-004', checks), 'WARN');
});

// RULE-PE-005 fec_hash_format
test('RULE-PE-005: fecHash 非 64hex → FAIL', () => {
  const checks = validateProofEnvelopeV2({ ...seal(), fecHash: 'too-short' });
  assert.equal(outcomeOf('RULE-PE-005', checks), 'FAIL');
});

// RULE-PE-006 ledger_root_format
test('RULE-PE-006: ledgerRoot 非 64hex → FAIL', () => {
  const checks = validateProofEnvelopeV2({ ...seal(), ledgerRoot: 'deadbeef' });
  assert.equal(outcomeOf('RULE-PE-006', checks), 'FAIL');
});

// RULE-PE-007 conclusion_matches_anti_theater
test('RULE-PE-007: antiTheaterReport hasFail + verdict CONFIRMED → FAIL（反 theater F1）', () => {
  const base = seal();
  const checks = validateProofEnvelopeV2({
    ...base,
    antiTheaterReport: {
      findings: [{ findingId: 'AT-LABEL-ONLY', attackKind: 'label-only-evidence', outcome: 'FAIL', hasFail: true, evidenceRef: 'rec-1', message: 'label-only 报告' }],
      hasFail: true,
      failCount: 1,
      warnCount: 0,
      llmOverrideRejected: true,
      canSealConfirmed: false,
    },
  });
  assert.equal(outcomeOf('RULE-PE-007', checks), 'FAIL');
});

test('RULE-PE-007: antiTheaterReport hasFail + verdict REFUTED → WARN（正确降级）', () => {
  const base = seal();
  const checks = validateProofEnvelopeV2({
    ...base,
    verdictTrace: { ...base.verdictTrace, verdict: 'REFUTED' },
    antiTheaterReport: { findings: [{ findingId: 'AT-LABEL-ONLY', attackKind: 'label-only-evidence', outcome: 'FAIL', hasFail: true, evidenceRef: 'rec-1', message: 'label-only 报告' }], hasFail: true, failCount: 1, warnCount: 0, llmOverrideRejected: true },
  });
  assert.equal(outcomeOf('RULE-PE-007', checks), 'WARN');
});

// RULE-PE-008 frozen_by_deterministic
test('RULE-PE-008: protocolFreeze.frozenBy 非 deterministic_freezer → FAIL', () => {
  const base = seal();
  // 字面量类型 frozenBy: 'deterministic_freezer' 无法编译期表达 'llm_as_judge'；
  // 用 structuredClone + mutable 单层断言运行时篡改，触发 RULE-PE-008 FAIL 路径。
  const tamperedFreeze = structuredClone(base.protocolFreeze);
  (tamperedFreeze as { frozenBy: string }).frozenBy = 'llm_as_judge';
  const checks = validateProofEnvelopeV2({ ...base, protocolFreeze: tamperedFreeze });
  assert.equal(outcomeOf('RULE-PE-008', checks), 'FAIL');
});

// RULE-PE-009 anti_theater_findings_transparent
test('RULE-PE-009: findings 含空 message → WARN', () => {
  const base = seal();
  const checks = validateProofEnvelopeV2({
    ...base,
    antiTheaterReport: {
      findings: [{ findingId: 'AT-POSTHOC-THRESHOLD', attackKind: 'post-hoc-threshold', outcome: 'WARN', hasFail: false, evidenceRef: 'rec-1', message: '   ' }],
      hasFail: false,
      failCount: 0,
      warnCount: 1,
      llmOverrideRejected: true,
    },
  });
  assert.equal(outcomeOf('RULE-PE-009', checks), 'WARN');
});

// RULE-PE-010 independently_recomputable（self-check 路径；跨语言见 cross_lang.test）
test('RULE-PE-010: 合法 envelope → PASS', () => {
  const checks = validateProofEnvelopeV2(seal());
  assert.equal(outcomeOf('RULE-PE-010', checks), 'PASS');
});

test('RULE-PE-010: 篡改 proofHash → FAIL', () => {
  const base = seal();
  const checks = validateProofEnvelopeV2({ ...base, proofHash: '0'.repeat(64) });
  assert.equal(outcomeOf('RULE-PE-010', checks), 'FAIL');
});

// 摘要 + 反 theater 断言辅助
test('summarizeChecksV2: 合法 envelope → PASS=10', () => {
  const summary = summarizeChecksV2(validateProofEnvelopeV2(seal()));
  assert.deepEqual(summary, { PASS: 10, WARN: 0, FAIL: 0, SKIP: 0 });
});

test('hasAntiTheaterViolationV2: WARN check + CONFIRMED → true（CI 门控断言用）', () => {
  const checks: ProofCheckResultV2[] = [{ ruleId: 'RULE-PE-007', ruleName: 'x', outcome: 'WARN', detail: 'd' }];
  assert.equal(hasAntiTheaterViolationV2(checks, 'CONFIRMED'), true);
  assert.equal(hasAntiTheaterViolationV2(checks, 'REFUTED'), false);
});
