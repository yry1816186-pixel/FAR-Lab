// tests/science_harness/hero_b_pipeline.test.ts
//
// P1-5 Phase 3 端到端物证：hero-B 走 Pipeline B（causal），真实两样本统计 + ConfoundingGate FAIL →
// kernel R-causal 门（verdict_kernel_v2.ts:344-367）拦截 → DEGRADED_SCOPE（单层·无重复降级 reasonCode）。
//
// 真实依赖（file:line）：
//   - src/statistics/p_value.ts:80 twoSampleWelchZTest（cot vs baseline · pValue 实算）
//   - src/statistics/effect_size.ts:98 twoSampleEffectSize（cohensD 实算）
//   - src/statistics/ci.ts:48 differenceInMeansConfidenceInterval（差值 CI 实算）
//   - src/statistics/multiple_testing.ts:19 adjustPValues（bonferroni 校正）
//   - src/confounding_gate/adjudicate.ts:45 adjudicateConfounding（d-separation 图算法·非 LLM·prior_knowledge FAIL）
//   - src/fec/orchestrator.ts:198 buildVerdictKernelInput（claimType/evidenceBasis/confoundingGateResult 注入）
//   - src/falsifiability/verdict_kernel_v2.ts:344 R-causal 门（FAIL → DEGRADED_SCOPE）
//
// 反同义反复：断言真实 pValue/cohensD/CI（非常量），verdict 由真实 ConfoundingGate FAIL 驱动
// （reasonCodes 恰为 R_CAUSAL_CONFOUNDING_FAIL + F6_CAUSAL_HONESTY，无 R7/R8 重复降级）。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C P1-5 + 03 §7.5/§7.5.1（R-causal + F6）+ CLAUDE.md §1。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  buildHeroBChain,
  HERO_B_ALPHA,
  HERO_B_METRIC_KEY,
} from '../../src/science_harness/hero_b_pipeline.ts';

test('hero_b_pipeline: real two-sample stats + ConfoundingGate FAIL -> R-causal DEGRADED_SCOPE (single layer) (P1-5 Phase 3)', () => {
  const db = new Database(':memory:');
  try {
    const chain = buildHeroBChain(db);
    const { statistics } = chain;

    // ── 真实两样本统计物证（非常量）──
    assert.ok(
      statistics.zTest.pValue > 0 && statistics.zTest.pValue < HERO_B_ALPHA,
      `real twoSampleWelchZTest pValue must be in (0, alpha=${HERO_B_ALPHA}), got ${statistics.zTest.pValue}`,
    );
    assert.ok(
      statistics.adjustedPValue <= HERO_B_ALPHA,
      `bonferroni-adjusted pValue must be <= alpha (R7 significance gate), got ${statistics.adjustedPValue}`,
    );
    assert.ok(
      statistics.observedReduction > 0,
      `real observed reduction (baseline - cot) must be > 0 (supports claim direction), got ${statistics.observedReduction}`,
    );
    assert.ok(
      Number.isFinite(statistics.effectSize.cohensD) && statistics.effectSize.cohensD !== 0,
      `real cohensD must be finite non-zero, got ${statistics.effectSize.cohensD}`,
    );
    const { confidenceInterval: ci } = statistics;
    assert.ok(
      ci.lower < ci.estimate && ci.estimate < ci.upper,
      `real difference CI must bracket the estimate: lower(${ci.lower}) < est(${ci.estimate}) < upper(${ci.upper})`,
    );

    // ── ConfoundingGate 真实裁决：HERO_B_CAUSAL_MODEL 的 prior_knowledge 后门路径未阻断 → FAIL ──
    assert.equal(
      statistics.confoundingGate.outcome,
      'FAIL',
      `adjudicateConfounding must return FAIL (prior_knowledge unblocked + suspected), got ${statistics.confoundingGate.outcome}`,
    );
    assert.ok(
      statistics.confoundingGate.unmeasuredConfounders.includes('prior_knowledge'),
      `FAIL must carry prior_knowledge as unmeasured confounder, got [${statistics.confoundingGate.unmeasuredConfounders.join(',')}]`,
    );

    // 接线不变式：testId === metricKey（kernel primary-test 匹配）。
    assert.equal(statistics.statisticalResult.testId, HERO_B_METRIC_KEY);

    // ── FEC 可编译 + kernel integrityFlags 空（无 legacy flag）──
    assert.equal(chain.fecGate.allowed, true);

    // ── R-causal 门拦截：机器裁决 = DEGRADED_SCOPE（ observational_only + FAIL）──
    assert.equal(
      chain.machineVerdict,
      'DEGRADED_SCOPE',
      `R-causal gate (FAIL) must yield DEGRADED_SCOPE, got ${chain.machineVerdict}`,
    );
    assert.equal(
      chain.kernelOutput.decisiveRuleId,
      'R_CAUSAL_CONFOUNDING_FAIL',
      `decisiveRuleId must be R_CAUSAL_CONFOUNDING_FAIL (R-causal gate fired), got ${chain.kernelOutput.decisiveRuleId}`,
    );

    // 单层降级（反重复）：reasonCodes 恰为 R_CAUSAL_CONFOUNDING_FAIL + F6_CAUSAL_HONESTY，
    // 不含 R7_PRIMARY_TEST_CONFIRMS / R8_INSUFFICIENT_POWER_OR_NULL（R-causal 门在 R7 return 前拦截，无重复）。
    assert.deepEqual(
      [...chain.kernelOutput.reasonCodes].sort(),
      ['F6_CAUSAL_HONESTY', 'R_CAUSAL_CONFOUNDING_FAIL'],
      `reasonCodes must be exactly {R_CAUSAL_CONFOUNDING_FAIL, F6_CAUSAL_HONESTY} (single-layer downgrade, no R7/R8 dup), got [${chain.kernelOutput.reasonCodes.join(',')}]`,
    );

    // kernel 消费真实统计（primaryAdjustedPValue = 实算值，证明 statistics? 注入穿透到 kernel）。
    assert.equal(
      chain.kernelOutput.statisticalReport.primaryAdjustedPValue,
      statistics.adjustedPValue,
      'kernel primaryAdjustedPValue must equal real computed adjustedPValue',
    );
    // 真实统计本会触发 supports（显著）—— R-causal FAIL 在 R7 CONFIRMED return 前拦截。
    assert.equal(
      chain.kernelOutput.statisticalReport.supports,
      true,
      'real stats must reach supports=true (would-be CONFIRMED intercepted by R-causal gate)',
    );

    assert.equal(chain.machineVerdict, chain.kernelOutput.verdict);

    // ── DEGRADED_SCOPE 可机器密封（非 CONFIRMED → ASK-9 不降级）──
    assert.equal(chain.sealedConclusion, 'DEGRADED_SCOPE');
    assert.equal(chain.sealed.envelope.conclusion, 'DEGRADED_SCOPE');
    assert.match(chain.sealed.envelope.proofHash, /^[0-9a-f]{64}$/);

    assert.ok(
      ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(chain.sealedConclusion),
      `sealedConclusion must be one of the five frozen verdicts, got: ${chain.sealedConclusion}`,
    );
  } finally {
    db.close();
  }
});
