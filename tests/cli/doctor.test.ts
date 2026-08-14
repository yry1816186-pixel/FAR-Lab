// tests/cli/doctor.test.ts
// far doctor 输出顺序回归（2026-08-14 UX reorder）：
//   1) 环境检查表先打印 —— 旧输出把整份 far verify 报告放在最前，埋没了环境检查；
//   2) IC-03 离线重算降级为一行 VERIFY SUMMARY（完整报告仅在 --full-verify 回显，
//      且仍排在环境检查表之后）；
//   3) verify 逻辑本身未删除（SKIPPED 状态仅在 demo fixture 缺失时出现）。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DOCTOR_HEADER = 'FAR-Lab · far doctor (environment self-check)';
const VERIFY_REPORT = 'FAR-Lab Verify (third-party independent recomputation)';
const VERIFY_SUMMARY = 'VERIFY SUMMARY (IC-03 · offline recompute of the demo bundle)';
const DEMO_FIXTURE = resolve('.far-implementation/walking-skeleton/demo.far-proof');

function runFarDoctor(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'doctor', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('far doctor: env checks print FIRST; verify is a compact summary line, not the full report', () => {
  const r = runFarDoctor([]);
  // exit contract unchanged: 0 all green / 1 FAIL / 2 WARN-only (env-dependent, e.g. missing key).
  assert.ok(r.status === 0 || r.status === 1 || r.status === 2, `unexpected exit ${r.status}`);
  const headerIdx = r.stdout.indexOf(DOCTOR_HEADER);
  const summaryIdx = r.stdout.indexOf(VERIFY_SUMMARY);
  assert.ok(headerIdx !== -1, 'doctor header must print');
  assert.ok(summaryIdx !== -1, 'VERIFY SUMMARY section must print');
  assert.ok(headerIdx < summaryIdx, 'env checks table must precede the verify summary');
  // Default demotes the full verify report (this was the burying defect).
  assert.equal(r.stdout.indexOf(VERIFY_REPORT), -1, 'full verify report must NOT print by default');
  // The summary line carries a status (PASS/WARN/FAIL/SKIPPED) — not empty theater.
  assert.match(r.stdout, /verify: (PASS|WARN|FAIL|SKIPPED)/);
});

test('far doctor --full-verify: full verify report prints AFTER the env table + summary', () => {
  const r = runFarDoctor(['--full-verify']);
  assert.ok(r.status === 0 || r.status === 1 || r.status === 2, `unexpected exit ${r.status}`);
  const summaryIdx = r.stdout.indexOf(VERIFY_SUMMARY);
  assert.ok(summaryIdx !== -1, 'VERIFY SUMMARY section must print');
  if (!existsSync(DEMO_FIXTURE)) {
    // Hermetic across environments (fresh clone without a generated bundle): verify is SKIPPED,
    // there is no report to expand — the flag must not fabricate one.
    assert.match(r.stdout, /verify: SKIPPED/);
    assert.equal(r.stdout.indexOf(VERIFY_REPORT), -1);
    return;
  }
  const reportIdx = r.stdout.indexOf(VERIFY_REPORT);
  assert.ok(reportIdx !== -1, 'full verify report must print with --full-verify (IC-03 logic kept)');
  assert.ok(summaryIdx < reportIdx, 'full report must follow the env table + summary');
});
