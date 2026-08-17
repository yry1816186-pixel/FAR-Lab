// tests/planning/startup_receipt.test.ts
// CORE-START-001：启动 receipt——资产哈希 + baseline 实跑账 + GATES 视图 + 状态差异。
// 真实依赖：assembleStartupReceipt/parseGatesSnapshot/diffStartupState/verifyStartupReceipt
// （纯函数）+ CLI e2e（spawnSync 真跑 src/cli/far.ts；主仓库 cwd 有真实 .far 层，
// fresh worktree cwd 无 → 正好覆盖 fail-closed 路径）。

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  BaselineEntrySchema,
  StartupReceiptSchema,
  assembleStartupReceipt,
  diffStartupState,
  parseGatesSnapshot,
  verifyStartupReceipt,
} from '../../src/planning/startup_receipt.ts';
import type { BaselineEntry, StartupReceipt } from '../../src/planning/startup_receipt.ts';

const GATES_FIXTURE = `# T0 / T1 Gate View — GENERATED
t0:
  total: 125
  byStatus:
    PASS: 67
    FAIL: 58
  notPassing:
    - AGENT-BRIEF-001
    - CAMPAIGN-CHECKPOINT-001
t1:
  total: 49
`;

function goodBaseline(): BaselineEntry[] {
  return [
    { name: 'typecheck', command: 'pnpm run typecheck', exitCode: 0, summary: '0 errors' },
    { name: 'lint', command: 'pnpm run lint', exitCode: 0, summary: '0 problems' },
  ];
}

function receipt(overrides: Record<string, unknown> = {}): StartupReceipt {
  return StartupReceiptSchema.parse({
    generatedAt: '2026-08-18T00:00:00Z',
    readAssets: [{ path: 'AGENTS.md', exists: true, sha256: 'a'.repeat(64) }],
    baseline: goodBaseline(),
    gitState: { branch: 'main', head: 'a'.repeat(40), dirtyCount: 0 },
    gatesSnapshot: { t0Pass: 67, t0Total: 125, topNotPassing: 'AGENT-BRIEF-001' },
    plannedBatch: { objective: '启动后首个最小批', requirementId: 'CORE-START-001' },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// schema fail-closed
// ---------------------------------------------------------------------------

test('CORE-START-001 schema: 合法 receipt 通过；零 baseline 被拒（无实跑不成 receipt）', () => {
  assert.equal(receipt().baseline.length, 2);
  const noBaseline = StartupReceiptSchema.safeParse({ ...receipt(), baseline: [] });
  assert.equal(noBaseline.success, false, 'empty baseline must fail schema');
  const noPlan = StartupReceiptSchema.safeParse({ ...receipt(), plannedBatch: undefined });
  assert.equal(noPlan.success, false, 'plannedBatch required');
  const badEntry = BaselineEntrySchema.safeParse({ name: 'x', command: 'y', exitCode: '0', summary: 'z' });
  assert.equal(badEntry.success, false, 'exitCode must be number (实跑值，不是字符串)');
});

// ---------------------------------------------------------------------------
// GATES 解析（fail-closed）
// ---------------------------------------------------------------------------

test('CORE-START-001: parseGatesSnapshot 解析真实格式（counts + notPassing 首项）', () => {
  const snap = parseGatesSnapshot(GATES_FIXTURE);
  assert.equal(snap.t0Total, 125);
  assert.equal(snap.t0Pass, 67);
  assert.equal(snap.topNotPassing, 'AGENT-BRIEF-001');
});

test('CORE-START-001 fail-closed: GATES 无 t0 段 / 缺 PASS 行 → 抛错不静默 0', () => {
  assert.throws(() => parseGatesSnapshot('t1:\n  total: 49\n'), /no t0 section/);
  assert.throws(() => parseGatesSnapshot('t0:\n  total: 5\n'), /missing total\/PASS/);
});

// ---------------------------------------------------------------------------
// 状态差异
// ---------------------------------------------------------------------------

test('CORE-START-001: diff 检出 branch/head/dirty/T0/资产哈希五类变动；identical 为空', () => {
  const before = receipt();
  const after = receipt({
    generatedAt: '2026-08-19T00:00:00Z', // 时间戳不参与比较
    gitState: { branch: 'feat/x', head: 'b'.repeat(40), dirtyCount: 3 },
    gatesSnapshot: { t0Pass: 68, t0Total: 125, topNotPassing: 'CAMPAIGN-CHECKPOINT-001' },
    readAssets: [{ path: 'AGENTS.md', exists: true, sha256: 'c'.repeat(64) }],
  });
  const diff = diffStartupState(before, after);
  const fields = diff.map((d) => d.field);
  for (const expect of ['gitState.branch', 'gitState.head', 'gitState.dirtyCount', 'gatesSnapshot.t0Pass', 'gatesSnapshot.topNotPassing', 'asset:AGENTS.md']) {
    assert.ok(fields.includes(expect), `diff must include ${expect}`);
  }
  assert.deepEqual(diffStartupState(before, receipt()), [], 'identical state (仅 generatedAt 异) → 无差异');
});

// ---------------------------------------------------------------------------
// 组装 + 完整性门
// ---------------------------------------------------------------------------

test('CORE-START-001: 组装含资产缺失 warning（如实记录不中断）+ verify 拒资产缺失', () => {
  const { result, warnings } = (() => {
    const r = assembleStartupReceipt({
      baseline: goodBaseline(),
      gitState: { branch: 'main', head: 'a'.repeat(40), dirtyCount: 0 },
      gatesYamlText: GATES_FIXTURE,
      plannedBatch: { objective: 'o', requirementId: 'CORE-START-001' },
      assetPaths: ['AGENTS.md', 'definitely/missing/file.xyz'],
    });
    return { result: verifyStartupReceipt(r.receipt), warnings: r.warnings };
  })();
  assert.ok(warnings.some((w) => w.includes('definitely/missing/file.xyz')));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('definitely/missing')));
});

test('CORE-START-001: baseline 红 → verify 拒（失败如实入账且不得判 ok）', () => {
  const r = receipt({ baseline: [{ name: 'test', command: 'pnpm test', exitCode: 1, summary: '1 failing' }] });
  const v = verifyStartupReceipt(r);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("'test' exit 1")));
});

test('CORE-START-001: 全绿 receipt → verify ok', () => {
  assert.equal(verifyStartupReceipt(receipt()).ok, true);
});

// ---------------------------------------------------------------------------
// CLI e2e（真跑；主仓库 cwd=真实 .far 层，本 worktree cwd=无 .far 层）
// ---------------------------------------------------------------------------

/** 仓库根（由本测试文件位置推导——路径无关，Linux/Windows CI 与本地任意 checkout 皆可）。 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function runStartupCli(cwd: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli/far.ts'), 'planning', 'startup', ...args], {
    encoding: 'utf8',
    timeout: 60000,
    cwd,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('CORE-START-001 e2e: 临时脚手架（资产+GATES+baseline 全齐）→ exit 0 全绿 receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-startup-green-'));
  try {
    // 脚手架：全部 8 项核心资产占位文件 + GATES fixture（非 git 目录 → gitState 如实记 '(unknown)'）
    const assets = [
      '.far/constitution/CORE_CONSTITUTION.md',
      '.far/constitution/DOMAIN_PROTOCOLS.md',
      '.far/constitution/MACHINE_SCHEMAS.yaml',
      'AGENTS.md',
      'docs/development/PROGRESS.md',
      '.far/agent/decisions.md',
      '.far/state/UNKNOWN_REGISTRY.yaml',
      '.far/requirements/GATES.yaml',
    ];
    for (const asset of assets) {
      const file = join(dir, asset);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, asset.endsWith('GATES.yaml') ? GATES_FIXTURE : `placeholder ${asset}\n`);
    }
    const baselineFile = join(dir, 'baseline.json');
    writeFileSync(baselineFile, JSON.stringify(goodBaseline()));
    const r = runStartupCli(dir, ['--baseline', baselineFile, '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const payload = JSON.parse(r.stdout) as {
      receipt: { readAssets: { exists: boolean }[]; gatesSnapshot: { t0Pass: number; t0Total: number }; gitState: { branch: string }; baseline: unknown[] };
      ok: boolean;
      diff: unknown[];
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.receipt.gatesSnapshot.t0Pass, 67);
    assert.equal(payload.receipt.baseline.length, 2);
    assert.ok(payload.receipt.readAssets.length >= 4);
    assert.ok(payload.receipt.readAssets.every((a) => a.exists));
    assert.equal(payload.receipt.gitState.branch, '(unknown)'); // 非 git 目录如实记录
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CORE-START-001 e2e fail-closed: 缺 --baseline → 2；GATES 缺失（fresh worktree 无 .far）→ 7', () => {
  const noFlag = runStartupCli(REPO_ROOT, ['--json']);
  assert.equal(noFlag.status, 2);

  const dir = mkdtempSync(join(tmpdir(), 'far-startup-'));
  try {
    const baselineFile = join(dir, 'baseline.json');
    writeFileSync(baselineFile, JSON.stringify(goodBaseline()));
    // 本 worktree（REPO_ROOT）有 startup 代码但无 gitignored .far/requirements/GATES.yaml → fail-closed 7
    const r = runStartupCli(REPO_ROOT, ['--baseline', baselineFile]);
    assert.equal(r.status, 7);
    assert.match(r.stderr, /GATES\.yaml missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
