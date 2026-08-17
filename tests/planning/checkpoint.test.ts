// tests/planning/checkpoint.test.ts
// PROGRESS.md 检查点协议渲染 + 解析。
// 真实依赖：renderCheckpoint / parseCheckpoint / nextStepFrom（纯函数无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  nextStepFrom,
  parseCheckpoint,
  renderCheckpoint,
} from '../../src/planning/checkpoint.ts';
import type { Checkpoint } from '../../src/planning/types.ts';
import { CheckpointSchema } from '../../src/planning/types.ts';

function okCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    taskId: 'task-abc',
    goal: 'add planning engine',
    completed: ['engine implemented (evidence: pnpm test pass)'],
    state: 'branch: main / dirty: yes',
    nextStep: 'run full regression: pnpm run typecheck && pnpm run lint && pnpm test',
    blockers: [],
    excludedApproaches: [],
    assumptions: [],
    valueHypothesis: 'deliver a verifiable planning gate to CLI users',
    successCriteria: ['cli exits 0 on valid plan'],
    evidenceGaps: [],
    unachieved: [],
    ...overrides,
  };
}

test('renderCheckpoint emits the protocol template with all sections', () => {
  const text = renderCheckpoint(okCheckpoint());
  assert.match(text, /^# PROGRESS — task-abc @ \d{4}-\d{2}-\d{2}T/);
  assert.match(text, /## 当前目标（≤20 词）/);
  assert.match(text, /## 已完成（带证据：命令输出 \/ file:line \/ 测试名）/);
  assert.match(text, /## 当前状态（git branch \/ commit \/ dirty flag）/);
  assert.match(text, /## 下一步（具体可执行的下一动作，不是抽象计划）/);
  assert.match(text, /run full regression/);
});

test('parseCheckpoint round-trips a rendered checkpoint', () => {
  const text = renderCheckpoint(okCheckpoint());
  const parsed = parseCheckpoint(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.taskId, 'task-abc');
  if (parsed.ok) {
    assert.match(parsed.sections['当前目标（≤20 词）'] ?? '', /add planning engine/);
    assert.match(parsed.sections['下一步（具体可执行的下一动作，不是抽象计划）'] ?? '', /run full regression/);
  }
});

test('nextStepFrom extracts the resumption action (recovery protocol core)', () => {
  const text = renderCheckpoint(okCheckpoint());
  const parsed = parseCheckpoint(text);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const next = nextStepFrom(parsed.sections);
    assert.equal(next, 'run full regression: pnpm run typecheck && pnpm run lint && pnpm test');
  }
});

test('empty arrays render as （无） and do not create sections', () => {
  const text = renderCheckpoint(okCheckpoint());
  assert.doesNotMatch(text, /## 阻塞/);
  assert.doesNotMatch(text, /## 已排除方案/);
  assert.doesNotMatch(text, /## 未验证的假设/);
});

test('populated optional sections render and parse', () => {
  const cp = okCheckpoint({
    blockers: ['CI runner quota'],
    excludedApproaches: ['do not rewrite kernel'],
    assumptions: ['Python 3.12 present'],
  });
  const text = renderCheckpoint(cp);
  const parsed = parseCheckpoint(text);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.match(parsed.sections['阻塞 / 风险'] ?? '', /CI runner quota/);
    assert.match(parsed.sections['已排除方案（防恢复时盲目重试）'] ?? '', /do not rewrite kernel/);
    assert.match(parsed.sections['未验证的假设'] ?? '', /Python 3.12/);
  }
});

test('non-template markdown → parse fails with ok=false', () => {
  const parsed = parseCheckpoint('# Just a heading\nplain text, no sections');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error ?? '', /no "## " sections/);
});

test('multi-line section content is preserved', () => {
  const cp = okCheckpoint({ completed: ['a: x', 'b: y', 'c: z'] });
  const text = renderCheckpoint(cp);
  const parsed = parseCheckpoint(text);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const lines = (parsed.sections['已完成（带证据：命令输出 / file:line / 测试名）'] ?? '').split('\n');
    assert.equal(lines.length, 3);
  }
});


// ============================================================
// CORE-VALUE-001 · 价值三元组（batch report 必须回答「为什么值得做」）
// ============================================================

test('CORE-VALUE-001: 渲染包含价值假设/成功标准/证据缺口/未达成项四节', () => {
  const text = renderCheckpoint(okCheckpoint({
    valueHypothesis: 'cut session-resume cost by 50% for the next agent',
    successCriteria: ['resume test passes', 'checkpoint parse round-trip'],
    evidenceGaps: ['no multi-session timing measurement yet'],
    unachieved: [{ item: 'timing benchmark', reason: 'needs second session' }],
  }));
  assert.match(text, /cut session-resume cost by 50%/);
  assert.match(text, /resume test passes/);
  assert.match(text, /no multi-session timing measurement yet/);
  assert.match(text, /timing benchmark/);
  assert.match(text, /needs second session/);
});

test('CORE-VALUE-001 fail-closed: 缺 valueHypothesis 的 checkpoint 被 schema 拒绝', () => {
  const broken = okCheckpoint();
  delete (broken as { valueHypothesis?: string }).valueHypothesis;
  const parsed = CheckpointSchema.safeParse(broken);
  assert.equal(parsed.success, false, 'batch without a value hypothesis must not pass the gate');
});

test('CORE-VALUE-001: unachieved 项缺 reason 被拒（未达成必须交代原因）', () => {
  const parsed = CheckpointSchema.safeParse(
    okCheckpoint({ unachieved: [{ item: 'x' } as unknown as { item: string; reason: string }] }),
  );
  assert.equal(parsed.success, false);
});
