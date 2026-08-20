/**
 * Verdict Kernel V2 单测 —— APPENDIX_B_GOLDEN 12 个 P0 golden vectors（GV-01..GV-12）+ 辅助边界 case。
 *
 * 权威：（R0-R9 优先级 SSOT）+ §2（GV-01..GV-12 详细规范）
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
import {
  decideFiveValueVerdict,
  evaluateScope,
  evaluateStatistics,
  flagExecutionFingerprintMagnitudeMismatch,
} from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { StatisticalResult, VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
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

test('GV-03 HARKing 纵深: measurementCutoff 早于 freeze.timestamp → UNTESTED (R1·kernel 内 compileFec #10)', () => {
  // defense-in-depth：kernel R1 内 compileFec 经 measurementCutoff 通道跑 #10 HARKing（与 orchestrator
  // mandate gate orchestrator.ts:146 同条件）。此前 VerdictKernelInput 无该通道——直调 kernel 且不经
  // mandate gate 的路径对 HARKing 不可见。baseKernelInput FEC freeze.timestamp='2020-01-01'（fixtures.ts:104）。
  const out = decideFiveValueVerdict(baseKernelInput({ measurementCutoff: '2019-06-01T00:00:00Z' }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');
});

test('GV-03 HARKing 纵深负控: measurementCutoff 晚于 freeze.timestamp → #10 不触发 → CONFIRMED (R7)', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ measurementCutoff: '2021-01-01T00:00:00Z' }));
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
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

// ---------------------------------------------------------------------------
// EVID-CONTRADICTION-001 · 均值掩盖锁（GV-13/GV-14）——冲突不得被多数票/均值稀释
// ---------------------------------------------------------------------------

test('GV-13: 10 supports + 1 refute（均显著）→ 仍 INCONCLUSIVE（多数票不得覆盖冲突）', () => {
  // 均值口径下净效应 +0.42 会被解读为支持；布尔冲突检测使多数票无效。
  const statistics: readonly StatisticalResult[] = [
    {
      testId: 'refuting-outlier',
      status: 'ran',
      effectDirection: 'refutes',
      pValue: 0.01,
      adjustedPValue: 0.01,
      effectSizeObserved: -0.4,
      confidenceInterval: [-0.7, -0.1],
      assumptionDiagnostics: [],
    },
    ...Array.from({ length: 10 }, (_, i): StatisticalResult => ({
      testId: `supporting-${i}`,
      status: 'ran',
      effectDirection: 'supports',
      pValue: 0.01,
      adjustedPValue: 0.01,
      effectSizeObserved: 0.46,
      confidenceInterval: [0.2, 0.7] as const,
      assumptionDiagnostics: [],
    })),
  ];
  const out = decideFiveValueVerdict(baseKernelInput({ statistics }));
  assert.equal(out.verdict, 'INCONCLUSIVE', '1 条显著反证必须阻断 CONFIRMED——不得被 10:1 多数票均值掩盖');
  assert.equal(out.decisiveRuleId, 'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE');
});

test('GV-14: 相反效应量 (+0.8 / -0.7) 双双显著 → conflicting（均值≈0.05 不得产生干净结论）', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'plus-arm',
        status: 'ran',
        effectDirection: 'supports',
        pValue: 0.001,
        adjustedPValue: 0.001,
        effectSizeObserved: 0.8,
        confidenceInterval: [0.5, 1.1],
        assumptionDiagnostics: [],
      },
      {
        testId: 'minus-arm',
        status: 'ran',
        effectDirection: 'refutes',
        pValue: 0.002,
        adjustedPValue: 0.002,
        effectSizeObserved: -0.7,
        confidenceInterval: [-1.0, -0.4],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'INCONCLUSIVE', '符号相反的双臂不得经均值抵消产生 CONFIRMED/REFUTED');
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

// ── 2026-08-20 mutation 盲区补杀（全位点跑出 54.5% 存活的偿还·逐状态 fixture）──
// 本节 helpers：复用 GV-01 的 FEC 形状（fecId/claimId/metric/statPlan/threshold/powerPlan）。
function baseFecOverrides(): Partial<FecContractV2> {
  const sample = baseKernelInput();
  if (sample.fec === null) return {};
  return {
    fecId: sample.fec.fecId,
    claimId: sample.fec.claimId,
    measurableImplication: sample.fec.measurableImplication,
    metric: sample.fec.metric,
    statisticalPlan: sample.fec.statisticalPlan,
    direction: sample.fec.direction,
    threshold: sample.fec.threshold,
    ...(sample.fec.powerPlan !== undefined ? { powerPlan: sample.fec.powerPlan } : {}),
  };
}
function primaryStat(overrides: Partial<StatisticalResult> = {}): StatisticalResult {
  return {
    testId: 'bls_power',
    status: 'ran',
    effectDirection: 'supports',
    pValue: 0.003,
    adjustedPValue: 0.003,
    effectSizeObserved: 0.62,
    confidenceInterval: [0.21, 0.95],
    assumptionDiagnostics: [],
    ...overrides,
  };
}
// 根因：GV-01..GV-12 覆盖主路径，但 R7/R8 组合布尔的状态反相（underpowered/
// insufficient/fail/warn/skipped/flags 非空/derivationForm 失配）大多未测。

test('mutation 盲区: identifierClaims unresolved → UNTESTED / not_found → REFUTED（R-identifier 两向）', () => {
  const unresolved = decideFiveValueVerdict(baseKernelInput({
    identifierClaims: [{ kind: 'doi', value: '10.1/x', resolutionStatus: 'unresolved', harnessVerifiedSource: false }],
  }));
  assert.notEqual(unresolved.verdict, 'CONFIRMED', 'unresolved 不得 CONFIRMED（环境故障非伪造·UNTESTED 优先）');
  assert.equal(unresolved.verdict, 'UNTESTED');
  const fabricated = decideFiveValueVerdict(baseKernelInput({
    identifierClaims: [{ kind: 'doi', value: '10.1/x', resolutionStatus: 'not_found', harnessVerifiedSource: false }],
  }));
  assert.equal(fabricated.verdict, 'REFUTED', 'not_found → 伪造信号 → REFUTED');
});

test('mutation 盲区: evidenceSufficiency.insufficient → 非 CONFIRMED（=== sufficient 位点）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({
    evidenceSufficiency: { status: 'insufficient', powerStatus: 'adequate' },
  }));
  assert.notEqual(out.verdict, 'CONFIRMED', 'insufficient 不得 CONFIRMED（变异 === 后 insufficient 也放行）');
});

test('mutation 盲区: powerStatus=underpowered 双向（显著→CONFIRMED·不显著→R8 INCONCLUSIVE）', () => {
  // 现行语义快照：统计显著本身证明 power 足够（underpowered 只能解释 null 结果），
  // 故 R7 全绿 + underpowered → CONFIRMED；不显著 + underpowered → R8 INCONCLUSIVE。
  const significant = decideFiveValueVerdict(baseKernelInput({
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
  }));
  assert.equal(significant.verdict, 'CONFIRMED', '显著结果不受 powerStatus 贬低（R7 先于 R8）');
  const nullResult = decideFiveValueVerdict(baseKernelInput({
    statistics: [primaryStat({ pValue: 0.5, adjustedPValue: 0.5 })],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
  }));
  assert.equal(nullResult.verdict, 'INCONCLUSIVE', 'null 结果 + underpowered → R8（=== underpowered 位点）');
});

test('mutation 盲区: antiTheater fail → UNTESTED；warn → INCONCLUSIVE（severity 两向）', () => {
  const failOut = decideFiveValueVerdict(baseKernelInput({
    antiTheaterFindings: [{ kind: 'seed-cherry-picking', severity: 'fail' }],
  }));
  assert.equal(failOut.verdict, 'UNTESTED', 'fail 发现 → UNTESTED');
  const warnOut = decideFiveValueVerdict(baseKernelInput({
    antiTheaterFindings: [{ kind: 'seed-cherry-picking', severity: 'warn' }],
  }));
  assert.equal(warnOut.verdict, 'INCONCLUSIVE', 'warn 发现 → R8 INCONCLUSIVE');
});

test('mutation 盲区: integrityFlags 非空 → 非 CONFIRMED（R7 flags 门·length === 0 位点）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({
    integrityFlags: ['p_hacking_risk'],
  }));
  assert.notEqual(out.verdict, 'CONFIRMED', 'integrityFlags 非空不得 CONFIRMED');
});

test('mutation 盲区: 全 skipped 统计 → 非 CONFIRMED（every skipped 位点）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [{
      testId: 'bls_power', status: 'skipped', effectDirection: 'supports',
      assumptionDiagnostics: [],
    }],
  }));
  assert.notEqual(out.verdict, 'CONFIRMED', '全 skipped 不得 CONFIRMED');
});

test('mutation 盲区: effectSize < mde → 非 CONFIRMED（MDE 门两向）', () => {
  // powerPlan.minimumDetectableEffect=0.5 > effectSize=0.2 → R7 效应量门拒。
  const fec = makeValidFec(baseFecOverrides());
  const out = decideFiveValueVerdict(baseKernelInput({
    fec: { ...fec, powerPlan: { targetPower: 0.8, minimumDetectableEffect: 0.5, sampleSize: 120, powerMethod: 'ttest', alphaAssumed: 0.0125 } },
    statistics: [primaryStat({ effectSizeObserved: 0.2 })],
  }));
  assert.notEqual(out.verdict, 'CONFIRMED', '效应量低于 MDE 不得 CONFIRMED（mde===undefined 位点变异会跳过该门）');
  // 精确落点：R7 拒后由 R8 c3（效应量不足）接住——!==→=== 变异会让 c3 静默失效落 NO_DECISION_PATH。
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL', 'effectSize < mde 单条款 → R8');
});

test('mutation 盲区: derivationForm 失配/匹配/缺省三向（formMismatch 链）', () => {
  const withExpected = (expected: 'literal' | 'derived') => {
    const fec = makeValidFec(baseFecOverrides());
    return { ...fec, statisticalPlan: { ...fec.statisticalPlan, expectedDerivationForm: expected } };
  };
  // 失配：期望 literal、实际 derived → formMismatch → 降级非 CONFIRMED
  const mismatch = decideFiveValueVerdict(baseKernelInput({
    fec: withExpected('literal'),
    statistics: [primaryStat({ derivationForm: 'derived' })],
  }));
  assert.notEqual(mismatch.verdict, 'CONFIRMED', 'derivationForm 失配（值相等也降级）');
  // 全匹配：期望 literal、实际 literal → 通过
  const match = decideFiveValueVerdict(baseKernelInput({
    fec: withExpected('literal'),
    statistics: [primaryStat({ derivationForm: 'literal' })],
  }));
  assert.equal(match.verdict, 'CONFIRMED', '全匹配必须放行（!== expectedForm 位点）');
  // 统计侧缺省（无 derivationForm）+ 期望存在 → 不算失配
  const absent = decideFiveValueVerdict(baseKernelInput({
    fec: withExpected('literal'),
  }));
  assert.equal(absent.verdict, 'CONFIRMED', '统计侧缺省 derivationForm 不算失配（!== undefined 位点）');
});

test('mutation 盲区: 无 powerPlan → mde undefined 路径（report.effectSizeSufficient=null）', () => {
  const fec = makeValidFec(baseFecOverrides());
  const { powerPlan: _drop, ...fecNoPower } = fec;
  const out = decideFiveValueVerdict(baseKernelInput({
    fec: fecNoPower,
  }));
  assert.equal(out.verdict, 'CONFIRMED', '无 MDE 约束时显著支持仍 CONFIRMED（mde===undefined 放行）');
});

test('mutation 盲区: studyDesign 提供时输出证据质量层（=== undefined 位点）', () => {
  const withDesign = decideFiveValueVerdict(baseKernelInput({
    studyDesign: 'rct',
  }));
  const without = decideFiveValueVerdict(baseKernelInput());
  // 提供与缺省的裁决必须一致（透明度层不进 verdict）
  assert.equal(withDesign.verdict, without.verdict, 'META 层零回归');
});

test('mutation 盲区: protocolDeviations alpha_rewrite/metric_swap 附加 risk 旗标（d.kind 组合）', () => {
  // critical 偏离 → R3 UNTESTED；此处测非 critical alpha_rewrite 附加 harking_risk 后的 R7 拒绝路径
  // R3 critical 偏离 → UNTESTED；alpha_rewrite/metric_swap 附加对应风险旗标进输出
  const alphaRewrite = decideFiveValueVerdict(baseKernelInput({
    protocolDeviations: [{ kind: 'alpha_rewrite', severity: 'critical', details: 'alpha changed post-hoc' }],
  }));
  assert.equal(alphaRewrite.verdict, 'UNTESTED', 'critical 偏离 → R3 UNTESTED');
  assert.ok(
    alphaRewrite.integrityFlags.includes('harking_risk'),
    `alpha_rewrite 须附加 harking_risk 旗标（输出 flags: ${JSON.stringify(alphaRewrite.integrityFlags)}）`,
  );
  const metricSwap = decideFiveValueVerdict(baseKernelInput({
    protocolDeviations: [{ kind: 'metric_swap', severity: 'critical', details: 'metric swapped' }],
  }));
  assert.equal(metricSwap.verdict, 'UNTESTED');
  assert.ok(metricSwap.integrityFlags.includes('p_hacking_risk'), 'metric_swap 须附加 p_hacking_risk');
  // 对照：其他 critical 偏离不得误加 harking_risk（and→or 变异会误加 → 本断言杀之）
  const lateExclusion = decideFiveValueVerdict(baseKernelInput({
    protocolDeviations: [{ kind: 'late_exclusion', severity: 'critical', details: 'excluded post-hoc' }],
  }));
  assert.equal(lateExclusion.verdict, 'UNTESTED');
  assert.ok(!lateExclusion.integrityFlags.includes('harking_risk'), 'late_exclusion 不得误加 harking_risk');
  // alpha_rewrite 只加 harking_risk，不得误加 p_hacking_risk（&&→|| 变异会误加 → 杀之）
  assert.ok(!alphaRewrite.integrityFlags.includes('p_hacking_risk'), 'alpha_rewrite 不得误加 p_hacking_risk');
});

// ── 2026-08-20 mutation 补杀批次 2（全位点 47.0% 存活的剩余长尾·逐位点断言）──

test('mutation 补杀: R0/R1/R2 早退输出 statisticalReport/scopeReport 须为空报告（字面量 false 位点）', () => {
  // 早退路径（R0 schema / R1 fec null / R2 无绑定）共用 emptyStat/emptyScope 字面量；
  // 变异其中任一 false → true 会污染早退输出的透明度报告——逐字段锁死。
  const earlyExits = [
    decideFiveValueVerdict(baseKernelInput({ fec: null })), // R1
    decideFiveValueVerdict(baseKernelInput({ datasetBindings: [] })), // R2
    decideFiveValueVerdict(baseKernelInput({
      fec: { ...makeValidFec(baseFecOverrides()), contractVersion: 'FEC/1.0' as 'FEC/2.0' } as FecContractV2,
    })), // R0
  ];
  for (const out of earlyExits) {
    assert.deepEqual({ ...out.statisticalReport }, {
      refutes: false, supports: false, conflicting: false, underpowered: false,
      effectiveDirection: 'unknown', primaryAdjustedPValue: null, primaryEffectSize: null,
      primaryConfidenceInterval: null, hasWarnAssumption: false, formMismatch: false,
    }, '早退 statisticalReport 须为 emptyStat 原样（任一 false 变 true 都是透明度污染）');
    assert.deepEqual({ ...out.scopeReport }, {
      isDegraded: false, coverage: 'none', impactedScopeEdges: [], scopeSlipText: null,
      hasSameScopeRefutation: false,
    }, '早退 scopeReport 须为 emptyScope 原样');
  }
});

test('mutation 补杀: evaluateStatistics/evaluateScope 直调 fec=null 分支输出空报告', () => {
  // 内核主路径 R1 早退先于 evaluate* 调用，fec=null 分支只能经导出函数直达——
  // 该分支的字面量 false 位点与 emptyStat 是独立副本，须单独锁定。
  const nullFecInput = baseKernelInput({ fec: null });
  assert.deepEqual({ ...evaluateStatistics(nullFecInput) }, {
    refutes: false, supports: false, conflicting: false, underpowered: false,
    effectiveDirection: 'unknown', primaryAdjustedPValue: null, primaryEffectSize: null,
    primaryConfidenceInterval: null, hasWarnAssumption: false, formMismatch: false,
  }, 'evaluateStatistics(fec=null) 须返回空统计报告');
  assert.deepEqual({ ...evaluateScope(nullFecInput) }, {
    isDegraded: false, coverage: 'none', impactedScopeEdges: [], scopeSlipText: null,
    hasSameScopeRefutation: false,
  }, 'evaluateScope(fec=null) 须返回空 scope 报告');
});

test('mutation 补杀: verdictLte 容差边界精确命中（a === b + 1e-7 → 仍 ≤ → CONFIRMED）', () => {
  // 容差语义：a ≤ b + tol 的等号分支。测试侧用与内核相同的双精度表达式（0.0125 + 1e-7）
  // 构造精确命中；变异 <= 为 < 后该统计不再显著 → R8，与断言冲突。
  const edge = 0.0125 + 1e-7;
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [primaryStat({ pValue: edge, adjustedPValue: edge })],
  }));
  assert.equal(out.verdict, 'CONFIRMED', `adjustedP === alpha + tol（${edge}）须视为 ≤ → CONFIRMED（容差等号分支）`);
});

test('mutation 补杀: verdictGte 容差边界精确命中（effect === mde − 1e-7 → 仍 ≥ → CONFIRMED）', () => {
  // 容差语义：a ≥ b − tol 的等号分支。0.2 − 1e-7 与内核 b − VERDICT_FLOAT_TOLERANCE 位相同。
  const edge = 0.2 - 1e-7;
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [primaryStat({ effectSizeObserved: edge })],
  }));
  assert.equal(out.verdict, 'CONFIRMED', `effectSize === mde − tol（${edge}）须视为 ≥ → CONFIRMED（容差等号分支）`);
});

test('mutation 补杀: R-EF 直测（executionFingerprintMismatch=true → DEGRADED_SCOPE + isDegraded + 非空 slipText）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ executionFingerprintMismatch: true }));
  assert.equal(out.verdict, 'DEGRADED_SCOPE', '复算资源指纹量级发散 → R_EXECUTION_FINGERPRINT');
  assert.equal(out.decisiveRuleId, 'R_EXECUTION_FINGERPRINT_MISMATCH');
  assert.equal(out.reasonCodes[0], 'R_EXECUTION_FINGERPRINT_MISMATCH');
  assert.equal(out.scopeReport.isDegraded, true, 'R-EF 的 scopeReport.isDegraded 须显式 true');
  assert.ok(out.scopeReport.scopeSlipText !== null && out.scopeReport.scopeSlipText.length > 0,
    'recordVerdict 契约：DEGRADED_SCOPE 须带非空 scopeSlipText');
});

test('mutation 补杀: ruleTrace[0].triggered 须为 true（决定性规则触发标记）', () => {
  const out = decideFiveValueVerdict(baseKernelInput());
  assert.equal(out.ruleTrace.length, 1);
  const trace = out.ruleTrace[0];
  assert.ok(trace !== undefined, 'ruleTrace[0] 须存在');
  assert.equal(trace.ruleId, 'R7_PRIMARY_TEST_CONFIRMS');
  assert.equal(trace.triggered, true, '触发记录的 triggered 须为 true（false 位点变异）');
});

test('mutation 补杀: scopeReport.coverage 三向（full / partial / none·eq 位点）', () => {
  const full = decideFiveValueVerdict(baseKernelInput());
  assert.equal(full.scopeReport.coverage, 'full', 'within 绑定 + 无 drift → coverage=full');
  const partial = decideFiveValueVerdict(baseKernelInput({
    datasetBindings: [{
      datasetId: 'D1', contentHash: 'a'.repeat(64), sourceAnchor: { resolved: true },
      scopeCoverage: { dimension: 'population', value: 'adults 25-40', relation: 'partial' },
    }],
  }));
  assert.equal(partial.scopeReport.coverage, 'partial', 'scope 窄化 → coverage=partial');
  const none = decideFiveValueVerdict(baseKernelInput({ datasetBindings: [] }));
  assert.equal(none.scopeReport.coverage, 'none', '空绑定 → coverage=none');
});

test('mutation 补杀: 空 statistics → NO_DECISION_PATH（非 R9·length>0 guard）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ statistics: [] }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'NO_DECISION_PATH', 'statistics 空 → 不得落 R9（every([]) 恒真陷阱）');
});

test('mutation 补杀: statisticalReport.underpowered 输出字段（powerStatus 投影 eq 位点）', () => {
  const under = decideFiveValueVerdict(baseKernelInput({
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
  }));
  assert.equal(under.statisticalReport.underpowered, true, 'powerStatus=underpowered 须投影到 statisticalReport.underpowered');
  const adequate = decideFiveValueVerdict(baseKernelInput());
  assert.equal(adequate.statisticalReport.underpowered, false, 'powerStatus=adequate → underpowered=false');
});

test('mutation 补杀: 反证跨阈值但不同 scope → hasSameScopeRefutation=false → R4 保持（&&→|| 位点）', () => {
  // crossesRefutationThreshold=true + sameScope=false：原版 some()=false → R4 照常降级；
  // 变异 &&→|| 后 some()=true → R4 条件（isDegraded && !hasSameScopeRefutation）失效 → 漏放行到 R7。
  const out = decideFiveValueVerdict(baseKernelInput({
    datasetBindings: [{
      datasetId: 'D1', contentHash: 'a'.repeat(64), sourceAnchor: { resolved: true },
      scopeCoverage: { dimension: 'population', value: 'adults 25-40', relation: 'partial' },
    }],
    contradictionSet: [{ crossesRefutationThreshold: true, sameScope: false }],
  }));
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.decisiveRuleId, 'R4_SCOPE_MISMATCH_NONCRITICAL', '不同 scope 的反证不得触发 hasSameScopeRefutation 升级');
  assert.equal(out.scopeReport.hasSameScopeRefutation, false);
});

test('mutation 补杀: 无 adjustedPValue 的 refutes 统计不显著 → 不触发 R6（significant && 位点）', () => {
  // adjustedPValue undefined 的统计必须被 significant 过滤排除（&&→|| 会把 undefined-p
  // 也算显著 → refutes=true → R6 REFUTED）。保留 GV-01 主统计（supports 显著），
  // 追加无 p 的 refutes 副统计：原版 → R7 CONFIRMED；变异 → R6 REFUTED。
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [
      primaryStat(),
      {
        testId: 'secondary-no-p', status: 'ran', effectDirection: 'refutes',
        effectSizeObserved: -0.4, confidenceInterval: [-0.7, -0.1], assumptionDiagnostics: [],
      },
    ],
  }));
  assert.equal(out.verdict, 'CONFIRMED', '无 p 值的 refutes 统计不算显著反证（不得阻断 GV-01 主统计的 R7）');
});

test('mutation 补杀: R8 单条件精确触发（仅 p>alpha·neq/and 位点）', () => {
  // 仅第 1 条款（p>alpha）成立：power adequate / effect≥mde / 无 warn / 无 flags。
  // 断言落 R8 → 杀 !==→===（变异后该条款 false → 落 NO_DECISION_PATH）。
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [primaryStat({ pValue: 0.5, adjustedPValue: 0.5 })],
  }));
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL', 'p>alpha 单条件 → R8（不得静默落 NO_DECISION_PATH）');
});

test('mutation 补杀: p 显著 + status=insufficient → NO_DECISION_PATH 非 R8（R8 c1 的 ||→&& 位点）', () => {
  // p≤alpha（显著）时 R8 第 1 条款 false；insufficient 不属于 R8 条款 → 不得落 R8。
  // 变异 c1 的 &&→|| 后显著 p 也触发 R8 → 与断言冲突。
  const out = decideFiveValueVerdict(baseKernelInput({
    evidenceSufficiency: { status: 'insufficient', powerStatus: 'adequate' },
  }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'NO_DECISION_PATH', '显著 p + insufficient → 不得 R8（R8 只认五条款）');
});

test('mutation 补杀: underpowered 单条款 R8（R8 c2 的 ||→&& 位点）', () => {
  // p 显著（c1 false）+ status=insufficient（R7 拒）+ powerStatus=underpowered（c2 单条成立）→ R8。
  // 变异 c2 行 ||→&& 后 (c1&&c2)=false 且其余 false → 落 NO_DECISION_PATH → 与断言冲突。
  const out = decideFiveValueVerdict(baseKernelInput({
    evidenceSufficiency: { status: 'insufficient', powerStatus: 'underpowered' },
  }));
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL', 'underpowered 单条款 → R8');
});

// ── mutation 补杀批次 3（多文件复跑后剩余 15 位点中的可杀 9 个）──

test('mutation 补杀: p>alpha 的 refutes 统计不显著（significant &&→|| 位点·defined-p 分支）', () => {
  // adjustedPValue 存在但 > alpha（不显著）的 refutes 统计必须被排除：
  // &&→|| 变异后（true || verdictLte(0.5, α)=false → true）误判显著 → R6 REFUTED。
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [
      primaryStat(),
      {
        testId: 'secondary-ns-refutes', status: 'ran', effectDirection: 'refutes',
        pValue: 0.5, adjustedPValue: 0.5,
        effectSizeObserved: -0.4, confidenceInterval: [-0.7, -0.1], assumptionDiagnostics: [],
      },
    ],
  }));
  assert.equal(out.verdict, 'CONFIRMED', '不显著（p>α）的 refutes 统计不得触发 R6');
});

test('mutation 补杀: R8 c3 效应量缺失（effectSize=null 且 mde 有 → 不得仅凭 null 触发 R8）', () => {
  // primary 无 effectSizeObserved：R7 因 effectSize=null 拒（c…见 r7Pass），但 R8 c3
  // 要求 effectSize !== null 才比较 → 原版 c3 false → 落 NO_DECISION_PATH；
  // !==→=== 变异后 null===null 且 !verdictGte(null→0 ≥ mde−tol)=true → 误触 R8。
  const out = decideFiveValueVerdict(baseKernelInput({
    statistics: [{
      testId: 'bls_power', status: 'ran', effectDirection: 'supports',
      pValue: 0.003, adjustedPValue: 0.003, assumptionDiagnostics: [],
    }],
  }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'NO_DECISION_PATH', 'effectSize 缺失不得静默当 0 参与比较（c3 null guard）');
});

test('mutation 补杀: r7Gate.effectSizeSufficient 三态（false·null）+ 无 powerPlan 时 overallPassed=true', () => {
  // evaluateR7Gate 镜像层。effectSizeSufficient=false 须用「非 null 且 < mde」场景：
  // null 场景下 &&→|| 两分支均 false（verdictGte(null→0, mde)=false）不可区分。
  const belowMde = decideFiveValueVerdict(baseKernelInput({
    statistics: [primaryStat({ effectSizeObserved: 0.1 })], // 0.1 < mde 0.2
  }));
  assert.equal(belowMde.decisionTrace?.r7Gate?.effectSizeSufficient, false,
    'effectSize=0.1 < mde=0.2 → r7Gate.effectSizeSufficient=false（&&→|| 变异会误判 true）');
  const fec = makeValidFec(baseFecOverrides());
  const { powerPlan: _drop, ...fecNoPower } = fec;
  const noMde = decideFiveValueVerdict(baseKernelInput({ fec: fecNoPower }));
  assert.equal(noMde.decisionTrace?.r7Gate?.effectSizeSufficient, null, '无 powerPlan → effectSizeSufficient=null（门跳过）');
  assert.equal(noMde.decisionTrace?.r7Gate?.overallPassed, true, '(null ?? true) → overallPassed 不得被贬为 false');
});

test('mutation 补杀: R-causal FAIL 的 scopeReport.isDegraded 须显式 true（透明度位点）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({
    claimType: 'causal',
    evidenceBasis: 'observational_only',
    confoundingGateResult: gateResult('FAIL'),
  }));
  assert.equal(out.verdict, 'DEGRADED_SCOPE');
  assert.equal(out.scopeReport.isDegraded, true, 'R-causal 降级的 scopeReport.isDegraded 须 true');
  assert.ok(out.scopeReport.scopeSlipText !== null && out.scopeReport.scopeSlipText.length > 0,
    'recordVerdict 契约：DEGRADED_SCOPE 须带非空 rationale');
});

test('mutation 补杀: decisionTrace.metrics 的 antiTheater fail/warn 计数（filter eq 位点）', () => {
  const out = decideFiveValueVerdict(baseKernelInput({
    antiTheaterFindings: [
      { kind: 'proof_tamper', severity: 'fail' },
      { kind: 'seed-cherry-picking', severity: 'warn' },
      { kind: 'heterogeneity', severity: 'warn' },
    ],
    // fail 会先触发 ANTI_THEATER_FAIL UNTESTED——但 decisionTrace 仍构建（透明度层不依赖 verdict）。
  }));
  assert.equal(out.decisionTrace?.metrics.antiTheaterFailCount, 1, 'fail 计数=1');
  assert.equal(out.decisionTrace?.metrics.antiTheaterWarnCount, 2, 'warn 计数=2');
});

test('mutation 补杀: flagExecutionFingerprintMagnitudeMismatch 量级边界（ratio=10 不触发·未测量维不触发·单维发散触发）', () => {
  const fp = (wallMs: number, cpuMs: number, peakRssKb: number) => ({ wallMs, cpuMs, peakRssKb });
  // ratio 恰好 === 10（100/10）：严格大于才触发（> → >= 变异会误触发）。
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(fp(100, 1, 1), fp(10, 1, 1)),
    false,
    'ratio=10（等于阈值）不触发——量级阈值为严格大于',
  );
  // a=0（未测量）维度：不可比 → 不触发（<=0 提前返回 false；< 变异后 0/50=Infinity 会误触发）。
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(fp(0, 1, 1), fp(50, 1, 1)),
    false,
    'wallMs=0（未测量）不得触发（0 维度不可比）',
  );
  // 单维发散（其余正常）：必须触发（|| → && 变异会把单维发散漏放）。
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(fp(100, 1, 1), fp(1, 1, 1)),
    true,
    '单 wallMs 维发散（100x）→ 触发',
  );
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(fp(1, 100, 1), fp(1, 1, 1)),
    true,
    '单 cpuMs 维发散（100x）→ 触发（三行 || 各自独立）',
  );
});
