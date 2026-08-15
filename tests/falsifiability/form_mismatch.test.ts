// tests/falsifiability/form_mismatch.test.ts
//
// FUSION-OS-13 端到端 RED→GREEN：StatisticalResult.derivationForm 与 FEC statisticalPlan.expectedDerivationForm
// 不匹配 → R-derivation-form 降级 INCONCLUSIVE（值相等也不信·Open Science Agreement-is-not-verification 范式）。
//
// 单一真实依赖：真实 decideFiveValueVerdict（verdict_kernel_v2.ts）→ evaluateStatistics 算 formMismatch
// → R-derivation-form 规则（R6 之后、R7 之前）。非 Fake 后端、非硬编码指标。
//
// RED→GREEN 论证：
//   RED（接线前）：StatisticalResult 无 derivationForm 字段；StatisticalReport 无 formMismatch；R-derivation-form
//     规则不存在 → 派生形式静默变更（literal 偷换 derived）即使数值相等也判 CONFIRMED（theater）。
//   GREEN（接线后）：formMismatch=true → R-derivation-form INCONCLUSIVE（GV-13）。
//
// Authority: FUSION-OS-13（Agreement-is-not-verification 范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput, StatisticalResult } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';

type DerivationForm = 'literal' | 'derived' | 'formula' | 'auto';

interface KernelOverrides {
  readonly expectedDerivationForm?: DerivationForm;
  readonly statisticsDerivationForm?: DerivationForm;
  readonly statisticsEffectDirection?: 'supports' | 'refutes';
}

// buildKernelInput：GV-01 风格·默认落 CONFIRMED R7（adjustedPValue=0.003 ≤ α=0.0125 + effectSize=0.62 ≥ MDE=0.2）。
// 对齐 verdict_kernel_v2.test.ts:34 baseKernelInput 构造模式。deep overrides 内部组装（避免测试层 spread nullable fec）。
function buildKernelInput(o: KernelOverrides = {}): VerdictKernelInput {
  const fec: FecContractV2 = makeValidFec({
    fecId: 'FEC-OS-13',
    claimId: 'C-OS-13',
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
      ...(o.expectedDerivationForm !== undefined ? { expectedDerivationForm: o.expectedDerivationForm } : {}),
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

  const statistics: readonly StatisticalResult[] = [
    {
      testId: 'bls_power',
      status: 'ran',
      effectDirection: o.statisticsEffectDirection ?? 'supports',
      pValue: 0.003,
      adjustedPValue: 0.003,
      effectSizeObserved: 0.62,
      confidenceInterval: [0.21, 0.95],
      assumptionDiagnostics: [],
      ...(o.statisticsDerivationForm !== undefined ? { derivationForm: o.statisticsDerivationForm } : {}),
    },
  ];

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
    statistics,
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    contradictionSet: [],
    integrityFlags: [],
  };
}

test('literal_to_derived_silent_change_downgrades: derivationForm literal→derived 不匹配即使值相等也降级 INCONCLUSIVE', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({ expectedDerivationForm: 'literal', statisticsDerivationForm: 'derived' }),
  );
  // 默认落 CONFIRMED R7，但 derivationForm literal→derived 不匹配 → R-derivation-form 降级 INCONCLUSIVE。
  assert.equal(output.verdict, 'INCONCLUSIVE');
  assert.equal(output.decisiveRuleId, 'R_DERIVATION_FORM_MISMATCH');
  assert.deepEqual(output.reasonCodes, ['R_DERIVATION_FORM_MISMATCH']);
  assert.equal(output.statisticalReport.formMismatch, true);
});

test('derivation_form_match_keeps_confirmed: expected=literal actual=literal → CONFIRMED（form 一致不降级）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({ expectedDerivationForm: 'literal', statisticsDerivationForm: 'literal' }),
  );
  assert.equal(output.verdict, 'CONFIRMED', 'form 一致 + 数值显著 → R7 CONFIRMED（不降级）');
  assert.equal(output.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
  assert.equal(output.statisticalReport.formMismatch, false);
});

test('no_expected_derivation_form_zero_regression: 无 expectedDerivationForm → CONFIRMED（缺省零回归）', () => {
  // expectedDerivationForm 缺省（既有 GV-01..GV-12 形态）→ formMismatch 恒 false → R0-R9 cascade 字节不变。
  const output = decideFiveValueVerdict(buildKernelInput());
  assert.equal(output.verdict, 'CONFIRMED', '缺省 expectedDerivationForm → 零回归·仍 CONFIRMED');
  assert.equal(output.statisticalReport.formMismatch, false);
});

test('r6_refutes_takes_precedence_over_form_mismatch: 显著 refute + formMismatch → REFUTED（R6 优先）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({
      expectedDerivationForm: 'literal',
      statisticsDerivationForm: 'derived',
      statisticsEffectDirection: 'refutes',
    }),
  );
  // R6（REFUTED）在 R-derivation-form 之前 → 即使 formMismatch，REFUTED 优先（反证 > 形式降级）。
  assert.equal(output.verdict, 'REFUTED');
  assert.equal(output.decisiveRuleId, 'R6_PRIMARY_TEST_REFUTES');
  assert.equal(output.statisticalReport.formMismatch, true, 'formMismatch 仍为 true（R6 优先不代表形式一致）');
});
