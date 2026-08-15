/**
 * complexity_budget_check.test.mjs — 门禁脚本自测（night-r3 T1）。
 * 1. 脚本在当前树上 PASS（基线化的存量债务不阻断）；
 * 2. 基线文件存在且为位置键（location keys）格式；
 * 3. 检测器语义抽验：对已知高复杂度源文件的分析结果包含 kernel 决策树函数（>15）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'complexity_budget_check.mjs');
const BASELINE = join(ROOT, 'scripts', 'complexity_budget_baseline.json');

test('gate passes on the current tree (grandfathered debt, zero new violations)', () => {
  const out = execFileSync('node', [SCRIPT], { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /new violations: 0/);
  assert.match(out, /PASS/);
  assert.doesNotMatch(out, /\[FAIL\]/);
});

test('baseline file exists with location keys (repayment-plan register)', () => {
  assert.ok(existsSync(BASELINE), 'baseline must be committed with the gate');
  const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
  assert.ok(Array.isArray(parsed.entries) && parsed.entries.length > 0);
  for (const key of parsed.entries) {
    assert.match(key, /^(file|fn):src\//, `baseline key format: ${key}`);
  }
});

test('debt register lists the known hotspot (verdict_kernel_v2 decision tree)', () => {
  const out = execFileSync('node', [SCRIPT], { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /budget-debt \(grandfathered\): \d+/);
  assert.ok(/decideFiveValueVerdictInternal|verdict_kernel_v2/.test(out), 'kernel decision-tree debt must stay visible until repaid');
});
