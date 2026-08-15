/**
 * CITATION.cff 完整性测试。
 *
 * 背景（findings）：CITATION.cff 曾为 NEEDS_HUMAN_OPERATION 占位 + version 1.0.0 漂移
 * （package.json=1.1.0）+ commit 未锚定。
 * 修复契约：
 *   1. version 与 package.json 一致（SSOT：package.json）。
 *   2. 无 NEEDS_HUMAN_OPERATION 占位。
 *   3. commit 字段 = 仓库内可解析的 commit SHA。
 *   4. 真实作者（非 "FAR-Lab Contributors" 占位）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

test('P0-7: CITATION.cff version matches package.json and has no placeholders', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const cff = readFileSync(join(repoRoot, 'CITATION.cff'), 'utf8');
  assert.match(cff, /version: "1\.\d+\.\d+"/, 'version field must exist');
  assert.match(cff, new RegExp(`version: "${pkg.version}"`), 'version must match package.json');
  assert.doesNotMatch(cff, /NEEDS_HUMAN_OPERATION/, 'no placeholder markers');
  assert.doesNotMatch(cff, /FAR-Lab Contributors/, 'real author required');
});

test('P0-7: CITATION.cff commit is a resolvable git commit', () => {
  const cff = readFileSync(join(repoRoot, 'CITATION.cff'), 'utf8');
  const m = /^commit: "([0-9a-f]{40})"$/m.exec(cff);
  assert.ok(m !== null, 'commit must be a pinned 40-hex SHA');
  // 仓库内可解析：git cat-file -e 无错即存在。
  execFileSync('git', ['cat-file', '-e', m[1]], { cwd: repoRoot, stdio: 'pipe' });
});
