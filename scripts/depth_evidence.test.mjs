// scripts/depth_evidence.test.mjs
//
// depth_evidence bot 纯逻辑单测（safety-critical 反伪造核心）。
//   主进程入口（main）走真实 git/node 子进程，由 CLI 集成验证；本测覆盖**可纯化**的安全关键逻辑：
//   TAP 解析（PASS/FAIL/SKIP/TODO/CJK/特殊字符/冲突→UNKNOWN）、rowOutcome 裁决矩阵（UPGRADE 仅 base-FAIL+head-PASS；
//   ERROR=NO_MATCH/UNKNOWN/NO_FILE_HEAD fail-closed；INFO=stale/skip/head-红）、原子写回（WIRED_RED→WIRED_GREEN+evidence、
//   幂等、不动非目标行、无 tmp 残留、写回行仍匹配 LEDGER_ROW_RE + evidence 行过 L2 正则）。
//
// 真实依赖：import 真实 depth_evidence.mjs 导出函数 + 真实 lib/ledger.mjs LEDGER_ROW_RE（R6 同源校验）。
// 反假绿：断言裁决矩阵每个分支 + 写回前后字节级 diff，无 expect(true)。
//
// Authority: scripts/depth_evidence.mjs 康威不变式 + PROJECT_PLAN/DEPTH_LEDGER.md §D inherent_limits (c)(d)。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseTap,
  verdictForName,
  rowOutcome,
  replaceRowCells,
  formatEvidenceLine,
  padCell,
  writeBackUpgrades,
  removeWorktree,
} from './depth_evidence.mjs';
import { LEDGER_ROW_RE, parseLedgerTable } from './lib/ledger.mjs';

const B = 'a'.repeat(40); // base 40-hex
const H = 'b'.repeat(40); // head 40-hex（B≠H）

// ----- parseTap + verdictForName -----
test('parseTap: 提取 PASS/FAIL/SKIP/TODO + CJK + 特殊字符名 + summary', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: probe_pass',
    'ok 1 - probe_pass',
    '# Subtest: probe_fail',
    'not ok 2 - probe_fail',
    '# Subtest: probe_skip',
    'ok 3 - probe_skip # SKIP env reason',
    '# Subtest: real_429穿透_fallback_chain',
    'ok 4 - real_429穿透_fallback_chain',
    '# Subtest: name (parens) + plus | pipe',
    'ok 5 - name (parens) + plus | pipe',
    '# Subtest: probe_todo',
    'not ok 6 - probe_todo # TODO not done',
    '1..6',
    '# tests 6',
    '# pass 3',
    '# fail 1',
    '# skipped 1',
    '# todo 1',
  ].join('\n');
  const p = parseTap(tap);
  assert.equal(verdictForName(p, 'probe_pass'), 'PASS');
  assert.equal(verdictForName(p, 'probe_fail'), 'FAIL');
  assert.equal(verdictForName(p, 'probe_skip'), 'SKIP');
  assert.equal(verdictForName(p, 'real_429穿透_fallback_chain'), 'PASS'); // CJK 精确名匹配
  assert.equal(verdictForName(p, 'name (parens) + plus | pipe'), 'PASS'); // 特殊字符精确名匹配
  assert.equal(verdictForName(p, 'probe_todo'), 'TODO');
  assert.equal(verdictForName(p, 'nonexistent'), 'NO_MATCH');
  assert.equal(p.summary.pass, 3);
  assert.equal(p.summary.fail, 1);
  assert.equal(p.summary.skipped, 1);
  assert.equal(p.summary.todo, 1);
});

test('verdictForName: 同名多行裁决冲突 → UNKNOWN（fail-closed）', () => {
  const tap = ['ok 1 - dup', 'not ok 2 - dup', '1..2'].join('\n');
  const p = parseTap(tap);
  assert.equal(verdictForName(p, 'dup'), 'UNKNOWN');
});

// 回归测试：prefix 名匹配（§C 短名 vs TAP `short: desc` 全名）。
// 修前 verdictForName 仅精确匹配 → 19 行 NO_MATCH（短前缀名不中全名）。
test('verdictForName: §C 短前缀名匹配 TAP 全名（冒号分隔防子串误命中）', () => {
  const tap = [
    'ok 1 - literal_to_derived_silent_change_downgrades: derivationForm literal→derived 不匹配即使值相等也降级 INCONCLUSIVE',
    'ok 2 - derivation_form_match_keeps_confirmed: expected=literal actual=literal → CONFIRMED（form 一致不降级）',
    'ok 3 - unrelated_test: 别的测试',
    '1..3',
  ].join('\n');
  const p = parseTap(tap);
  // 短前缀 + ':' 分隔 → 命中全名
  assert.equal(verdictForName(p, 'literal_to_derived_silent_change_downgrades'), 'PASS');
  assert.equal(verdictForName(p, 'derivation_form_match_keeps_confirmed'), 'PASS');
  // 精确全名仍命中（双模式向后兼容）
  assert.equal(
    verdictForName(p, 'literal_to_derived_silent_change_downgrades: derivationForm literal→derived 不匹配即使值相等也降级 INCONCLUSIVE'),
    'PASS',
  );
  // ':' 分隔防子串误命中：`derivation_form` 不命中 `derivation_form_match_keeps_confirmed`
  assert.equal(verdictForName(p, 'derivation_form'), 'NO_MATCH');
  // 无冒号的精确名仍工作
  assert.equal(verdictForName(p, 'unrelated_test'), 'PASS');
  assert.equal(verdictForName(p, 'nonexistent'), 'NO_MATCH');
});

test('verdictForName: 短前缀命中多个同前缀全名且状态冲突 → UNKNOWN', () => {
  const tap = ['ok 1 - shared: a', 'not ok 2 - shared: b', '1..2'].join('\n');
  const p = parseTap(tap);
  assert.equal(verdictForName(p, 'shared'), 'UNKNOWN');
});

// 回归测试：removeWorktree 不穿越 node_modules junction 删除真实依赖（数据丢失 bug）。
// 修前 removeWorktree 直接 rmSync(tmp, recursive) + git worktree remove，两者均穿越 junction
// 递归删掉 REPO_ROOT/node_modules 全部内容（实测 bot dry-run 后 node_modules 清空）。
test('removeWorktree: node_modules junction 不被穿越——目标 SENTINEL 存活 + tmp 清除', () => {
  const base = mkdtempSync(join(tmpdir(), 'junc-reg-'));
  // 真实目标（模拟 REPO_ROOT/node_modules）+ SENTINEL 文件（模拟 typescript 等依赖）
  const target = join(base, 'real_nm_target');
  mkdirSync(target);
  const sentinel = join(target, 'TYPESCRIPT_PACKAGE_MARKER');
  writeFileSync(sentinel, 'must survive removeWorktree');
  // worktree 临时目录 + node_modules junction → 真实目标（镜像 createWorktree 行为）
  const wt = mkdtempSync(join(tmpdir(), 'depth-ev-junc-'));
  const wtNm = join(wt, 'node_modules');
  symlinkSync(target, wtNm, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(lstatSync(wtNm).isSymbolicLink(), true, 'junction 应被识别为 symlink');

  removeWorktree(wt); // 不应穿越 junction

  assert.equal(existsSync(sentinel), true, '关键断言：junction 目标 SENTINEL 必须存活（修前被删）');
  assert.equal(existsSync(target), true, 'junction 目标目录必须存活');
  assert.equal(existsSync(wt), false, 'worktree 临时目录应被清除');
  // 清理真实目标（本测试创建，非主仓 node_modules）
  rmSync(base, { recursive: true, force: true });
});

// ----- rowOutcome 裁决矩阵（康威不变式：UPGRADE 仅 base-FAIL+head-PASS）-----
const V = (verdict) => ({ verdict, exitCode: 0, tapSample: '' });

test('rowOutcome: UPGRADE 仅当 base=FAIL + head=PASS', () => {
  assert.equal(rowOutcome(V('FAIL'), V('PASS')).kind, 'UPGRADE');
});

test('rowOutcome: base=PASS+head=PASS（stale 接线在历史）→ INFO 不升级', () => {
  const r = rowOutcome(V('PASS'), V('PASS'));
  assert.equal(r.kind, 'INFO');
});

test('rowOutcome: head=FAIL（仍红）→ INFO 不升级', () => {
  assert.equal(rowOutcome(V('FAIL'), V('FAIL')).kind, 'INFO');
  assert.equal(rowOutcome(V('PASS'), V('FAIL')).kind, 'INFO');
});

test('rowOutcome: head=SKIP/TODO（环境门控）→ INFO', () => {
  assert.equal(rowOutcome(V('FAIL'), V('SKIP')).kind, 'INFO');
  assert.equal(rowOutcome(V('FAIL'), V('TODO')).kind, 'INFO');
});

test('rowOutcome: NO_MATCH → ERROR（账本指不存在测试名，fail-closed）', () => {
  assert.equal(rowOutcome(V('NO_MATCH'), V('PASS')).kind, 'ERROR');
  assert.equal(rowOutcome(V('FAIL'), V('NO_MATCH')).kind, 'ERROR');
});

test('rowOutcome: UNKNOWN → ERROR（TAP 冲突/不可解释失败，fail-closed）', () => {
  assert.equal(rowOutcome(V('UNKNOWN'), V('PASS')).kind, 'ERROR');
  assert.equal(rowOutcome(V('FAIL'), V('UNKNOWN')).kind, 'ERROR');
});

test('rowOutcome: NO_FILE_HEAD → ERROR（WIRED_RED 测试须存在于 head）', () => {
  assert.equal(rowOutcome(V('FAIL'), V('NO_FILE')).kind, 'ERROR');
});

test('rowOutcome: NO_FILE_BASE → INFO（base 后新增测试，无法证 base-FAIL）', () => {
  assert.equal(rowOutcome(V('NO_FILE'), V('PASS')).kind, 'INFO');
});

// ----- replaceRowCells / formatEvidenceLine / padCell -----
test('replaceRowCells: 外科替换 status+closed_by，其余 cell 不动，仍匹配 LEDGER_ROW_RE', () => {
  const line = '| P0-1 | compileFec ... | src/fec/orchestrator.ts:99 | tests/fec/fec_mandatory_e2e.test.ts::x | (待 CI) | WIRED_RED | — |';
  const out = replaceRowCells(line, { status: 'WIRED_GREEN', closedBy: H });
  assert.match(out, /WIRED_GREEN/);
  assert.match(out, new RegExp(H));
  assert.doesNotMatch(out, /WIRED_RED/);
  // 仍可被 §C 行正则解析（status=WIRED_GREEN, closed_by=40hex）。
  const m = out.match(LEDGER_ROW_RE);
  assert.ok(m, 'rewritten row must still match LEDGER_ROW_RE');
  assert.equal(m[7].trim(), 'WIRED_GREEN');
  assert.equal(m[8].trim(), H);
  // id/dep/caller/proofTest/redCommit cell 内容不变。
  assert.match(out, /P0-1/);
  assert.match(out, /src\/fec\/orchestrator\.ts:99/);
});

// R10：claimed_by_pr 第 8 列（可选）。replaceRowCells 须改 status+closed_by 而**保留** claimed_by_pr cell。
test('replaceRowCells: 9-col 行（R10 claimed_by_pr）改 status+closed_by，claimed_by_pr cell 原样保留', () => {
  const line = '| P0-1 | compileFec ... | src/fec/orchestrator.ts:119 | tests/fec/fec_mandatory_e2e.test.ts::x | (待 CI) | WIRED_RED | — | PR-42 |';
  const out = replaceRowCells(line, { status: 'WIRED_GREEN', closedBy: H });
  assert.match(out, /WIRED_GREEN/);
  assert.match(out, new RegExp(H));
  // claimed_by_pr cell 保留（PR-42 不被抹掉/移位）。
  assert.match(out, /PR-42/);
  // 9 段 → 10 段 split 仍被 guard 接受（非返回原行）。
  assert.notEqual(out, line);
  const m = out.match(LEDGER_ROW_RE);
  assert.ok(m, '9-col rewritten row must match LEDGER_ROW_RE (向后兼容正则)');
  assert.equal(m[7].trim(), 'WIRED_GREEN');
  assert.equal(m[8].trim(), H);
  assert.equal(m[9].trim(), 'PR-42'); // 第 9 列 claimedBy
});

// R10：parseLedgerTable 须向后兼容——8 列行 claimedBy=undefined，9 列行 claimedBy=<值>。
test('parseLedgerTable: R10 claimed_by_pr——8 列行 claimedBy=undefined，9 列行 claimedBy=<值>', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ledger-r10-'));
  try {
    mkdirSync(join(tmp, 'PROJECT_PLAN'), { recursive: true });
    const ledgerPath = join(tmp, 'PROJECT_PLAN', 'DEPTH_LEDGER.md');
    writeFileSync(
      ledgerPath,
      [
        '# DEPTH_LEDGER', '', '## §C 深度模块接线表（机器解析，schema 严格）', '',
        '| id | single_real_dependency | proof_caller | proof_test | proof_test_red_commit | status | closed_by_sha | claimed_by_pr |',
        '|----|------------------------|--------------|------------|-----------------------|--------|---------------|---------------|',
        '| P-8col | dep | src/foo.ts:1 | tests/foo/t.test.ts::x | (待CI) | WIRED_RED | — |',
        '| P-9col | dep | src/foo.ts:2 | tests/foo/t.test.ts::y | (待CI) | WIRED_RED | — | PR-7 |',
        '',
      ].join('\n'),
    );
    const { rows } = parseLedgerTable(tmp);
    assert.equal(rows.length, 2, '8-col + 9-col 行各解析 1 条');
    const r8 = rows.find((r) => r.id === 'P-8col');
    const r9 = rows.find((r) => r.id === 'P-9col');
    assert.equal(r8.claimedBy, undefined, '8 列行无第 9 列 → claimedBy=undefined（向后兼容）');
    assert.equal(r9.claimedBy, 'PR-7', '9 列行第 9 列 → claimedBy=PR-7');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('formatEvidenceLine: cell 数正确 + → 两侧空格 + 过 L2 base≠head hex 正则', () => {
  const line = formatEvidenceLine(B, H, 7);
  const cells = line.split('|').filter((c) => c.trim().length > 0 || c === ' ');
  // 7 cell：evidence + 6 dash
  assert.equal((line.match(/\|/g) || []).length, 8); // 7 cells = 8 pipes
  // L2 正则（depth_gate.mjs:455 verifyWiredGreenEvidence）：evidence\s*:\s*(\S+)\s*[→>]\s*(\S+)
  const ev = line.match(/evidence\s*:\s*(\S+)\s*[→>]\s*(\S+)/i);
  assert.ok(ev, 'evidence line must match L2 regex');
  assert.equal(ev[1], B);
  assert.equal(ev[2], H);
  assert.notEqual(B, H);
  // → 两侧空格强制（无空格则两 SHA 塌进首捕获组）。
  assert.match(line, new RegExp(`${B} → ${H}`));
});

test('padCell: 短值保持原宽，长值溢出仅加单空格', () => {
  assert.equal(padCell(' WIRED_RED ', 'WIRED_GREEN').length >= 'WIRED_GREEN'.length + 2, true);
  assert.equal(padCell(' — ', H), ' ' + H + ' ');
});

// ----- writeBackUpgrades 端到端（temp ledger · 原子 · 幂等 · 不动非目标行）-----
function tempLedger(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'depth-ev-test-'));
  const path = join(dir, 'DEPTH_LEDGER.md');
  const content = [
    '# DEPTH_LEDGER',
    '',
    '## §A. next_action',
    '```',
    'next_action = X',
    '```',
    '',
    '## §C. 深度模块接线表',
    '',
    '| id | dep | proof_caller | proof_test | red | status | closed_by |',
    '|----|-----|--------------|------------|-----|--------|-----------|',
    ...rows,
    '',
    '## §D. 机器门',
    '',
    '散文段。',
  ].join('\n');
  writeFileSync(path, content, 'utf8');
  return { dir, path };
}

const ROW_P01 = '| P0-1 | compileFec ... | src/fec/orchestrator.ts:99 | tests/fec/fec_mandatory_e2e.test.ts::missing_or_bad_fec_blocks_confirmed | (待 CI) | WIRED_RED | — |';
const ROW_P02A = '| P0-2a | kernel caller | src/fec/orchestrator.ts:117 | tests/fec/orchestrator_v2_wired.test.ts::verdict_uses_v2_kernel | (待 CI) | WIRED_RED | — |';

test('writeBackUpgrades: WIRED_RED→WIRED_GREEN + evidence 行；非目标行不动；写回行过 L2 + LEDGER_ROW_RE', () => {
  const { dir, path } = tempLedger([ROW_P01, ROW_P02A]);
  try {
    const upgrades = new Map([
      ['P0-1', { testFile: 'tests/fec/fec_mandatory_e2e.test.ts', testName: 'missing_or_bad_fec_blocks_confirmed' }],
    ]);
    const wb = writeBackUpgrades(path, upgrades, B, H, false);
    assert.equal(wb.changed, 1);
    assert.equal(wb.wrote, true);

    const after = readFileSync(path, 'utf8');
    const lines = after.split('\n');
    // P0-1 行已升 WIRED_GREEN + closed_by=H，紧随 evidence 行。
    const p01Idx = lines.findIndex((l) => /^\|\s*P0-1\b/.test(l));
    assert.ok(p01Idx >= 0);
    assert.match(lines[p01Idx], /WIRED_GREEN/);
    assert.match(lines[p01Idx], new RegExp(H));
    assert.match(lines[p01Idx + 1], new RegExp(`evidence: ${B} → ${H}`));
    // P0-1 行仍可被 §C 正则解析。
    assert.ok(lines[p01Idx].match(LEDGER_ROW_RE), 'upgraded P0-1 must still match LEDGER_ROW_RE');

    // P0-2a 非目标行未被动（仍 WIRED_RED，无 evidence 跟随）。
    const p02aIdx = lines.findIndex((l) => /^\|\s*P0-2a\b/.test(l));
    assert.ok(p02aIdx >= 0);
    assert.match(lines[p02aIdx], /WIRED_RED/);
    assert.doesNotMatch(lines[p02aIdx + 1], /evidence:/);

    // 无 tmp 残留（原子 rename）。
    assert.equal(existsSync(path + '.depth-evidence-tmp'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeBackUpgrades: 无升级目标 → changed=0 不写', () => {
  const { dir, path } = tempLedger([ROW_P01]);
  try {
    const before = readFileSync(path, 'utf8');
    const wb = writeBackUpgrades(path, new Map(), B, H, false);
    assert.equal(wb.changed, 0);
    assert.equal(wb.wrote, false);
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeBackUpgrades: dry-run 不写盘，返回 preview', () => {
  const { dir, path } = tempLedger([ROW_P01]);
  try {
    const before = readFileSync(path, 'utf8');
    const upgrades = new Map([['P0-1', { testFile: 'x', testName: 'y' }]]);
    const wb = writeBackUpgrades(path, upgrades, B, H, true);
    assert.equal(wb.changed, 1);
    assert.equal(wb.wrote, false);
    assert.ok(wb.preview.includes('WIRED_GREEN'));
    assert.equal(readFileSync(path, 'utf8'), before, 'dry-run must not write');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeBackUpgrades: 已有 evidence 行则替换不重复插入（幂等重跑）', () => {
  // 预置：P0-1 已 WIRED_GREEN + 旧 evidence 行；但 writeBack 只动 status===WIRED_RED 的目标行，
  // 故已是 WIRED_GREEN 的行不会被二次处理 → 第二次跑同 upgrade 时该行已不在 upgrades（main 仅收集 WIRED_RED）。
  // 此测验证：对仍 WIRED_RED 且下一行已是 evidence 行的目标，替换而非插入。
  const rowWithEv = [
    '| P0-1 | compileFec ... | src/fec/orchestrator.ts:99 | tests/fec/fec_mandatory_e2e.test.ts::x | (待 CI) | WIRED_RED | — |',
    `| evidence: ${'c'.repeat(40)} → ${'d'.repeat(40)} | — | — | — | — | — | — |`,
    ROW_P02A,
  ];
  const { dir, path } = tempLedger(rowWithEv);
  try {
    const upgrades = new Map([['P0-1', { testFile: 'x', testName: 'y' }]]);
    const wb = writeBackUpgrades(path, upgrades, B, H, false);
    assert.equal(wb.changed, 1);
    const after = readFileSync(path, 'utf8');
    // 仅 1 条 evidence 行（替换旧值），未重复插入。
    assert.equal((after.match(/\| evidence:/g) || []).length, 1);
    assert.match(after, new RegExp(`evidence: ${B} → ${H}`));
    assert.doesNotMatch(after, /evidence: c{40}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
