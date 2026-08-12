/**
 * test_numbers_check 脚本测试（阶段 7 P0-8 · AT15/SA13 修复回归载体）。
 *
 * 覆盖：
 *   1. parseTestNumbers 从 node --test spec 输出解析数字。
 *   2. extractClaimedNumbers 从声称文本提取数字。
 *   3. 端到端：脚本 --check（用临时 claim 文件，hermetic）exit 0。
 *   4. 端到端：脚本 --write 把漂移的 claim 文件回写为实测数字。
 *   5. 回归：--write 不再改写本测试文件自身（旧副作用 bug）。
 *
 * Hermetic 原则：端到端用例一律用 `--claim-file <临时文件>`，绝不读取真实 AGENTS.md——
 * 后者自 2026-08-10 round 1-5 被 .gitignore（本地 agent 指令文件），fresh clone 上不存在，
 * 任何"读真实 AGENTS.md"的断言都会让 CI / 新克隆者必红。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClaimedNumbers, parseTestNumbers } from '../../scripts/test_numbers_check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

const SCRIPT = join(repoRoot, 'scripts', 'test_numbers_check.mjs');

test('P0-8: parseTestNumbers extracts tests/pass/fail/skipped from spec output', () => {
  const spec = [
    'ℹ tests 2703',
    'ℹ suites 67',
    'ℹ pass 2697',
    'ℹ fail 0',
    'ℹ cancelled 0',
    'ℹ skipped 6',
    'ℹ todo 0',
  ].join('\n');
  const n = parseTestNumbers(spec);
  assert.deepEqual(n, { tests: 2703, pass: 2697, fail: 0, skipped: 6 });
});

test('P0-8: parseTestNumbers throws on unparseable output', () => {
  assert.throws(() => parseTestNumbers('no numbers here'), /cannot parse/);
});

test('P0-8: extractClaimedNumbers reads the claim pattern', () => {
  const claim = extractClaimedNumbers(
    '- 331 TS files, 2703 tests passing (2697 pass / 0 fail / 6 skip — SSOT)',
  );
  assert.deepEqual(claim, { tests: 2703, pass: 2697, fail: 0, skipped: 6 });
});

test('P0-8: end-to-end --check exits 0 when claim file matches actual numbers', () => {
  // Hermetic：临时 claim 文件 + 临时 spec，--check 经 --claim-file 指向它。
  // 不依赖真实 AGENTS.md（gitignored，fresh clone 不存在）。
  const specFile = join(here, '_test_numbers_check_spec.txt');
  const claimFile = join(here, '_test_numbers_check_claim.md');
  writeFileSync(
    specFile,
    ['ℹ tests 2700', 'ℹ pass 2694', 'ℹ fail 0', 'ℹ skipped 6'].join('\n'),
    'utf8',
  );
  writeFileSync(
    claimFile,
    'status: 2700 tests passing (2694 pass / 0 fail / 6 skip — SSOT)',
    'utf8',
  );
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--from-file', specFile, '--check', '--claim-file', claimFile],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(
      result.status,
      0,
      `expected exit 0 (claim synced to fixture)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(specFile, { force: true });
    rmSync(claimFile, { force: true });
  }
});

test('P0-8: end-to-end --check FAILs (exit 1) on drift between claim and actual', () => {
  // 守护 SSOT 门禁的否定路径：claim 声称与 spec 实测不符 → 必须 exit 1。
  const specFile = join(here, '_test_numbers_drift_spec.txt');
  const claimFile = join(here, '_test_numbers_drift_claim.md');
  writeFileSync(
    specFile,
    ['ℹ tests 2700', 'ℹ pass 2694', 'ℹ fail 0', 'ℹ skipped 6'].join('\n'),
    'utf8',
  );
  writeFileSync(
    claimFile,
    'status: 1000 tests passing (900 pass / 50 fail / 20 skip — drifted)',
    'utf8',
  );
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--from-file', specFile, '--check', '--claim-file', claimFile],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0, `drift must FAIL (non-zero exit)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stderr, /drifted|claims.*but actual is|drift/i, `stderr should explain drift\nstderr: ${result.stderr}`);
  } finally {
    rmSync(specFile, { force: true });
    rmSync(claimFile, { force: true });
  }
});

test('LP-2: --write rewrites a drifted claim file to actual (auto SSOT sync)', () => {
  // 漂移场景：claim 声称 1000/900/50/20，实测 spec 为 2703/2697/0/6。
  // --write 须把 claim 文件回写到实测值。全程不触碰真实 AGENTS.md。
  const specFile = join(here, '_test_numbers_write_spec.txt');
  const claimFile = join(here, '_test_numbers_write_claim.md');
  writeFileSync(
    specFile,
    ['ℹ tests 2703', 'ℹ pass 2697', 'ℹ fail 0', 'ℹ skipped 6', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    claimFile,
    'baseline: 1000 tests passing (900 pass / 50 fail / 20 skip — drifted)',
    'utf8',
  );
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--from-file', specFile, '--write', '--claim-file', claimFile],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `--write must exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    const updated = readFileSync(claimFile, 'utf8');
    const claimed = extractClaimedNumbers(updated);
    assert.equal(claimed.tests, 2703, 'claim file must be rewritten to actual tests count');
    assert.equal(claimed.pass, 2697, 'claim file pass must be rewritten to actual');
    assert.equal(claimed.fail, 0, 'claim file fail must be rewritten to actual');
    assert.equal(claimed.skipped, 6, 'claim file skipped must be rewritten to actual');
  } finally {
    rmSync(specFile, { force: true });
    rmSync(claimFile, { force: true });
  }
});

test('LP-2 regression: --write does NOT mutate the test file itself (no self-rewrite side effect)', () => {
  // 旧 --write 会顺带重写 tests/scripts/test_numbers_check.test.mjs（治理脚本改写自身测试
  // 文件的副作用 bug，且当时测试 finally 未还原）——该行为已移除。本测试守护回归。
  const specFile = join(here, '_test_numbers_self_spec.txt');
  const claimFile = join(here, '_test_numbers_self_claim.md');
  writeFileSync(
    specFile,
    ['ℹ tests 9999', 'ℹ pass 8888', 'ℹ fail 0', 'ℹ skipped 1', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    claimFile,
    'old: 1000 tests passing (900 pass / 50 fail / 20 skip — drifted)',
    'utf8',
  );
  const selfPath = join(repoRoot, 'tests', 'scripts', 'test_numbers_check.test.mjs');
  const before = readFileSync(selfPath, 'utf8');
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--from-file', specFile, '--write', '--claim-file', claimFile],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `--write must exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    const after = readFileSync(selfPath, 'utf8');
    assert.equal(
      after,
      before,
      '--write must NOT modify the test file itself (regression: old --write rewrote its own fixture)',
    );
  } finally {
    rmSync(specFile, { force: true });
    rmSync(claimFile, { force: true });
  }
});
