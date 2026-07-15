// tests/science_harness/sandbox_pgroup_kill.test.ts
//
// FUSION-OS-2 端到端 RED→GREEN：spawn detached=true 独立进程组 + 超时 process.kill(-pgid) 组播清理，
// 防 subprocess.Popen 子孙成孤儿（Open Science setsid+kill -- -$pgid 范式）。
//
// 单一真实依赖（CLAUDE.md §1）：
//   - 真实 killProcessGroup（src/science_harness/sandbox_runner.ts:killProcessGroup）POSIX process.kill(-pgid) /
//     win taskkill /T —— 非 Fake·真实进程组/tree kill。
//   - 真实 Python 父进程（Node spawn detached=true 直接起·不经 sandbox_runner.py 故不挂 OS-8 audit hook）
//     subprocess.Popen 派生真孙 python 进程（sleep 60s）—— 验证组 kill 杀尽孤孙，非仅单进程。
//   - 真实 spawnVenv timer 路径（sandbox_runner.ts:spawnVenv 自管 setTimeout + killProcessGroup）。
//
// OS-2 与 OS-8 的语义关系（诚实声明）：OS-8 audit hook 在 sandbox_runner.py 内禁 subprocess.Popen（沙箱内禁 spawn），
// 故 OS-2 的「组 kill 杀孙进程」无法经 audited sandbox 验证（Popen 一调即 exit 126）。OS-2 的组 kill 是
// **defense-in-depth 清理原语**——覆盖 audit hook 被绕过 / native-spawned 子孙 / 超时路径的兜底清理。
// 故本测试经 Node 直接 spawn python 父（绕开 sandbox_runner.py audit hook）派生真孙进程，调 killProcessGroup 验证。
//
// RED→GREEN 论证：
//   RED（接线前）：spawn 无 detached + Node `timeout` 选项只对单进程发 SIGTERM → python 父被杀，
//     但 subprocess.Popen 派生的孙进程继承父 group 却不被 Node timeout 触及 → 孤儿存活（reparent to init）。
//   GREEN（接线后）：detached=true 让 python 父成新进程组 leader（pgid=pid）；killProcessGroup →
//     process.kill(-pid) 组播 SIGKILL（win taskkill /T 递归）→ 孙进程同组被杀，不成孤儿。
//
// 反剧场红线（FUSION-OS-2 + CLAUDE.md §5）：fail-closed 清理。超时不仅杀直接子进程，杀整组——
// 防孤孙绕过 sandbox 约束存活。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-2 +
//            FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-2（setsid+kill -$pgid 范式）。

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { killProcessGroup, spawnVenv } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 15_000,
};

// FUSION-OS-2 主证：killProcessGroup（spawnVenv timer 调用的组 kill 原语）杀尽 subprocess.Popen 派生的孙进程。
test('timeout_kills_python_grandchildren: process group kill 杀尽孤孙（FUSION-OS-2）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const work = mkdtempSync(resolve(tmpdir(), 'far-pgroup-'));
  const gcpidFile = resolve(work, 'gcpid.txt');
  // python 父脚本：派生孙进程（sleep 60s）+ 写其 PID 到文件，自身 sleep 60s。
  // 经 Node spawn 直接起（不经 sandbox_runner.py → 不挂 OS-8 audit hook → 可 subprocess.Popen）。
  const parentScript =
    'import subprocess, sys, time, os\n' +
    'p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])\n' +
    `with open(${JSON.stringify(gcpidFile)}, "w") as f:\n` +
    '    f.write(str(p.pid))\n' +
    'time.sleep(60)\n';
  let parent: ReturnType<typeof spawn> | null = null;
  let grandchildPid: number | null = null;
  try {
    parent = spawn(pythonCommand, ['-c', parentScript], {
      stdio: 'ignore',
      detached: true,
    });
    // 等 python 父写出 gcpid 文件（Popen 返回 + 文件落盘）。
    grandchildPid = await waitForPidFile(gcpidFile, 5000);
    if (grandchildPid === null) {
      t.skip('grandchild PID file not written (subprocess.Popen unavailable in this python env)');
      return;
    }
    // 杀前：父 + 孙均存活。
    assert.equal(isProcessAlive(parent.pid ?? -1), true, 'python parent must be alive before group kill');
    assert.equal(isProcessAlive(grandchildPid), true, 'grandchild must be alive before group kill');

    // 触发组 kill（spawnVenv timer 超时时调用的同一原语）。
    killProcessGroup(parent);

    // 孙进程应同组被杀（非孤儿）。轮询 3s。
    const dead = await waitForProcessDead(grandchildPid, 3000);
    assert.equal(
      dead,
      true,
      `grandchild pid=${grandchildPid} must be killed with parent (FUSION-OS-2 group kill), still alive after 3s`,
    );
  } finally {
    // 测试卫生：force-kill 残留（断言失败路径防泄漏）。
    if (grandchildPid !== null) forceKillPid(grandchildPid);
    if (parent !== null && parent.exitCode === null && parent.pid !== undefined) {
      try {
        killProcessGroup(parent);
      } catch {
        // best-effort。
      }
    }
    rmSync(work, { recursive: true, force: true });
  }
});

// FUSION-OS-2 spawnVenv timer 集成：长睡脚本 + 短超时 → timedOut=true（timer 触发 killProcessGroup）。
test('spawnVenv_timeout_fires_group_kill: 长 sleep + 短 timeout → timedOut=true（FUSION-OS-2 timer 路径）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    // 不用 subprocess（OS-8 audit hook 禁）——纯 time.sleep，验证 spawnVenv timer 路径触发组 kill。
    const result = await spawnVenv(
      { script: 'import time; time.sleep(60)', pythonCmd: pythonCommand, seed: 42, timeoutMs: 1200 },
      RESOURCES,
    );
    assert.equal(result.timedOut, true, 'spawnVenv must report timedOut after group kill timer fires');
    assert.equal(result.exitCode, 124, 'timedOut result must surface as exitCode 124');
    // wallClockMs 应接近 timeout（~1.2s），远小于 60s——证明 timer 触发后快速清理，非等满 60s。
    assert.ok(
      result.wallClockMs < 10_000,
      `wallClockMs ${result.wallClockMs} must be bounded by group kill (<<60s)`,
    );
  } finally {
    restorePythonPath(previous);
  }
});

async function waitForPidFile(file: string, timeoutMs: number): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const text = readFileSync(file, 'utf8').trim();
      const pid = Number.parseInt(text, 10);
      if (Number.isFinite(pid) && pid > 0) return pid;
    } catch {
      // 文件尚未写出——继续等。
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function waitForProcessDead(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isProcessAlive(pid);
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function forceKillPid(pid: number): void {
  if (!isProcessAlive(pid)) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // best-effort 测试卫生清理。
  }
}

function findPythonCommand(): string | null {
  // Windows: 'python' 优先（WindowsApps python3 是 Store stub / 异装缺包）；Unix: 'python3'。对齐 ensure_py_deps.mjs / smt_backend.ts 约定。
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const command of candidates) {
    const r = spawnSync(command, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' });
    if (r.error === undefined && r.status === 0) {
      return command;
    }
  }
  return null;
}

function buildPythonPath(previous: string | undefined): string {
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (previous !== undefined && previous.length > 0) {
    parts.push(previous);
  }
  return parts.join(delimiter);
}

function restorePythonPath(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.PYTHONPATH;
  } else {
    process.env.PYTHONPATH = previous;
  }
}
