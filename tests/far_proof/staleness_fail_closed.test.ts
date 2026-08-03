// tests/far_proof/staleness_fail_closed.test.ts
//
// 深度对抗轮回归测试：snapshotBundleContent / detectPostSealStaleness 须 fail-closed。
//
// 背景（深度对抗轮发现）：
//   visitHash 旧实现对 readdirSync 用 try/catch 静默返回（fail-OPEN）——若目录在 seal 后变为不可读
//   （权限撤销/并发删除/IO 错误），快照会缺失该目录内容 → detectPostSealStaleness 比对漏报 →
//   攻击者可通过撤销目录读权限绕过 sentinel。修复为 fail-closed（让错误抛出）。
//
// 本测试验证：
//   1. snapshotBundleContent 对不可读目录抛错（fail-closed），而非静默返回不完整快照。
//   2. 正常目录仍工作（回归保护）。
//
// Authority: AGENTS.md §7（trust-kernel·fail-closed）+ offline_package.ts:216-225 契约（"不静默放过"）。
// 平台边界：权限撤销测试在 Windows 上可能不生效（NTFS ACL 语义不同），故用不存在的目录路径
// 触发 ENOENT（跨平台确定抛错），验证 fail-closed 语义而非特定 errno。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotBundleContent } from '../../src/far_proof/offline_package.ts';

test('snapshotBundleContent_fail_closed_on_missing_dir: 不存在的目录 → 抛错（非静默空快照）', () => {
  // 回归：旧 visitHash try/catch 静默返回，会产空快照 → detectPostSealStaleness 漏报。
  // fail-closed：让 readdirSync 的 ENOENT 抛出。
  const nonexistent = join(tmpdir(), `far-test-missing-${Date.now()}-${Math.random()}`);
  assert.throws(
    () => snapshotBundleContent(nonexistent),
    (err: unknown) => {
      // Node readdirSync 对不存在目录抛 ENOENT
      const code = (err as NodeJS.ErrnoException)?.code;
      return code === 'ENOENT';
    },
    'snapshotBundleContent 对不存在的目录须抛 ENOENT（fail-closed），而非静默返回空快照',
  );
});

test('snapshotBundleContent_normal_dir: 正常目录 → 完整快照（回归保护）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-stale-ok-'));
  try {
    writeFileSync(join(tmp, 'a.json'), '{"x":1}');
    mkdirSync(join(tmp, 'sub'));
    writeFileSync(join(tmp, 'sub', 'b.ttl'), '<x>');
    const snap = snapshotBundleContent(tmp);
    assert.equal(snap.hashes.size, 2, '快照含 2 个文件');
    assert.ok(snap.hashes.has('a.json'), '根文件在快照中');
    assert.ok(snap.hashes.has('sub/b.ttl'), '子目录文件在快照中（路径用 / 分隔）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('snapshotBundleContent_empty_dir: 空目录 → 空快照（非错误）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-stale-empty-'));
  try {
    const snap = snapshotBundleContent(tmp);
    assert.equal(snap.hashes.size, 0, '空目录 → 空快照（合法·非 fail-closed 触发）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// 注：权限撤销（chmod 000）测试在 Windows 上不可靠（NTFS ACL ≠ POSIX mode bits），
// 故用 ENOENT 路径验证 fail-closed 语义。POSIX 平台的 chmod 000 场景由 CI 覆盖。
// 本测试跳过 chmod 路径以保持跨平台确定性（不引入 platform-skip 的 flaky）。
test('snapshotBundleContent_unreadable_subdir_unix: POSIX 不可读子目录 → 抛错（skip on win32）', {
  skip: process.platform === 'win32' ? 'POSIX chmod 测试·Windows NTFS ACL 语义不同' : undefined,
}, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-stale-perm-'));
  try {
    mkdirSync(join(tmp, 'locked'));
    writeFileSync(join(tmp, 'locked', 'secret.json'), '{}');
    chmodSync(join(tmp, 'locked'), 0o000); // 撤销所有权限
    try {
      assert.throws(
        () => snapshotBundleContent(tmp),
        /EACCES|permission/i,
        '不可读子目录须抛 EACCES（fail-closed），不静默跳过其内容',
      );
    } finally {
      chmodSync(join(tmp, 'locked'), 0o755); // 恢复以便清理
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
