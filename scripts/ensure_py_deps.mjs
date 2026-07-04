// Ensure Python replay/test dependencies are available without touching system Python.
// Installs pyproject.toml project.dependencies into .python-deps/ when imports are missing.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const pythonDepsDir = resolve(repoRoot, '.python-deps');
const reproDir = resolve(repoRoot, 'repro');
// 核心必装模块（缺则 ensure_py_deps 自动 pip install 进 .python-deps/）。
const requiredModules = ['threadpoolctl', 'numpy', 'sympy', 'z3'];
// 可选 science 模块（C-ASTRO / Phase 5 真实取数）。重依赖，**不**自动安装——
// 仅探测并报告可用性，缺失走 cached_fixture 降级（02 F1），非错误。
const optionalModules = ['lightkurve', 'astroquery'];

const baseEnv = {
  ...process.env,
  PYTHONPATH: buildPythonPath(),
};

const missingBefore = missingModules(baseEnv);
if (missingBefore.length === 0) {
  reportOptionalModules(baseEnv);
  process.exit(0);
}

mkdirSync(pythonDepsDir, { recursive: true });
const dependencies = readProjectDependencies();
const install = spawnSync(
  pythonCmd,
  [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--no-warn-conflicts',
    '--upgrade',
    '--target',
    pythonDepsDir,
    ...dependencies,
  ],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (install.error !== undefined || install.status !== 0) {
  const detail = install.error?.message ?? `pip exited with ${install.status ?? 'unknown status'}`;
  process.stderr.write(
    `ensure_py_deps: failed to install Python dependencies into .python-deps (${detail}).\n` +
      `Run manually: ${pythonCmd} -m pip install --target .python-deps ${dependencies.join(' ')}\n`,
  );
  process.exit(1);
}

const missingAfter = missingModules(baseEnv);
if (missingAfter.length > 0) {
  process.stderr.write(`ensure_py_deps: imports still missing after install: ${missingAfter.join(', ')}\n`);
  process.exit(1);
}

reportOptionalModules(baseEnv);

function reportOptionalModules(env) {
  // 可选 science 模块探测（非失败）：打印可用/缺失，供 C-ASTRO/Phase 5 skip 决策参考。
  const checkCode = [
    'import importlib.util, sys',
    `mods = ${JSON.stringify(optionalModules)}`,
    'avail = [m for m in mods if importlib.util.find_spec(m) is not None]',
    'print(",".join(avail))',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', checkCode], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) {
    process.stdout.write(`optional science modules: unavailable (probe failed)\n`);
    return;
  }
  const available = (result.stdout ?? '').trim();
  const availableSet = new Set(
    available.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
  );
  const present = optionalModules.filter((m) => availableSet.has(m));
  const absent = optionalModules.filter((m) => !availableSet.has(m));
  process.stdout.write(
    `optional science modules: ${present.length > 0 ? present.join(',') : 'none'} available` +
      (absent.length > 0 ? `; ${absent.join(',')} missing (cached_fixture fallback)` : '') +
      '\n',
  );
}

function buildPythonPath() {
  const existingPythonPath = process.env.PYTHONPATH;
  const parts = [reproDir, pythonDepsDir];
  if (existingPythonPath !== undefined && existingPythonPath.length > 0) {
    parts.push(existingPythonPath);
  }
  return parts.join(delimiter);
}

function missingModules(env) {
  const checkCode = [
    'import importlib.util, sys',
    `mods = ${JSON.stringify(requiredModules)}`,
    'missing = [m for m in mods if importlib.util.find_spec(m) is None]',
    'print("\\n".join(missing))',
    'sys.exit(1 if missing else 0)',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', checkCode], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    process.stderr.write(`ensure_py_deps: failed to spawn ${pythonCmd}: ${result.error.message}\n`);
    process.exit(1);
  }
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readProjectDependencies() {
  const readCode = [
    'import json, tomllib',
    'with open("pyproject.toml", "rb") as f:',
    '    data = tomllib.load(f)',
    'print(json.dumps(data["project"]["dependencies"]))',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', readCode], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? `exit ${result.status ?? '?'}`;
    process.stderr.write(`ensure_py_deps: failed to read pyproject.toml dependencies (${detail})\n`);
    process.exit(1);
  }
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    process.stderr.write('ensure_py_deps: pyproject.toml project.dependencies must be a string array\n');
    process.exit(1);
  }
  return parsed;
}
