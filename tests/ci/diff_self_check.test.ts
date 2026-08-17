// tests/ci/diff_self_check.test.ts
// ENG-DIFF-001：diff 级自查门元测试——八信号正反例 + 豁免通道 + 退出码契约。
// 驱动 scripts/diff_self_check.mjs --diff-file <临时 unified diff>（真子进程）。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const script = join(repoRoot, 'scripts', 'diff_self_check.mjs');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runDiffCheck(diffText: string, extra: readonly string[] = []): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'far-dsc-'));
  try {
    const diffPath = join(dir, 'changes.diff');
    writeFileSync(diffPath, diffText, 'utf8');
    const r = spawnSync(process.execPath, [script, '--diff-file', diffPath, ...extra], { encoding: 'utf8', timeout: 30000 });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 构造单文件 unified diff。 */
function diff(path: string, removed: readonly string[], added: readonly string[]): string {
  const body = [
    ...removed.map((t) => `-${t}`),
    ...added.map((t) => `+${t}`),
  ];
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,${Math.max(1, removed.length)} +1,${Math.max(1, added.length)} @@\n${body.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// ① 逃逸注入
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 ESCAPE: 新增 :any/@ts-ignore/as unknown as/空 catch 各自拦截', () => {
  for (const [bad, label] of [
    ['const x: any = f();', ': any'],
    ['// @ts-ignore', '@ts-ignore'],
    [`const y = z ${'as unknown as'} W;`, 'as unknown as'],
    ['try { g(); } catch {}', '空 catch'],
  ] as const) {
    const r = runDiffCheck(diff('src/agent_loop/foo.ts', [], [bad]));
    assert.equal(r.code, 7, `${label} 必须拦截`);
    assert.match(r.stdout, new RegExp(`FAIL ESCAPE.*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
  // 干净新增行不误报
  const clean = runDiffCheck(diff('src/agent_loop/foo.ts', [], ['const x: number = f();']));
  assert.equal(clean.code, 0);
});

// ---------------------------------------------------------------------------
// ② 测试删除 / skip 无理由
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 TEST_REMOVAL: 删测试/加 skip 无理由拒；带理由豁免', () => {
  const removed = runDiffCheck(diff('tests/unit/a.test.ts', ["test('hard case', () => {", '  assert.equal(x, 1);', '});'], ['// 用例迁移占位']));
  assert.equal(removed.code, 7);
  assert.match(removed.stdout, /TEST_REMOVAL/);

  const skipped = runDiffCheck(diff('tests/unit/a.test.ts', [], ["test.skip('flaky on macos', () => {});"]));
  assert.equal(skipped.code, 7);

  // 豁免：相邻行理由注释
  const justified = runDiffCheck(diff('tests/unit/a.test.ts', [], [
    '// skip 理由：macos WAL flake 已另立专项（跟踪 #123）',
    "test.skip('flaky on macos', () => {});",
  ]));
  assert.equal(justified.code, 0, `理由注释应豁免: ${justified.stdout}`);
});

// ---------------------------------------------------------------------------
// ③ 断言削弱
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 ASSERT_WEAKEN: 强断言删+弱断言增 → 拦截；等价改写不误报', () => {
  const weakened = runDiffCheck(diff('tests/unit/a.test.ts', [
    "  assert.equal(rows.length, 3);",
  ], [
    "  assert.ok(rows.length !== undefined);",
  ]));
  assert.equal(weakened.code, 7);
  assert.match(weakened.stdout, /ASSERT_WEAKEN/);

  // 强化方向（弱→强）不拦
  const strengthened = runDiffCheck(diff('tests/unit/a.test.ts', [
    "  assert.ok(x !== undefined);",
  ], [
    "  assert.equal(x, 42);",
  ]));
  assert.equal(strengthened.code, 0, `强化不应拦截: ${strengthened.stdout}`);
});

// ---------------------------------------------------------------------------
// ④ 科学阈值漂移
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 THRESHOLD_DRIFT: 阈值数值变更无依据拒；带依据豁免', () => {
  const drifted = runDiffCheck(diff('src/falsifiability/kernel.ts', [
    '  const falsificationThreshold: number = 0.95;',
  ], [
    '  const falsificationThreshold: number = 0.5;',
  ]));
  assert.equal(drifted.code, 7);
  assert.match(drifted.stdout, /THRESHOLD_DRIFT/);

  const justified = runDiffCheck(diff('src/falsifiability/kernel.ts', [
    '  // 依据：bench 校准研究 2026-08-17（rationale: 校准偏差修正）',
    '  const falsificationThreshold: number = 0.95;',
  ], [
    '  // 依据：bench 校准研究 2026-08-17（rationale: 校准偏差修正）',
    '  const falsificationThreshold: number = 0.9;',
  ]));
  assert.equal(justified.code, 0, `依据注释应豁免: ${justified.stdout}`);
});

// ---------------------------------------------------------------------------
// ⑤ 模式标识改动
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 MODE_LABEL: 执行模式行改动无豁免拒', () => {
  const r = runDiffCheck(diff('src/research/orch.ts', [
    "    modelExecutionMode: 'LIVE' as const,",
  ], [
    "    modelExecutionMode: 'OFFLINE_DEVELOPMENT' as const,",
  ]));
  assert.equal(r.code, 7);
  assert.match(r.stdout, /MODE_LABEL/);
});

// ---------------------------------------------------------------------------
// ⑥ public schema 粗信号
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 SCHEMA_DRIFT: 类型改而无 schema 产物拒；带 schema.json 放行', () => {
  const typeOnly = [
    diff('src/fec/fec_contract.ts', ['export interface A { x: number; }'], ['export interface A { x: number; y: string; }']),
  ].join('');
  const r1 = runDiffCheck(typeOnly + diff('tests/unit/t.test.ts', [], ['test("w", () => { assert.ok(true); });']));
  assert.equal(r1.code, 7);
  assert.match(r1.stdout, /SCHEMA_DRIFT/);

  const withSchema = typeOnly + diff('schema/fec.schema.json', [], ['{"x": "number", "y": "string"}']);
  const r2 = runDiffCheck(withSchema);
  assert.notEqual(r2.code, 7, `schema 产物在场应放行: ${r2.stdout}`);
});

// ---------------------------------------------------------------------------
// ⑦ 生产码无测试（warn 级 + strict 升 fail）
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 TEST_GAP: src 变更无测试 → warn（exit 0）；--strict 升 7', () => {
  const srcOnly = diff('src/platform/util.ts', [], ['export const two = 2;']);
  const lenient = runDiffCheck(srcOnly);
  assert.equal(lenient.code, 0, '默认 warn 不阻断');
  assert.match(lenient.stdout, /warn TEST_GAP/);
  const strictRun = runDiffCheck(srcOnly, ['--strict']);
  assert.equal(strictRun.code, 7, 'strict 下 warn 升阻断');
});

// ---------------------------------------------------------------------------
// ⑧ 用法契约
// ---------------------------------------------------------------------------

test('ENG-DIFF-001 用法: 缺参 → exit 2；干净 diff → exit 0', () => {
  const noArgs = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 30000 });
  assert.equal(noArgs.status, 2);

  const clean = runDiffCheck(diff('docs/README.md', [], ['- 更新说明']));
  assert.equal(clean.code, 0);
  assert.match(clean.stdout, /PASS/);
});
