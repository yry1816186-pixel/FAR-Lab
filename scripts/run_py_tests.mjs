// Cross-platform Python test runner (Windows-compatible).
// 职责：设置 PYTHONPATH=repro 并 spawn python3 -m unittest discover，
// 解决 package.json 直接用 POSIX 语法 `PYTHONPATH=repro python3 ...` 在 Windows 失败的问题。
// 跨平台：用 process.env 显式设置环境变量 + spawn 继承 stdio + 透传退出码。
// Authority: Task 10.6（test:py Windows compat fix）.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const pythonPath = resolve(repoRoot, 'repro');

const env = {
  ...process.env,
  PYTHONPATH: pythonPath,
};

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
  console.error('run_py_tests: failed to spawn python3:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
