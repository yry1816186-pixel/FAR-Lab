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
import { spawnSync } from 'node:child_process';
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

// Windows 的 NTFS ACL 不等价于 POSIX mode bits，故只跳过 Windows 轴。POSIX 轴不能盲信
// os.tmpdir()：WSL 可继承 Windows TEMP 并把临时目录落到 /mnt/c DrvFS，那里 chmod 显示
// 000 但未必实际拒绝读取。因此此用例显式用 POSIX 原生 /tmp，且在子进程中调真实
// snapshotBundleContent；若 runner 是 root，子进程降权到 nobody，避免 root 绕过 DAC 造成假红。
test('snapshotBundleContent_unreadable_subdir_unix: POSIX 不可读子目录 → 抛错（skip on win32）', {
  skip: process.platform === 'win32' ? 'POSIX chmod 测试·Windows NTFS ACL 语义不同' : undefined,
}, (t) => {
  const identity = unprivilegedChildIdentity();
  if (identity === null) {
    t.skip('POSIX root runner cannot resolve an unprivileged nobody uid/gid');
    return;
  }

  const tmp = mkdtempSync(join('/tmp', 'far-stale-perm-'));
  try {
    mkdirSync(join(tmp, 'locked'));
    writeFileSync(join(tmp, 'locked', 'secret.json'), '{}');
    // mkdtemp 缺省 0700；降权子进程需要能穿过根目录，但不能读 locked。
    chmodSync(tmp, 0o755);
    chmodSync(join(tmp, 'locked'), 0o000); // 撤销所有权限
    try {
      const moduleUrl = new URL('../../src/far_proof/offline_package.ts', import.meta.url).href;
      const childSource = `
        const { snapshotBundleContent } = await import(${JSON.stringify(moduleUrl)});
        const dropUid = ${identity?.uid ?? 'null'};
        const dropGid = ${identity?.gid ?? 'null'};
        if (dropUid !== null && dropGid !== null) {
          process.setgroups([]);
          process.setgid(dropGid);
          process.setuid(dropUid);
        }
        try {
          snapshotBundleContent(process.argv[1]);
          process.stderr.write('snapshot unexpectedly succeeded');
          process.exitCode = 3;
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
          if (code === 'EACCES' || code === 'EPERM') {
            process.stdout.write(code + ':' + String(process.getuid?.() ?? 'unknown'));
          } else {
            process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
            process.exitCode = 4;
          }
        }
      `;
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', childSource, tmp],
        { encoding: 'utf8' },
      );
      assert.equal(
        child.status,
        0,
        `不可读子目录须 fail-closed（status=${String(child.status)}; stdout=${child.stdout}; stderr=${child.stderr}; error=${child.error?.message ?? 'none'}）`,
      );
      assert.match(child.stdout, /EACCES|EPERM/, '子进程须观测到真实权限拒绝');
    } finally {
      chmodSync(join(tmp, 'locked'), 0o755); // 恢复以便清理
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * Non-root runners already exercise DAC honestly. Root runners must drop to the
 * platform's `nobody` account; returning null means this POSIX capability is not
 * available and the test reports an explicit axis skip instead of a false pass.
 */
function unprivilegedChildIdentity(): { readonly uid: number; readonly gid: number } | undefined | null {
  if (process.getuid?.() !== 0) return undefined;
  const uid = resolveIdentityNumber(['-u', 'nobody']);
  const gid = resolveIdentityNumber(['-g', 'nobody']);
  if (uid === null || gid === null || uid === 0) return null;
  return { uid, gid };
}

function resolveIdentityNumber(args: readonly string[]): number | null {
  const result = spawnSync('id', args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const parsed = Number(result.stdout.trim());
  if (!Number.isInteger(parsed)) return null;
  // Darwin may render nobody as -2 while spawn uid/gid uses unsigned uid_t.
  return parsed < 0 ? 2 ** 32 + parsed : parsed;
}
