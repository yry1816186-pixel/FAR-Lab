// Cross-platform Python test runner (Windows-compatible).
// 职责：设置 PYTHONPATH=repro + .python-deps 并 spawn python3 -m unittest discover，
// 解决 package.json 直接用 POSIX 语法 `PYTHONPATH=repro python3 ...` 在 Windows 失败的问题。
// 跨平台：用 process.env 显式设置环境变量 + spawn 继承 stdio + 透传退出码。
// Authority: Task 10.6（test:py Windows compat fix）/ Task 7（P3-1 Python axis 能力探针）.

import { spawn, spawnSync, execSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();

function buildPythonAxisEnv() {
  const pythonPath = resolve(repoRoot, 'repro');
  const pythonDepsPath = resolve(repoRoot, '.python-deps');
  const existingPythonPath = process.env.PYTHONPATH;
  const pythonPathParts = [pythonPath, pythonDepsPath];
  if (existingPythonPath !== undefined && existingPythonPath.length > 0) {
    pythonPathParts.push(existingPythonPath);
  }

  return {
    ...process.env,
    PYTHONPATH: pythonPathParts.join(delimiter),
  };
}

// P3-1: 真实依赖 = spawnSync python3 + 'import sympy, z3'。环境失败 ≠ 代码 bug（CLAUDE.md §3 第3条不变式）。
// 首行输出格式固定为 'Python axis: available' 或 'Python axis: skipped (<reason>)'，须在任何其他输出之前。
// write 注入仅用于测试捕获首行契约；默认写 process.stdout（生产行为不变）。
export function probePythonAxis(write = (s) => process.stdout.write(s)) {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const probe = spawnSync(pythonCmd, ['-c', 'import sympy, z3; print("available")'], {
    encoding: 'utf8',
    env: buildPythonAxisEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (probe.error !== undefined || probe.status !== 0) {
    const stderr = (probe.stderr ?? '').trim();
    let reason;
    if (probe.error !== undefined) {
      reason = `${pythonCmd} not on PATH`;
    } else if (/ModuleNotFoundError.*sympy/.test(stderr) || /ImportError.*sympy/.test(stderr)) {
      reason = 'sympy import failed';
    } else if (/ModuleNotFoundError.*z3/.test(stderr) || /ImportError.*z3/.test(stderr) || /No module named 'z3'/.test(stderr)) {
      reason = 'z3 import failed';
    } else {
      reason = `unknown: ${stderr.slice(0, 200).replace(/[\r\n]+/g, ' ').trim()}`;
    }
    write(`Python axis: skipped (${reason})\n`);
    return { available: false, reason };
  }
  write('Python axis: available\n');
  return { available: true };
}

// fail-closed 红线：CI PR 模式下 Python axis 不可用且 PR diff 触动 src/ 中 Python-axis 覆盖符号 → exit 1。
// 本地直跑（无 GITHUB_ACTIONS / GITHUB_EVENT_NAME）不触发；non-PR CI 事件不触发。
// P1-6: sandbox_runner / dataset_resolver 真 spawn python 子进程 → 触动它们 = Python-axis 覆盖。
const PY_AXIS_SYMBOLS = [
  'verifyEnvelopeV2WithPython',
  'cross_lang_consistency',
  'cas_backend',
  'smt_backend',
  'sandbox_runner',
  'dataset_resolver',
];

function failIfCIPRTouchedPyAxis() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    return;
  }
  const base = process.env.GITHUB_BASE_REF;
  const head = process.env.GITHUB_HEAD_REF;
  if (!base || !head) return;
  if (!/^[A-Za-z0-9._/-]+$/.test(base) || !/^[A-Za-z0-9._/-]+$/.test(head)) return;
  let diff = '';
  try {
    diff = execSync(`git diff origin/${base}...origin/${head} -- src/`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return;
  }
  if (diff.length === 0) return;
  const touched = PY_AXIS_SYMBOLS.filter((sym) => new RegExp(`\\b${sym}\\b`).test(diff));
  if (touched.length > 0) {
    process.stderr.write(`Python axis 不可用但 PR diff 触动 Python-axis 覆盖符号：${touched.join(', ')}\n`);
    process.exit(1);
  }
}

// 直接调用（CLI）才跑探针 + unittest 套件；被 import（单元测试 probePythonAxis）时不跑，
// 避免 import 触发整套 Python 测试 + process.exit 污染测试进程（与 depth_evidence.mjs 同口径）。
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (invokedDirectly) {
  const probe = probePythonAxis();
  if (!probe.available) {
    failIfCIPRTouchedPyAxis();
  }

  const env = buildPythonAxisEnv();

  // python3 on Linux/macOS, python on Windows
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(
    pythonCmd,
    ['-m', 'unittest', 'discover', '-s', 'repro/tests', '-p', 'test_*.py'],
    {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    },
  );

  child.on('error', (err) => {
    console.error(`run_py_tests: failed to spawn ${pythonCmd}:`, err.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
}
