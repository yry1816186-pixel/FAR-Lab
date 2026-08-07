/**
 * Decision Trace 单测（A1·裁决可解释性·批次 3 透明度层）。
 *
 * 权威：src/falsifiability/verdict_kernel_v2.ts buildDecisionTrace（L794+）。
 *
 * 验证矩阵：
 *   1. decideFiveValueVerdict 输出始终含 decisionTrace（additive 字段·不破坏消费者）
 *   2. firedRuleId === decisiveRuleId（一致性·buildDecisionTrace 镜像正确）
 *   3. R7 gate 7 条件评估正确（GV-01 CONFIRMED 全 true · GV-02 REFUTED supports=false）
 *   4. metrics 关键数值快照正确（alpha/mde/pValue/effectSize/CI/powerStatus/...）
 *   5. fec=null 时 r7Gate=null（alpha 不可得 · R0-R2 场景诚实降级）
 *   6. cannotProveStatement 非空（诚实声明·"what this cannot prove"）
 *   7. totalRulesInTree === 18（文档化 R0-R9 规则总数）
 *   8. 多路径一致性（GV-01/02/03/04 的 firedRuleId 全等于 decisiveRuleId）
 *
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。所有断言忠于 R0-R9 逻辑。
 * 诚实边界：本测试不证明裁决正确（那由 verdict_kernel_v2.test.ts 的 GV-01..GV-12 守护），
 *           只证明 decisionTrace 透明度层正确镜像了裁决状态。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';

/**
 * 构造 GV-01 风格 CONFIRMED input（复用 verdict_kernel_v2.test.ts 的 baseKernelInput 模式）。
 * GV-01 数值（APPENDIX_B §2 GV-01）：alpha=0.0125, M1 supports, adjustedP=0.003, effectSize=0.62,
 * CI=[0.21,0.95], mde=0.2 → 默认落 CONFIRMED R7。
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

// ===== A1-GV-01: CONFIRMED/R7 → r7Gate.overallPassed=true, 7 conditions all true =====

test('A1-GV-01: CONFIRMED/R7 → decisionTrace.r7Gate 7 conditions all PASS', () => {
  const out = decideFiveValueVerdict(baseKernelInput());
  assert.equal(out.verdict, 'CONFIRMED');
  assert.equal(out.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');

  const trace = out.decisionTrace;
  assert.ok(trace, 'decisionTrace must be present on all decideFiveValueVerdict outputs');

  // 一致性：firedRuleId 必须等于 decisiveRuleId（buildDecisionTrace 镜像正确）
  assert.equal(trace.firedRuleId, out.decisiveRuleId, 'firedRuleId must match decisiveRuleId');

  // R7 gate：CONFIRMED 时所有 7 条件必须 PASS
  assert.ok(trace.r7Gate, 'r7Gate must be present when alpha is available (CONFIRMED path)');
  assert.equal(trace.r7Gate.overallPassed, true, 'R7 overallPassed must be true for CONFIRMED');
  assert.equal(trace.r7Gate.supports, true);
  assert.equal(trace.r7Gate.primaryAdjustedPValueSignificant, true);
  assert.equal(trace.r7Gate.effectSizeSufficient, true, 'effectSize 0.62 >= mde 0.2');
  assert.equal(trace.r7Gate.evidenceSufficient, true);
  assert.equal(trace.r7Gate.noSameScopeRefutation, true);
  assert.equal(trace.r7Gate.noIntegrityFlags, true);
  assert.equal(trace.r7Gate.noWarnAssumption, true);
});

// ===== A1-GV-02: REFUTED/R6 → r7Gate.supports=false, overallPassed=false =====

test('A1-GV-02: REFUTED/R6 → r7Gate.supports=false, overallPassed=false', () => {
  const input = baseKernelInput({
    statistics: [
      {
        testId: 'bls_power',
        status: 'ran' as const,
        effectDirection: 'refutes' as const,
        pValue: 0.003,
        adjustedPValue: 0.003,
        effectSizeObserved: 0.62,
        confidenceInterval: [0.21, 0.95],
        assumptionDiagnostics: [],
      },
    ],
  });
  const out = decideFiveValueVerdict(input);
  assert.equal(out.verdict, 'REFUTED');
  assert.equal(out.decisiveRuleId, 'R6_PRIMARY_TEST_REFUTES');

  const trace = out.decisionTrace;
  assert.ok(trace);
  assert.equal(trace.firedRuleId, 'R6_PRIMARY_TEST_REFUTES');

  // R7 gate：REFUTED 时 supports=false（方向相反），overallPassed=false
  assert.ok(trace.r7Gate);
  assert.equal(trace.r7Gate.supports, false, 'supports=false because effectDirection=refutes');
  assert.equal(trace.r7Gate.overallPassed, false);
});

// ===== A1-GV-03: UNTESTED/R1 (fec=null) → r7Gate=null, alpha=null =====

test('A1-GV-03: UNTESTED/R1 (fec=null) → r7Gate=null (alpha unavailable, honest degradation)', () => {
  const out = decideFiveValueVerdict(baseKernelInput({ fec: null }));
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');

  const trace = out.decisionTrace;
  assert.ok(trace);
  assert.equal(trace.firedRuleId, 'R1_FEC_NOT_COMPILABLE');

  // R7 gate 不可评估（alpha 从 FEC 读取·FEC null → alpha null → r7Gate null）
  assert.equal(trace.r7Gate, null, 'r7Gate must be null when alpha is unavailable');
  assert.equal(trace.metrics.alpha, null);
  assert.equal(trace.metrics.mde, null);
});

// ===== A1-GV-04: UNTESTED/R2 (no valid dataset binding) → firedRuleId consistency =====

test('A1-GV-04: UNTESTED/R2 (no valid dataset binding) → firedRuleId === decisiveRuleId', () => {
  const out = decideFiveValueVerdict(
    baseKernelInput({
      datasetBindings: [
        {
          datasetId: 'D1',
          contentHash: 'a'.repeat(64),
          sourceAnchor: { resolved: false },
          scopeCoverage: { dimension: 'population', value: 'adults', relation: 'within' },
        },
      ],
    }),
  );
  assert.equal(out.verdict, 'UNTESTED');
  assert.equal(out.decisiveRuleId, 'R2_NO_VALID_DATASET_BINDING');
  assert.equal(out.decisionTrace?.firedRuleId, 'R2_NO_VALID_DATASET_BINDING');
});

// ===== A1-metrics: key numeric snapshot correct（GV-01 CONFIRMED 数值）=====

test('A1-metrics: key numeric snapshot correct for GV-01', () => {
  const out = decideFiveValueVerdict(baseKernelInput());
  const trace = out.decisionTrace;
  assert.ok(trace);

  const m = trace.metrics;
  assert.equal(m.alpha, 0.0125);
  assert.equal(m.mde, 0.2);
  assert.equal(m.primaryAdjustedPValue, 0.003);
  assert.equal(m.primaryEffectSize, 0.62);
  assert.deepEqual([...(m.primaryConfidenceInterval ?? [])], [0.21, 0.95]);
  assert.equal(m.powerStatus, 'adequate');
  assert.equal(m.evidenceStatus, 'sufficient');
  assert.equal(m.effectiveDirection, 'supports');
  assert.equal(m.antiTheaterFailCount, 0);
  assert.equal(m.antiTheaterWarnCount, 0);
  assert.deepEqual(m.integrityFlags, []);
  assert.equal(m.totalStatistics, 1);
  assert.equal(m.skippedStatistics, 0);
});

// ===== A1-invariants: cannotProveStatement + totalRulesInTree =====

test('A1-invariants: cannotProveStatement non-empty, totalRulesInTree=18', () => {
  const out = decideFiveValueVerdict(baseKernelInput());
  const trace = out.decisionTrace;
  assert.ok(trace);
  assert.ok(
    trace.cannotProveStatement.length > 50,
    'cannotProveStatement must be a meaningful honesty statement (not empty/trivial)',
  );
  assert.equal(trace.totalRulesInTree, 18, 'R0-R9 decision tree has 18 trigger points (documented)');
});

// ===== A1-consistency: firedRuleId === decisiveRuleId across multiple GV paths =====

test('A1-consistency: firedRuleId === decisiveRuleId across GV-01/02/03/04 paths', () => {
  const cases: Array<{ name: string; input: VerdictKernelInput; expectedRule: string }> = [
    { name: 'GV-01 CONFIRMED', input: baseKernelInput(), expectedRule: 'R7_PRIMARY_TEST_CONFIRMS' },
    {
      name: 'GV-02 REFUTED',
      input: baseKernelInput({
        statistics: [
          {
            testId: 'bls_power',
            status: 'ran' as const,
            effectDirection: 'refutes' as const,
            pValue: 0.003,
            adjustedPValue: 0.003,
            effectSizeObserved: 0.62,
            confidenceInterval: [0.21, 0.95],
            assumptionDiagnostics: [],
          },
        ],
      }),
      expectedRule: 'R6_PRIMARY_TEST_REFUTES',
    },
    { name: 'GV-03 fec-null', input: baseKernelInput({ fec: null }), expectedRule: 'R1_FEC_NOT_COMPILABLE' },
    {
      name: 'GV-04 no-dataset-binding',
      input: baseKernelInput({
        datasetBindings: [
          {
            datasetId: 'D1',
            contentHash: 'a'.repeat(64),
            sourceAnchor: { resolved: false },
            scopeCoverage: { dimension: 'population', value: 'adults', relation: 'within' },
          },
        ],
      }),
      expectedRule: 'R2_NO_VALID_DATASET_BINDING',
    },
  ];

  for (const { name, input, expectedRule } of cases) {
    const out = decideFiveValueVerdict(input);
    assert.equal(out.decisiveRuleId, expectedRule, `${name}: decisiveRuleId mismatch`);
    assert.ok(out.decisionTrace, `${name}: decisionTrace missing`);
    assert.equal(
      out.decisionTrace.firedRuleId,
      out.decisiveRuleId,
      `${name}: firedRuleId must match decisiveRuleId`,
    );
  }
});

// ===== A1-R8: INCONCLUSIVE/R8 → r7Gate.overallPassed=false（R7 条件未满足才到 R8）=====
// R8 在 R7 之后，只有 R7 不 PASS 才触发。powerStatus='underpowered' 不影响 R7（R7 看 status 不看
// powerStatus），所以单独 underpowered 不足以致 R8。需要 p>alpha 或其他 R8 条件。见下方 corrected 版本。

test('A1-R8: INCONCLUSIVE/R8 (p>alpha + underpowered) → r7Gate.primaryAdjustedPValueSignificant=false', () => {
  const out = decideFiveValueVerdict(
    baseKernelInput({
      statistics: [
        {
          testId: 'bls_power',
          status: 'ran' as const,
          effectDirection: 'supports' as const,
          pValue: 0.5, // 不显著
          adjustedPValue: 0.5, // > alpha=0.0125
          effectSizeObserved: 0.62,
          confidenceInterval: [0.21, 0.95],
          assumptionDiagnostics: [],
        },
      ],
      evidenceSufficiency: { status: 'sufficient', powerStatus: 'underpowered' },
    }),
  );
  // p=0.5 > alpha → R7 pSignificant=false → R7 不 PASS → 落到 R8
  // R8 触发：p > alpha（L566）+ underpowered（L567）
  assert.equal(out.verdict, 'INCONCLUSIVE');
  assert.equal(out.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');

  const trace = out.decisionTrace;
  assert.ok(trace);
  assert.equal(trace.firedRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  assert.ok(trace.r7Gate);
  assert.equal(trace.r7Gate.primaryAdjustedPValueSignificant, false, 'p=0.5 > alpha=0.0125');
  assert.equal(trace.r7Gate.overallPassed, false);
  assert.equal(trace.metrics.powerStatus, 'underpowered');
});
