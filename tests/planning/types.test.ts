// tests/planning/types.test.ts
// 规划域 zod schemas 边界测试（SSOT 校验，与 v2_receipts_schemas 同模式）。
// 真实依赖：PlanSchema / SpecSchema / CheckpointSchema / VerificationReportSchema / RiskLevelSchema。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  CheckpointSchema,
  PlanSchema,
  RiskLevelSchema,
  SpecSchema,
  VerificationReportSchema,
} from '../../src/planning/types.ts';

test('RiskLevelSchema rejects out-of-range levels (P5 / lowercase)', () => {
  assert.equal(RiskLevelSchema.safeParse('P3').success, true);
  assert.equal(RiskLevelSchema.safeParse('P5').success, false);
  assert.equal(RiskLevelSchema.safeParse('p2').success, false);
});

test('PlanSchema rejects empty steps (min 1)', () => {
  const r = PlanSchema.safeParse({ goal: 'x', steps: [] });
  assert.equal(r.success, false);
});

test('PlanStepSchema requires verification + action (unverifiable step rejected at schema level)', () => {
  const r = PlanSchema.safeParse({
    goal: 'x',
    steps: [{ id: 'T1', action: '', risk: 'P2', dependsOn: [], verification: '' }],
  });
  assert.equal(r.success, false);
});

test('PlanStep defaults: tools and dependsOn default when omitted', () => {
  const r = PlanSchema.safeParse({
    goal: 'x',
    steps: [{ id: 'T1', action: 'a', risk: 'P2', verification: 'cmd' }],
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.steps[0]?.tools, ['Bash']);
    assert.deepEqual(r.data.steps[0]?.dependsOn, []);
  }
});

test('SpecSchema enforces min 1 AC and verifiable criteria at schema level', () => {
  assert.equal(SpecSchema.safeParse(validSpecInput({ acceptanceCriteria: [] })).success, false);
  assert.equal(SpecSchema.safeParse(validSpecInput({ acceptanceCriteria: [{ id: 'AC-1', statement: 'x', verification: '' }] })).success, false);
});

test('SpecSchema requires story and risk', () => {
  const base = validSpecInput({});
  assert.equal(SpecSchema.safeParse({ ...base, story: '' }).success, false);
  assert.equal(SpecSchema.safeParse({ ...base, risk: 'P9' }).success, false);
});

test('CheckpointSchema defaults empty arrays（CORE-VALUE-001：valueHypothesis 必填）', () => {
  const r = CheckpointSchema.safeParse({
    taskId: 't',
    goal: 'g',
    state: 's',
    nextStep: 'n',
    valueHypothesis: 'v',
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.completed, []);
    assert.deepEqual(r.data.blockers, []);
    assert.deepEqual(r.data.excludedApproaches, []);
    assert.deepEqual(r.data.assumptions, []);
  }
});

test('VerificationReportSchema parses pass/fail/not_run and rejects other statuses', () => {
  const ok = VerificationReportSchema.safeParse({
    items: [{ id: 'a', name: 'typecheck', command: 'cmd', expected: 'exit 0' }],
    results: { a: { status: 'pass', actual: 'exit 0' } },
  });
  assert.equal(ok.success, true);
  const bad = VerificationReportSchema.safeParse({
    items: [{ id: 'a', name: 'typecheck', command: 'cmd', expected: 'exit 0' }],
    results: { a: { status: 'maybe', actual: 'x' } },
  });
  assert.equal(bad.success, false);
});

function validSpecInput(overrides: object): object {
  return {
    story: 's',
    delta: { added: ['a.ts'], modified: [], removed: [] },
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'x', verification: 'cmd1' },
      { id: 'AC-2', statement: 'y', verification: 'cmd2' },
      { id: 'AC-3', statement: 'z', verification: 'cmd3' },
    ],
    risk: 'P2',
    ...overrides,
  };
}
