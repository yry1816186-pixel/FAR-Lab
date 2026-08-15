/**
 * anti_theater integration —— W3.5b 集成测试：证明 runAntiTheaterLint → kernel adapter →
 * VerdictKernelInput.antiTheaterFindings，以及 runAntiTheaterLint → SealProofEnvelopeV2Input.
 * antiTheaterReport → sealProofEnvelopeV2/RULE-PE-007 三段组合契约（无生产编排器时的组合证明）。
 *
 * Authority: 任务 #10 计划 W3.5b（集成 kernel_adapter + sealer）+ APPENDIX_A_TYPES.md §7.1
 *            （VerdictKernelInput.antiTheaterFindings 消费投影型 KernelAntiTheaterFinding）
 *            APPENDIX_E_ANTI_THEATER.md §1（runAntiTheaterLint 编排器·D2 双轴纪律）
 *            04_PROOF_ENVELOPE_AND_VERIFIER.md §2.4 RULE-PE-007（conclusion_matches_anti_theater）。
 *
 * 为什么是集成测试而非生产编排器：
 *   - V2 sealer（src/proof_envelope/v2/sealer.ts）是纯组装器——antiTheaterReport 作为
 *     SealProofEnvelopeV2Input 的输入字段（类型契约），调用者负责运行 lint 并注入报告，
 *     sealer 本身不调用 runAntiTheaterLint（职责分离·antiTheaterReport 作为输入是 04 §2 的契约）。
 *   - verdict kernel 已消费 KernelAntiTheaterFinding（verdict_kernel_v2.ts:285 经 adapter 投影），
 *     GV-10（verdict_kernel_v2.test.ts）单测 kernel 对 severity='fail' 的反应；adapter 单测投影映射。
 *   - 本测试填补的唯一集成缺口：REAL runAntiTheaterLint 输出（来自 golden vector）经 REAL adapter
 *     投影后，能否被 kernel 与 V2 sealer 端到端正确消费（不是各段孤立正确，而是组合正确）。
 *   - 生产端到端编排器（FEC → kernel → lint → seal）属任务 #11（far verify CLI）领域，此处不臆造
 *     （反幻觉/证据驱动铁律：不声称未实现的编排路径）。
 *
 * 三段组合断言：
 *   A. lint→adapter→kernel：gv-posthoc-threshold-01 真实报告（hasFail=true）→ toKernelFindings →
 *      注入 VerdictKernelInput.antiTheaterFindings → decideFiveValueVerdict → UNTESTED (ANTI_THEATER_FAIL)；
 *      对照同 input 清空 antiTheaterFindings → CONFIRMED (R7)，证明翻盘由投影型 finding 驱动。
 *   B. lint→sealer：真实报告注入 SealProofEnvelopeV2Input.antiTheaterReport → sealProofEnvelopeV2 →
 *      RULE-PE-007 outcome=FAIL（verdict=CONFIRMED + hasFail=true）；proofHash 仍确定性产出（报告进 hash 流）。
 *   C. happy path：makeCleanBaseInput（干净·过全部 detector）→ 报告 hasFail=false/canSealConfirmed=true →
 *      kernel CONFIRMED (R7) + RULE-PE-007 PASS（无误报·零容忍反 theater F1 不误伤合法 CONFIRMED）。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。所有断言忠于 A §7.1 + 04 §2.4。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { toKernelFindings } from '../../src/anti_theater/adapters/kernel_adapter.ts';
import { getGoldenVector, makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import type { ProofCheckResultV2 } from '../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';

/**
 * 构造 GV-01 风格合法 VerdictKernelInput（complete support·默认落 CONFIRMED R7）。
 * 镜像 tests/falsifiability/verdict_kernel_v2.test.ts 的 baseKernelInput（不导出·本测试局部复用同形），
 * 以便在 antiTheaterFindings 注入前后形成可对照的 kernel 输入。
 */
function baseKernelInput(overrides: Partial<VerdictKernelInput> = {}): VerdictKernelInput {
  const fec: FecContractV2 = makeValidFec({
    fecId: 'FEC-INTEGRATION-01',
    claimId: 'C-INTEGRATION-0001',
    measurableImplication: 'Model M achieves BLS power > baseline on dataset D',
    metric: { ...baseMetric(), metricKey: 'bls_power', description: 'BLS power' },
    statisticalPlan: {
      ...baseStatPlan(),
      primaryMetric: 'bls_power',
      alpha: 0.0125,
      effectDirection: 'greater',
      multipleTestingCorrection: 'bonferroni',
    },
    direction: 'greater',
    threshold: { value: 0, unit: 'unitless', thresholdSemantics: 'gt', preregistered: true },
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

/** 在 checks 中按 ruleId 定位单条结果（noUncheckedIndexedAccess 防御性判空）。 */
function findCheck(checks: readonly ProofCheckResultV2[], ruleId: string): ProofCheckResultV2 | null {
  for (const c of checks) {
    if (c.ruleId === ruleId) {
      return c;
    }
  }
  return null;
}

// ===== A. lint → adapter → kernel =====

test('integration A: runAntiTheaterLint 真实报告经 toKernelFindings 投影 → kernel 翻盘 UNTESTED (ANTI_THEATER_FAIL)', () => {
  // gv-posthoc-threshold-01：FEC threshold.value 篡改 → frozen thresholdHash 失配 → outcome FAIL。
  const gv = getGoldenVector('gv-posthoc-threshold-01');
  const report = runAntiTheaterLint(gv.build());

  // 前置：该向量确产出 FAIL（hasFail=true）——证明下游翻盘由真实 fail 驱动，非测试构造的桩。
  assert.equal(report.hasFail, true, 'gv-posthoc-threshold-01 须产出 hasFail=true（outcome FAIL）');

  // 1. adapter 投影：存储型 findings → kernel 投影型 KernelAntiTheaterFinding。
  const projected = toKernelFindings(report.findings);
  const hasFailSeverity = projected.some((f) => f.severity === 'fail');
  assert.ok(
    hasFailSeverity,
    `投影后须含 severity='fail'（kernel verdict_kernel_v2.ts:285 消费此信号），got [${projected.map((f) => f.severity).join(', ')}]`,
  );

  // 2. 对照：同合法 input（CONFIRMED R7）清空 antiTheaterFindings → CONFIRMED（证明基线不翻盘）。
  const baseline = decideFiveValueVerdict(baseKernelInput());
  assert.equal(baseline.verdict, 'CONFIRMED', '基线（无 anti-theater finding）须落 CONFIRMED R7');

  // 3. 注入投影型 fail finding → kernel 翻盘 UNTESTED (ANTI_THEATER_FAIL·§7.3 line 852)。
  const blocked = decideFiveValueVerdict(
    baseKernelInput({ antiTheaterFindings: projected }),
  );
  assert.equal(blocked.verdict, 'UNTESTED');
  assert.equal(blocked.decisiveRuleId, 'ANTI_THEATER_FAIL');
  assert.deepEqual([...blocked.reasonCodes], ['ANTI_THEATER_FAIL']);
  assert.equal(blocked.untestedReason, 'ANTI_THEATER_FAIL');
});

// ===== B. lint → sealer（RULE-PE-007）=====

test('integration B: runAntiTheaterLint 真实报告注入 antiTheaterReport → sealProofEnvelopeV2 RULE-PE-007 FAIL', () => {
  const gv = getGoldenVector('gv-posthoc-threshold-01');
  const report = runAntiTheaterLint(gv.build());
  assert.equal(report.hasFail, true, '前置：报告须 hasFail=true 才能触发 RULE-PE-007 FAIL 分支');

  // makeValidEnvelopeV2Core 基线 verdict=CONFIRMED + 干净 antiTheaterReport；注入真实被攻击报告。
  const input = makeValidEnvelopeV2Core({
    antiTheaterReport: report,
    // verdictTrace.verdict 保持 base CONFIRMED → hasFail=true + CONFIRMED → RULE-PE-007 FAIL（04 §2.4）。
  });

  const { envelope, checks } = sealProofEnvelopeV2(input);

  // 1. antiTheaterReport 作为 proofHash 输入字段流经 computeProofHashV2 → proofHash 仍确定性产出（64-hex）。
  assert.match(envelope.proofHash, /^[0-9a-f]{64}$/, 'proofHash 须 64-hex（报告进 hash 流不破坏确定性）');

  // 2. RULE-PE-007：hasFail=true + verdict=CONFIRMED → FAIL（anti-theater F1·conclusion_matches_anti_theater）。
  const rule = findCheck(checks, 'RULE-PE-007');
  assert.ok(rule, 'checks 须含 RULE-PE-007');
  assert.equal(rule?.outcome, 'FAIL');
  assert.match(
    rule?.detail ?? '',
    /hasFail=true/,
    'FAIL detail 须披露 hasFail=true（透明·反 theater F1 问责可追溯）',
  );

  // 3. RULE-PE-009：findings 透明（每条 message 非空）—— 真实报告须过透明性门。
  const transparency = findCheck(checks, 'RULE-PE-009');
  assert.ok(transparency, 'checks 须含 RULE-PE-009');
  assert.notEqual(transparency?.outcome, 'FAIL', 'RULE-PE-009 不应 FAIL（真实 findings message 非空）');
});

// ===== C. happy path（干净报告不误伤合法 CONFIRMED）=====

test('integration C: makeCleanBaseInput 干净报告 → kernel CONFIRMED (R7) + RULE-PE-007 PASS（零误报）', () => {
  const report = runAntiTheaterLint(makeCleanBaseInput());

  // 干净 base 过全部 23 detector → 无 FAIL/WARN（误报率=0·false_green_rate gate 的 liveness 基准）。
  assert.equal(report.hasFail, false, '干净 base 须 hasFail=false（过全部 detector·误报率=0）');
  assert.equal(report.canSealConfirmed, true, '干净 base 须 canSealConfirmed=true（score>=70 + 无 blockSeal）');

  // 1. kernel：投影型 findings 全非 fail → 不触发 ANTI_THEATER_FAIL → 落 R7 CONFIRMED。
  const projected = toKernelFindings(report.findings);
  assert.ok(
    !projected.some((f) => f.severity === 'fail'),
    '干净报告投影后须无 severity=fail（kernel 不应误翻盘）',
  );
  const verdict = decideFiveValueVerdict(
    baseKernelInput({ antiTheaterFindings: projected }),
  );
  assert.equal(verdict.verdict, 'CONFIRMED');
  assert.equal(verdict.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');

  // 2. sealer：干净报告注入合法 envelope → RULE-PE-007 PASS（hasFail=false + verdict=CONFIRMED 不冲突）。
  const input = makeValidEnvelopeV2Core({ antiTheaterReport: report });
  const { checks } = sealProofEnvelopeV2(input);
  const rule = findCheck(checks, 'RULE-PE-007');
  assert.equal(rule?.outcome, 'PASS', '干净报告 + CONFIRMED 须 RULE-PE-007 PASS（反 theater F1 不误伤）');
});
