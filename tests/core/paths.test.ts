// tests/core/paths.test.ts
// 跨平台路径工具（P0-1）测试：POSIX 归一化 / 原生转换 / 安全拼接 / 包含检查 / 跨平台临时目录。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import {
  toPosixPath,
  toNativePath,
  safeJoin,
  isSubPath,
  crossPlatformTmpDir,
  crossPlatformHomeDir,
  PACKAGE_ROOT,
} from '../../src/paths.ts';

test('paths: toPosixPath 统一反斜杠', () => {
  assert.equal(toPosixPath('domains\\a\\b.json'), 'domains/a/b.json');
  assert.equal(toPosixPath('a/b/c.ts'), 'a/b/c.ts');
  assert.equal(toPosixPath('C:\\Users\\x\\f.ts'), 'C:/Users/x/f.ts');
  assert.equal(toPosixPath(''), '');
});

test('paths: toNativePath 在 Windows 上转反斜杠、POSIX 上原样', () => {
  const expected = process.platform === 'win32' ? 'a\\b\\c' : 'a/b/c';
  assert.equal(toNativePath('a/b/c'), expected);
  // 幂等：对已原生路径再次转换不改变
  assert.equal(toNativePath(toNativePath('x/y')), toNativePath('x/y'));
});

test('paths: safeJoin 拼接合法段', () => {
  const root = process.platform === 'win32' ? 'C:\\repo' : '/repo';
  assert.equal(safeJoin(root, 'domains', 'a'), root + (process.platform === 'win32' ? '\\' : '/') + 'domains' + (process.platform === 'win32' ? '\\' : '/') + 'a');
  // 空段忽略
  assert.equal(safeJoin(root, '', 'x'), root + (process.platform === 'win32' ? '\\' : '/') + 'x');
});

test('paths: safeJoin 拒绝目录穿越（fail-closed）', () => {
  const root = '/repo';
  assert.throws(() => safeJoin(root, '..', 'x'), /directory traversal/);
  assert.throws(() => safeJoin(root, 'a', '../x'), /directory traversal/);
  assert.throws(() => safeJoin(root, 'a', 'b/../c'), /directory traversal/);
  assert.throws(() => safeJoin(root, '/etc'), /absolute path/);
  if (process.platform === 'win32') {
    assert.throws(() => safeJoin('C:\\repo', 'D:\\evil'), /absolute path/);
  }
});

test('paths: isSubPath 包含检查', () => {
  assert.equal(isSubPath('/repo', '/repo/domains/a.json'), true);
  assert.equal(isSubPath('/repo', '/repo'), true);
  assert.equal(isSubPath('/repo/domains', '/repo/domains2/x.json'), false);
  assert.equal(isSubPath('/repo', '/other/x.json'), false);
  // Windows 分隔符差异被归一化
  assert.equal(isSubPath('C:\\repo', 'C:\\repo\\domains\\a.json'), true);
  assert.equal(isSubPath('C:\\repo', 'C:/repo/domains/a.json'), true);
});

test('paths: 跨平台临时目录与主目录（永不硬编码 /tmp）', () => {
  assert.equal(crossPlatformTmpDir(), tmpdir());
  assert.ok(crossPlatformTmpDir().length > 0);
  assert.ok(crossPlatformHomeDir().length > 0);
  // PACKAGE_ROOT 解析到仓库根
  assert.ok(PACKAGE_ROOT.length > 0);
});
