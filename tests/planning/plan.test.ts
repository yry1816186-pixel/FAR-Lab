// tests/planning/plan.test.ts
// opencode /plan 源代码化测试：Plan DAG 校验门禁（AGENT-LIFECYCLE §2.3）。
// 真实依赖：validatePlan / isValidRiskLevel（src/planning/plan.ts，纯函数无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isValidRiskLevel, validatePlan } from '../../src/planning/plan.ts';
import type { Plan } from '../../src/planning/types.ts';

function okPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    goal: 'add a new anti-theater detector',
    steps: [
      { id: 'T1', action: 'write failing tests', risk: 'P2', tools: ['Write'], dependsOn: [], verification: 'pnpm test -- tests/anti_theater/x.test.ts' },
      { id: 'T2', action: 'implement detector', risk: 'P2', tools: ['Edit'], dependsOn: ['T1'], verification: 'pnpm run typecheck && pnpm test -- tests/anti_theater/x.test.ts' },
      { id: 'T3', action: 'full regression', risk: 'P2', tools: ['Bash'], dependsOn: ['T2'], verification: 'pnpm run typecheck && pnpm run lint && pnpm test' },
    ],
    ...overrides,
  };
}

test('valid DAG plan passes with deterministic topological order', () => {
  const r = validatePlan(okPlan());
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.executionOrder, ['T1', 'T2', 'T3']);
});

test('empty steps → EMPTY_PLAN (defense in depth below schema min(1))', () => {
  const r = validatePlan({ goal: 'x', steps: [] });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'EMPTY_PLAN'));
  assert.deepEqual(r.executionOrder, []);
});

test('duplicate step id → DUPLICATE_STEP_ID', () => {
  const plan = okPlan({
    steps: [
      { id: 'T1', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: [], verification: 'cmd1' },
      { id: 'T1', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: [], verification: 'cmd2' },
    ],
  });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'DUPLICATE_STEP_ID'));
});

test('missing dependency → MISSING_DEPENDENCY', () => {
  const plan = okPlan({ steps: [{ id: 'T1', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['GHOST'], verification: 'cmd' }] });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'MISSING_DEPENDENCY' && v.message.includes('GHOST')));
});

test('cycle A→B→A → CYCLE_DETECTED, no execution order', () => {
  const plan = okPlan({
    steps: [
      { id: 'A', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['B'], verification: 'cmd1' },
      { id: 'B', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: ['A'], verification: 'cmd2' },
    ],
  });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'CYCLE_DETECTED'));
  assert.deepEqual(r.executionOrder, []);
});

test('self-dependency → cycle', () => {
  const plan = okPlan({ steps: [{ id: 'A', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['A'], verification: 'cmd' }] });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'CYCLE_DETECTED'));
});

test('missing verification command → MISSING_VERIFICATION (unverifiable step = placeholder)', () => {
  const plan = okPlan({ steps: [{ id: 'T1', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: [], verification: '   ' }] });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'MISSING_VERIFICATION'));
});

test('invalid risk level → INVALID_RISK', () => {
  const plan = okPlan({
    steps: [{ id: 'T1', action: 'a', risk: 'P9' as Plan['steps'][number]['risk'], tools: ['Bash'], dependsOn: [], verification: 'cmd' }],
  });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'INVALID_RISK'));
});

test('all violations reported at once (not first-only)', () => {
  const plan = okPlan({
    steps: [
      { id: 'A', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['MISSING'], verification: '' },
      { id: 'A', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: [], verification: 'cmd' },
    ],
  });
  const r = validatePlan(plan);
  assert.equal(r.ok, false);
  const codes = new Set(r.violations.map((v) => v.code));
  assert.ok(codes.has('DUPLICATE_STEP_ID'));
  assert.ok(codes.has('MISSING_DEPENDENCY'));
  assert.ok(codes.has('MISSING_VERIFICATION'));
});

test('topological order is deterministic across runs for diamond DAG', () => {
  const plan = okPlan({
    steps: [
      { id: 'T1', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: [], verification: 'c1' },
      { id: 'T2', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: ['T1'], verification: 'c2' },
      { id: 'T3', action: 'c', risk: 'P2', tools: ['Bash'], dependsOn: ['T1'], verification: 'c3' },
      { id: 'T4', action: 'd', risk: 'P2', tools: ['Bash'], dependsOn: ['T2', 'T3'], verification: 'c4' },
    ],
  });
  const first = validatePlan(plan).executionOrder;
  const second = validatePlan(plan).executionOrder;
  assert.equal(first.length, 4);
  assert.deepEqual(first, second);
  // 拓扑不变量：T2/T3 在 T4 前，T1 在最前
  assert.ok(first.indexOf('T1') < first.indexOf('T2'));
  assert.ok(first.indexOf('T1') < first.indexOf('T3'));
  assert.ok(first.indexOf('T2') < first.indexOf('T4'));
  assert.ok(first.indexOf('T3') < first.indexOf('T4'));
});

test('isValidRiskLevel accepts P0-P4 only', () => {
  for (const ok of ['P0', 'P1', 'P2', 'P3', 'P4']) assert.equal(isValidRiskLevel(ok), true);
  for (const bad of ['P5', 'p2', '', '3']) assert.equal(isValidRiskLevel(bad), false);
});
