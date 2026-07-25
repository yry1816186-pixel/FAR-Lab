// tests/cli/demo.test.ts
// 测试 far demo 命令的输出契约（T-002 回归）。
//
// 第 1 轮评委03 F-3-002 发现：`far demo tess-offline` 的 TESS_OFFLINE_NOTE 指向
// 已删的 `examples/tess-offline/output/demo.far-proof`（commit 2b60d14 删 examples/），
// 形成死循环——评委照抄必失败。本测试锁住修复：输出不得引用任何不存在的 examples 路径，
// 必须给出可执行的 two-step verify 工作流。
//
// 不 spawn 子进程（镜像 verify.test.ts 的 runVerifyCapture 模式）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runDemo } from '../../src/cli/commands/demo.ts';

function runDemoCapture(subcommand: string | undefined): {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown): boolean => {
    outChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    errChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stderr.write;
  let code: number;
  try {
    code = runDemo(subcommand);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, stdout: outChunks.join(''), stderr: errChunks.join('') };
}

test('runDemo tess-offline: 输出不得引用已删的 examples/ 路径（T-002 死循环回归）', () => {
  const { code, stdout } = runDemoCapture('tess-offline');
  assert.equal(code, 0, 'demo tess-offline 须正常退出');

  // 死循环根治：不得再出现 examples/tess-offline/output/demo.far-proof 字面量
  assert.ok(
    !stdout.includes('examples/tess-offline/output/demo.far-proof'),
    'TESS_OFFLINE_NOTE 不得再指向已删的 examples/ 路径（T-002 死循环修复后必须给可执行工作流）',
  );
  assert.ok(
    !stdout.includes('far verify examples/'),
    '不得再出现 `far verify examples/...` 死循环指令',
  );
});

test('runDemo tess-offline: 必须给出可执行的 two-step verify 工作流（T-002 修复正向契约）', () => {
  const { stdout } = runDemoCapture('tess-offline');

  // 必须包含 export → verify 的 two-step 工作流（不再指向不存在路径）
  assert.ok(
    stdout.includes('far export far-proof --demo-chain'),
    'TESS_OFFLINE_NOTE 须给出 export 命令（生成可验证 bundle）',
  );
  assert.ok(
    stdout.includes('far verify --bundle'),
    'TESS_OFFLINE_NOTE 须给出 verify --bundle 命令（验证已生成 bundle）',
  );
});

test('runDemo tess-offline: 必须诚实标注 UNTESTED 是预期（非演示失败）', () => {
  const { stdout } = runDemoCapture('tess-offline');

  // 诚实边界声明：UNTESTED 是 demo 设计，不是 bug
  assert.ok(
    stdout.includes('UNTESTED') || stdout.includes('NO_DECISION_PATH'),
    'tess-offline 输出须含 UNTESTED/NO_DECISION_PATH 裁决（设计预期）',
  );
  assert.ok(
    stdout.toLowerCase().includes('honesty boundary') || stdout.includes('诚实边界') || stdout.includes('by design'),
    '须含 honesty boundary / by design 声明（UNTESTED 是设计预期，非演示失败）',
  );
});

test('runDemo tess-offline: 不得泄露 Next steps 中的 examples 路径', () => {
  const { stdout } = runDemoCapture('tess-offline');

  // Next steps 段也不得引用 examples/ 死路径
  const nextStepsIdx = stdout.indexOf('Next steps');
  if (nextStepsIdx !== -1) {
    const nextStepsSection = stdout.slice(nextStepsIdx);
    assert.ok(
      !nextStepsSection.includes('examples/tess-offline'),
      `Next steps 段不得引用 examples/ 死路径: ${nextStepsSection}`,
    );
  }
});

test('runDemo 未知子命令 → exit 2 + stderr 提示', () => {
  const { code, stderr } = runDemoCapture('unknown-sub');
  assert.equal(code, 2, '未知子命令 → exit 2');
  assert.match(stderr, /unknown subcommand/);
  assert.match(stderr, /tess-offline/);
});
