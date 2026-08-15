/**
 * perf_budget_check 脚本测试（b6-S2 性能预算门 v1）。
 *
 * 覆盖（≥8 项验收全落）：
 *   1. evaluateMeasurements：未超阈值 → 0 违规 + 维度计入 evaluated。
 *   2. evaluateMeasurements：超阈值 → 违规附实测值与阈值差。
 *   3. evaluateMeasurements：堆维度 ok:false / cap 不匹配 → 违规；ok:true 通过。
 *   4. evaluateMeasurements：未知测量键 → fail-closed 违规。
 *   5. parseBudget：合法/坏 JSON/schema 版本不符/空 budgets 四分支。
 *   6. nextWallThresholdMs：倍率+取整粒度（100ms / 60000ms）。
 *   7. 端到端：缺预算文件 → exit 1（fail-closed，不自动新建）。
 *   8. 端到端：--from-measurements 未超 → exit 0；超阈 → exit 1 附实测值。
 *   9. 端到端：--update-baseline 回写新预算 + 打印旧→新 + 回写后仍可 parseBudget。
 *   10. 回归：--update-baseline 不改真实 scripts/perf_budget.json（防路径误写）。
 *   11. CRLF：预算文件与测量文件 CRLF 行尾均可解析判定。
 *   12. 空门 fail-closed：无可评估维度 → exit 1。
 *
 * Hermetic 原则：一切端到端用例走 --budget-file/--from-measurements 指向临时文件，
 * 绝不 spawn 真实 CLI 测量（墙钟断言跨机器必假绿/假红），绝不改真实预算文件。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateMeasurements,
  parseBudget,
  nextWallThresholdMs,
  buildUpdatedBudget,
} from '../../scripts/perf_budget_check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const SCRIPT = join(repoRoot, 'scripts', 'perf_budget_check.mjs');
const REAL_BUDGET = join(repoRoot, 'scripts', 'perf_budget.json');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

/** 最小合法预算夹具（4 维度齐全）。 */
function fixtureBudget() {
  return {
    schema_version: 1,
    description: 'test fixture budget',
    budgets: {
      cli_cold_start_ms: { kind: 'wall_ms', threshold_ms: 1000, command: 'x', runs: 3, rationale: 't' },
      demo_wall_ms: { kind: 'wall_ms', threshold_ms: 2000, command: 'x', runs: 3, rationale: 't' },
      demo_heap_cap: { kind: 'heap_success', cap_mb: 128, command: 'x', rationale: 't' },
      test_wall_ms: { kind: 'wall_ms', threshold_ms: 600000, command: 'x', runs: 1, rationale: 't' },
    },
  };
}

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repoRoot, encoding: 'utf8' });
}

// ───────────────────────── 单元：门判定 ─────────────────────────

test('gate: wall measurement under threshold → no violation, counted as evaluated', () => {
  const budget = fixtureBudget();
  const { evaluated, violations } = evaluateMeasurements(budget, { cli_cold_start_ms: 999 });
  assert.deepEqual(violations, []);
  assert.deepEqual(evaluated, ['cli_cold_start_ms']);
});

test('gate: wall measurement over threshold → violation carries measured value and threshold', () => {
  const budget = fixtureBudget();
  const { violations } = evaluateMeasurements(budget, { demo_wall_ms: 2500.7 });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].key, 'demo_wall_ms');
  assert.equal(violations[0].threshold, 2000);
  assert.equal(Math.round(violations[0].measured), 2501);
  assert.match(violations[0].detail, /2501ms > threshold 2000ms/);
});

test('gate: heap dimension — ok:true passes, ok:false and cap mismatch fail closed', () => {
  const budget = fixtureBudget();
  const ok = evaluateMeasurements(budget, { demo_heap_cap: { cap_mb: 128, ok: true } });
  assert.deepEqual(ok.violations, []);

  const crashed = evaluateMeasurements(budget, { demo_heap_cap: { cap_mb: 128, ok: false } });
  assert.equal(crashed.violations.length, 1);
  assert.match(crashed.violations[0].detail, /max-old-space-size=128/);

  const wrongCap = evaluateMeasurements(budget, { demo_heap_cap: { cap_mb: 64, ok: true } });
  assert.equal(wrongCap.violations.length, 1, 'cap mismatch vs budget entry must be a violation');
});

test('gate: measurement for a key with no budget entry → fail-closed violation', () => {
  const budget = fixtureBudget();
  const { violations } = evaluateMeasurements(budget, { mystery_key: 1 });
  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /no budget entry for measured key 'mystery_key'/);
});

test('gate: non-numeric wall measurement is a violation, not silently skipped', () => {
  const budget = fixtureBudget();
  const { violations } = evaluateMeasurements(budget, { cli_cold_start_ms: 'fast' });
  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /not a non-negative number/);
});

// ───────────────────────── 单元：预算解析 ─────────────────────────

test('parseBudget: valid budget parses; corrupt JSON / wrong schema_version / empty budgets throw', () => {
  const good = parseBudget(JSON.stringify(fixtureBudget()));
  assert.equal(good.budgets.cli_cold_start_ms.threshold_ms, 1000);

  assert.throws(() => parseBudget('{not json'), /not valid JSON/);
  const badVersion = fixtureBudget();
  badVersion.schema_version = 99;
  assert.throws(() => parseBudget(JSON.stringify(badVersion)), /schema_version 99/);
  const noBudgets = fixtureBudget();
  noBudgets.budgets = {};
  assert.throws(() => parseBudget(JSON.stringify(noBudgets)), /no budgets entries/);
  const badKind = fixtureBudget();
  badKind.budgets.demo_heap_cap.kind = 'wall_ms';
  assert.throws(() => parseBudget(JSON.stringify(badKind)), /kind 'wall_ms' != expected 'heap_success'/);
  const badThreshold = fixtureBudget();
  badThreshold.budgets.cli_cold_start_ms.threshold_ms = -1;
  assert.throws(() => parseBudget(JSON.stringify(badThreshold)), /positive threshold_ms/);
});

test('nextWallThresholdMs: multiplier × max rounded up per-dimension step (100ms vs 60000ms)', () => {
  assert.equal(nextWallThresholdMs('demo_wall_ms', [471.5, 438.9]), 1500); // 471.5×3=1414.5 → ceil 100 → 1500
  assert.equal(nextWallThresholdMs('cli_cold_start_ms', [368.4]), 1200); // 368.4×3=1105.2 → ceil 100 → 1200
  assert.equal(nextWallThresholdMs('test_wall_ms', [120000]), 600000); // 120s×5=600s（60s 粒度）
  assert.equal(nextWallThresholdMs('demo_wall_ms', [400]), 1200); // 400×3=1200 恰好整除不进位
});

test('buildUpdatedBudget: rewrites thresholds+last_measured, preserves untouched entries', () => {
  const old = fixtureBudget();
  const updated = buildUpdatedBudget(
    old,
    { cli_cold_start_ms: 350, demo_heap_cap: { cap_mb: 128, ok: true } },
    { cli_cold_start_ms: [349, 306, 299] },
    '2026-08-15T00:00:00.000Z',
  );
  assert.equal(updated.budgets.cli_cold_start_ms.threshold_ms, 1100); // max 349×3=1047 → 1100
  assert.deepEqual(updated.budgets.cli_cold_start_ms.last_measured.samples_ms, [349, 306, 299]);
  assert.equal(updated.budgets.demo_heap_cap.last_measured.exit_code, 0);
  assert.equal(updated.budgets.test_wall_ms.threshold_ms, 600000); // 未测量 → 原样保留
  assert.equal(old.budgets.cli_cold_start_ms.threshold_ms, 1000, 'old budget object must not be mutated');
});

// ───────────────────────── 端到端（hermetic 临时文件） ─────────────────────────

test('e2e: missing budget file → exit 1 fail-closed (never auto-created)', () => {
  const missing = join(here, '_perf_budget_missing.json');
  rmSync(missing, { force: true });
  const r = runScript(['--budget-file', missing, '--from-measurements', join(here, '_perf_budget_absent_measurements.json')]);
  assert.equal(r.status, 1, `missing budget must exit 1\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /budget file not found/);
  assert.match(r.stderr, /fail-closed/);
});

test('e2e: --from-measurements within budget → exit 0 with dimension list', () => {
  const budgetFile = join(here, '_perf_budget_ok.json');
  const measFile = join(here, '_perf_meas_ok.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  writeFileSync(measFile, JSON.stringify({ cli_cold_start_ms: 800, demo_wall_ms: 1900 }), 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(r.status, 0, `within-budget must exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /evaluated 2 dimension\(s\)/);
    assert.match(r.stdout, /PASS/);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: --from-measurements over threshold → exit 1, stderr carries measured value', () => {
  const budgetFile = join(here, '_perf_budget_over.json');
  const measFile = join(here, '_perf_meas_over.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  writeFileSync(measFile, JSON.stringify({ test_wall_ms: 750000 }), 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(r.status, 1, `over-budget must exit 1\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /1 budget violation/);
    assert.match(r.stderr, /\[test_wall_ms\].*750000ms > threshold 600000ms/);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: heap violation via measurements file → exit 1 mentioning the cap', () => {
  const budgetFile = join(here, '_perf_budget_heap.json');
  const measFile = join(here, '_perf_meas_heap.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  writeFileSync(measFile, JSON.stringify({ demo_heap_cap: { cap_mb: 128, ok: false } }), 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /max-old-space-size=128/);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: --update-baseline rewrites budget, prints old→new, file revalidates', () => {
  const budgetFile = join(here, '_perf_budget_update.json');
  const measFile = join(here, '_perf_meas_update.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  writeFileSync(measFile, JSON.stringify({ cli_cold_start_ms: 350, demo_wall_ms: 460, test_wall_ms: 120000 }), 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile, '--update-baseline']);
    assert.equal(r.status, 0, `update-baseline must exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /old → new/);
    assert.match(r.stdout, /cli_cold_start_ms: threshold 1000ms → threshold 1100ms/); // 350×3=1050→1100
    assert.match(r.stdout, /test_wall_ms: threshold 600000ms → threshold 600000ms/); // 120s×5 恰等
    // 回写后的文件必须仍能通过严格解析（round-trip 校验）。
    const rewritten = parseBudget(readFileSync(budgetFile, 'utf8'));
    assert.equal(rewritten.budgets.cli_cold_start_ms.threshold_ms, 1100);
    assert.equal(rewritten.budgets.demo_wall_ms.threshold_ms, 1400); // 460×3=1380 → ceil 100 → 1400
    assert.deepEqual(rewritten.budgets.cli_cold_start_ms.last_measured.samples_ms, [350]);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e regression: --update-baseline with --budget-file never touches the real perf_budget.json', () => {
  const budgetFile = join(here, '_perf_budget_realguard.json');
  const measFile = join(here, '_perf_meas_realguard.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  writeFileSync(measFile, JSON.stringify({ cli_cold_start_ms: 350 }), 'utf8');
  const realBefore = readFileSync(REAL_BUDGET, 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile, '--update-baseline']);
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(readFileSync(REAL_BUDGET, 'utf8'), realBefore, 'real budget file must be untouched by hermetic runs');
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: CRLF line endings in budget and measurements files parse and gate correctly', () => {
  const budgetFile = join(here, '_perf_budget_crlf.json');
  const measFile = join(here, '_perf_meas_crlf.json');
  const crlf = (obj) => `${JSON.stringify(obj, null, 2)}\n`.replace(/\n/g, '\r\n');
  writeFileSync(budgetFile, crlf(fixtureBudget()), 'utf8');
  writeFileSync(measFile, crlf({ cli_cold_start_ms: 900 }), 'utf8');
  try {
    const pass = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(pass.status, 0, `CRLF budget must gate fine\nstdout: ${pass.stdout}\nstderr: ${pass.stderr}`);

    writeFileSync(measFile, crlf({ cli_cold_start_ms: 9999 }), 'utf8');
    const fail = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(fail.status, 1, 'CRLF over-budget must still fail');
    assert.match(fail.stderr, /9999ms > threshold 1000ms/);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: empty gate (external-only budget, no external value provided) → exit 1, not a silent pass', () => {
  const budgetFile = join(here, '_perf_budget_empty.json');
  const measFile = join(here, '_perf_meas_empty.json');
  const externalOnly = fixtureBudget();
  externalOnly.budgets = { test_wall_ms: externalOnly.budgets.test_wall_ms };
  writeFileSync(budgetFile, JSON.stringify(externalOnly), 'utf8');
  writeFileSync(measFile, '{}', 'utf8');
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', measFile]);
    assert.equal(r.status, 1, 'empty gate must fail closed');
    assert.match(r.stderr, /no dimensions were measured/);
  } finally {
    rmSync(budgetFile, { force: true });
    rmSync(measFile, { force: true });
  }
});

test('e2e: missing --from-measurements file → exit 1 fail-closed', () => {
  const budgetFile = join(here, '_perf_budget_noMeas.json');
  const absent = join(here, '_perf_meas_absent.json');
  writeFileSync(budgetFile, JSON.stringify(fixtureBudget()), 'utf8');
  rmSync(absent, { force: true });
  try {
    const r = runScript(['--budget-file', budgetFile, '--from-measurements', absent]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--from-measurements file not found/);
  } finally {
    rmSync(budgetFile, { force: true });
  }
});

test('e2e: unknown flag → exit 2 (usage error); bad --test-wall-ms value → exit 2', () => {
  assert.equal(runScript(['--nonsense']).status, 2);
  assert.equal(runScript(['--test-wall-ms', 'abc']).status, 2);
});
