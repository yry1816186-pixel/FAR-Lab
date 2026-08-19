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


// ---------------------------------------------------------------------------
// --json 契约（CLI_JSON_CONTRACT_CENSUS P2-3 修复锁定）
// 缺陷背景：修复前 `--json` 被静默忽略——banner 直出 stdout，exit code 照常返回
// （曾误判为 fail-closed，实测 exit=2 系 WARN-only 环境语义而非参数拒绝，普查已勘误）。
// ---------------------------------------------------------------------------

test('far doctor --json: stdout 是可解析的单文档纯 JSON，banner/分隔线零泄漏', () => {
  const r = runFarDoctor(['--json']);
  assert.ok(r.status === 0 || r.status === 1 || r.status === 2, `unexpected exit ${r.status}`);
  const doc = JSON.parse(r.stdout) as {
    tool: string;
    checks: Array<{ name: string; status: string; detail: string }>;
    verify: { ran: boolean; status: string; reason: string };
    result: string;
  }; // 非纯 JSON（banner 混入）将在此抛错——这就是判别
  assert.equal(doc.tool, 'far doctor');
  assert.ok(doc.checks.length >= 5, `checks 不得为空壳: ${doc.checks.length}`);
  for (const c of doc.checks) {
    assert.match(c.status, /^(ok|warn|fail|info)$/, `非法 status: ${c.status}`);
    assert.ok(c.name.length > 0 && typeof c.detail === 'string', 'check 必须名实俱全');
  }
  assert.match(doc.verify.status, /^(PASS|WARN|FAIL|SKIPPED)$/);
  assert.ok(['ok', 'warn', 'fail'].includes(doc.result));
  assert.equal(r.stdout.indexOf(DOCTOR_HEADER), -1, 'banner 泄漏进 JSON 输出');
  assert.equal(r.stdout.indexOf('─────'), -1, '分隔线泄漏进 JSON 输出');
});

test('far doctor --json: result 字段与 exit code 语义一致（0=ok / 2=warn / 1=fail）', () => {
  const r = runFarDoctor(['--json']);
  const doc = JSON.parse(r.stdout) as { result: string };
  const expectResult = r.status === 0 ? 'ok' : r.status === 2 ? 'warn' : 'fail';
  assert.equal(doc.result, expectResult, `exit=${r.status} 与 result=${doc.result} 不自洽`);
});

test('far doctor --json: stderr 与 exit code 契约不被人读路径污染', () => {
  const r = runFarDoctor(['--json']);
  // 已知环境噪声：Node DEP0190（子进程 shell:true 弃用警告，源自 doctor 既有探针——
  // 非本契约测试对象，已登记 census Phase 5 安全项）。剥离后 stderr 必须无 doctor 自产文本。
  const ownText = r.stderr
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.includes('DEP0190') && !l.includes('--trace-deprecation'))
    .join('\n');
  assert.equal(ownText, '', '--json 成功执行不得向 stderr 写人读文本');
  // 单行 JSON 文档（pretty-print 多行但必为单文档——JSON.parse 已证）；stdout 以 } 收尾
  assert.ok(r.stdout.trimEnd().endsWith('}'), 'JSON 文档不完整');
});


// ---------------------------------------------------------------------------
// P5-sec 回归锁定：probeBin 直 spawn 优先（DEP0190 消除）
// 缺陷背景：旧实现 Windows 恒 shell:true + 数组参数 → Node DEP0190 弃用警告
// （"args with shell option true can lead to security vulnerabilities"）。
// 修复后：.exe 直 spawn，.cmd shim 才回退 shell 字符串（仅代码固定字面量）。
// ---------------------------------------------------------------------------

test('far doctor: stderr 不得再出现 DEP0190（shell:true+args 弃用警告绝不再现）', () => {
  const r = runFarDoctor([]);
  assert.ok(
    !r.stderr.includes('DEP0190') && !r.stderr.includes('shell option true'),
    `DEP0190 回归:\n${r.stderr.slice(0, 300)}`,
  );
});

test('far doctor: Windows .cmd shim 回退后 pnpm 探测仍真实命中（防直 spawn 一刀切）', () => {
  const r = runFarDoctor(['--json']);
  const doc = JSON.parse(r.stdout) as { checks: Array<{ name: string; status: string; detail: string }> };
  const pnpm = doc.checks.find((c) => c.name.toLowerCase().includes('pnpm'));
  assert.ok(pnpm !== undefined, 'pnpm 探测项缺失');
  // 本机 pnpm 为 .cmd shim——若回退链断裂，此项会从 ok 退化为 warn/missing
  assert.equal(pnpm.status, 'ok', `pnpm shim 回退链断裂: ${pnpm.status} ${pnpm.detail}`);
  assert.match(pnpm.detail, /\d+\.\d+\.\d+/, 'pnpm 版本必须是真实探测值');
});
