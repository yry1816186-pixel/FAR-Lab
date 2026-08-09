/**
 * release_check 脚本测试（阶段 7 P0-9 · AT14/BV3-1 修复回归载体）。
 *
 * 覆盖纯函数（无外部依赖）：
 *   1. listReleaseTags 只返回 v* 发布 tag（排除 depth-* 等内部 tag）。
 * 注：checkReleaseForTag 依赖 gh CLI + 网络——不做 CI 单测（P0-9 已用真实仓库验证，
 * 输出 `release_check: ok — all 3 release tag(s)`）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listReleaseTags } from '../../scripts/release_check.mjs';

test('P0-9: listReleaseTags returns only semver v* tags', () => {
  const tags = listReleaseTags();
  assert.ok(tags.length >= 3, `at least v0.1.0/v1.0.0/v1.1.0 expected, got: ${tags.join(', ')}`);
  assert.ok(tags.includes('v1.1.0'), 'v1.1.0 must be listed');
  assert.ok(tags.includes('v0.1.0'), 'v0.1.0 must be listed');
  for (const t of tags) {
    assert.match(t, /^v\d+\.\d+\.\d+/, `internal tags (depth-*) must be excluded: ${t}`);
  }
});
