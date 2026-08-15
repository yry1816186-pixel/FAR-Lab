#!/usr/bin/env node
/**
 * perf_budget_check —— 性能预算门 v1（b6-S2·08-22 发布列车缺口闭合第一刀）。
 *
 * 设计（全部阈值来自实测，禁止拍脑袋估算；实测记录见 scripts/perf_budget.json）：
 *   维度① cli_cold_start_ms —— `node src/cli/far.ts --help` 墙钟（自测）。
 *   维度② demo_wall_ms      —— `node src/cli/far.ts demo` 墙钟（自测·离线确定性 demo）。
 *   维度③ demo_heap_cap     —— `node --max-old-space-size=<cap> src/cli/far.ts demo` 须 exit 0（自测）。
 *   维度④ test_wall_ms      —— CI test_ts job 测试链墙钟（外测：CI 步传入 --test-wall-ms）。
 *
 * 测试墙钟 CI 方案二选一（已裁定并文档化，弃案见下）：
 *   【采纳】复用既有 test 步骤计时 —— test_ts job 内记录起止 epoch ms，末步把实测墙钟
 *           传给本脚本门禁。测的就是真实全量测试链，零重复跑套件。
 *   【弃案】独立轻量 job + skip-suite 子集计时 —— 子集墙钟≠全量墙钟，预算盖不住真实退化；
 *           且若跑全量则测试套件在 CI 重复执行一遍（时长翻倍）。诚实性差、成本高，弃。
 *
 * 用法：
 *   node scripts/perf_budget_check.mjs                        # 自测①②③ → 比对预算 → 超阈 exit 1
 *   node scripts/perf_budget_check.mjs --test-wall-ms 123456   # CI：外测④ + 自测①②③
 *   node scripts/perf_budget_check.mjs --update-baseline       # 显式重置基线（实测→回写，打印旧→新）
 *   node scripts/perf_budget_check.mjs --from-measurements f   # hermetic：注入测量值（不 spawn 真实命令）
 *   node scripts/perf_budget_check.mjs --budget-file p         # 覆盖预算文件路径（hermetic 测试）
 *
 * Exit codes: 0 = 预算内；1 = 超阈值 / fail-closed（预算文件缺失·损坏·schema 不识别·测量命令失败）；
 *             2 = 用法错误。
 *
 * 诚实边界（本门不能证明什么）：
 *   - 墙钟阈值跨机器不可比（基线在本地 Windows 开发机实测，CI=ubuntu-latest）；阈值含倍率余量，
 *     首次 CI 运行即再校验。机器换代须 --update-baseline 显式重置。
 *   - 本门只防性能量级退化（cold start / demo 墙钟 / 堆膨胀 / 测试链挂死），不是基准测试工具，
 *     不产出统计显著性结论。
 *   - test_wall 含 CI runner 调度噪声，阈值须留足余量（当前 5×），防假红。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const DEFAULT_BUDGET_FILE = join(repoRoot, 'scripts', 'perf_budget.json');

export const BUDGET_SCHEMA_VERSION = 1;

/** 墙钟维度的阈值余量倍数（实测 max × 倍率 → 阈值）。CLI/demo=3×，test_wall=5×（CI 噪声更大）。 */
export const WALL_HEADROOM = { cli_cold_start_ms: 3, demo_wall_ms: 3, test_wall_ms: 5 };

/** --update-baseline 时各墙钟维度的取值口径：max（最保守）而非 median。 */
const BASELINE_AGGREGATE = 'max';

const MEASUREMENT_SPECS = {
  cli_cold_start_ms: { kind: 'wall_ms', args: ['src/cli/far.ts', '--help'], runs: 3, external: false },
  demo_wall_ms: { kind: 'wall_ms', args: ['src/cli/far.ts', 'demo'], runs: 3, external: false },
  demo_heap_cap: { kind: 'heap_success', args: ['src/cli/far.ts', 'demo'], external: false },
  test_wall_ms: { kind: 'wall_ms', args: null, runs: 1, external: true },
};

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

function parseArgs(argv) {
  let updateBaseline = false;
  let budgetFile = null;
  let fromMeasurements = null;
  let testWallMs = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--update-baseline') {
      updateBaseline = true;
    } else if (a === '--budget-file') {
      budgetFile = argv[i + 1];
      i += 1;
    } else if (a === '--from-measurements') {
      fromMeasurements = argv[i + 1];
      i += 1;
    } else if (a === '--test-wall-ms') {
      testWallMs = argv[i + 1];
      i += 1;
    } else {
      console.error(`perf_budget_check: unknown argument '${a}'`);
      process.exit(2);
    }
  }
  if (testWallMs !== null && !/^\d+$/.test(testWallMs)) {
    console.error(`perf_budget_check: --test-wall-ms expects a non-negative integer, got '${testWallMs}'`);
    process.exit(2);
  }
  return {
    updateBaseline,
    budgetFile: budgetFile !== null ? budgetFile : DEFAULT_BUDGET_FILE,
    fromMeasurements,
    testWallMs: testWallMs !== null ? Number(testWallMs) : null,
  };
}

/**
 * 解析并校验预算文件内容（纯函数）。
 * 校验：JSON 可解析 / schema_version 匹配 / budgets 非空 / 每项 kind 已知且阈值合法。
 * 任何不合格 → throw（CLI 层转为 exit 1 fail-closed）。
 */
export function parseBudget(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`perf_budget_check: budget file is not valid JSON (${err.message})`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('perf_budget_check: budget file must be a JSON object');
  }
  if (parsed.schema_version !== BUDGET_SCHEMA_VERSION) {
    throw new Error(
      `perf_budget_check: budget schema_version ${JSON.stringify(parsed.schema_version)} ` +
        `!= supported ${BUDGET_SCHEMA_VERSION} (regenerate with --update-baseline after reviewing the schema change)`,
    );
  }
  if (typeof parsed.budgets !== 'object' || parsed.budgets === null || Object.keys(parsed.budgets).length === 0) {
    throw new Error('perf_budget_check: budget file has no budgets entries');
  }
  for (const [key, entry] of Object.entries(parsed.budgets)) {
    const spec = MEASUREMENT_SPECS[key];
    if (spec === undefined) {
      throw new Error(`perf_budget_check: unknown budget key '${key}'`);
    }
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`perf_budget_check: budget entry '${key}' must be an object`);
    }
    if (entry.kind !== spec.kind) {
      throw new Error(
        `perf_budget_check: budget entry '${key}' kind '${entry.kind}' != expected '${spec.kind}'`,
      );
    }
    if (spec.kind === 'wall_ms' && (!Number.isFinite(entry.threshold_ms) || entry.threshold_ms <= 0)) {
      throw new Error(`perf_budget_check: budget entry '${key}' needs positive threshold_ms`);
    }
    if (spec.kind === 'heap_success' && (!Number.isFinite(entry.cap_mb) || entry.cap_mb <= 0)) {
      throw new Error(`perf_budget_check: budget entry '${key}' needs positive cap_mb`);
    }
  }
  return parsed;
}

/**
 * 门判定（纯函数）：测量值比对预算 → 违规清单。
 * measurements 形如 { cli_cold_start_ms: 900, demo_heap_cap: { cap_mb: 128, ok: true } }。
 * 只评估出现的键（调用方决定自测/外测覆盖面）；类型不符 → 视为违规（fail-closed，不静默跳过）。
 */
export function evaluateMeasurements(budget, measurements) {
  const violations = [];
  const evaluated = [];
  for (const [key, measured] of Object.entries(measurements)) {
    const entry = budget.budgets[key];
    if (entry === undefined) {
      violations.push({ key, kind: 'invalid', detail: `no budget entry for measured key '${key}'` });
      continue;
    }
    if (entry.kind === 'wall_ms') {
      if (!Number.isFinite(measured) || measured < 0) {
        violations.push({ key, kind: 'wall_ms', threshold: entry.threshold_ms, measured, detail: 'measurement is not a non-negative number' });
        continue;
      }
      evaluated.push(key);
      if (measured > entry.threshold_ms) {
        violations.push({
          key,
          kind: 'wall_ms',
          threshold: entry.threshold_ms,
          measured,
          detail: `measured ${Math.round(measured)}ms > threshold ${entry.threshold_ms}ms (budget exceeded by ${Math.round(measured - entry.threshold_ms)}ms)`,
        });
      }
    } else if (entry.kind === 'heap_success') {
      const capOk = typeof measured === 'object' && measured !== null && measured.cap_mb === entry.cap_mb;
      if (!capOk || measured.ok !== true) {
        violations.push({
          key,
          kind: 'heap_success',
          threshold: entry.cap_mb,
          measured,
          detail:
            `run under --max-old-space-size=${entry.cap_mb} must exit 0 ` +
            `(measured: ${JSON.stringify(measured)})`,
        });
      } else {
        evaluated.push(key);
      }
    } else {
      violations.push({ key, kind: 'invalid', detail: `unknown budget kind '${entry.kind}'` });
    }
  }
  return { evaluated, violations };
}

/** 阈值取整到 step（墙钟 100ms / test_wall 60000ms 量级），向上取整。 */
export function ceilTo(value, step) {
  return Math.ceil(value / step) * step;
}

/** 由实测样本推下一版阈值：max × 倍率 → 向上取整到该维度量级。纯函数。 */
export function nextWallThresholdMs(key, samples) {
  const max = Math.max(...samples);
  const multiplier = WALL_HEADROOM[key] ?? 3;
  const step = key === 'test_wall_ms' ? 60000 : 100;
  return ceilTo(max * multiplier, step);
}

/** 单次 spawn 计时（墙钟 ms + exit code + spawn error）。 */
function spawnTimed(args, extraNodeFlags) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [...extraNodeFlags, ...args], { cwd: repoRoot, encoding: 'utf8' });
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6, status: r.status, error: r.error !== undefined ? String(r.error.message) : null };
}

/**
 * 自测（真实 spawn）。返回 { measurements, samples, errors }：
 *   - 每个自测墙钟维度跑 runs 次：measurements[key]=max(samples)（门比对用），
 *     samples[key]=全部样本（--update-baseline 记录完整证据用）。
 *   - 任一次 exit≠0 或 spawn error → errors 记录（fail-closed：坏命令不得冒充"快"）。
 *   - 堆维度按预算 cap 跑一次；exit≠0 → measurements 里记 ok:false（这是"超预算"而非"门坏了"）。
 * skipExternal=true 时跳过 external 维度（test_wall 由 CI 外测传入）。
 */
export function runSelfMeasurements(budget, { skipExternal = true } = {}) {
  const measurements = {};
  const samples = {};
  const errors = [];
  for (const [key, spec] of Object.entries(MEASUREMENT_SPECS)) {
    if (spec.external && skipExternal) continue;
    const entry = budget.budgets[key];
    if (entry === undefined) continue; // 预算未启用的维度不测（evaluated 覆盖面由预算文件定义）
    if (spec.kind === 'wall_ms') {
      const runs = [];
      for (let i = 0; i < spec.runs; i += 1) {
        const r = spawnTimed(spec.args, []);
        if (r.error !== null || r.status !== 0) {
          errors.push(
            `measurement command for '${key}' failed (exit=${r.status}${r.error !== null ? ` spawn error: ${r.error}` : ''}) — ` +
              `a broken command must not pass as fast`,
          );
          break;
        }
        runs.push(r.ms);
      }
      if (runs.length === spec.runs) {
        samples[key] = runs;
        measurements[key] = Math.max(...runs);
      }
    } else if (spec.kind === 'heap_success') {
      const r = spawnTimed(spec.args, [`--max-old-space-size=${entry.cap_mb}`]);
      measurements[key] = { cap_mb: entry.cap_mb, ok: r.error === null && r.status === 0 };
      if (r.error !== null) {
        errors.push(`measurement command for '${key}' failed to spawn: ${r.error}`);
      }
    }
  }
  return { measurements, samples, errors };
}

/** 从 JSON 文件读外测注入（--from-measurements）。文件缺失/坏 JSON → throw（fail-closed）。 */
export function readMeasurementsFile(path) {
  if (!existsSync(path)) {
    throw new Error(`perf_budget_check: --from-measurements file not found: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`perf_budget_check: --from-measurements file is not valid JSON (${err.message})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--from-measurements file must contain a JSON object of measurements');
  }
  return parsed;
}

/** --update-baseline 的旧→新对照输出（纯函数）。 */
export function formatBaselineDiff(oldBudget, newBudget) {
  const lines = ['perf_budget_check: baseline update (old → new):'];
  for (const key of Object.keys(newBudget.budgets)) {
    const o = oldBudget.budgets[key];
    const n = newBudget.budgets[key];
    if (o === undefined) {
      lines.push(`  + ${key}: (new) → ${describeEntry(n)}`);
      continue;
    }
    lines.push(`  ~ ${key}: ${describeEntry(o)} → ${describeEntry(n)}`);
  }
  for (const key of Object.keys(oldBudget.budgets)) {
    if (newBudget.budgets[key] === undefined) {
      lines.push(`  - ${key}: ${describeEntry(oldBudget.budgets[key])} → (removed)`);
    }
  }
  return lines.join('\n');
}

function describeEntry(entry) {
  if (entry.kind === 'wall_ms') return `threshold ${entry.threshold_ms}ms`;
  if (entry.kind === 'heap_success') return `cap ${entry.cap_mb}MB`;
  return JSON.stringify(entry);
}

/**
 * 由测量值构造新版预算（保留 command/rationale 框架，回写 last_measured 与新阈值）。纯函数。
 * samples：自测的完整样本表 {key: [ms...]}（缺省时回退单值记录）。
 * 无新测量的维度原样保留（显式不静默改）。
 */
export function buildUpdatedBudget(oldBudget, measurements, samples = {}, isoNow) {
  const budgets = {};
  for (const [key, entry] of Object.entries(oldBudget.budgets)) {
    const measured = measurements[key];
    const sampleList = Array.isArray(samples[key]) && samples[key].length > 0
      ? samples[key]
      : Number.isFinite(measured) ? [measured] : [];
    if (entry.kind === 'wall_ms' && sampleList.length > 0) {
      budgets[key] = {
        ...entry,
        threshold_ms: nextWallThresholdMs(key, sampleList),
        last_measured: { aggregate: BASELINE_AGGREGATE, samples_ms: sampleList.map((v) => Math.round(v)), at: isoNow },
      };
    } else if (entry.kind === 'heap_success' && typeof measured === 'object' && measured !== null) {
      budgets[key] = {
        ...entry,
        last_measured: { cap_mb: measured.cap_mb, exit_code: measured.ok === true ? 0 : 1, at: isoNow },
      };
    } else {
      budgets[key] = structuredClone(entry);
    }
  }
  return { ...structuredClone(oldBudget), budgets };
}

// CLI 入口（import.meta.main：被测试 import 时不触发）。
if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));

  // 1. 预算文件 fail-closed：缺失/损坏 → exit 1（绝不静默放行，也绝不自动新建）。
  if (!existsSync(opts.budgetFile)) {
    console.error(`perf_budget_check FAIL: budget file not found: ${opts.budgetFile}`);
    console.error('  (fail-closed: a missing budget means an unmanaged perf surface; create it deliberately,');
    console.error('   e.g. from a reviewed measurement session — do not auto-generate on gate runs)');
    process.exit(1);
  }
  let budget;
  try {
    budget = parseBudget(readFileSync(opts.budgetFile, 'utf8'));
  } catch (err) {
    console.error(`perf_budget_check FAIL: ${err.message}`);
    process.exit(1);
  }

  // 2. 采集测量值：外测注入优先（hermetic / CI test_wall），其余自测真实 spawn。
  let measurements = {};
  let samples = {};
  if (opts.fromMeasurements !== null) {
    try {
      measurements = readMeasurementsFile(opts.fromMeasurements);
    } catch (err) {
      console.error(`perf_budget_check FAIL: ${err.message}`);
      process.exit(1);
    }
  } else {
    const self = runSelfMeasurements(budget);
    if (self.errors.length > 0) {
      for (const e of self.errors) console.error(`perf_budget_check FAIL: ${e}`);
      process.exit(1);
    }
    measurements = self.measurements;
    samples = self.samples;
  }
  if (opts.testWallMs !== null) {
    measurements.test_wall_ms = opts.testWallMs;
  }

  // 3a. --update-baseline：回写新预算并打印旧→新对照（显式重置，输出可审计）。
  if (opts.updateBaseline) {
    const updated = buildUpdatedBudget(budget, measurements, samples, new Date().toISOString());
    writeFileSync(opts.budgetFile, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(formatBaselineDiff(budget, updated));
    console.log(`perf_budget_check: --update-baseline wrote ${opts.budgetFile}`);
    // 基线重置后立即用新阈值复评，防止"更新到一个已经超标的基线"被静默放过。
    const recheck = evaluateMeasurements(updated, measurements);
    if (recheck.violations.length > 0) {
      for (const v of recheck.violations) console.error(`perf_budget_check FAIL (post-update): [${v.key}] ${v.detail}`);
      process.exit(1);
    }
    console.log('perf_budget_check: baseline updated and re-verified (measurements within new thresholds)');
    process.exit(0);
  }

  // 3b. 门禁：超阈值 → exit 1 并附实测值。
  const { evaluated, violations } = evaluateMeasurements(budget, measurements);
  if (evaluated.length > 0) {
    console.log(`perf_budget_check: evaluated ${evaluated.length} dimension(s): ${evaluated.join(', ')}`);
  }
  if (violations.length > 0) {
    console.error(`perf_budget_check: FAIL — ${violations.length} budget violation(s):`);
    for (const v of violations) console.error(`  [${v.key}] ${v.detail}`);
    process.exit(1);
  }
  if (evaluated.length === 0) {
    // 测量面为空（如预算里只有 external 维度而调用方没传外测值）→ fail-closed，不放行空门。
    console.error('perf_budget_check FAIL: no dimensions were measured (empty gate is not a gate)');
    process.exit(1);
  }
  console.log('perf_budget_check: PASS (all measured dimensions within budget)');
  process.exit(0);
}
