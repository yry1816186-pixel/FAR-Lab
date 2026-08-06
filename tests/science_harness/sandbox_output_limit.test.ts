// tests/science_harness/sandbox_output_limit.test.ts
// 测 spawnVenv 输出上限：失控脚本打印超限 → 强制中断（timedOut + outputLimitExceeded）→ 宿主无 OOM 风险。
//
// 审计背景（P1-2）：stdout/stderr 无限收集 → 恶意/失控脚本可耗尽宿主内存。
// 修复：MAX_OUTPUT_BYTES 上限，超限 killProcessGroup + outputLimitExceeded 标记。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findPythonCommand, buildPythonPath, restorePythonPath } from '../_helpers/python.ts';

import { spawnVenv, MAX_OUTPUT_BYTES } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 20_000,
};

test('spawnVenv: 输出超过 MAX_OUTPUT_BYTES → 强制中断（timedOut + outputLimitExceeded）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    // 脚本打印 2× 上限字节（20MB）——若无限收集则宿主缓冲 20MB。
    const flood = MAX_OUTPUT_BYTES * 2;
    const result = await spawnVenv(
      {
        script: `import sys\nsys.stdout.write('x' * ${flood})\nprint('done')`,
        pythonCmd: pythonCommand,
        seed: 1,
      },
      RESOURCES,
    );
    assert.equal(result.outputLimitExceeded, true, '输出超限必须被标记');
    assert.equal(result.timedOut, true, '输出超限 = 资源中断，必须 timedOut');
    // kill 是异步的：管道中已缓冲的残余（数十 KB 级）仍会被收集——上限是软阈值（防 OOM 的有界性保证）。
    // 核心不变量：收集量 << 脚本全量（20MB），即确实被中断而非全量缓冲。
    assert.ok(
      result.stdout.length < flood,
      `stdout 不得保留全量超限输出（实测 ${result.stdout.length}B < ${flood}B）`,
    );
    assert.ok(
      result.stdout.length <= MAX_OUTPUT_BYTES + 512 * 1024,
      `收集量应接近上限（允许管道残余）：实测 ${result.stdout.length}B`,
    );
  } finally {
    restorePythonPath(previous);
  }
});

test('spawnVenv: 正常小输出不受影响（outputLimitExceeded=false）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const result = await spawnVenv(
      { script: "print('hello')", pythonCmd: pythonCommand, seed: 1 },
      RESOURCES,
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.outputLimitExceeded, false);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, /hello/);
  } finally {
    restorePythonPath(previous);
  }
});
