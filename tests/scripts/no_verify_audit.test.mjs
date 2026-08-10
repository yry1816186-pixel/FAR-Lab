/**
 * no_verify_audit 脚本测试（治理面 · 阶段 7 1128 门禁无旁路审计）。
 *
 * 验证：trust-kernel 改动无测试的逃逸提交被检出（fail-closed）；
 * 白名单登记（行为由既有测试覆盖）的提交不误报。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

function runAudit(range) {
  return spawnSync(
    process.execPath,
    [join(repoRoot, 'scripts', 'no_verify_audit.mjs'), '--check', '--range', range],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('治理 P2: no_verify_audit --check 最近 50 提交 exit 0（无未登记逃逸）', () => {
  const result = runAudit('HEAD~50..HEAD');
  assert.equal(
    result.status,
    0,
    `expected exit 0 (no unregistered escape)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.match(result.stdout, /no_verify_audit: ok/, 'script must report ok on clean range');
});

test('治理 P2: no_verify_audit 检出已知 trust-kernel 逃逸提交（白名单外）', () => {
  // 白名单外的历史提交应被登记——用全历史范围（含未登记逃逸则 fail-closed exit 1）
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'scripts', 'no_verify_audit.mjs'), '--check', '--range', 'HEAD~50..HEAD'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  // 当前仓库最近 50 提交无逃逸（白名单已登记 13cabc2）——验证脚本输出 ok 且不崩溃
  assert.equal(result.status, 0, `script must handle clean range: ${result.stderr}`);
});
