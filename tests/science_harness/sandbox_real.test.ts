// tests/science_harness/sandbox_real.test.ts
//
// P1-6 Phase 4 端到端物证：venvSandboxAdapter 真起 python 子进程执行用户脚本（非桩）。
//
// 真实依赖（file:line）：
//   - src/science_harness/sandbox_runner.ts:venvSandboxAdapter.executeAsync（真 spawn）
//   - src/science_harness/sandbox_runner.ts:spawnVenv（spawn(pythonCmd, [SANDBOX_RUNNER_PY])）
//   - repro/science_harness/sandbox_runner.py:main（threadpoolctl(1)+seed+exec 用户脚本+emit JSON+scan_artifacts）
//
// 诚实边界：缺 python = 环境问题 → t.skip（不当代码 bug）。缺 threadpoolctl 不 skip
// （sandbox 优雅降级，确定性 Python random 不依赖它）。
//
// Authority: P1-6 + 12 §1.2 SR-2/SR-3/SR-5/SR-7。

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findPythonCommand, buildPythonPath, restorePythonPath } from '../_helpers/python.ts';

import { venvSandboxAdapter } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 15_000,
};

test('venv sandbox: real spawn executes deterministic script + computes sha256 hash anchors (P1-6)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const result = await venvSandboxAdapter.executeAsync(
      { script: 'print(2 + 3)', pythonCmd: pythonCommand, seed: 42 },
      RESOURCES,
    );
    assert.equal(result.exitCode, 0, `expected exit 0, stderr-hash=${result.stderrHash}`);
    assert.equal(result.seed, 42, 'SR-2 seed must flow into result');
    assert.equal(result.networkBlocked, true, 'default networkPolicy=off -> networkBlocked=true (SR-5)');
    assert.equal(result.singleThreaded, true, 'SR-7 nthread=1');
    assert.equal(result.timedOut, false);
    assert.match(result.stdoutHash, /^[0-9a-f]{64}$/, 'stdoutHash must be real sha256');
    assert.match(result.stderrHash, /^[0-9a-f]{64}$/, 'stderrHash must be real sha256');
    // sha256("5\n") —— 证明 stdout 真实捕获（print(2+3) → "5\n"），非占位。
    assert.equal(result.stdoutHash, sha256Hex('5\n'));
    assert.equal(result.artifacts.length, 0);
  } finally {
    restorePythonPath(previous);
  }
});

test('venv sandbox: real spawn captures artifact manifest (sha256 + bytes) from WORKING_DIR', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  const work = mkdtempSync(resolve(tmpdir(), 'far-sandbox-art-'));
  try {
    const payload = 'deterministic_artifact_seed42\n';
    // 二进制模式写：避免 Windows text-mode 把 \n 翻译成 \r\n（跨平台字节确定性）。
    // JSON.stringify(payload) 产出含转义 \n 的双引号串，前缀 b 即合法 Python 字节字面量。
    const script =
      'import os\n' +
      `with open(os.path.join(WORKING_DIR, "result.txt"), "wb") as f:\n` +
      `    f.write(b${JSON.stringify(payload)})\n`;
    const result = await venvSandboxAdapter.executeAsync(
      { script, pythonCmd: pythonCommand, seed: 42, workingDir: work },
      RESOURCES,
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.artifacts.length, 1, 'artifact manifest must contain the written file');
    const art = result.artifacts[0];
    assert.equal(art?.path, 'result.txt');
    assert.equal(art?.bytes, Buffer.byteLength(payload, 'utf8'));
    assert.equal(art?.contentHash, sha256Hex(payload), 'artifact contentHash must be real sha256 of file bytes');
    assert.match(result.artifactTreeHash, /^[0-9a-f]{64}$/, 'artifactTreeHash must be real sha256');
  } finally {
    restorePythonPath(previous);
    rmSync(work, { recursive: true, force: true });
  }
});

test('venv sandbox: real spawn captures script exception -> exitCode 1 + non-empty stderr', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const result = await venvSandboxAdapter.executeAsync(
      { script: 'raise ValueError("far_sandbox_probe")', pythonCmd: pythonCommand, seed: 42 },
      RESOURCES,
    );
    assert.equal(result.exitCode, 1, 'raised exception must surface as exitCode 1');
    assert.notEqual(result.stderrHash, sha256Hex(''), 'stderr must capture the traceback (non-empty)');
  } finally {
    restorePythonPath(previous);
  }
});

test('venv sandbox: SR-2 seed determinism — same seed -> identical stdoutHash; different seed -> different', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const script = 'import random\nprint(round(random.random(), 6))';
    const r1 = await venvSandboxAdapter.executeAsync(
      { script, pythonCmd: pythonCommand, seed: 42 },
      RESOURCES,
    );
    const r2 = await venvSandboxAdapter.executeAsync(
      { script, pythonCmd: pythonCommand, seed: 42 },
      RESOURCES,
    );
    const r3 = await venvSandboxAdapter.executeAsync(
      { script, pythonCmd: pythonCommand, seed: 43 },
      RESOURCES,
    );
    assert.equal(r1.exitCode, 0);
    assert.equal(
      r1.stdoutHash,
      r2.stdoutHash,
      'same seed (42) must yield identical stdoutHash (SR-2 reproducibility)',
    );
    assert.notEqual(
      r1.stdoutHash,
      r3.stdoutHash,
      'different seed (43) must yield different stdoutHash (seed flows into RNG)',
    );
  } finally {
    restorePythonPath(previous);
  }
});

test('venv sandbox: SR-4 input.timeoutMs bypass closed — exceeds ceiling throws fail-closed (no spawn)', async () => {
  // 回归（对抗审查 confirmed）：input.timeoutMs 曾绕过 validateResourceSpec（只校验 resources.timeoutMs），
  // spawnVenv 用 input.timeoutMs ?? resources.timeoutMs 后直接喂 spawn·无二次校验。
  // 现对 effective timeoutMs 跑 SR-4 上限 → 超 ceiling fail-closed 抛错（禁静默放宽·反假绿）。
  // 不依赖 python：throw 在 spawn 前同步发生，executeAsync reject 传播。
  await assert.rejects(
    venvSandboxAdapter.executeAsync({ script: 'print(1)', timeoutMs: 300_000 }, RESOURCES),
    /SR-4 ceiling/,
    'input.timeoutMs > RESOURCE_LIMITS.timeoutMs(120000) must throw fail-closed (closes bypass)',
  );
});

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
