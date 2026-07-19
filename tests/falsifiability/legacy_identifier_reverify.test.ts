// tests/falsifiability/legacy_identifier_reverify.test.ts
//
// FUSION-OS-14 legacy-path 闭合物证：buildLegacyVerdictKernelInput（verdict_stage.ts:247 / render.ts:38
// 的 kernel-input builder）经 recomputeIdentifierClaims 重算 resolutionStatus，覆盖 caller 自填值。
//
// 闭合的盲区（独立 grader 第 9 轮发现）：FUSION-OS-14 首版只补了 orchestrator.buildVerdictKernelInput，
// 本 builder 仍透传 args.identifierClaims → caller 可自填 resolved 经 verdict_stage/render 绕过 R-identifier
// REFUTED。修复（shared helper recomputeIdentifierClaims @ external_facts.ts）：两 builder 同源重算，禁漂移。
//
// 单一真实依赖（CLAUDE.md §1）：真实 buildLegacyVerdictKernelInput → recomputeIdentifierClaims
// → decideFiveValueVerdict R-identifier 规则。非 Fake、非直接断言常量、经真实 kernel 端到端。
//
// Authority: CLAUDE.md §5（来源不可自填）+ verdict_kernel_v2.ts:397-408 R-identifier 规则。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLegacyVerdictKernelInput } from '../../src/falsifiability/legacy_kernel_adapter.ts';
import { decideFiveValueVerdict } from '../../src/falsifiability/verdict_kernel_v2.ts';
import { makeValidFec } from '../fec/fixtures.ts';
import type { IdentifierClaim } from '../../src/falsifiability/verdict_kernel_v2.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  SourceAnchor,
  ThresholdSpec,
} from '../../src/falsifiability/index.ts';

const sourceAnchor: SourceAnchor = {
  gitCommitSha: 'a'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-07-12T00:00:00Z',
  rawResponseHash: 'b'.repeat(64),
};

const falsificationSpec: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const thresholdSpec: ThresholdSpec = { semantics: 'gt', value: 0.85 };

// metric-only evidence：scopeNarrowerThanClaim=false（R4 不 fire）+ 非 supports/refutes（R5/R6 不 fire）
// → base 落 NO_DECISION_PATH；加 identifierClaims 后 R-identifier（R5 后 R6 前）先 fire。
const metricOnlyEvidence: EvidenceRecord = {
  claim: 'measured accuracy is 0.91',
  metricValue: 0.91,
  supportsClaim: false,
  refutesClaim: false,
  scopeNarrowerThanClaim: false,
  sourceAnchor,
};

function buildLegacyArgs(identifierClaims?: readonly IdentifierClaim[]) {
  return buildLegacyVerdictKernelInput({
    claim: 'accuracy should be at least 0.85',
    evidences: [metricOnlyEvidence],
    falsificationSpec,
    thresholdSpec,
    fec: makeValidFec({
      metric: { metricKey: 'accuracy', description: 'classification accuracy', unit: 'unitless', computationRef: 'metrics/accuracy.py', isDeterministic: false },
      statisticalPlan: {
        primaryMetric: 'accuracy',
        nullHypothesis: 'accuracy < 0.85',
        alternativeHypothesis: 'accuracy >= 0.85',
        alpha: 0.05,
        effectDirection: 'greater',
        confidenceIntervalMethod: 'wilson',
        multipleTestingCorrection: 'none',
        missingDataPolicy: 'none',
        outlierPolicy: 'none',
        stoppingRule: 'fixed-n',
      },
      threshold: { value: 0.85, unit: 'unitless', thresholdSemantics: 'gt', preregistered: true },
      direction: 'greater',
    }),
    ...(identifierClaims !== undefined ? { identifierClaims } : {}),
  });
}

test('legacy_self_filled_resolved_bypass_blocked: buildLegacyVerdictKernelInput 自填 resolved → 重算 not_found → REFUTED', () => {
  const fabricatedSelfFilled: IdentifierClaim = {
    kind: 'doi',
    value: '10.1/totally-fabricated-not-in-registry',
    resolutionStatus: 'resolved',
    harnessVerifiedSource: true,
  };
  const output = decideFiveValueVerdict(buildLegacyArgs([fabricatedSelfFilled]));
  assert.equal(
    output.verdict,
    'REFUTED',
    'legacy builder 须用 HARNESS_VERIFIED_IDENTIFIERS 重算自填 resolved → not_found → R-identifier REFUTED（来源不可自填）',
  );
  assert.equal(output.decisiveRuleId, 'R_IDENTIFIER_FABRICATION');
  assert.ok(
    output.reasonCodes.includes('UNVERIFIED_IDENTIFIER'),
    `reasonCodes must include UNVERIFIED_IDENTIFIER, got ${JSON.stringify(output.reasonCodes)}`,
  );
});

test('legacy_legitimate_resolved_zero_regression: value 在 registry → 重算 resolved → 不触发 R-identifier', () => {
  const legitimate: IdentifierClaim = {
    kind: 'doi',
    value: '10.1/far-verified-001',
    resolutionStatus: 'resolved',
    harnessVerifiedSource: true,
  };
  const output = decideFiveValueVerdict(buildLegacyArgs([legitimate]));
  assert.notEqual(
    output.decisiveRuleId,
    'R_IDENTIFIER_FABRICATION',
    'value 在 HARNESS_VERIFIED_IDENTIFIERS → 重算 resolved → 不触发 R-identifier（零回归）',
  );
  assert.notEqual(output.verdict, 'REFUTED');
});

test('legacy_honest_not_found_still_refuted: 诚实 not_found → 重算一致 → REFUTED', () => {
  const honestNotFound: IdentifierClaim = {
    kind: 'arxiv',
    value: '9999.9999',
    resolutionStatus: 'not_found',
    harnessVerifiedSource: false,
  };
  const output = decideFiveValueVerdict(buildLegacyArgs([honestNotFound]));
  assert.equal(output.verdict, 'REFUTED', '诚实 not_found 与重算一致 → REFUTED（行为不变）');
  assert.equal(output.decisiveRuleId, 'R_IDENTIFIER_FABRICATION');
});
