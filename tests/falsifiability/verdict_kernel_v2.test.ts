/**
 * Verdict Kernel V2 单测 —— APPENDIX_B_GOLDEN 12 个 P0 golden vectors（GV-01..GV-12）+ 辅助边界 case。
 *
 * 权威：FAR_LAB_MASTER_PLAN/APPENDIX_B_GOLDEN.md §1（R0-R9 优先级 SSOT）+ §2（GV-01..GV-12 详细规范）+
 *       §4.1（浮点容差 1e-7）+ 03 §7（VerdictKernelInput/Output）。
 *
 * 覆盖矩阵（APPENDIX_B §2 line 79）：
 *   GV-01 complete support / GV-02 complete refute / GV-03 missing FEC / GV-04 missing dataset /
 *   GV-05 narrower population / GV-06 dataset drift / GV-07 underpowered / GV-08 conflicting metrics /
 *   GV-09 post-hoc threshold / GV-10 tampered proof / GV-11 metric swap / GV-12 seed cherry-pick。
 *
 * GV-10 说明：APPENDIX_B line 266 "本 case 不测 kernel 输出，测 verifier 能否检测篡改"。
 *   完整 GV-10（proofHash mismatch / verifier RED）归 task #9（ProofEnvelope）+ task #10（Anti-Theater）。
 *   此处测 kernel 层变体：antiTheaterFindings=[{kind:'proof_tamper', severity:'fail'}] → UNTESTED (ANTI_THEATER_FAIL)。
 *
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。所有数值断言忠于 APPENDIX_B。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import type { ConfoundingGateResult } from '../../src/confounding_gate/types.ts';

/**
 * 构造 GV-01 风格的合法 VerdictKernelInput（complete support·默认落 CONFIRMED R7）。
 * GV-01 数值（APPENDIX_B §2 GV-01 line 91-94）：
 *   primaryMetric='bls_power', direction='greater', alpha=0.0125, correction='bonferroni',
 *   M1 supports, adjustedPValue=0.003, effectSizeObserved=0.62, CI=[0.21,0.95],
 *   minimumDetectableEffect=0.2（line 99），seedPolicy.seed=42。
 */
function baseKernelInput(overrides: Partial<VerdictKernelInput> = {}): VerdictKernelInput {
  const fec: FecContractV2 = makeValidFec({
    fecId: 'FEC-GV-01',
    claimId: 'C-DEMO-0001',
    measurableImplication: 'Model M achieves BLS power > baseline on dataset D',
    metric: { ...baseMetric(), metricKey: 'bls_power', description: 'BLS power', isDeterministic: false },
    statisticalPlan: {
      ...baseStatPlan(),
      primaryMetric: 'bls_power',
      alpha: 0.0125,
      effectDirection: 'greater',
      multipleTestingCorrection: 'bonferroni',
      nullHypothesis: 'effect <= 0',
      alternativeHypothesis: 'effect > 0',
    },
    direction: 'greater',
    threshold: {
      value: 0,
      unit: 'unitless',
      thresholdSemantics: 'gt',
      preregistered: true,
    },
    powerPlan: {
      targetPower: 0.8,
      minimumDetectableEffect: 0.2,
      sampleSize: 120,
      powerMethod: 'ttest',
      alphaAssumed: 0.0125,
    },
  });

  return {
    fec,
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: true },
        scopeCoverage: { dimension: 'population', value: 'adults 18-65 all sexes', relation: 'within' },
      },
    ],
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.003,
        adjustedPValue: 0.003,
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [],
      },
    ],
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    contradictionSet: [],
    integrityFlags: [],
    ...overrides,
  };
}

// ===== GV-01..GV-12（APPENDIX_B §2）=====

test('GV-01: complete support → CONFIRMED (R7)', () => {
  const out = decideFiveValueVerdict(baseKernelInput());
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
  assert.deepEqual([...out.reasonCodes], ['R7_PRIMARY_TEST_CONFIRMS']);
  assert.equal(out.boundedSupport, true, 'CONFIRMED 须标 bounded support（非科学真理）');
});

test('GV-02: complete refute → REFUTED (R6)', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'refutes',
        pValue: 0.0008,
        adjustedPValue: 0.0008,
        effectSizeObserved: -0.71,
        confidenceInterval: [-1.05, -0.34],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'REFUTED');
  assert.equal(out.decisiveRuleId, 'R6_PRIMARY_TEST_REFUTES');
  // R6 优先级高于 R7：即便数值显著也落 REFUTED。
  assert.equal(out.boundedSupport, false);
});

test('GV-03: missing FEC (null) → UNTESTED (R1)', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ fec: null }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');
  assert.ok(out.untestedReason !== null && out.untestedReason.length > 0, 'untestedReason 须非空（F1 反 theater）');
});

test('GV-03 变体: FEC 缺 measurableImplication → UNTESTED (R1)', () => {
  const fec = makeValidFec({ measurableImplication: '   ' });
  const out = decideFiveValueVerdict(baseKernelInput({ fec }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');
});

test('GV-04: missing dataset (空 bindings) → UNTESTED (R2)', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ datasetBindings: [] }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R2_NO_VALID_DATASET_BINDING');
  assert.equal(out.untestedReason, 'EVIDENCE_MISSING');
});

test('GV-04 变体: sourceAnchor.resolved=false → UNTESTED (R2)', () => {
  const input = baseKernelInput({
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: false },
        scopeCoverage: { dimension: 'population', value: 'adults 18-65', relation: 'within' },
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R2_NO_VALID_DATASET_BINDING');
});

test('GV-05: narrower population → DEGRADED_SCOPE (R4 > R7)', () => {
  // 统计上全 PASS（supports significant），但 scope 窄于 claim → R4 先判。
  const input = baseKernelInput({
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: true },
        scopeCoverage: { dimension: 'population', value: 'adults 25-40 male only', relation: 'partial' },
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.decisiveRuleId, 'R4_SCOPE_MISMATCH_NONCRITICAL');
  assert.ok(out.scopeReport.scopeSlipText !== null && out.scopeReport.scopeSlipText.length > 0, 'scopeSlipText 须非空');
  assert.ok(out.scopeReport.impactedScopeEdges.length > 0, 'impactedScopeEdges 须非空');
});

test('GV-06: dataset drift → DEGRADED_SCOPE (R4 + DATASET_DRIFT_WARN)', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.004,
        adjustedPValue: 0.004,
        effectSizeObserved: 0.5,
        confidenceInterval: [0.2, 0.8],
        assumptionDiagnostics: [{ kind: 'distribution_drift', severity: 'warn' }],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.decisiveRuleId, 'R4_SCOPE_MISMATCH_NONCRITICAL');
  assert.ok(out.reasonCodes.includes('DATASET_DRIFT_WARN'), 'reasonCodes 须含 DATASET_DRIFT_WARN');
});

test('GV-07: underpowered → INCONCLUSIVE (R8·三触发同时成立)', () => {
  const input = baseKernelInput({
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'neutral',
        pValue: 0.18,
        adjustedPValue: 0.18,
        effectSizeObserved: 0.08,
        confidenceInterval: [-0.1, 0.26],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  // underpowered 已测试·untestedReason 留空（APPENDIX_B GV-07 line 211）。
  assert.equal(out.untestedReason, null);
});

test('GV-08: conflicting metrics (multi-implication 互斥) → INCONCLUSIVE (R5)', () => {
  // M1 supports（相对 claim greater）+ M2 refutes（相对 claim greater·因 M2 alternative=less 互斥）。
  // 两者均显著 → evaluate_statistics 检测 supports && refutes → conflicting → R5。
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.009,
        adjustedPValue: 0.009,
        effectSizeObserved: 0.5,
        confidenceInterval: [0.2, 0.8],
        assumptionDiagnostics: [],
      },
      {
        testId: 'chi_square',
        status: 'ran',
        effectDirection: 'refutes',
        pValue: 0.011,
        adjustedPValue: 0.011,
        effectSizeObserved: -0.4,
        confidenceInterval: [-0.7, -0.1],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE');
});

test('GV-09: post-hoc threshold (alpha_rewrite critical) → UNTESTED (R3 + ALPHA_REWRITE_DETECTED)', () => {
  const input = baseKernelInput({
    protocolDeviations: [{ kind: 'alpha_rewrite', severity: 'critical', detectedAt: 'post-result' }],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R3_CRITICAL_PROTOCOL_DEVIATION');
  assert.ok(out.reasonCodes.includes('ALPHA_REWRITE_DETECTED'), '须含 ALPHA_REWRITE_DETECTED');
  assert.ok(out.integrityFlags.includes('harking_risk'), 'integrityFlags 须 += harking_risk');
  assert.ok(out.untestedReason !== null, 'untestedReason 须非空');
});

test('GV-10 (kernel 层变体): tampered proof → UNTESTED (ANTI_THEATER_FAIL)', () => {
  // APPENDIX_B GV-10 line 266：完整 case 测 verifier（proofHash mismatch），归 task #9/#10。
  // kernel 层变体：anti-theater 检测到 proof tamper (fail) → UNTESTED。
  const input = baseKernelInput({
    antiTheaterFindings: [{ kind: 'proof_tamper', severity: 'fail', details: 'fecSnapshot hash mismatch' }],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'ANTI_THEATER_FAIL');
});

test('GV-11: metric swap (critical) → UNTESTED (R3 + METRIC_SWAP_DETECTED)', () => {
  // metric swap 是 critical deviation；LLM reviewer 旁路输入不进 kernel（F3·kernel 无 LLM 字段）。
  const input = baseKernelInput({
    protocolDeviations: [{ kind: 'metric_swap', severity: 'critical', details: 'used chi_square instead of bls_power' }],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R3_CRITICAL_PROTOCOL_DEVIATION');
  assert.ok(out.reasonCodes.includes('METRIC_SWAP_DETECTED'), '须含 METRIC_SWAP_DETECTED');
  assert.ok(out.integrityFlags.includes('p_hacking_risk'), 'integrityFlags 须 += p_hacking_risk');
});

test('GV-12: seed cherry-pick → INCONCLUSIVE (R8 + SEED_CHERRY_PICK_WARN)', () => {
  // seed 偏离 + runRegistry 记录失败 run → caller 预填 p_hacking_risk + seed_cherry_pick warn finding。
  // p_hacking_risk 阻断 R7 → R8；seed_cherry_pick finding 追加 SEED_CHERRY_PICK_WARN。
  const input = baseKernelInput({
    integrityFlags: ['p_hacking_risk'],
    antiTheaterFindings: [{ kind: 'seed-cherry-picking', severity: 'warn', details: 'seed=42 failed (adj=0.34), seed=137 reported (adj=0.008)' }],
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.008,
        adjustedPValue: 0.008,
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  assert.deepEqual([...out.reasonCodes], ['R8_INSUFFICIENT_POWER_OR_NULL', 'SEED_CHERRY_PICK_WARN']);
});

// ===== 辅助 case（R0 schema / R9 skipped / 反 theater 自检 / 浮点边界）=====

test('R0: contractVersion 不被支持 → UNTESTED (R0_SCHEMA_INVALID)', () => {
  // 单层窄断言 + 注释：contractVersion 是 'FEC/2.0' 字面量，类型系统禁止 'FEC/1.0'。
  // 测试刻意篡改触发 R0_SCHEMA_INVALID；spread + exactOptionalPropertyTypes 使属性降级 optional，
  // 故需 `as FecContractV2` 还原类型（单层断言·依据：运行时 kernel 仅读 contractVersion 字段判 R0）。
  const tampered = { ...baseKernelInput().fec, contractVersion: 'FEC/1.0' as 'FEC/2.0' } as FecContractV2;
  const out = decideFiveValueVerdict(baseKernelInput({ fec: tampered }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R0_SCHEMA_INVALID');
  assert.equal(out.untestedReason, 'SCHEMA_INVALID');
});

test('R9: 所有 primary test skipped → UNTESTED (R9_ALL_TESTS_SKIPPED)', () => {
  const input = baseKernelInput({
    statistics: [
      { testId: 'bls_power', status: 'skipped', effectDirection: 'neutral', assumptionDiagnostics: [] },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R9_ALL_TESTS_SKIPPED');
});

test('GV-01 反 theater 自检: 注入 WARN assumption → 降级 INCONCLUSIVE (R8)', () => {
  // APPENDIX_B GV-01 line 101：注入 WARN → 必须 INCONCLUSIVE，不得假装 CONFIRMED。
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.003,
        adjustedPValue: 0.003,
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [{ kind: 'normality', severity: 'warn' }],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
});

test('浮点边界 §4.1: adjustedPValue === alpha → CONFIRMED（≤ 含等号·容差内）', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.0125,
        adjustedPValue: 0.0125, // === alpha (0.0125)
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED', 'adjustedP === alpha 须 ≤（含等号）→ CONFIRMED');
});

test('浮点边界 §4.1: adjustedPValue = alpha + 1e-6（超出 1e-7 容差）→ INCONCLUSIVE (R8)', () => {
  // §4.1 容差 1e-7：alpha+1e-6 超出容差 → 视为 > alpha → R8。
  // （APPENDIX_B line 339 举例 alpha+1e-8，但 1e-8 < 1e-7 容差会被吸收；此处用 1e-6 明确超出容差。）
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.012501,
        adjustedPValue: 0.012501, // alpha (0.0125) + 1e-6
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
});

test('effect size 边界: effectSizeObserved === minimumDetectable → CONFIRMED（≥ 含等号）', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.003,
        adjustedPValue: 0.003,
        effectSizeObserved: 0.2, // === minimumDetectableEffect (0.2)
        confidenceInterval: [0.05, 0.35],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED', 'effectSize === mde 须 ≥（含等号）→ CONFIRMED');
});

test('纯函数性: 相同输入 → 相同输出（确定性·F2）', () => {
  const input = baseKernelInput();
  const out1 = decideFiveValueVerdict(input);
  const out2 = decideFiveValueVerdict(input);
  assert.deepEqual(out1, out2, 'kernel 须确定性（相同输入 → 逐字相等输出）');
});

test('不变性: kernel 不 mutate 输入（零容忍 #10）', () => {
  const input = baseKernelInput({
    protocolDeviations: [{ kind: 'alpha_rewrite', severity: 'critical' }],
    integrityFlags: [],
  });
  const inputSnapshot = JSON.parse(JSON.stringify(input));
  decideFiveValueVerdict(input);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), inputSnapshot, 'kernel 不得 mutate 输入');
});

// ===== R-causal ConfoundingGate（F6·§7.5:945·任务 #12·仅 claimType='causal' 触发）=====
// baseKernelInput() 默认落 CONFIRMED（R7）——即「本会 CONFIRMED」的 base，供 R-causal 门降级演示。

/** 构造最小 ConfoundingGateResult（仅 outcome 有意义·R-causal 门只读 outcome + caller 提供 evidenceBasis）。 */
function gateResult(outcome: ConfoundingGateResult['outcome']): ConfoundingGateResult {
  return {
    outcome,
    unblockedConfounders: [],
    blockedConfounders: [],
    unmeasuredConfounders: outcome === 'FAIL' ? ['latent_x'] : [],
    backdoorPaths: [],
    blockedPaths: [],
    unblockedPaths: [],
    rationale: `kernel test fixture outcome=${outcome}`,
  };
}

test('R-causal FAIL + observational_only → DEGRADED_SCOPE (R_CAUSAL_CONFOUNDING_FAIL + F6_CAUSAL_HONESTY)', () => {
  // 本会 CONFIRMED 的 base + causal FAIL → 因果门降 DEGRADED_SCOPE（相关 ≠ 因果）。
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('FAIL'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.decisiveRuleId, 'R_CAUSAL_CONFOUNDING_FAIL');
  assert.ok(out.reasonCodes.includes('R_CAUSAL_CONFOUNDING_FAIL'), '须含 R_CAUSAL_CONFOUNDING_FAIL');
  assert.ok(out.reasonCodes.includes('F6_CAUSAL_HONESTY'), 'observational_only + FAIL 须追加 F6_CAUSAL_HONESTY');
});

test('R-causal FAIL + interventional → DEGRADED_SCOPE（无 F6_CAUSAL_HONESTY·evidenceBasis 不为 observational_only）', () => {
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'interventional',
    confoundingGateResult: gateResult('FAIL'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.decisiveRuleId, 'R_CAUSAL_CONFOUNDING_FAIL');
  assert.deepEqual(
    [...out.reasonCodes],
    ['R_CAUSAL_CONFOUNDING_FAIL'],
    'interventional 不追加 F6_CAUSAL_HONESTY',
  );
});

test('R-causal WARN + 本会 CONFIRMED → INCONCLUSIVE (R_CAUSAL_CONFOUNDING_WARN·降级)', () => {
  // 本会 CONFIRMED + causal WARN → 降 INCONCLUSIVE（混杂使因果声称无法确认）。
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('WARN'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R_CAUSAL_CONFOUNDING_WARN');
  assert.deepEqual([...out.reasonCodes], ['R_CAUSAL_CONFOUNDING_WARN']);
});

test('R-causal WARN + 本不会 CONFIRMED（underpowered）→ no-op·正常 R8（门不重复降级）', () => {
  // GV-07 underpowered base（本就 R8·r7Pass=false）+ causal WARN → 门 no-op（WARN+!wouldConfirm）→ 落 R8。
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('WARN'),
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran',
        effectDirection: 'neutral',
        pValue: 0.18,
        adjustedPValue: 0.18,
        effectSizeObserved: 0.08,
        confidenceInterval: [-0.1, 0.26],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL', '门 no-op·落正常 R8');
});

test('R-causal PASS + 本会 CONFIRMED → 正常 R7 CONFIRMED（门 no-op·PASS 不影响 verdict）', () => {
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('PASS'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS', 'PASS → 门 no-op·落正常 R7');
});

test('R-causal guard: claimType=existence（非 causal）+ FAIL gate → no-op·正常 R7 CONFIRMED（零回归）', () => {
  // 双重 guard：claimType !== 'causal' → 门短路 → R0-R9 cascade 与改动前字节一致。
  const input = baseKernelInput({
    claimType: 'existence',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('FAIL'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS', '非因果 claim 不受 F6 影响');
});

test('R-causal guard: claimType 缺省（undefined）+ FAIL gate → no-op·正常 R7 CONFIRMED（零回归）', () => {
  // 既有 19 测试 + GV 向量均不设 claimType → guard 短路 → 字节级零回归的核心保证。
  const input = baseKernelInput({
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('FAIL'),
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
});

test('R-causal guard: claimType=causal 但 confoundingGateResult 缺省 → no-op·正常 R7 CONFIRMED', () => {
  // caller 未提供 confoundingGateResult（未做混杂裁决）→ 门短路 → 落正常 R7。
  const input = baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
});
