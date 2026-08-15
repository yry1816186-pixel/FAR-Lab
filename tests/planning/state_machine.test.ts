// tests/planning/state_machine.test.ts
// 规划状态机。
// 真实依赖：transitionStage / allowedNextStages / isValidStageChain（纯函数无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  allowedNextStages,
  isValidStageChain,
  transitionStage,
} from '../../src/planning/state_machine.ts';

const FULL_CHAIN = ['ANALYZE', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'REPORT'] as const;
type Stage = (typeof FULL_CHAIN)[number];

test('full mode: legal chain ANALYZE → … → REPORT all green', () => {
  let current: Stage = 'ANALYZE';
  for (const to of FULL_CHAIN.slice(1)) {
    const r = transitionStage(current, to);
    assert.equal(r.ok, true, `transition(${current}, ${to}) should be legal in full mode`);
    current = to;
  }
  assert.equal(current, 'REPORT');
});

test('full mode: skipping a stage is intercepted (PROTOCOL_DEVIATION)', () => {
  const r = transitionStage('ANALYZE', 'EXECUTE');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason ?? '', /skipped a stage/);
    assert.deepEqual(r.allowedNext, ['PLAN']);
  }
});

test('full mode: VERIFY → REPORT (skipping REVIEW) is intercepted', () => {
  assert.equal(transitionStage('VERIFY', 'REPORT').ok, false);
});

test('backward transition is forbidden in both modes (rework must be declared)', () => {
  for (const mode of ['full', 'compressed'] as const) {
    const r = transitionStage('PLAN', 'ANALYZE', mode);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason ?? '', /backward/);
  }
});

test('same-stage no-op transition is intercepted', () => {
  const r = transitionStage('EXECUTE', 'EXECUTE');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason ?? '', /no-op/);
});

test('compressed mode: ANALYZE → EXECUTE is legal (stage compression)', () => {
  const r = transitionStage('ANALYZE', 'EXECUTE', 'compressed');
  assert.equal(r.ok, true);
});

test('compressed mode: EXECUTE → REPORT legal, but REPORT → REVIEW backward illegal', () => {
  assert.equal(transitionStage('EXECUTE', 'REPORT', 'compressed').ok, true);
  assert.equal(transitionStage('REPORT', 'REVIEW', 'compressed').ok, false);
});

test('REPORT → ANALYZE is the loop-back edge (next task cycle)', () => {
  assert.equal(transitionStage('REPORT', 'ANALYZE').ok, true);
});

test('allowedNextStages differs by mode', () => {
  assert.deepEqual(allowedNextStages('ANALYZE', 'full'), ['PLAN']);
  assert.deepEqual(allowedNextStages('ANALYZE', 'compressed'), ['PLAN', 'EXECUTE', 'REPORT']);
  assert.deepEqual(allowedNextStages('EXECUTE', 'full'), ['VERIFY']);
  assert.deepEqual(allowedNextStages('EXECUTE', 'compressed'), ['VERIFY', 'REPORT']);
});

test('isValidStageChain: full legal chain true, illegal jump false, short chain false', () => {
  assert.equal(isValidStageChain(['ANALYZE', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'REPORT']), true);
  assert.equal(isValidStageChain(['ANALYZE', 'EXECUTE']), false);
  assert.equal(isValidStageChain(['ANALYZE']), false);
});
