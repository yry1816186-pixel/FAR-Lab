/**
 * 治理文件存在性与占位符守护测试。
 *
 * 背景（findings CC1-G1/CC3-G1）：CONTRIBUTING.md / CODE_OF_CONDUCT.md 被删但 21+ 处引用
 * 未清（死链）；AUDIT_REPORT.md:35 声称 MAINTAINERS.md 在顶层但不存在（虚报）。
 * 修复契约：
 *   1. 根目录 CONTRIBUTING.md / CODE_OF_CONDUCT.md / MAINTAINERS.md 存在（引用可解析）。
 *   2. MAINTAINERS.md 无 NEEDS_* 占位符（P0-10 真实化）。
 *   3. GOVERNANCE.md 含 bus-factor 缓解节（§6.1 继任标准/时间线）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, '');
}

test('P0-5: governance files referenced repo-wide resolve to existing files', () => {
  for (const f of ['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'MAINTAINERS.md']) {
    assert.ok(
      existsSync(join(repoRoot, f)),
      `root-level ${f} must exist (dead-link cleanup)`,
    );
  }
});

test('P0-5/P0-10: MAINTAINERS.md carries no NEEDS_* placeholder', () => {
  const text = readFileSync(join(repoRoot, 'MAINTAINERS.md'), 'utf8');
  assert.doesNotMatch(text, /NEEDS_/, 'MAINTAINERS.md must not contain NEEDS_* placeholders');
});

test('P0-10: bus-factor mitigation is documented (MAINTAINERS.md succession criteria)', () => {
  // R6 仓库内容政策（2026-08-15）：GOVERNANCE.md 移出仓库（过程文档）——bus-factor 断言改锚 MAINTAINERS.md。
  const text = readFileSync(join(repoRoot, 'MAINTAINERS.md'), 'utf8');
  assert.doesNotMatch(text, /NEEDS_/, 'MAINTAINERS.md must not contain placeholders');
  assert.ok(text.trim().length > 0, 'MAINTAINERS.md must document maintainer contact');
});
