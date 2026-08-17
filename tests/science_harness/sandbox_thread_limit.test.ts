// tests/science_harness/sandbox_thread_limit.test.ts
//
// SR-7 跨语言回执反例：用系统 Python 真实创建一个 --without-pip venv，再从
// 不含仓库 .python-deps 的 cwd 启动全新 Node 进程。这使 sandbox_runner.py 的
// `import threadpoolctl` 真实失败（非 stub/mock），同时经过生产 spawnVenv + Python JSON wire +
// computeSandboxRunResult 整条路径。脚本内的哨兵输出不得出现，证明缺依赖在 exec 前 fail-closed。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPythonPath,
  findPythonCommand,
  probeNumpy,
  PYTHON_SPAWN_TIMEOUT_MS,
  restorePythonPath,
} from '../_helpers/python.ts';
import { venvSandboxAdapter } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 15_000,
};

const PYTHON_RUNNER = resolve('repro/science_harness/sandbox_runner.py');

test('python sandbox wire: invalid JSON emits a complete non-execution thread receipt', () => {
  const pythonCommand = findPythonCommand();
  assert.notEqual(pythonCommand, null, 'python3/python is required for the real sandbox protocol test');
  if (pythonCommand === null) return;
  const processResult = spawnSync(
    pythonCommand,
    [PYTHON_RUNNER],
    {
      input: '{',
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: buildPythonPath(process.env.PYTHONPATH) },
      timeout: PYTHON_SPAWN_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  assert.equal(processResult.status, 0, processResult.stderr);
  assert.equal(processResult.stderr, '', 'wrapper diagnostics belong inside the JSON manifest');
  const manifest = JSON.parse(processResult.stdout) as {
    readonly exitCode: number;
    readonly singleThreaded: boolean;
    readonly threadLimitReason: string;
  };
  assert.equal(manifest.exitCode, 2);
  assert.equal(manifest.singleThreaded, false);
  assert.equal(manifest.threadLimitReason, 'execution_not_started');
});

test('venv sandbox: missing threadpoolctl fails before user execution and propagates an honest SR-7 receipt', () => {
  const pythonCommand = findPythonCommand();
  assert.notEqual(pythonCommand, null, 'python3/python is required for the real sandbox backend test');
  if (pythonCommand === null) return;

  const work = mkdtempSync(join(tmpdir(), 'far-thread-limit-'));
  try {
    const venvDir = join(work, 'isolated-venv');
    const createVenv = spawnSync(
      pythonCommand,
      ['-m', 'venv', '--without-pip', venvDir],
      { encoding: 'utf8', timeout: PYTHON_SPAWN_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.equal(
      createVenv.status,
      0,
      `failed to create real dependency-free venv: ${createVenv.stderr || String(createVenv.error)}`,
    );

    const isolatedPython = process.platform === 'win32'
      ? join(venvDir, 'Scripts', 'python.exe')
      : join(venvDir, 'bin', 'python');
    const runnerUrl = pathToFileURL(resolve('src/science_harness/sandbox_runner.ts')).href;
    const childProgram = [
      `import { venvSandboxAdapter } from ${JSON.stringify(runnerUrl)};`,
      `const result = await venvSandboxAdapter.executeAsync(`,
      `  { script: ${JSON.stringify('print("USER_SCRIPT_MUST_NOT_RUN")')}, pythonCmd: ${JSON.stringify(isolatedPython)} },`,
      `  { cpu: { limitMillicores: 1000 }, memory: { limitMb: 512 }, timeoutMs: 15000 },`,
      `);`,
      `process.stdout.write(JSON.stringify(result));`,
    ].join('\n');
    const childEnv = { ...process.env, PYTHONPATH: '' };
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', childProgram],
      {
        cwd: work,
        env: childEnv,
        encoding: 'utf8',
        timeout: PYTHON_SPAWN_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    assert.equal(child.status, 0, `nested production runner failed: ${child.stderr || String(child.error)}`);

    const result = JSON.parse(child.stdout) as {
      readonly exitCode: number;
      readonly singleThreaded: boolean;
      readonly threadLimitReason: string;
      readonly stdoutHash: string;
      readonly stderrHash: string;
    };
    assert.equal(result.exitCode, 78, 'missing deterministic dependency must fail-closed');
    assert.equal(result.singleThreaded, false, 'receipt must not claim an unapplied thread limit');
    assert.equal(result.threadLimitReason, 'threadpoolctl_unavailable');
    // sha256("") — Python returned no user stdout, so the sentinel print was never executed.
    assert.equal(result.stdoutHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.notEqual(
      result.stderrHash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'failure receipt must retain a non-empty diagnostic',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('venv sandbox: a script that re-expands a real numerical pool invalidates the SR-7 receipt', async () => {
  const pythonCommand = findPythonCommand();
  assert.notEqual(pythonCommand, null, 'python3/python is required for the real sandbox backend test');
  if (pythonCommand === null) return;
  assert.equal(probeNumpy(pythonCommand), true, 'numpy is required for the real native-thread-pool counterexample');

  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    const script = [
      'import os',
      'for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "BLIS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS"):',
      '    os.environ[key] = "2"',
      'import numpy as np',
      'print(np.dot(np.arange(3), np.arange(3)))',
    ].join('\n');
    const result = await venvSandboxAdapter.executeAsync(
      { script, pythonCmd: pythonCommand },
      RESOURCES,
    );
    assert.equal(result.exitCode, 78, 'verified nthread!=1 must invalidate an otherwise successful run');
    assert.equal(result.singleThreaded, false);
    assert.equal(result.threadLimitReason, 'threadpool_limit_not_one');
  } finally {
    restorePythonPath(previous);
  }
});

test('venv sandbox red team: thread verifier does not make the dlopen audit set rebindable', async () => {
  const pythonCommand = findPythonCommand();
  assert.notEqual(pythonCommand, null, 'python3/python is required for the real sandbox backend test');
  if (pythonCommand === null) return;

  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    // PEP 578 fires 'ctypes.dlopen' before any load attempt, so a slash-containing
    // nonexistent path is the cross-platform / cross-Python-version trigger:
    // CDLL(None) TypeErrors in pure-Python ctypes on Python >= 3.12 before the audit
    // event ever fires (observed: 3.12.10 win32 → exit 1, not 126).
    const result = await venvSandboxAdapter.executeAsync(
      {
        script: [
          'import __main__',
          'import ctypes',
          '__main__._AUDIT_REJECT_EVENTS = frozenset()',
          "ctypes.CDLL('/sandbox/redteam/fake-dlopen-probe.so')",
        ].join('\n'),
        pythonCmd: pythonCommand,
      },
      RESOURCES,
    );
    assert.equal(result.exitCode, 126, 'rebinding a module global must not disable the captured audit policy');
  } finally {
    restorePythonPath(previous);
  }
});
