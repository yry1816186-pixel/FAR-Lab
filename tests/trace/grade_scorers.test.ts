/**
 * grade_scorers.test.ts —— M-10 TraceGrade 评分器单元测试。
 *
 * 历史溯源（已归档）: （Trace grading 与失败分类）。
 *
 * 覆盖：
 *   - deterministicGrade: 7 维度评分、失败码生成、边界 case
 *   - humanCheckpointGrade: 占位生成、初始 score=0、非 LLM 自评
 *   - externalOracleGrade: 占位生成、oracleName 校验
 *   - 三种评分器的 graderBy 字段一致性
 *   - 边缘情况：空 ID、负计数、分数夹持 0..1
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicGrade,
  humanCheckpointGrade,
  externalOracleGrade,
} from '../../src/trace/grade_scorers.ts';
import type { GradeInput } from '../../src/trace/grade_scorers.ts';
import { TRACE_FAILURE_CODES } from '../../src/trace/agent_run_event.ts';

// ---------- 共享 GradeInput fixture ----------

function baseGradeInput(overrides: Partial<GradeInput> = {}): GradeInput {
  return {
    traceGradeId: 'tg-001',
    runId: 'run-001',
    graderKind: 'schema_validity',
    eventCount: 10,
    guardrailBlockedCount: 2,
    toolCallCompletedCount: 3,
    sourceCardAcceptedCount: 5,
    allEventsHashed: true,
    hasSchemaViolation: false,
    hasProviderBoundaryLeak: false,
    isOverConfirmed: false,
    attackBlocked: true,
    evidenceRefs: ['ev-001', 'ev-002'],
    isoTimestamp: '2026-06-27T00:00:00.000Z',
    ...overrides,
  };
}

// ---------- deterministicGrade ----------

test('M-10 deterministicGrade: perfect score with no failures', () => {
  const result = deterministicGrade(baseGradeInput());

  assert.equal(result.traceGradeId, 'tg-001');
  assert.equal(result.gradedBy, 'deterministic_script');
  assert.equal(result.graderKind, 'schema_validity');
  assert.equal(result.failureCodes.length, 0, 'no failures expected for clean input');
  // 7/7 dimensions passed = score 1.0
  assert.ok(result.score >= 0.95, `expected ~1.0, got ${result.score}`);
});

test('M-10 deterministicGrade: deduped failure dimensions reduce score proportionally', () => {
  const result = deterministicGrade(
    baseGradeInput({
      hasSchemaViolation: true,
      isOverConfirmed: true,
    }),
  );

  // 2 dimensions failed, guardrail_effectiveness also affected (0 guardrail events with 0 blocked)
  // schema_invalid + over_confirmed + guardrail
  assert.ok(result.failureCodes.includes('schema_invalid'));
  assert.ok(result.failureCodes.includes('over_confirmed'));
  assert.ok(result.score < 1.0, `score should be < 1.0 with failures, got ${result.score}`);
  assert.ok(result.score >= 0, `score should be >= 0, got ${result.score}`);
});

test('M-10 deterministicGrade: all failures produce score near 0', () => {
  const result = deterministicGrade(
    baseGradeInput({
      hasSchemaViolation: true,
      hasProviderBoundaryLeak: true,
      isOverConfirmed: true,
      allEventsHashed: false,
      sourceCardAcceptedCount: 0,
      guardrailBlockedCount: 0,
    }),
  );

  // 所有 7 维度都可能受影响
  assert.ok(result.failureCodes.length >= 3);
  assert.ok(result.score <= 0.3, `score should be very low, got ${result.score}`);
});

test('M-10 deterministicGrade: source_mismatch when no source cards accepted', () => {
  const result = deterministicGrade(
    baseGradeInput({ sourceCardAcceptedCount: 0 }),
  );

  assert.ok(result.failureCodes.includes('source_mismatch'));
});

test('M-10 deterministicGrade: nonreproducible_metric when hash chain incomplete', () => {
  const result = deterministicGrade(
    baseGradeInput({ allEventsHashed: false }),
  );

  assert.ok(result.failureCodes.includes('nonreproducible_metric'));
});

test('M-10 deterministicGrade: provider_boundary_leak when boundary leak detected', () => {
  const result = deterministicGrade(
    baseGradeInput({ hasProviderBoundaryLeak: true }),
  );

  assert.ok(result.failureCodes.includes('provider_boundary_leak'));
});

test('M-10 deterministicGrade: score always clamped to 0..1', () => {
  const perfect = deterministicGrade(baseGradeInput());
  assert.ok(perfect.score >= 0 && perfect.score <= 1);

  const worst = deterministicGrade(
    baseGradeInput({
      hasSchemaViolation: true,
      hasProviderBoundaryLeak: true,
      isOverConfirmed: true,
      allEventsHashed: false,
      sourceCardAcceptedCount: 0,
      guardrailBlockedCount: 0,
    }),
  );
  assert.ok(worst.score >= 0 && worst.score <= 1, `score=${worst.score} not in [0,1]`);
});

test('M-10 deterministicGrade: rejects empty traceGradeId', () => {
  assert.throws(
    () => deterministicGrade(baseGradeInput({ traceGradeId: '' })),
    /traceGradeId must be non-empty/,
  );
});

test('M-10 deterministicGrade: rejects empty runId', () => {
  assert.throws(
    () => deterministicGrade(baseGradeInput({ runId: '' })),
    /runId must be non-empty/,
  );
});

test('M-10 deterministicGrade: rejects negative eventCount', () => {
  assert.throws(
    () => deterministicGrade(baseGradeInput({ eventCount: -1 })),
    /eventCount must be >= 0/,
  );
});

// ---------- humanCheckpointGrade ----------

test('M-10 humanCheckpointGrade: produces placeholder with score=0', () => {
  const result = humanCheckpointGrade(
    baseGradeInput(),
    'pending human review of schema validity',
  );

  assert.equal(result.gradedBy, 'human_checkpoint');
  assert.equal(result.score, 0, 'human checkpoint starts at score=0');
  assert.equal(result.traceGradeId, 'tg-001');
  assert.equal(result.runId, 'run-001');
});

test('M-10 humanCheckpointGrade: does not auto-deduct for guardrail absence', () => {
  const result = humanCheckpointGrade(
    baseGradeInput({ guardrailBlockedCount: 0 }),
    null,
  );

  // 人类审核器不自动扣除 guardrail 缺失分数
  assert.equal(result.gradedBy, 'human_checkpoint');
  assert.equal(result.score, 0);
});

test('M-10 humanCheckpointGrade: captures failure codes for human review', () => {
  const result = humanCheckpointGrade(
    baseGradeInput({
      hasSchemaViolation: true,
      hasProviderBoundaryLeak: true,
      isOverConfirmed: true,
    }),
    'multiple violations need human judgment',
  );

  assert.ok(result.failureCodes.includes('schema_invalid'));
  assert.ok(result.failureCodes.includes('provider_boundary_leak'));
  assert.ok(result.failureCodes.includes('over_confirmed'));
});

// ---------- externalOracleGrade ----------

test('M-10 externalOracleGrade: produces placeholder with score=0', () => {
  const result = externalOracleGrade(
    baseGradeInput(),
    'SWE-bench verified',
  );

  assert.equal(result.gradedBy, 'external_oracle');
  assert.equal(result.score, 0, 'external oracle starts at score=0');
});

test('M-10 externalOracleGrade: captures broader failure dimensions than deterministic', () => {
  const result = externalOracleGrade(
    baseGradeInput({
      sourceCardAcceptedCount: 0,
      allEventsHashed: false,
    }),
    'AgentBench',
  );

  // 外部 oracle 检测 source_coverage 和 reproducibility 维度
  assert.ok(result.failureCodes.includes('source_mismatch'));
  assert.ok(result.failureCodes.includes('nonreproducible_metric'));
});

test('M-10 externalOracleGrade: rejects empty oracleName', () => {
  assert.throws(
    () => externalOracleGrade(baseGradeInput(), ''),
    /oracleName must be non-empty/,
  );
});

// ---------- 交叉验证 ----------

test('M-10 all three graders produce unique gradedBy values', () => {
  const det = deterministicGrade(baseGradeInput());
  const hum = humanCheckpointGrade(baseGradeInput(), null);
  const ext = externalOracleGrade(baseGradeInput(), 'public-benchmark');

  assert.equal(det.gradedBy, 'deterministic_script');
  assert.equal(hum.gradedBy, 'human_checkpoint');
  assert.equal(ext.gradedBy, 'external_oracle');

  // 三者互不相同
  const gradedByValues = [det.gradedBy, hum.gradedBy, ext.gradedBy];
  assert.equal(new Set(gradedByValues).size, 3);
});

test('M-10 all graders preserve input evidence refs', () => {
  const evidenceRefs = ['ev-a', 'ev-b', 'ev-c'];
  const det = deterministicGrade(baseGradeInput({ evidenceRefs }));
  const hum = humanCheckpointGrade(baseGradeInput({ evidenceRefs }), null);
  const ext = externalOracleGrade(baseGradeInput({ evidenceRefs }), 'test');

  assert.deepEqual(det.evidenceRefs, evidenceRefs);
  assert.deepEqual(hum.evidenceRefs, evidenceRefs);
  assert.deepEqual(ext.evidenceRefs, evidenceRefs);
});

test('M-10 trace failure codes are referenced from the authoritative source', () => {
  // TRACE_FAILURE_CODES 来自 agent_run_event.ts（spec §5.1）
  assert.equal(TRACE_FAILURE_CODES.length, 10);
  assert.ok(TRACE_FAILURE_CODES.includes('schema_invalid'));
  assert.ok(TRACE_FAILURE_CODES.includes('over_confirmed'));
  assert.ok(TRACE_FAILURE_CODES.includes('security_policy_violation'));
});
