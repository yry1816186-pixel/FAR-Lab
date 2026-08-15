// Ensure Python replay/test dependencies are available without touching system Python.
// Installs pyproject.toml project.dependencies into .python-deps/ when imports fail.

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
let install = installDependencies([]);
if (install.error !== undefined || install.status !== 0) {
  process.stderr.write(
    'ensure_py_deps: pip install failed with configured index; retrying via https://pypi.org/simple\n',
  );
  install = installDependencies(['--index-url', 'https://pypi.org/simple']);
}

if (install.error !== undefined || install.status !== 0) {
  const detail = install.error?.message ?? `pip exited with ${install.status ?? 'unknown status'}`;
  // F-4-102（R4）：pip 失败时 graceful skip（exit 0 + warn），而非硬阻断 pnpm test。
  // 原行为：exit 1 → package.json test 脚本以 ensure_py_deps 开头 → 整个 pnpm test 红灯。
  // 新行为：exit 0 + stderr warn → Python 轴测试自行 t.skip()（已由 science_harness 测试的
  // t.skip() 实现）→ 主套件仍可跑（offline demo / verify / kernel 不依赖 Python）。
  // 文档宣称 "graceful skip"（quickstart.md / installation.md / python_axis_probe.mjs 注释）
  // 本修复让代码与文档一致。
  process.stderr.write(
    `ensure_py_deps: WARNING — pip install failed (${detail}).\n` +
      `Python axis tests will be skipped. Core FAR-Lab functionality (offline demo / verify / kernel) is unaffected.\n` +
      `To enable Python axis: ${pythonCmd} -m pip install --upgrade --force-reinstall --target .python-deps ${dependencies.join(' ')}\n`,
  );
  process.exit(0);
}

const missingAfter = missingModules(baseEnv);
if (missingAfter.length > 0) {
  // F-4-102（R4）：与 pip 失败同处理——graceful skip 而非硬阻断。
  process.stderr.write(
    `ensure_py_deps: WARNING — imports still missing after install: ${missingAfter.join(', ')}.\n` +
      `Python axis tests will be skipped. Core FAR-Lab functionality is unaffected.\n`,
  );
  process.exit(0);
}

reportOptionalModules(baseEnv);

function reportOptionalModules(env) {
  // 可选 science 模块探测（非失败）：打印可用/缺失，供 C-ASTRO/Phase 5 skip 决策参考。
  const checkCode = [
    'import importlib, sys',
    `mods = ${JSON.stringify(optionalModules)}`,
    'avail = []',
    'for m in mods:',
    '    try:',
    '        importlib.import_module(m)',
    '        avail.append(m)',
    '    except Exception:',
    '        pass',
    'print(",".join(avail))',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', checkCode], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 30_000,
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
    'import importlib, sys',
    `mods = ${JSON.stringify(requiredModules)}`,
    'missing = []',
    'for m in mods:',
    '    try:',
    '        importlib.import_module(m)',
    '    except Exception:',
    '        missing.append(m)',
    'print("\\n".join(missing))',
    'sys.exit(1 if missing else 0)',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', checkCode], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      // 探测超时 → 按"全部缺失"继续走 install 路径；install 自带 300s 上限，失败仍 graceful skip。
      process.stderr.write(`ensure_py_deps: import probe timed out after 30s — treating all as missing\n`);
      return [...requiredModules];
    }
    process.stderr.write(`ensure_py_deps: failed to spawn ${pythonCmd}: ${result.error.message}\n`);
    process.exit(1);
  }
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function installDependencies(extraPipArgs) {
  // CI 韧性（2026-08-07，run 31186354000）：无 timeout 的 pip spawn 在 CI 上可能整块阻塞。
  // 300s 上限 + 前后进度行（可观测），超时后返回 status=null → 外层 graceful skip（F-4-102）。
  const startedAt = Date.now();
  process.stderr.write(
    `ensure_py_deps: pip install into .python-deps/ (timeout 300s; index=${extraPipArgs.length > 0 ? extraPipArgs.join(' ') : 'default'})\n`,
  );
  const result = spawnSync(
    pythonCmd,
    [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-warn-conflicts',
      ...extraPipArgs,
      '--upgrade',
      '--force-reinstall',
      '--target',
      pythonDepsDir,
      ...dependencies,
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      timeout: 300_000,
    },
  );
  const elapsedMs = Date.now() - startedAt;
  const outcome = result.error !== undefined || result.status !== 0 ? 'FAILED' : 'OK';
  process.stderr.write(
    `ensure_py_deps: pip install ${outcome} after ${elapsedMs}ms (status=${String(result.status)}; error=${result.error?.message ?? 'none'})\n`,
  );
  return result;
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
    timeout: 30_000,
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
