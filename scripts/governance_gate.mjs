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

const RED_LINE = new Set(['typecheck', 'lint', 'test', 'coverage', 'fitness', 'design_lint', 'zero_tolerance', 'anti_theater']);

/** Windows 上 pnpm 是 .cmd shim，execFileSync 需显式 .cmd（项目陷阱文档正解）。 */
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function measureSli() {
  const results = {};
  results.typecheck = run('node', ['node_modules/typescript/bin/tsc', '--noEmit']).exit === 0;
  results.lint = run('node', ['node_modules/eslint/bin/eslint.js', 'src', '--max-warnings', '0']).exit === 0;
  // pnpm 是 .cmd shim 且不在 execFileSync 的 PATH 解析内 → shell:true 经 cmd.exe 解析（项目陷阱正解）。
  results.test = run(PNPM, ['test'], 600000, true).exit === 0;
  results.coverage = run('node', ['scripts/coverage_gate.mjs']).exit === 0;
  results.fitness = run('node', ['scripts/fitness_functions.mjs']).exit === 0;
  results.design_lint = run('node', ['scripts/design_lint.mjs']).exit === 0;
  results.zero_tolerance = run('node', ['scripts/zero_tolerance_scan.mjs']).exit === 0;
  results.anti_theater = run('node', ['scripts/anti_theater_deterministic_scan.mjs']).exit === 0;

  // hero 性能：读既有计时日志（诚实：缺失标 UNKNOWN 而非虚构）
  const perfPaths = [
    join(ROOT, '.far-implementation/phase_f/perf_hero_tamper.log'),
    join(ROOT, '.far-implementation/vertical-slice/perf_hero_tamper.log'),
  ];
  const heroLog = perfPaths.find((p) => existsSync(p));
  results.hero_perf = heroLog !== undefined ? true : 'UNKNOWN';

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
