// tests/science_harness/preflight.test.ts
//
// FUSION-OS-4 端到端 RED→GREEN：spawnVenv 前 preflightWorkingDir 预算预扫（.git-cap /
// symlink-O_NOFOLLOW / 文件数 cap / container 检测·Open Science gitScanWorker 范式·用户态降级版）。
//
// 单一真实依赖（CLAUDE.md §1）：
//   - 真实 preflightWorkingDir（src/science_harness/sandbox_runner.ts:preflightWorkingDir）
//     真实 existsSync(.git) + readdirSync({withFileTypes}) + Dirent.isSymbolicLink() lstat 等价遍历
//     （非 Fake·真实 fs 操作 + 文件数计数 + symlink 形状判定）。
//   - 真实 spawnVenv（sandbox_runner.ts:spawnVenv）preflight 拒绝 → 不 spawn·返回 exitCode 126
//     （非桩·真实 fs 预扫接入 spawn 前 fail-closed 路径）。
//
// RED→GREEN 论证：
//   RED（接线前）：spawnVenv 直接把 workingDir 喂给 Python 子进程（sandbox_runner.py os.makedirs + exec），
//     无 spawn 前 fs 预扫 → 攻击者可塞 .git（artifact 扫描爆量 / 仓库泄漏）或 symlink（path traversal
//     逃逸 workingDir）或洪水文件（zip-bomb），Python 侧无防御。
//   GREEN（接线后）：preflightWorkingDir 在 spawn 前 .git-cap 拒绝 / symlink O_NOFOLLOW 拒绝 /
//     文件数 > cap 拒绝；spawnVenv 调用 preflight，fail-closed → exitCode 126 + 不 spawn。
//
// 反剧场红线（FUSION-OS-4 + CLAUDE.md §5）：收窄伪造窗口。spawn 前显式拒绝已知恶意形状，
// 非 OS 级强隔离保证（07_RISK_REGISTER §188·真隔离 V2 路线·诚实声明）。
//
// Authority: PROJECT_PLAN/DEPTH_LEDGER.md §C FUSION-OS-4 +
//            PROJECT_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-4（gitScanWorker 范式）。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { preflightWorkingDir, venvSandboxAdapter } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 15_000,
};

// FUSION-OS-4 主证：preflightWorkingDir 拒绝 .git flood + symlink + 文件洪水，放行 clean dir。
test('git_flood_and_symlink_escape_rejected: preflightWorkingDir 拒绝已知恶意形状（FUSION-OS-4）', () => {
  // 1. .git flood：workingDir 含 .git 目录 → 拒绝。
  const gitDir = mkdtempSync(resolve(tmpdir(), 'far-preflight-git-'));
  try {
    mkdirSync(resolve(gitDir, '.git'));
    writeFileSync(resolve(gitDir, '.git', 'config'), '[remote]');
    const r1 = preflightWorkingDir(gitDir);
    assert.equal(r1.ok, false, '.git in workingDir must be rejected (git-flood)');
    assert.match(r1.reason, /git-flood/, 'reason must mention git-flood');
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }

  // 2. symlink escape：workingDir 含 symlink 指向外部 → O_NOFOLLOW 拒绝（永不跟随）。
  const linkDir = mkdtempSync(resolve(tmpdir(), 'far-preflight-link-'));
  const outsideTarget = mkdtempSync(resolve(tmpdir(), 'far-preflight-out-'));
  try {
    writeFileSync(resolve(outsideTarget, 'secret.txt'), 'escaped');
    let symlinkCreated = true;
    try {
      symlinkSync(resolve(outsideTarget, 'secret.txt'), resolve(linkDir, 'escape.link'));
    } catch {
      // Windows 非管理员无 SeCreateSymbolicLinkPrivilege → symlinkSync EPERM；本子断言跳过。
      symlinkCreated = false;
    }
    if (symlinkCreated) {
      const r2 = preflightWorkingDir(linkDir);
      assert.equal(r2.ok, false, 'symlink in workingDir must be rejected (O_NOFOLLOW)');
      assert.match(r2.reason, /symlink/, 'reason must mention symlink');
    }
  } finally {
    rmSync(linkDir, { recursive: true, force: true });
    rmSync(outsideTarget, { recursive: true, force: true });
  }

  // 3. 文件洪水：文件数 > cap → 拒绝（zip-bomb / flood）。
  const floodDir = mkdtempSync(resolve(tmpdir(), 'far-preflight-flood-'));
  try {
    for (let i = 0; i < 4; i++) {
      writeFileSync(resolve(floodDir, `f${i}.txt`), 'x');
    }
    const r3 = preflightWorkingDir(floodDir, { fileCap: 3 });
    assert.equal(r3.ok, false, 'file count > cap must be rejected (flood/zip-bomb)');
    assert.match(r3.reason, /exceeds cap/, 'reason must mention cap');
    assert.equal(r3.fileCount, 4, 'fileCount must report actual count');
  } finally {
    rmSync(floodDir, { recursive: true, force: true });
  }

  // 4. clean dir：正常文件 → 放行。
  const cleanDir = mkdtempSync(resolve(tmpdir(), 'far-preflight-clean-'));
  try {
    writeFileSync(resolve(cleanDir, 'a.txt'), '1');
    writeFileSync(resolve(cleanDir, 'b.txt'), '2');
    const r4 = preflightWorkingDir(cleanDir);
    assert.equal(r4.ok, true, 'clean workingDir must pass preflight');
    assert.equal(r4.fileCount, 2, 'fileCount must be 2');
  } finally {
    rmSync(cleanDir, { recursive: true, force: true });
  }

  // 5. 空 workingDir → 放行（无 workingDir 不预扫）。
  const r5 = preflightWorkingDir('');
  assert.equal(r5.ok, true, 'empty workingDir must pass (no preflight)');
});

// FUSION-OS-4 spawn 集成：workingDir 含 .git → spawnVenv 不 spawn·返回 exitCode 126。
test('preflight_blocks_spawn_on_git_flood: spawnVenv returns exitCode 126 without spawning（FUSION-OS-4）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const gitDir = mkdtempSync(resolve(tmpdir(), 'far-preflight-spawn-'));
  try {
    mkdirSync(resolve(gitDir, '.git'));
    writeFileSync(resolve(gitDir, '.git', 'config'), '[remote]');
    const previous = process.env.PYTHONPATH;
    process.env.PYTHONPATH = buildPythonPath(previous);
    try {
      const result = await venvSandboxAdapter.executeAsync(
        {
          script: 'print("should-never-run")',
          pythonCmd: pythonCommand,
          seed: 42,
          workingDir: gitDir,
        },
        RESOURCES,
      );
      assert.equal(
        result.exitCode,
        126,
        `preflight rejection must surface as exitCode 126 (got ${result.exitCode})`,
      );
      // stderrHash 应为 preflight reason 的 hash（非空·非 "should-never-run" 执行输出）。
      assert.notEqual(
        result.stderrHash,
        sha256Hex(''),
        'preflight reason must be captured in stderr (non-empty)',
      );
    } finally {
      restorePythonPath(previous);
    }
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }
});

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function findPythonCommand(): string | null {
  for (const command of ['python3', 'python']) {
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
