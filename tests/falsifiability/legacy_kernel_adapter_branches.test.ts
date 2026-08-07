/**
 * legacy_kernel_adapter.ts 分支覆盖率补全测试。
 *
 * 目标源文件 branch coverage: 76.12%
 * 未覆盖行: 340-341, 474, 479-480, 482-483, 485-488
 *
 * 覆盖计划:
 *   - validateEvidenceRecord 三个 throw 分支（lines 479-480, 482-483, 485-488）
 *     → 通过 buildLegacyVerdictKernelInput 触发
 *   - resolveThresholdValue ?? 回退分支（lines 340-341）
 *     → 通过 makeRealStatsFec 触发
 *   - evidenceDirectionFromFlags 'neutral'（line 474）
 *     → 死代码: validateEvidenceRecord 守卫使得 supportsClaim===refutesClaim
 *       且 metricValue===undefined 的路径在进入前已 throw，无法到达
 *
 * 零容忍合规: 无 any / @ts-ignore / 空 catch / 桩。
 * noUncheckedIndexedAccess: 数组访问用 destructuring + assert.ok。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLegacyVerdictKernelInput, makeRealStatsFec } from '../../src/falsifiability/legacy_kernel_adapter.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';
import type { RealStatsFecInput } from '../../src/falsifiability/legacy_kernel_adapter.ts';

// ---------- 共享 fixture ----------

const SOURCE_ANCHOR = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
} as const;

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = { semantics: 'gt', value: 0.85 };

function makeEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    claim: 'accuracy should be at least 0.85',
    metricValue: 0.9,
    supportsClaim: false,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: SOURCE_ANCHOR,
    ...overrides,
  };
}

// ============================================================================
// validateEvidenceRecord — 三个 throw 分支 (lines 479-480, 482-483, 485-488)
// ============================================================================

test('validateEvidenceRecord: 空 claim 抛错 (line 479-480)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [makeEvidence({ claim: '   ' })],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /evidence claim must be non-empty/,
    },
  );
});

test('validateEvidenceRecord: claim 仅含空白抛错', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [makeEvidence({ claim: '\t\n ' })],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /evidence claim must be non-empty/,
    },
  );
});

test('validateEvidenceRecord: metricValue 为 NaN 抛错 (line 482-483)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [makeEvidence({ metricValue: NaN, claim: 'NaN test' })],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /metricValue must be finite/,
    },
  );
});

test('validateEvidenceRecord: metricValue 为 Infinity 抛错 (line 482-483)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [makeEvidence({ metricValue: Infinity, claim: 'Inf test' })],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /metricValue must be finite/,
    },
  );
});

test('validateEvidenceRecord: metricValue 为 -Infinity 抛错 (line 482-483)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [makeEvidence({ metricValue: -Infinity, claim: '-Inf test' })],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /metricValue must be finite/,
    },
  );
});

test('validateEvidenceRecord: 无 metricValue 且 supportsClaim===refutesClaim (both false) 抛错 (line 485-488)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [
          {
            claim: 'both false',
            supportsClaim: false,
            refutesClaim: false,
            scopeNarrowerThanClaim: false,
            sourceAnchor: SOURCE_ANCHOR,
          },
        ],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /without metricValue must set exactly one of supportsClaim\/refutesClaim/,
    },
  );
});

test('validateEvidenceRecord: 无 metricValue 且 supportsClaim===refutesClaim (both true) 抛错 (line 485-488)', () => {
  assert.throws(
    () =>
      buildLegacyVerdictKernelInput({
        claim: 'test claim',
        evidences: [
          {
            claim: 'both true',
            supportsClaim: true,
            refutesClaim: true,
            scopeNarrowerThanClaim: false,
            sourceAnchor: SOURCE_ANCHOR,
          },
        ],
        falsificationSpec: BASE_SPEC,
        thresholdSpec: BASE_THRESHOLD,
        fec: null,
      }),
    {
      name: 'Error',
      message: /without metricValue must set exactly one of supportsClaim\/refutesClaim/,
    },
  );
});

// ============================================================================
// resolveThresholdValue — ?? 回退分支 (lines 340-341, 342)
// ============================================================================

const BASE_REAL_STATS_INPUT: Omit<RealStatsFecInput, 'falsificationSpec' | 'thresholdSpec'> = {
  claimId: 'TEST-001',
  frozenAt: '2026-06-27T00:00:00.000Z',
  alpha: 0.05,
  multipleTestingCorrection: 'bonferroni',
  confidenceIntervalMethod: 'z_test',
  effectDirection: 'greater',
  metricUnit: 'percentage',
  metricDescription: 'accuracy test',
  seedValue: 42,
};

test('resolveThresholdValue: range 语义 lower 为 undefined → ?? 回退到 falsificationThreshold (line 340)', () => {
  const spec: FalsificationSpec = {
    prediction: 'range test',
    metric: 'accuracy',
    falsificationThreshold: 0.75,
    thresholdSemantics: 'range',
  };
  const threshold: ThresholdSpec = {
    semantics: 'range',
    upper: 0.90,
    // lower intentionally undefined to trigger ?? fallback
  };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  // resolveThresholdValue 的 ?? 回退应返回 spec.falsificationThreshold
  assert.equal(result.threshold.value, 0.75);
  assert.equal(result.threshold.thresholdSemantics, 'range');
  assert.equal(result.direction, 'within');
  // rangeUpper 应正确传递
  const t = result.threshold as { rangeUpper?: number };
  assert.equal(t.rangeUpper, 0.90);
});

test('resolveThresholdValue: gt 语义 value 为 undefined → ?? 回退到 falsificationThreshold (line 342)', () => {
  const spec: FalsificationSpec = {
    prediction: 'gt test without explicit value',
    metric: 'effect_size',
    falsificationThreshold: 0.5,
    thresholdSemantics: 'gt',
  };
  const threshold: ThresholdSpec = {
    semantics: 'gt',
    // value intentionally undefined to trigger ?? fallback
  };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  // resolveThresholdValue 的 ?? 回退应返回 spec.falsificationThreshold
  assert.equal(result.threshold.value, 0.5);
  assert.equal(result.direction, 'greater');
});

test('resolveThresholdValue: lt 语义 value 为 undefined → ?? 回退到 falsificationThreshold (line 342)', () => {
  const spec: FalsificationSpec = {
    prediction: 'lt test without explicit value',
    metric: 'latency',
    falsificationThreshold: 100,
    thresholdSemantics: 'lt',
  };
  const threshold: ThresholdSpec = {
    semantics: 'lt',
    // value intentionally undefined to trigger ?? fallback
  };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  assert.equal(result.threshold.value, 100);
  assert.equal(result.direction, 'less');
});

test('resolveThresholdValue: range 语义 lower 显式提供 → 正常路径 (line 340 非回退)', () => {
  const spec: FalsificationSpec = {
    prediction: 'range with explicit lower',
    metric: 'precision',
    falsificationThreshold: 0.7,
    thresholdSemantics: 'range',
  };
  const threshold: ThresholdSpec = {
    semantics: 'range',
    lower: 0.80,
    upper: 0.95,
  };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  assert.equal(result.threshold.value, 0.80);
});

test('resolveThresholdValue: gt 语义 value 显式提供 → 正常路径 (line 342 非回退)', () => {
  const spec: FalsificationSpec = {
    prediction: 'gt with explicit value',
    metric: 'recall',
    falsificationThreshold: 0.6,
    thresholdSemantics: 'gt',
  };
  const threshold: ThresholdSpec = {
    semantics: 'gt',
    value: 0.65,
  };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  assert.equal(result.threshold.value, 0.65);
});

// ============================================================================
// makeRealStatsFec 补充验证
// ============================================================================

test('makeRealStatsFec: 输出字段完整性检查', () => {
  const spec: FalsificationSpec = {
    prediction: 'field completeness test',
    metric: 'f1_score',
    falsificationThreshold: 0.8,
    thresholdSemantics: 'gt',
  };
  const threshold: ThresholdSpec = { semantics: 'gt', value: 0.8 };

  const result = makeRealStatsFec({ ...BASE_REAL_STATS_INPUT, falsificationSpec: spec, thresholdSpec: threshold });

  // 关键字段存在且类型正确
  assert.match(result.fecId, /^FEC-REAL-/);
  assert.equal(result.contractVersion, 'FEC/2.0');
  assert.equal(result.claimId, 'TEST-001');
  assert.ok(result.metric.metricKey.length > 0);
  assert.equal(result.metric.unit, 'percentage');
  assert.equal(result.threshold.preregistered, true);
  assert.equal(result.seedPolicy.fixed, true);
  assert.equal(result.seedPolicy.seedValue, 42);
  assert.equal(result.statisticalPlan.alpha, 0.05);
  assert.equal(result.integrityFlags.length, 0);
});

// ============================================================================
// buildLegacyVerdictKernelInput — 正常路径验证（确保已有路径不被破坏）
// ============================================================================

test('buildLegacyVerdictKernelInput: 正常路径不抛错', () => {
  const result = buildLegacyVerdictKernelInput({
    claim: 'normal claim',
    evidences: [
      makeEvidence({ supportsClaim: true, refutesClaim: false, metricValue: 0.9 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
    fec: null,
  });

  assert.ok(Array.isArray(result.datasetBindings));
  assert.ok(Array.isArray(result.statistics));
  assert.equal(result.datasetBindings.length, 1);
  assert.equal(result.statistics.length, 1);
});

test('buildLegacyVerdictKernelInput: identifierClaims 可选字段传递', () => {
  const result = buildLegacyVerdictKernelInput({
    claim: 'claim with identifiers',
    evidences: [
      makeEvidence({ supportsClaim: true, refutesClaim: false, metricValue: 0.9 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
    fec: null,
    identifierClaims: [
      { kind: 'doi' as const, value: '10.1234/test.1', resolutionStatus: 'not_found' as const, harnessVerifiedSource: false },
    ],
  });

  // recomputeIdentifierClaims 会处理传入的 identifierClaims
  assert.ok(result.identifierClaims !== undefined);
  const identifierClaims = result.identifierClaims;
  assert.ok(identifierClaims !== undefined);
  const [first] = identifierClaims;
  assert.ok(first !== undefined);
  assert.equal(first.kind, 'doi');
});
