/**
 * Shared Python-environment discovery for CLI commands / sandbox spawns.
 *
 * DRY extraction of findPythonCommand / probeNumpy / buildPythonPath, previously
 * duplicated in src/cli/commands/{audit_seed_cherry,verify_golden}.ts. cwd-relative
 * resolve('repro')/('.python-deps') preserved (CLI runs from repo or package root).
 */

import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';

/** Find a working python3/python on PATH (Windows: 'python' first; Unix: 'python3'). null if none. */
export function findPythonCommand(): string | null {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const command of candidates) {
    const r = spawnSync(command, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' });
    if (r.error === undefined && r.status === 0) {
      return command;
    }
  }
  return null;
}

/** Probe whether pythonCommand can import numpy (sandbox BLS needs it). */
export function probeNumpy(pythonCommand: string): boolean {
  const r = spawnSync(pythonCommand, ['-c', 'import numpy; print(numpy.__version__)'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: buildPythonPath() },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return r.error === undefined && r.status === 0 && r.stdout.trim().length > 0;
}

/** Build PYTHONPATH: repro + .python-deps (+ existing). previous defaults to process.env.PYTHONPATH. */
export function buildPythonPath(previous: string | undefined = process.env.PYTHONPATH): string {
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (previous !== undefined && previous.length > 0) {
    parts.push(previous);
  }
  return parts.join(delimiter);
}
