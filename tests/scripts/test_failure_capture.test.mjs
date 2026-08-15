/**
 * test_failure_capture 脚本测试（b5 · flaky 身份捕获）。
 *
 * 契约（格式来自 2026-08-15 spec_probe 实测，非推断）：
 *   - spec reporter 尾区 `✖ failing tests:` 块解析：身份（name）+ 位置（test at）
 *     + 每块 ≤15 行错误详情；ℹ 计数行入档
 *   - CRLF 容忍；clean 日志 → clean 报告 exit 0；缺文件 → exit 2
 *   - 流式 fallback（无尾区）：唯一 ✖ 名收集
 * 零容忍合规：无 any / @ts-ignore / 空 catch。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecLog } from '../../scripts/test_failure_capture.mjs';

function here() {
  return fileURLToPath(new URL('.', import.meta.url));
}
const repoRoot = join(here(), '..', '..');

/** MEASURED spec-reporter sample (spec_probe, node --test, 2026-08-15). */
const SAMPLE_LOG = [
  '✔ alpha passes (0.3782ms)',
  '✖ beta fails deliberately (0.441ms)',
  '▶ parent suite',
  '  ✖ gamma child fails (0.1497ms)',
  '✖ parent suite (0.2959ms)',
  'ℹ tests 4',
  'ℹ suites 0',
  'ℹ pass 1',
  'ℹ fail 3',
  'ℹ cancelled 0',
  'ℹ skipped 0',
  'ℹ todo 0',
  'ℹ duration_ms 53.2526',
  '',
  '✖ failing tests:',
  '',
  'test at spec_probe.test.mjs:4:1',
  '✖ beta fails deliberately (0.441ms)',
  '  AssertionError [ERR_ASSERTION]: boom-beta',
  '  ',
  '  1 !== 2',
  '  ',
  '    at TestContext.<anonymous> (file:///C:/t/spec_probe.test.mjs:4:48)',
  '  }',
  '',
  'test at spec_probe.test.mjs:5:45',
  '✖ gamma child fails (0.1497ms)',
  '  AssertionError [ERR_ASSERTION]: boom-gamma',
  '',
].join('\n');

test('parses the measured spec-reporter analysis section: names, locations, counts', () => {
  const { counts, failures } = parseSpecLog(SAMPLE_LOG);
  assert.equal(counts.tests, 4);
  assert.equal(counts.pass, 1);
  assert.equal(counts.fail, 3);
  assert.equal(counts.skipped, 0);
  assert.equal(failures.length, 2, 'two named blocks in the analysis section');
  assert.equal(failures[0].name, 'beta fails deliberately');
  assert.equal(failures[0].at, 'spec_probe.test.mjs:4:1');
  assert.ok(failures[0].detail.some((l) => l.includes('boom-beta')), 'error detail captured');
  assert.equal(failures[1].name, 'gamma child fails');
});

test('CRLF line endings are tolerated', () => {
  const { failures } = parseSpecLog(SAMPLE_LOG.replaceAll('\n', '\r\n'));
  assert.equal(failures.length, 2);
  assert.equal(failures[0].name, 'beta fails deliberately');
});

test('clean log → zero failures, counts still reported', () => {
  const clean = ['✔ a (1ms)', '✔ b (1ms)', 'ℹ tests 2', 'ℹ pass 2', 'ℹ fail 0'].join('\n');
  const { counts, failures } = parseSpecLog(clean);
  assert.equal(counts.fail, 0);
  assert.equal(failures.length, 0);
});

test('stream-only log (no analysis section) falls back to unique ✖ names', () => {
  const stream = ['✖ first failure (1.2ms)', '  ✖ first failure (1.3ms)', '✖ second failure (2ms)'].join('\n');
  const { failures } = parseSpecLog(stream);
  assert.equal(failures.length, 2, 'duplicate nested name deduplicated');
  assert.deepEqual(failures.map((f) => f.name), ['first failure', 'second failure']);
});

test('detail lines are capped (≤15) so giant stack traces cannot flood the report', () => {
  const lines = ['✖ failing tests:', 'test at t.mjs:1:1', '✖ big failure (1ms)'];
  for (let i = 0; i < 40; i += 1) lines.push(`  detail line ${i}`);
  const { failures } = parseSpecLog(lines.join('\n'));
  assert.equal(failures[0].detail.length, 15);
});

test('CLI: writes a timestamped failure report and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-cap-'));
  try {
    const log = join(dir, 'test.log');
    const out = join(dir, 'out');
    writeFileSync(log, SAMPLE_LOG, 'utf8');
    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts', 'test_failure_capture.mjs'), log, '--out-dir', out],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 failure\(s\) identified/);
    const reports = readdirSync(out).filter((f) => f.startsWith('failures-'));
    assert.equal(reports.length, 1);
    const report = readFileSync(join(out, reports[0]), 'utf8');
    assert.match(report, /beta fails deliberately/);
    assert.match(report, /gamma child fails/);
    assert.match(report, /fail=3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: clean log writes a clean report and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-cap2-'));
  try {
    const log = join(dir, 'clean.log');
    const out = join(dir, 'out');
    writeFileSync(log, ['✔ a (1ms)', 'ℹ tests 1', 'ℹ pass 1', 'ℹ fail 0'].join('\n'), 'utf8');
    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts', 'test_failure_capture.mjs'), log, '--out-dir', out],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /CLEAN — 0 failures/);
    const report = readFileSync(join(out, readdirSync(out)[0]), 'utf8');
    assert.match(report, /无失败（clean）/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: missing or empty log exits 2 with guidance', () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'scripts', 'test_failure_capture.mjs'), join(tmpdir(), 'far-nonexistent-x.log')],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /non-empty log file/);
});

test('npm script test:capture is registered (the runnable capture entry)', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:capture'], 'node scripts/test_capture_run.mjs');
});
