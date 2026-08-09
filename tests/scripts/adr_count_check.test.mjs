/**
 * adr_count_check 脚本测试（阶段 7 P0-6 · H2-C1 修复回归载体）。
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

test('P0-6: adr_count_check exits 0 and reports the real count', () => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'adr_count_check.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.match(result.stdout, /ADR-\*\.yaml = 21/, 'script must report the real ADR-* count (21)');
  assert.match(result.stdout, /total decision records = 24/, 'script must report 24 total records');
});
