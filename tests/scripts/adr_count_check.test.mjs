/**
 * adr_count_check 脚本测试（阶段 7 P0-6 · H2-C1 修复回归载体）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

// .far-design/ 自 2026-08-14 §20 起 untrack 出公共仓库——fresh clone 无 DECISIONS 目录。
// 脚本本体已环境性 skip（exit 0 + skip 输出）；本测试在目录存在时才断言真实计数，
// 不存在时断言脚本走 skip 路径（区分能力保留，非恒真）。
const decisionsDir = join(repoRoot, '.far-design', 'DECISIONS');
const hasDecisions = existsSync(decisionsDir);

test('P0-6: adr_count_check exits 0 and reports the real count', { skip: !hasDecisions && '.far-design/DECISIONS not present (untracked from public repo)' }, () => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'adr_count_check.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.match(result.stdout, /ADR-\*\.yaml = 22/, 'script must report the real ADR-* count (22)');
  assert.match(result.stdout, /total decision records = 25/, 'script must report 25 total records');
});

test('fresh-clone: script skips gracefully (exit 0 + skip message) when DECISIONS dir absent', { skip: hasDecisions && 'DECISIONS present — skip-path tested only on fresh clones' }, () => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'adr_count_check.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `missing-dir must exit 0 (environmental skip)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /环境性跳过/, 'must print an explicit skip message, not silently pass');
});
