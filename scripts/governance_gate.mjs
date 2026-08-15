/**
 * governance_gate.mjs — GATE_H 生产治理机检（第一轮硬化）。
 *
 * 采集 8 项开发期 SLI（.far-master/OPERATIONS_GOVERNANCE.md 定义），追加记录到
 * .far-master/GOVERNANCE_RUNS.jsonl（append-only·jsonl）。红线 SLO 违反 → exit 1（阻断）。
 *
 * SLI 数据源（全部真实可测）：
 *   - typecheck / lint / test / coverage / fitness / design_lint / 扫描器：直接跑脚本取 exit code
 *   - hero 性能：读 .far-implementation/vertical-slice/perf_*.log 或标记 UNKNOWN（不虚构）
 *
 * 诚实边界：不虚构生产监控数据；部署后第 4 节 SLI 须重定义数据源（外部门禁）。
 * 零容忍合规：无 any / @ts-ignore / 空 catch。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUNS_PATH = join(ROOT, '.far-master', 'GOVERNANCE_RUNS.jsonl');

function run(cmd, args, timeoutMs = 300000, useShell = false) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'ignore', timeout: timeoutMs, ...(useShell ? { shell: true } : {}) });
    return { exit: 0 };
  } catch (error) {
    const e = error;
    return { exit: typeof e.status === 'number' ? e.status : 1 };
  }
}

/**
 * Like run(), but on failure the child's captured stdout/stderr is printed —
 * a swallowed diagnostic is worse than a red gate (2026-08-15: CI reported
 * `coverage=false` with zero output because stdio was 'ignore').
 */
function runLogged(cmd, args, timeoutMs = 300000) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
    return { exit: 0 };
  } catch (error) {
    const e = error;
    if (e.stdout !== undefined && String(e.stdout).length > 0) process.stdout.write(String(e.stdout));
    if (e.stderr !== undefined && String(e.stderr).length > 0) process.stderr.write(String(e.stderr));
    return { exit: typeof e.status === 'number' ? e.status : 1 };
  }
}

const RED_LINE = new Set(['typecheck', 'lint', 'test', 'coverage', 'fitness', 'design_lint', 'zero_tolerance', 'anti_theater', 'adr_landing']);

/** Windows 上 pnpm 是 .cmd shim，execFileSync 需显式 .cmd（项目陷阱文档正解）。 */
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function measureSli() {
  const results = {};
  results.typecheck = run('node', ['node_modules/typescript/bin/tsc', '--noEmit']).exit === 0;
  results.lint = run('node', ['node_modules/eslint/bin/eslint.js', 'src', '--max-warnings', '0']).exit === 0;
  // --skip-test：CI 的 blocking_gates job 已由上游跑全量 test，此处跳过避免重复（节省 ~20s）；
  // 本地完整跑仍执行（600s 超时）。
  results.test = argv.includes('--skip-test')
    ? true
    : run(PNPM, ['test'], 600000, true).exit === 0;
  results.coverage = runLogged('node', ['scripts/coverage_gate.mjs']).exit === 0;
  results.fitness = run('node', ['scripts/fitness_functions.mjs']).exit === 0;
  results.design_lint = run('node', ['scripts/design_lint.mjs']).exit === 0;
  results.zero_tolerance = run('node', ['scripts/zero_tolerance_scan.mjs']).exit === 0;
  results.anti_theater = run('node', ['scripts/anti_theater_deterministic_scan.mjs']).exit === 0;

  // ADR 落地率（阶段 7 1125 · P2-C）：21 个 ADR 的 decision 锚点机器核对——
  // 任何 ADR 决策无代码机制 = 治理红线违规（RED_LINE 含 adr_landing）。
  results.adr_landing = run('node', ['scripts/adr_landing_check.mjs']).exit === 0;

  // hero 性能（阶段 7 P2-A · B4-G6 接线）：真实 seal 基准实测——不再依赖日志文件存在性
  // （旧实现恒 UNKNOWN 当日志缺失·观测面死锁）。实测路径 = performance_benchmark.test.ts
  // 三个门槛（seal<200ms / hash>1000 ops/s / GV cross-lang<30s）→ exit 0 即「实测达标」。
  // 诚实边界：这是离线本机实测（非生产监控）——部署后第 4 节 SLI 仍须重定义数据源。
  results.hero_perf =
    run(
      'node',
      ['--test', '--test-timeout=180000', 'tests/comparison/performance_benchmark.test.ts'],
      240000,
      true,
    ).exit === 0;

  // 可观测告警（阶段 7 1124 · P2-B 首步）：/metrics 阈值检查（degraded_scope 占比 /
  // degradation 增长率 / 端点可达）。非 RED_LINE：无 API 运行时端点不可达是本地
  // 常态（fail-open 检测、fail-closed 报告）——部署态须重定义数据源与告警通道。
  results.metrics_alert = run('node', ['scripts/metrics_alert.mjs']).exit === 0;

  return results;
}

const sli = measureSli();
const violated = Object.entries(sli).filter(([, ok]) => ok === false).map(([k]) => k);
const redViolations = violated.filter((k) => RED_LINE.has(k));

const record = {
  run_id: `gov-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  timestamp: new Date().toISOString(),
  generator: 'scripts/governance_gate.mjs',
  schema_version: 1,
  sli,
  violated,
  red_line_violations: redViolations,
  pass: redViolations.length === 0,
};

mkdirSync(dirname(RUNS_PATH), { recursive: true });
appendFileSync(RUNS_PATH, `${JSON.stringify(record)}\n`, 'utf8');

console.log(`governance: ${redViolations.length === 0 ? 'PASS' : 'FAIL'} (${Object.keys(sli).length} SLI, ${violated.length} violated, red-line ${redViolations.join(',') || 'none'})`);
console.log(`  SLI: ${Object.entries(sli).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`  record: ${RUNS_PATH}`);

// 红线违反 → exit 1（阻断提交）；仅非红线违反 → exit 0 + 记录（错误预算扣减由人工裁定）
process.exit(redViolations.length > 0 ? 1 : 0);
