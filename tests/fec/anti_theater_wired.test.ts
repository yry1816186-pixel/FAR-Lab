// tests/fec/anti_theater_wired.test.ts
//
// FUSION-OS-1 端到端物证:真实驱动 src/fec/orchestrator.ts fecAppendClaim 的 buildVerdictKernelInput
// 接线(orchestrator.ts:199 + legacy_kernel_adapter.ts:52 硬编码 [] → toKernelFindings(args.antiTheaterReport?.findings ?? [])
// 单点投影)。经真实 runAntiTheaterLint(golden_vectors seed-cherry 攻击)→ report → fecAppendClaim(antiTheaterReport)
// → kernel R-anti-theater-fail(verdict_kernel_v2.ts:296)触发 UNTESTED + decisiveRuleId='ANTI_THEATER_FAIL'。
//
// 真实依赖链:runAntiTheaterLint(23 detector 纯函数·src/anti_theater/lint.ts:39)
//   → toKernelFindings(单点投影·adapters/kernel_adapter.ts:58)
//   → decideFiveValueVerdict(经 fecAppendClaim 真实事务路径·非 FakeBackend·非 mock)。
//
// 反剧场自检红线(FUSION-OS-1):FecAppendClaimArgs 不暴露 KernelAntiTheaterFinding[] 字段——caller 只能经
// antiTheaterReport(runAntiTheaterLint 整体产出)传入,投影在 buildVerdictKernelInput 内部。类型层保证见
// src/fec/orchestrator.ts FecAppendClaimArgs 定义(仅 antiTheaterReport?: AntiTheaterReport·无 antiTheaterFindings 字段)。
//
// Authority: FUSION-OS-1 +  FUSION-OS-1。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';
import { makeLegacyCompatFec } from '../../src/falsifiability/index.ts';
import { runAntiTheaterLint } from '../../src/anti_theater/index.ts';
import { getGoldenVector } from '../fixtures/anti_theater/golden_vectors.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import type { FecAppendClaimArgs } from '../../src/fec/orchestrator.ts';
import {
  DEMO_CLAIM_ID,
  DEMO_EXPORTED_AT,
  DEMO_FALSIFICATION_SPEC,
  DEMO_GIT_COMMIT_SHA,
  DEMO_SOURCE_ANCHOR,
  DEMO_THRESHOLD_SPEC,
} from '../../src/far_proof/demo_chain.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/index.ts';

// 复用 fec_mandatory_e2e.test.ts 的 fecAppendClaim args 形状(真实生产调用形态·非测试桩)。
// antiTheaterReport 不设(可选字段)——caller 按需在外层 spread 注入。
function buildBaseArgs(fecContract: FecContractV2): FecAppendClaimArgs {
  const claimText = DEMO_FALSIFICATION_SPEC.prediction;
  return {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: 'a'.repeat(64),
        gitCommitSha: DEMO_GIT_COMMIT_SHA,
        isoTimestamp: DEMO_EXPORTED_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"FUSION-OS-1 anti-theater wired"}',
      responsePayload: '{"claim":"anti-theater-wired-e2e"}',
      finishReason: 'stop',
      usageTokensTotal: 16,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claimId: DEMO_CLAIM_ID, claim: claimText, metric: 'bls_power' },
    sourceAnchor: DEMO_SOURCE_ANCHOR,
    claim: claimText,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    evidences: [
      {
        claim: 'measured bls_power = 0.87 on TESS held-out split (n=1000)',
        metricValue: 0.87,
        supportsClaim: true,
        refutesClaim: false,
        scopeNarrowerThanClaim: false,
        sourceAnchor: DEMO_SOURCE_ANCHOR,
      },
    ],
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fecContract },
  };
}

test('green_wired_path_untested_with_anti_theater_fail: 真实 runAntiTheaterLint seed-cherry → fecAppendClaim → kernel UNTESTED+ANTI_THEATER_FAIL (FUSION-OS-1)', () => {
  // golden_vectors gv-seed-cherry-01:clone 干净 base → runRegistry 移除 seed=7,99 → HIDDEN_FAILED_RUN 触发。
  const lintInput = getGoldenVector('gv-seed-cherry-01').build();
  const report = runAntiTheaterLint(lintInput);

  // 真实 detector 物证(非 mock·非 GV-12 合成语义):detect_seed_cherry HIDDEN_FAILED_RUN 子路径产 outcome=FAIL。
  assert.equal(report.hasFail, true, 'gv-seed-cherry-01 must yield hasFail=true (real detector)');
  assert.ok(
    report.findings.some((f) => f.attackKind === 'seed-cherry-picking'),
    'report.findings must contain seed-cherry-picking attackKind',
  );

  const db = new Database(':memory:');
  try {
    runMigrations(db);
    // lintInput.fec(BASE_FEC)即 kernel 消费的 fec —— 语义一致:detector 检查的 fec === kernel 裁决的 fec。
    // report 经 fecAppendClaim 内部 toKernelFindings(report.findings) 单点投影喂 kernel(反剧场红线:caller 不能手填)。
    const result = fecAppendClaim(db, {
      ...buildBaseArgs(lintInput.fec),
      antiTheaterReport: report,
    });

    // kernel R-anti-theater-fail(verdict_kernel_v2.ts:296):severity='fail' 早返回 UNTESTED + ANTI_THEATER_FAIL。
    assert.equal(result.kernelOutput.verdict, 'UNTESTED', 'anti-theater fail must yield kernel UNTESTED');
    assert.equal(
      result.kernelOutput.decisiveRuleId,
      'ANTI_THEATER_FAIL',
      `decisiveRuleId must be SSOT 'ANTI_THEATER_FAIL', got: ${result.kernelOutput.decisiveRuleId}`,
    );
    assert.ok(
      result.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'),
      `reasonCodes must include ANTI_THEATER_FAIL, got: ${JSON.stringify(result.kernelOutput.reasonCodes)}`,
    );
    // decision 也 UNTESTED(anti-theater-fail 早返回保证 kernel verdict=UNTESTED·fecGate 路径不影响)。
    assert.equal(result.decision.verdict, 'UNTESTED');
  } finally {
    db.close();
  }
});

test('opt_out_caller_backward_compatible: 不传 antiTheaterReport → findings 空 → 不触发 ANTI_THEATER_FAIL (向后兼容·等价接线前行为)', () => {
  // FUSION-OS-1 R1 决策(基于 4-caller Explore 实测):3/4 生产 caller 无诚实构造 AntiTheaterLintInput 的
  // 数据(single-seed/合成 strata/无 raw artifact)——强制 flag 会回退 P1-5 已落地核心演示。故 flag 强制门
  // 移除(P1-6 multi-seed sandbox 落地后跟进),opt-out caller 行为等价接线前(findings 空·不误触发降级)。
  // 本用例锁该向后兼容契约:通道接通后,opt-out 路径的 anti-theater 投影为空,R-anti-theater-fail 不触发。
  const fec = makeLegacyCompatFec({
    claimId: DEMO_CLAIM_ID,
    falsificationSpec: DEMO_FALSIFICATION_SPEC,
    thresholdSpec: DEMO_THRESHOLD_SPEC,
    frozenAt: DEMO_SOURCE_ANCHOR.isoTimestamp,
  });

  const db = new Database(':memory:');
  try {
    runMigrations(db);
    // 故意不传 antiTheaterReport → toKernelFindings([]) 投影空 → verdict_kernel_v2.ts:296 不触发。
    const result = fecAppendClaim(db, buildBaseArgs(fec));

    assert.ok(
      !result.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'),
      `opt-out must not trigger ANTI_THEATER_FAIL (backward compat), got reasonCodes: ${JSON.stringify(result.kernelOutput.reasonCodes)}`,
    );
    assert.notEqual(
      result.kernelOutput.decisiveRuleId,
      'ANTI_THEATER_FAIL',
      `opt-out decisiveRuleId must not be ANTI_THEATER_FAIL, got: ${result.kernelOutput.decisiveRuleId}`,
    );
  } finally {
    db.close();
  }
});
