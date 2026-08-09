// tests/planning/gate.test.ts
// opencode /verify-full 源代码化测试：四步门函数报告（AGENT-LIFECYCLE §5.2 grade）。
// 真实依赖：buildGateReport / renderGateReport（src/planning/gate.ts，纯函数无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildGateReport, renderGateReport } from '../../src/planning/gate.ts';

const items = [
  { id: 'typecheck', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' },
  { id: 'lint', name: 'lint', command: 'pnpm run lint', expected: 'exit 0' },
  { id: 'test', name: 'test', command: 'pnpm test', expected: 'all green' },
] as const;

test('all pass → DONE with evidence-backed rationale', () => {
  const r = buildGateReport(items, {
    typecheck: { status: 'pass', actual: 'exit 0' },
    lint: { status: 'pass', actual: 'exit 0' },
    test: { status: 'pass', actual: '2425 (2419p/0f/6s)' },
  });
  assert.equal(r.conclusion, 'DONE');
  assert.deepEqual(r.passed, ['typecheck', 'lint', 'test']);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.notRun, []);
  assert.match(r.rationale, /all 3 verification item/);
});

test('any fail → BLOCKED (never claim completion on a failed gate)', () => {
  const r = buildGateReport(items, {
    typecheck: { status: 'pass', actual: 'exit 0' },
    lint: { status: 'fail', actual: '2 errors' },
    test: { status: 'pass', actual: 'all green' },
  });
  assert.equal(r.conclusion, 'BLOCKED');
  assert.deepEqual(r.failed, ['lint']);
  assert.match(r.rationale, /diagnose root cause/);
});

test('not_run present → IMPLEMENTED_UNVERIFIED (unverified never defaults to pass)', () => {
  const r = buildGateReport(items, {
    typecheck: { status: 'pass', actual: 'exit 0' },
    test: { status: 'pass', actual: 'all green' },
    // lint 无 result key
  });
  assert.equal(r.conclusion, 'IMPLEMENTED_UNVERIFIED');
  assert.deepEqual(r.notRun, ['lint']);
});

test('missing result key is fail-closed: treated as not_run', () => {
  const r = buildGateReport(items, {});
  assert.equal(r.conclusion, 'IMPLEMENTED_UNVERIFIED');
  assert.deepEqual(r.notRun, ['typecheck', 'lint', 'test']);
});

test('empty item list → IMPLEMENTED_UNVERIFIED (no evidence, no completion claim)', () => {
  const r = buildGateReport([], {});
  assert.equal(r.conclusion, 'IMPLEMENTED_UNVERIFIED');
  assert.match(r.rationale, /no verification items declared/);
});

test('explicit not_run status is honored', () => {
  const r = buildGateReport(items, {
    typecheck: { status: 'not_run', actual: '—' },
    lint: { status: 'pass', actual: 'exit 0' },
    test: { status: 'pass', actual: 'all green' },
  });
  assert.equal(r.conclusion, 'IMPLEMENTED_UNVERIFIED');
  assert.deepEqual(r.notRun, ['typecheck']);
});

test('renderGateReport marks statuses and conclusion visibly', () => {
  const r = buildGateReport(items, {
    typecheck: { status: 'pass', actual: 'exit 0' },
    lint: { status: 'not_run', actual: '—' },
    test: { status: 'fail', actual: '1 fail' },
  });
  const text = renderGateReport(r);
  assert.match(text, /typecheck.*PASS/);
  assert.match(text, /lint.*NOT_RUN/);
  assert.match(text, /test.*FAIL/);
  assert.match(text, /\*\*BLOCKED\*\*/);
  assert.match(text, /依据/);
});
