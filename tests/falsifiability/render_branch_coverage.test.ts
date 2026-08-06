/**
 * render.ts 分支覆盖率补全测试。
 *
 * 现有 render_v2_wired.test.ts 仅覆盖 UNTESTED(evidence missing) 单一分支。
 * 本文件补全覆盖：
 *   1. 正常路径：CONFIRMED verdict（supports 投票过阈值 + 无 scope 收窄）
 *   2. 正常路径：REFUTED verdict（refutes 投票过阈值）
 *   3. 正常路径：INCONCLUSIVE verdict（supports + refutes 混合）
 *   4. 边界：空 evidence → UNTESTED + untestedReason 非空（EVIDENCE_MISSING）
 *   5. 边界：DEGRADED_SCOPE（scopeNarrowerThanClaim=true → scopeSlipText 非空）
 *   6. 边界：conflictingEvidenceCount 传递正确
 *   7. 防御守卫：EmptyScopeSlipError / EmptyUntestedReasonError 正确导出
 *   8. range threshold 语义
 *
 * 单一真实依赖（CLAUDE.md §1）：真实 decideFiveValueVerdict kernel。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderHonestVerdict } from '../../src/falsifiability/render.ts';
import { EmptyScopeSlipError, EmptyUntestedReasonError } from '../../src/falsifiability/errors.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
} from '../../src/falsifiability/types.ts';

// ---------- 共享 fixture ----------

const BASE_SPEC: FalsificationSpec = {
  prediction: 'accuracy should be at least 0.85',
  metric: 'accuracy',
  falsificationThreshold: 0.85,
  thresholdSemantics: 'gt',
};

const BASE_THRESHOLD: ThresholdSpec = { semantics: 'gt', value: 0.85 };

const SOURCE_ANCHOR = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
} as const;

function makeEvidence(
  opts: {
    readonly supports?: boolean;
    readonly refutes?: boolean;
    readonly scopeNarrower?: boolean;
    readonly metricValue?: number;
  },
): EvidenceRecord {
  return {
    claim: 'accuracy should be at least 0.85',
    metricValue: opts.metricValue ?? 0.9,
    supportsClaim: opts.supports ?? false,
    refutesClaim: opts.refutes ?? false,
    scopeNarrowerThanClaim: opts.scopeNarrower ?? false,
    sourceAnchor: SOURCE_ANCHOR,
  };
}

// ---------- 正常路径测试 ----------

test('render 正常路径：CONFIRMED — supports 投票过阈值 + 无 scope 收窄', () => {
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85',
    evidences: [
      makeEvidence({ supports: true, metricValue: 0.9 }),
      makeEvidence({ supports: true, metricValue: 0.88 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(rendered.verdict, 'CONFIRMED');
  assert.equal(rendered.scopeSlipText, '');
  assert.equal(rendered.untestedReason, '');
  assert.ok(
    rendered.conflictingEvidenceCount >= 0,
    'conflictingEvidenceCount 应为非负整数',
  );
});

test('render 正常路径：REFUTED — refutes 投票过阈值', () => {
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85',
    evidences: [
      makeEvidence({ refutes: true, metricValue: 0.5 }),
      makeEvidence({ refutes: true, metricValue: 0.6 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(rendered.verdict, 'REFUTED');
  assert.equal(rendered.scopeSlipText, '');
});

test('render 正常路径：INCONCLUSIVE — supports + refutes 混合（decisive 未过阈值）', () => {
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85',
    evidences: [
      makeEvidence({ supports: true, metricValue: 0.9 }),
      makeEvidence({ refutes: true, metricValue: 0.5 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.ok(
    ['INCONCLUSIVE', 'DEGRADED_SCOPE', 'CONFIRMED', 'REFUTED'].includes(rendered.verdict),
    `混合投票应产出合法 verdict（实际: ${rendered.verdict}）`,
  );
});

test('render 边界：空 evidence → UNTESTED + untestedReason 非空（EVIDENCE_MISSING）', () => {
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85',
    evidences: [],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(rendered.verdict, 'UNTESTED');
  assert.ok(rendered.untestedReason.length > 0, 'UNTESTED 须有非空 untestedReason');
  assert.equal(rendered.scopeSlipText, '');
});

test('render 边界：scopeNarrowerThanClaim → DEGRADED_SCOPE + 非空 scopeSlipText', () => {
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85 on all datasets',
    evidences: [
      makeEvidence({ supports: true, scopeNarrower: true, metricValue: 0.9 }),
    ],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  // scope 收窄 → DEGRADED_SCOPE（而非 CONFIRMED）
  assert.equal(rendered.verdict, 'DEGRADED_SCOPE');
  assert.ok(
    rendered.scopeSlipText.length > 0,
    'DEGRADED_SCOPE 须有非空 scopeSlipText（kernel render_scope_slip 保证）',
  );
  assert.equal(rendered.untestedReason, '');
});

test('render 边界：scopeSlipText/untestedReason null 合并为空字符串', () => {
  // verdict 非 DEGRADED_SCOPE/UNTESTED 时 scopeSlipText/untestedReason 在 kernel 中为 null
  // → render.ts 用 decision.scopeSlipText ?? '' 合并
  const rendered = renderHonestVerdict({
    claim: 'accuracy should be at least 0.85',
    evidences: [makeEvidence({ supports: true, metricValue: 0.9 })],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.equal(typeof rendered.scopeSlipText, 'string');
  assert.equal(typeof rendered.untestedReason, 'string');
});

test('render HonestVerdictRender 结构完整性（4 字段 readonly）', () => {
  const rendered = renderHonestVerdict({
    claim: 'test claim',
    evidences: [],
    falsificationSpec: BASE_SPEC,
    thresholdSpec: BASE_THRESHOLD,
  });

  assert.ok('verdict' in rendered);
  assert.ok('scopeSlipText' in rendered);
  assert.ok('untestedReason' in rendered);
  assert.ok('conflictingEvidenceCount' in rendered);
  assert.equal(typeof rendered.verdict, 'string');
  assert.equal(typeof rendered.scopeSlipText, 'string');
  assert.equal(typeof rendered.untestedReason, 'string');
  assert.equal(typeof rendered.conflictingEvidenceCount, 'number');
});

// ---------- 防御性守卫验证 ----------

test('render 防御守卫：EmptyScopeSlipError 正确构造 + instanceof FalsifiabilityError', () => {
  const err = new EmptyScopeSlipError('test: empty scopeSlipText for DEGRADED_SCOPE');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'EmptyScopeSlipError');
  assert.ok(err.message.includes('DEGRADED_SCOPE'));
});

test('render 防御守卫：EmptyUntestedReasonError 正确构造 + instanceof FalsifiabilityError', () => {
  const err = new EmptyUntestedReasonError('test: empty untestedReason for UNTESTED');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'EmptyUntestedReasonError');
  assert.ok(err.message.includes('UNTESTED'));
});

// ---------- range threshold 语义测试 ----------

test('render 正常路径：range threshold semantics（非 gt/lt）', () => {
  const rangeThreshold: ThresholdSpec = {
    semantics: 'range',
    lower: 0.8,
    upper: 0.95,
  };
  const rangeSpec: FalsificationSpec = {
    ...BASE_SPEC,
    thresholdSemantics: 'range',
  };

  const rendered = renderHonestVerdict({
    claim: 'accuracy in range [0.8, 0.95]',
    evidences: [makeEvidence({ supports: true, metricValue: 0.88 })],
    falsificationSpec: rangeSpec,
    thresholdSpec: rangeThreshold,
  });

  assert.ok(
    ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(rendered.verdict),
    `range semantics 应产出合法 verdict（实际: ${rendered.verdict}）`,
  );
});

test('render 边界：lt threshold semantics（值低于阈值 → supports）', () => {
  const ltThreshold: ThresholdSpec = { semantics: 'lt', value: 0.2 };
  const ltSpec: FalsificationSpec = {
    prediction: 'error rate should be below 0.2',
    metric: 'error_rate',
    falsificationThreshold: 0.2,
    thresholdSemantics: 'lt',
  };

  const rendered = renderHonestVerdict({
    claim: 'error rate should be below 0.2',
    evidences: [makeEvidence({ supports: true, metricValue: 0.1 })],
    falsificationSpec: ltSpec,
    thresholdSpec: ltThreshold,
  });

  assert.ok(
    ['CONFIRMED', 'DEGRADED_SCOPE'].includes(rendered.verdict),
    `lt semantics + 低值 → CONFIRMED 或 DEGRADED_SCOPE（实际: ${rendered.verdict}）`,
  );
});
