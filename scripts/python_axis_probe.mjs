// scripts/python_axis_probe.mjs
// P3-1：suite 起跑时单条 Python-axis 能力探针，打印清晰状态行。
//
// 让 Python axis 的 available|skipped 状态在测试起跑时可见，避免 axis skipped 被误当代码 bug
// 。探针永不阻断 test（始终 exit 0）。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

function buildPythonPath() {
  const parts = [resolve(repoRoot, '.python-deps'), resolve(repoRoot, 'repro')].filter(existsSync);
  const sysPath = process.env.PYTHONPATH ?? '';
  return [...parts, sysPath].filter((p) => p.length > 0).join(delimiter);
}

const env = { ...process.env, PYTHONPATH: buildPythonPath() };

const pyOk = spawnSync(pythonCmd, ['-c', 'import sys; print(sys.version.split()[0])'], {
  encoding: 'utf8',
  env,
});

if (pyOk.status !== 0) {
  process.stdout.write('Python axis: skipped (python interpreter unavailable)\n');
  process.exit(0);
}

const version = pyOk.stdout.trim();
const modsOk = spawnSync(pythonCmd, ['-c', 'import sympy, z3, numpy; print("ok")'], {
  encoding: 'utf8',
  env,
});

if (modsOk.status !== 0) {
  process.stdout.write(
    `Python axis: skipped (core modules missing — python ${version} present but sympy/z3/numpy 未装；run: node scripts/ensure_py_deps.mjs)\n`,
  );
  process.exit(0);
}

process.stdout.write(`Python axis: available (python ${version} · sympy/z3/numpy ok)\n`);
process.exit(0);
