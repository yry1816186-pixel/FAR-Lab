/**
 * Shared Python-environment helpers for tests that spawn venv sandboxes / real Python backends.
 *
 * DRY extraction of findPythonCommand / buildPythonPath / restorePythonPath / probeNumpy,
 * previously duplicated inline across 9 test files. cwd-relative resolve('repro') /('.python-deps')
 * preserved (tests run from repo root) — no behavior change vs the prior inline copies.
 */

import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';

export function findPythonCommand(): string | null {
  // Windows: 'python' first (WindowsApps python3 is a Store alias / differently-packaged);
  // Unix: 'python3'. Aligns with ensure_py_deps.mjs / smt_backend.ts convention.
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const command of candidates) {
    const r = spawnSync(command, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' });
    if (r.error === undefined && r.status === 0) {
      return command;
    }
  }
  return null;
}

export function buildPythonPath(previous: string | undefined): string {
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (previous !== undefined && previous.length > 0) {
    parts.push(previous);
  }
  return parts.join(delimiter);
}

export function restorePythonPath(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.PYTHONPATH;
  } else {
    process.env.PYTHONPATH = previous;
  }
}

export function probeNumpy(pythonCommand: string): boolean {
  const r = spawnSync(pythonCommand, ['-c', 'import numpy; print(numpy.__version__)'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: buildPythonPath(process.env.PYTHONPATH) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return r.error === undefined && r.status === 0 && r.stdout.trim().length > 0;
}

/**
 * CI 韧性（2026-08-07，run 31186354000 test_ts 卡 58min）：跨语言 Python spawn 必须带上限超时。
 * 无 timeout 的 spawnSync 一旦 Python 启动/导入被卡，node 主线程被阻塞 → 外层 --test-timeout
 * 也失效（事件循环冻结）→ 整个 node --test 静默挂起（零输出）。超时后 status=null + error=ETIMEDOUT，
 * 断言 fail-closed（红而非挂）。默认 30s：单次 canonical/merkle/verify 重算均 < 1s，30s 极充裕。
 */
export const PYTHON_SPAWN_TIMEOUT_MS = 30_000;

export function pythonSpawnFailureMessage(result: {
  status: number | null;
  stderr: string;
  stdout?: string;
  error?: unknown;
}): string {
  if (result.error !== undefined) {
    return `python spawn failed: ${(result.error as Error).message}\nstderr: ${result.stderr}`;
  }
  return result.stderr || result.stdout || `python exited with status ${String(result.status)}`;
}
