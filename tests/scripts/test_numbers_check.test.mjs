/**
 * test_numbers_check 脚本测试（阶段 7 P0-8 · AT15/SA13 修复回归载体）。
 *
 * 覆盖：
 *   1. parseTestNumbers 从 node --test spec 输出解析数字。
 *   2. extractClaimedNumbers 从 AGENTS.md 声称提取数字。
 *   3. 端到端：脚本 --check 对当前仓库（AGENTS.md 已回写实测数）exit 0。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClaimedNumbers, parseTestNumbers } from '../../scripts/test_numbers_check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

test('P0-8: parseTestNumbers extracts tests/pass/fail/skipped from spec output', () => {
  const spec = [
    'ℹ tests 2579',
    'ℹ suites 67',
    'ℹ pass 2573',
    'ℹ fail 0',
    'ℹ cancelled 0',
    'ℹ skipped 6',
    'ℹ todo 0',
  ].join('\n');
  const n = parseTestNumbers(spec);
  assert.deepEqual(n, { tests: 2579, pass: 2573, fail: 0, skipped: 6 });
});

test('P0-8: parseTestNumbers throws on unparseable output', () => {
  assert.throws(() => parseTestNumbers('no numbers here'), /cannot parse/);
});

test('P0-8: extractClaimedNumbers reads the AGENTS.md claim pattern', () => {
  const claim = extractClaimedNumbers(
    '- 331 TS files, 2579 tests passing (2573 pass / 0 fail / 6 skip — SSOT)',
  );
  assert.deepEqual(claim, { tests: 2579, pass: 2573, fail: 0, skipped: 6 });
});

test('P0-8: end-to-end --check exits 0 when AGENTS.md matches actual numbers', () => {
  // 对拍基于全量回归的真实 spec 输出（%TEMP% 可能被清理——内嵌代表性输出）。
  const specFile = join(here, '_test_numbers_fixture.txt');
  writeFileSync(
    specFile,
    ['ℹ tests 2579', 'ℹ pass 2573', 'ℹ fail 0', 'ℹ skipped 6'].join('\n'),
    'utf8',
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, 'scripts', 'test_numbers_check.mjs'),
        '--from-file',
        specFile,
        '--check',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(
      result.status,
      0,
      `expected exit 0 (AGENTS.md claims synced to actual)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(specFile, { force: true });
  }
});
