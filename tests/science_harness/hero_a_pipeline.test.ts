// tests/science_harness/hero_a_pipeline.test.ts
//
// P1-5 Phase 2 端到端物证：hero-A 走 Pipeline B（fecAppendClaim + statistics? 注入），
// src/statistics/（oneSampleZTest/meanConfidenceInterval/cohensDOneSample/adjustPValues）首次作为生产 caller
// （STAT-1 BUILT_UNWIRED → WIRED 起点）。
//
// 真实依赖（file:line）：
//   - src/statistics/p_value.ts:59 oneSampleZTest（z + pValue 实算）
//   - src/statistics/ci.ts:36 meanConfidenceInterval（CI 实算）
//   - src/statistics/effect_size.ts:70 cohensDOneSample（effectSize 实算）
//   - src/statistics/multiple_testing.ts:19 adjustPValues（bonferroni 校正）
//   - src/fec/orchestrator.ts:185 buildVerdictKernelInput（statistics? 注入，跳过布尔降维）
//   - src/falsifiability/verdict_kernel_v2.ts:327 R7（真实 adjustedPValue<=alpha 驱动 CONFIRMED）
//
// 反同义反复：断言 pValue/adjustedPValue/CI/effectSize 为 src/statistics/ 实算值（非常量数组、非硬编码），
// verdict 由真实显著性驱动（R7 decisiveRuleId），非 V1 布尔计数器。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C P1-5 + 03 §7 R0-R9 + CLAUDE.md §1（progress=真实接线非测试变绿）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  buildHeroAChain,
  HERO_A_ALPHA,
  HERO_A_METRIC_KEY,
} from '../../src/science_harness/hero_a_pipeline.ts';

test('hero_a_pipeline: real src/statistics drives R7 CONFIRMED -> ASK-9 INCONCLUSIVE seal (P1-5 Phase 2)', () => {
  const db = new Database(':memory:');
  try {
    const chain = buildHeroAChain(db);
    const { statistics } = chain;

    // ── 真实统计物证：值由 src/statistics/ 实算（非常量）。pValue ∈ (0, alpha) → 显著 ──
    assert.ok(
      statistics.zTest.pValue > 0 && statistics.zTest.pValue < HERO_A_ALPHA,
      `real oneSampleZTest pValue must be in (0, alpha=${HERO_A_ALPHA}), got ${statistics.zTest.pValue}`,
    );
    assert.ok(
      statistics.adjustedPValue <= HERO_A_ALPHA,
      `bonferroni-adjusted pValue must be <= alpha (R7 significance gate), got ${statistics.adjustedPValue}`,
    );
    // adjustedPValue 是真实校正产物（bonferroni familySize=1 → = raw pValue；断言相等证明 adjustPValues 被调用）。
    assert.equal(
      statistics.adjustedPValue,
      statistics.zTest.pValue,
      'bonferroni with familySize=1 must yield adjustedPValue === raw pValue (proves adjustPValues ran)',
    );

    // CI 由 meanConfidenceInterval 实算（lower < estimate < upper，非预制 [0,0]）。
    const { confidenceInterval: ci } = statistics;
    assert.ok(
      ci.lower < ci.estimate && ci.estimate < ci.upper,
      `real CI must bracket the estimate: lower(${ci.lower}) < est(${ci.estimate}) < upper(${ci.upper})`,
    );

    // effectSize 由 cohensDOneSample 实算（有限非零，非占位）。
    assert.ok(
      Number.isFinite(statistics.cohensD) && statistics.cohensD !== 0,
      `real cohensD must be finite non-zero, got ${statistics.cohensD}`,
    );

    // ── 接线不变式：StatisticalResult.testId === fec.metric.metricKey（kernel primary-test 匹配）──
    assert.equal(
      statistics.statisticalResult.testId,
      HERO_A_METRIC_KEY,
      'statisticalResult.testId must equal metricKey (kernel primary-test match invariant)',
    );
    assert.equal(
      statistics.statisticalResult.pValue,
      statistics.zTest.pValue,
      'injected StatisticalResult.pValue must carry the real computed pValue',
    );

    // ── FEC 真实可编译（makeRealStatsFec 无 legacy flag）→ fecGate allowed ──
    assert.equal(chain.fecGate.allowed, true, 'real-stats FEC must compile (integrityFlags empty, no legacy flag)');
    assert.equal(
      chain.kernelOutput.integrityFlags.length,
      0,
      'kernel integrityFlags must be empty (no legacy_metric_only flag) for R7 to fire',
    );

    // ── 真实 R7 触发：机器裁决 = CONFIRMED（实算 adjustedPValue<=alpha + supports 驱动，非布尔计数器）──
    assert.equal(
      chain.machineVerdict,
      'CONFIRMED',
      'real statistics must drive R7 CONFIRMED (Pipeline B, not V1 boolean counter)',
    );
    assert.equal(
      chain.kernelOutput.decisiveRuleId,
      'R7_PRIMARY_TEST_CONFIRMS',
      `decisiveRuleId must be R7 (real significance path), got ${chain.kernelOutput.decisiveRuleId}`,
    );
    // kernel 消费真实统计：primaryAdjustedPValue = 实算值（非 null，证明 statistics? 注入穿透到 kernel）。
    assert.equal(
      chain.kernelOutput.statisticalReport.primaryAdjustedPValue,
      statistics.adjustedPValue,
      'kernel primaryAdjustedPValue must equal the real computed adjustedPValue (statistics? injection wired)',
    );
    assert.equal(
      chain.kernelOutput.statisticalReport.primaryEffectSize,
      statistics.cohensD,
      'kernel primaryEffectSize must equal the real cohensD (effectSize flowed through)',
    );
    assert.equal(
      chain.machineVerdict,
      chain.kernelOutput.verdict,
      'machineVerdict must equal kernelOutput.verdict (fecAppendClaim drives V2 kernel)',
    );

    // ── ASK-9：机器 CONFIRMED 降级为 INCONCLUSIVE 密封（绝不签 CONFIRMED 终审）──
    assert.equal(
      chain.sealedConclusion,
      'INCONCLUSIVE',
      'ASK-9: machine CONFIRMED must downgrade to INCONCLUSIVE for sealing',
    );
    assert.equal(chain.sealed.envelope.conclusion, 'INCONCLUSIVE');
    assert.match(
      chain.sealed.envelope.proofHash,
      /^[0-9a-f]{64}$/,
      'sealed envelope must carry a real sha256 proofHash',
    );

    // 五值红线：sealed conclusion ∈ 冻结五值 且 ≠ CONFIRMED。
    assert.ok(
      ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(chain.sealedConclusion),
      `sealedConclusion must be one of the five frozen verdicts, got: ${chain.sealedConclusion}`,
    );
    assert.notEqual(chain.sealedConclusion, 'CONFIRMED', 'ASK-9: sealed conclusion must never be CONFIRMED');
  } finally {
    db.close();
  }
});
