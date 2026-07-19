// tests/falsifiability/identifier_fabrication.test.ts
//
// FUSION-OS-14 端到端 RED→GREEN：claim 带可校验 identifier（DOI/arXiv/accession/author_year）但系统侧 trace
// 无 harness-verified 来源 → R-identifier-fabrication REFUTED（非 UNTESTED·五值优先级 REFUTED > UNTESTED·
// Open Science fabricated-references EXCEPTION 范式·反剧场强姿态）。
//
// 单一真实依赖（CLAUDE.md §1）：真实 decideFiveValueVerdict（verdict_kernel_v2.ts）→ R-identifier-fabrication
// 规则（R5 之后、R6 之前）三态判定。非 Fake 后端、非硬编码指标。
//
// RED→GREEN 论证：
//   RED（接线前）：VerdictKernelInput 无 identifierClaims；R-identifier-fabrication 规则不存在 → 伪造 DOI
//     （doi:10.1/nonexistent 无来源）落 UNTESTED（宽松·theater：伪造引用 == 无法验证）。
//   GREEN（接线后）：identifierClaims resolutionStatus='not_found' → REFUTED（GV-14）。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-14 +
//            FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-14（fabricated-references EXCEPTION）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type { VerdictKernelInput, StatisticalResult, IdentifierClaim } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';

interface KernelOverrides {
  readonly identifierClaims?: readonly IdentifierClaim[];
}

// buildKernelInput：GV-01 风格·默认落 CONFIRMED R7（adjustedPValue=0.003 ≤ α=0.0125 + effectSize=0.62 ≥ MDE=0.2）。
// 对齐 verdict_kernel_v2.test.ts:34 baseKernelInput 构造模式。identifierClaims override 测 R-identifier-fabrication。
function buildKernelInput(o: KernelOverrides = {}): VerdictKernelInput {
  const fec: FecContractV2 = makeValidFec({
    fecId: 'FEC-OS-14',
    claimId: 'C-OS-14',
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
      effectDirection: 'supports',
      pValue: 0.003,
      adjustedPValue: 0.003,
      effectSizeObserved: 0.62,
      confidenceInterval: [0.21, 0.95],
      assumptionDiagnostics: [],
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
    ...(o.identifierClaims !== undefined ? { identifierClaims: o.identifierClaims } : {}),
  };
}

test('doi_with_no_verified_source_refuted: identifier not_found → REFUTED（伪造引用定罪·非 UNTESTED）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({
      identifierClaims: [
        { kind: 'doi', value: '10.1/nonexistent', resolutionStatus: 'not_found', harnessVerifiedSource: false },
      ],
    }),
  );
  // 默认落 CONFIRMED R7，但 DOI 解析后追溯无果 → R-identifier-fabrication REFUTED。
  assert.equal(output.verdict, 'REFUTED');
  assert.equal(output.decisiveRuleId, 'R_IDENTIFIER_FABRICATION');
  assert.deepEqual(output.reasonCodes, ['UNVERIFIED_IDENTIFIER']);
});

test('unresolved_yields_untested_not_refuted: identifier unresolved（环境故障）→ UNTESTED（非伪造·严守边界）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({
      identifierClaims: [
        { kind: 'doi', value: '10.1/maybe-real', resolutionStatus: 'unresolved', harnessVerifiedSource: false },
      ],
    }),
  );
  // unresolved = 网络/DB 故障（非追溯无果）→ UNTESTED，不误判伪造（落点约束 R3）。
  assert.equal(output.verdict, 'UNTESTED');
  assert.equal(output.decisiveRuleId, 'R_IDENTIFIER_RESOLUTION_ENV_FAILURE');
  assert.equal(output.untestedReason, 'R_IDENTIFIER_RESOLUTION_ENV_FAILURE');
});

test('resolved_identifier_zero_regression: identifier resolved → CONFIRMED（harness-verified 不触发）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({
      identifierClaims: [
        { kind: 'doi', value: '10.1/far-verified-001', resolutionStatus: 'resolved', harnessVerifiedSource: true },
      ],
    }),
  );
  assert.equal(output.verdict, 'CONFIRMED', 'resolved + harness-verified → 不触发·正常 R7 CONFIRMED（零回归）');
  assert.equal(output.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
});

test('unresolved_precedes_not_found_env_failure_wins: unresolved + not_found 混合 → UNTESTED（环境抖动不误判伪造）', () => {
  const output = decideFiveValueVerdict(
    buildKernelInput({
      identifierClaims: [
        { kind: 'doi', value: '10.1/nonexistent', resolutionStatus: 'not_found', harnessVerifiedSource: false },
        { kind: 'arxiv', value: '2026.9999', resolutionStatus: 'unresolved', harnessVerifiedSource: false },
      ],
    }),
  );
  // unresolved 优先于 not_found：混合时环境故障态胜出 → UNTESTED（防网络抖动把合法引用误判伪造）。
  assert.equal(output.verdict, 'UNTESTED');
  assert.equal(output.decisiveRuleId, 'R_IDENTIFIER_RESOLUTION_ENV_FAILURE');
});
