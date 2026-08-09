// tests/cli/planning.test.ts
// far planning CLI 端到端测试（确定性门禁，无 mock）。
// 真实依赖：runPlanningFromArgs → src/planning/* 引擎。

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runPlanningFromArgs } from '../../src/cli/commands/planning.ts';

let tmp: string;
let stdout: string;
let stderr: string;

function capture(fn: () => number): number {
  const prevOut = process.stdout.write.bind(process.stdout);
  const prevErr = process.stderr.write.bind(process.stderr);
  let out = '';
  let err = '';
  process.stdout.write = ((chunk: unknown): boolean => {
    out += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    err += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    stdout = out;
    stderr = err;
    return code;
  } finally {
    process.stdout.write = prevOut;
    process.stderr.write = prevErr;
  }
}

test.before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'far-planning-'));
});

test.after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeJson(name: string, data: object): string {
  const p = join(tmp, name);
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return p;
}

const VALID_PLAN = {
  goal: 'add planning engine',
  steps: [
    { id: 'T1', action: 'write tests', risk: 'P2', tools: ['Write'], dependsOn: [], verification: 'pnpm test -- tests/planning/x.test.ts' },
    { id: 'T2', action: 'implement', risk: 'P2', tools: ['Edit'], dependsOn: ['T1'], verification: 'pnpm run typecheck' },
  ],
};

test('no subcommand → exit 2 + usage on stderr', () => {
  const code = capture(() => runPlanningFromArgs([]));
  assert.equal(code, 2);
  assert.match(stdout, /用法/);
});

test('plan: valid plan file → exit 0 + gate pass + topological order', () => {
  const file = writeJson('valid-plan.json', VALID_PLAN);
  const code = capture(() => runPlanningFromArgs(['plan', file]));
  assert.equal(code, 0);
  assert.match(stdout, /PLAN GATE PASS/);
  assert.match(stdout, /T1 → T2/);
});

test('plan: cyclic plan → exit 7 + CYCLE_DETECTED', () => {
  const file = writeJson('cycle-plan.json', {
    goal: 'x',
    steps: [
      { id: 'A', action: 'a', risk: 'P2', tools: ['Bash'], dependsOn: ['B'], verification: 'c1' },
      { id: 'B', action: 'b', risk: 'P2', tools: ['Bash'], dependsOn: ['A'], verification: 'c2' },
    ],
  });
  const code = capture(() => runPlanningFromArgs(['plan', file]));
  assert.equal(code, 7);
  assert.match(stderr, /PLAN GATE FAILED/);
  assert.match(stderr, /CYCLE_DETECTED/);
});

test('plan: missing file → exit 2', () => {
  const code = capture(() => runPlanningFromArgs(['plan', join(tmp, 'nope.json')]));
  assert.equal(code, 2);
  assert.match(stderr, /file not found/);
});

test('spec: valid spec → exit 0; <3 AC → exit 7', () => {
  const valid = writeJson('valid-spec.json', {
    story: 's',
    delta: { added: ['src/x.ts'], modified: [], removed: [] },
    acceptanceCriteria: [
      { id: 'AC-1', statement: 'a', verification: 'c1' },
      { id: 'AC-2', statement: 'b', verification: 'c2' },
      { id: 'AC-3', statement: 'c', verification: 'c3' },
    ],
    risk: 'P2',
  });
  assert.equal(capture(() => runPlanningFromArgs(['spec', valid])), 0);
  assert.match(stdout, /SPEC GATE PASS/);

  const tooFew = writeJson('too-few-spec.json', {
    story: 's',
    delta: { added: ['src/x.ts'], modified: [], removed: [] },
    acceptanceCriteria: [{ id: 'AC-1', statement: 'a', verification: 'c1' }],
    risk: 'P2',
  });
  assert.equal(capture(() => runPlanningFromArgs(['spec', tooFew])), 7);
  assert.match(stderr, /SPEC GATE FAILED/);
  assert.match(stderr, /TOO_FEW_CRITERIA/);
});

test('risk: boundedWrite → P2; irreversible → P4; no signal → exit 2', () => {
  assert.equal(capture(() => runPlanningFromArgs(['risk', 'boundedWrite'])), 0);
  assert.match(stdout, /far planning risk: P2/);

  assert.equal(capture(() => runPlanningFromArgs(['risk', 'irreversible', 'ambiguous'])), 0);
  assert.match(stdout, /far planning risk: P4/);

  const code = capture(() => runPlanningFromArgs(['risk', 'nonsense-signal']));
  assert.equal(code, 2);
  assert.match(stderr, /no valid signal/);
});

test('state: legal adjacent → 0; skipped stage → 7 with allowed-next hint', () => {
  assert.equal(capture(() => runPlanningFromArgs(['state', 'ANALYZE', 'PLAN'])), 0);
  assert.match(stdout, /LEGAL TRANSITION/);

  assert.equal(capture(() => runPlanningFromArgs(['state', 'ANALYZE', 'EXECUTE'])), 7);
  assert.match(stderr, /ILLEGAL TRANSITION/);
  assert.match(stderr, /allowed next: PLAN/);

  // compressed 模式允许跳跃
  assert.equal(capture(() => runPlanningFromArgs(['state', 'ANALYZE', 'EXECUTE', '--compress'])), 0);
  assert.match(stdout, /compressed mode/);
});

test('gate: all pass → 0; not_run → 3; fail → 7', () => {
  const done = writeJson('gate-done.json', {
    items: [{ id: 't', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' }],
    results: { t: { status: 'pass', actual: 'exit 0' } },
  });
  assert.equal(capture(() => runPlanningFromArgs(['gate', done])), 0);
  assert.match(stdout, /\*\*DONE\*\*/);

  const unverified = writeJson('gate-unverified.json', {
    items: [{ id: 't', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' }],
    results: {},
  });
  assert.equal(capture(() => runPlanningFromArgs(['gate', unverified])), 3);
  assert.match(stdout, /\*\*IMPLEMENTED_UNVERIFIED\*\*/);
  assert.match(stdout, /NOT_RUN/);

  const blocked = writeJson('gate-blocked.json', {
    items: [{ id: 't', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' }],
    results: { t: { status: 'fail', actual: '2 errors' } },
  });
  assert.equal(capture(() => runPlanningFromArgs(['gate', blocked])), 7);
  assert.match(stdout, /\*\*BLOCKED\*\*/);
});

test('checkpoint: --template renders protocol template; parsing a real checkpoint works', () => {
  assert.equal(capture(() => runPlanningFromArgs(['checkpoint', '--template'])), 0);
  assert.match(stdout, /^# PROGRESS — task-example @ /);
  assert.match(stdout, /## 下一步/);

  const cpFile = join(tmp, 'cp.md');
  writeFileSync(
    cpFile,
    `# PROGRESS — task-z @ 2026-08-09T00:00:00.000Z\n\n## 下一步（具体可执行的下一动作，不是抽象计划）\nrun the full suite\n`,
    'utf8',
  );
  assert.equal(capture(() => runPlanningFromArgs(['checkpoint', cpFile])), 0);
  assert.match(stdout, /task=task-z/);
  assert.match(stdout, /next step: run the full suite/);
});

test('unknown subcommand → exit 2', () => {
  const code = capture(() => runPlanningFromArgs(['frobnicate']));
  assert.equal(code, 2);
  assert.match(stderr, /unknown subcommand/);
});
