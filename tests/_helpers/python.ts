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
