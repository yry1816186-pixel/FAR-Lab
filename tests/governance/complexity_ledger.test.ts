// tests/governance/complexity_ledger.test.ts
//
// CORE-COMPLEXITY-001 验收测试：复杂度预算登记表——真实扫描对预算、超限
// fail、豁免必须带未过期期限且引用真实 baseline 条目、新模块必须先登记预算。
// 真实仓库 fixture + tmp fixture（构造超限/豁免/过期场景）双轴。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkComplexityLedger,
  MAX_LINES_PER_FILE,
  MODULE_COMPLEXITY_BUDGETS,
} from '../../src/governance/complexity_ledger.ts';
import { REPO_ROOT } from './repo_root.ts';

const BASELINE = ['file:src/legacy/big.ts', 'file:src/legacy/huge.ts'];

function tmpRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'far-cx-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

test('real repo: every src module is budgeted, no unexempted overage, budgets >= actual scan', () => {
  const check = checkComplexityLedger({ repoRoot: REPO_ROOT });
  assert.deepEqual(check.unbudgetedModules, [], 'every src/ module must carry an explicit budget entry');
  assert.deepEqual(check.overFileBudget, [], `module file counts must be within registered budgets (scan: ${JSON.stringify(check.scan)})`);
  // 存量超限文件（far.ts/orchestrator.ts 等）在真实仓库存在——无豁免表时
  // 必须如实暴露为未豁免超限（本测试证明扫描真实，不粉饰）。
  assert.ok(check.overLineBudget.some((f) => f.path === 'src/cli/far.ts'), 'real over-limit files must be surfaced');
  assert.ok(check.overLineBudget.every((f) => f.lines > MAX_LINES_PER_FILE));
});

test('new file over line budget fails; valid exemption with unexpired review passes but is listed for audit', () => {
  const big = 'const x = 1;\n'.repeat(900);
  const root = tmpRepo({ 'src/newmod/a.ts': 'export const a = 1;\n', 'src/newmod/big.ts': big });

  const noEx = checkComplexityLedger({ repoRoot: root, today: () => new Date('2026-08-18T00:00:00Z') });
  assert.equal(noEx.ok, false);
  assert.ok(noEx.overLineBudget.some((f) => f.path === 'src/newmod/big.ts' && f.exemption === undefined));
  assert.ok(noEx.unbudgetedModules.includes('newmod'));

  const exempted = checkComplexityLedger({
    repoRoot: root,
    today: () => new Date('2026-08-18T00:00:00Z'),
    exemptions: { 'src/newmod/big.ts': { baselineEntry: 'file:src/legacy/big.ts', reviewBy: '2026-09-01', reason: 'grandfathered CLI wall — refactor queue' } },
    baselineEntries: BASELINE,
  });
  assert.equal(exempted.ok, false, 'still fails: module not budgeted');
  assert.deepEqual(exempted.brokenExemptions, []);
  assert.ok(exempted.overLineBudget.some((f) => f.path === 'src/newmod/big.ts' && f.exemption !== undefined));

  // 登记预算后（临时表注入不可——登记表是模块常量；用预算内模块验证 ok 路径：
  // 构造只有 under-budget 文件的仓库）。
  const clean = tmpRepo({ 'src/governance/small.ts': 'export const s = 1;\n' });
  const cleanCheck = checkComplexityLedger({ repoRoot: clean });
  assert.equal(cleanCheck.ok, true, JSON.stringify(cleanCheck));
});

test('exemption defects fail the gate: expired review date, bogus baseline citation, malformed date', () => {
  const big = 'const y = 2;\n'.repeat(850);
  const root = tmpRepo({ 'src/governance/big.ts': big });
  const today = () => new Date('2026-08-18T00:00:00Z');

  const expired = checkComplexityLedger({
    repoRoot: root,
    today,
    exemptions: { 'src/governance/big.ts': { baselineEntry: 'file:src/legacy/big.ts', reviewBy: '2026-08-01', reason: 'x' } },
    baselineEntries: BASELINE,
  });
  assert.equal(expired.ok, false);
  assert.ok(expired.brokenExemptions.some((b) => b.problem.includes('expired')));

  const bogusRef = checkComplexityLedger({
    repoRoot: root,
    today,
    exemptions: { 'src/governance/big.ts': { baselineEntry: 'file:src/ghost.ts', reviewBy: '2027-01-01', reason: 'x' } },
    baselineEntries: BASELINE,
  });
  assert.equal(bogusRef.ok, false);
  assert.ok(bogusRef.brokenExemptions.some((b) => b.problem.includes('does not exist')));

  const malformed = checkComplexityLedger({
    repoRoot: root,
    today,
    exemptions: { 'src/governance/big.ts': { baselineEntry: 'file:src/legacy/big.ts', reviewBy: 'someday', reason: 'x' } },
    baselineEntries: BASELINE,
  });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.brokenExemptions.some((b) => b.problem.includes('not a valid date')));
});

test('file-budget overage: exceeding registered budgetFiles fails even when every file is small', () => {
  // governance 预算登记数为 MODULE_COMPLEXITY_BUDGETS 的显式值——tmp 仓库
  // 塞入超量小文件 → overFileBudget 必须点名。
  const budget = MODULE_COMPLEXITY_BUDGETS.find((b) => b.module === 'governance')!;
  const files: Record<string, string> = {};
  for (let i = 0; i < budget.budgetFiles + 1; i += 1) files[`src/governance/f${i}.ts`] = 'export {}\n';
  const root = tmpRepo(files);
  const check = checkComplexityLedger({ repoRoot: root });
  assert.equal(check.ok, false);
  assert.deepEqual(check.overFileBudget, [{ module: 'governance', budgetFiles: budget.budgetFiles, actualFiles: budget.budgetFiles + 1 }]);
});

test('line counting convention matches the CI script: split newline length', () => {
  // 800 行整（含尾换行的 800 个 \n 分段）不超限；801 超限——与
  // scripts/complexity_budget_check.mjs 的行计数口径一致性锚点。
  const exact = 'export {}\n'.repeat(MAX_LINES_PER_FILE - 1) + 'export const last = 1;'; // 800 行
  const over = 'export {}\n'.repeat(MAX_LINES_PER_FILE); // 801 行
  const root = tmpRepo({ 'src/governance/exact.ts': exact, 'src/governance/over.ts': over });
  const check = checkComplexityLedger({ repoRoot: root });
  assert.deepEqual(check.overLineBudget.map((f) => f.path), ['src/governance/over.ts']);
  assert.equal(check.overLineBudget[0]!.lines, MAX_LINES_PER_FILE + 1);
});
