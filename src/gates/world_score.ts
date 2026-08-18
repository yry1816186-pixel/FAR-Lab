/**
 * world_score — WORLD-SCORE-001 世界级目标的高信号维度评分。
 *
 * 设计立场（宪法原文语义）：少量高信号维度 + 每维度显式声明度量来源与
 * 局限；**不合成单一虚荣分**——聚合视图仅作为导航用 overview 显式标注
 * 「非目标本身」。
 *
 * 五个维度（全部从真实可算来源读取）：
 *   1. tests-scale-green  —— tests 目录 *.test.{ts,mjs} 文件数 + CI blocking
 *      gates 在场。来源：文件系统真实扫描。局限：规模与 CI 在场 ≠ 实跑
 *      全绿（全绿证据在 CI 运行记录，不在此函数）。
 *   2. gate-pass-rate     —— 编译产物 .far/requirements/GATES.yaml 的 T0
 *      byStatus（requirements:compile 生成）。来源：GATES.yaml 真实解析。
 *      局限：状态是登记面（status_input.json 派生），不替代逐门实跑；
 *      产物缺失 → null（不可测如实上报，不冒充 0 分或满分）。
 *   3. benchmark-coverage —— demo_seeds BENCHMARK_SEEDS 真实 import 计数
 *      （当前固化事实 30 problems / 28 domains）。局限：问题数是广度代理，
 *      不度量每个 problem 的判定深度。
 *   4. red-team-counter-cases —— tests/ 中含反例/对抗/篡改标记的测试文件数。
 *      局限：词面匹配是粗代理（命中文件未必真有强反例；漏词的真反例测不到）。
 *   5. honesty-boundaries —— src 树 *.ts 含 Cannot-prove 声明的文件数。
 *      局限：声明存在 ≠ 边界正确（内容质量是审查面）。
 *
 * 评分刻度：每维度 score = min(1, measured / target)，target 是登记基线
 * （当前真实值——写死在这里显式可审计；任何回退立刻显形为 <1）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 本评分不证明「世界级」达成——它只测量五个可机器算的代理维度；
 *     scientific utility / UX clarity 等需要人类判断的维度被显式排除在外，
 *     不装作可算；
 *   - gate-pass-rate 依赖登记状态与编译产物的新鲜度（GOV-EXTERNAL-001：
 *     过期产物给出的是过期事实）；
 *   - 聚合视图是维度的算术平均，无权重科学性可言——它只是导航 overview。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BENCHMARK_SEEDS } from '../demo_seeds/registry.ts';

/** 登记基线（真实实测 @2026-08-18 feat/t1-gov-core worktree）。 */
export const SCORE_BASELINES = {
  testFiles: 462,
  benchmarkSeeds: 30,
  redTeamTestFiles: 92,
  cannotProveFiles: 59,
} as const;

export interface DimensionScore {
  readonly dimension: string;
  /** [0,1]；null = 本环境不可测（如实上报，不冒充任何分数）。 */
  readonly score: number | null;
  readonly measured: string;
  readonly source: string;
  readonly limitation: string;
}

export interface WorldScoreReport {
  readonly dimensions: readonly DimensionScore[];
  /** 分数 <1 或 null 的维度（弱项清单——改进方向的 SSOT）。 */
  readonly weakDimensions: readonly DimensionScore[];
  /** 导航用聚合视图。**非目标本身**——显式标注，禁止对外当成绩引用。 */
  readonly aggregateView: { readonly value: number | null; readonly note: string };
}

function walk(dir: string, pred: (name: string) => boolean, out: string[], skip: readonly string[] = []): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (skip.includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, pred, out, skip);
    else if (pred(name)) out.push(full);
  }
}

const isTestFile = (n: string) => n.endsWith('.test.ts') || n.endsWith('.test.mjs');
const isTsFile = (n: string) => n.endsWith('.ts');

/** 维度 1：测试规模 + CI 门在场。 */
function dimensionTests(repoRoot: string): DimensionScore {
  const files: string[] = [];
  walk(join(repoRoot, 'tests'), isTestFile, files);
  const ciPath = join(repoRoot, '.github/workflows/ci.yml');
  const ciWired = existsSync(ciPath) && readFileSync(ciPath, 'utf8').includes('blocking_gates');
  const target = SCORE_BASELINES.testFiles;
  const raw = files.length / target;
  const score = ciWired ? Math.min(1, raw) : null;
  return {
    dimension: 'tests-scale-green',
    score,
    measured: `${files.length} test files; CI blocking_gates ${ciWired ? 'wired' : 'ABSENT'}`,
    source: '真实文件系统扫描 tests/**/*.test.{ts,mjs} + .github/workflows/ci.yml 标记检查',
    limitation: '规模与 CI 在场 ≠ 实跑全绿（全绿证据在 CI 运行记录；CI 缺席 → 不可测 null）',
  };
}

/** 维度 2：GATES.yaml T0 通过率（编译产物解析；缺失 → null）。 */
export function parseGatesYamlT0(text: string): { total: number; pass: number } | null {
  const totalM = /^t0:\s*\n(?:.*\n)*?\s*total:\s*(\d+)/m.exec(text);
  if (totalM?.[1] === undefined) return null;
  const total = Number.parseInt(totalM[1], 10);
  const section = text.slice(text.indexOf('t0:'), text.indexOf('t1:') === -1 ? undefined : text.indexOf('t1:'));
  const passM = /^\s+PASS:\s*(\d+)/m.exec(section);
  if (passM?.[1] === undefined) return null;
  return { total, pass: Number.parseInt(passM[1], 10) };
}

function dimensionGates(repoRoot: string, gatesYamlPath?: string): DimensionScore {
  const path = gatesYamlPath ?? join(repoRoot, '.far/requirements/GATES.yaml');
  if (!existsSync(path)) {
    return {
      dimension: 'gate-pass-rate',
      score: null,
      measured: 'compiled GATES.yaml not found',
      source: '.far/requirements/GATES.yaml（pnpm run requirements:compile 生成）',
      limitation: '产物缺失 = 当前环境不可测——如实 null，不冒充分数',
    };
  }
  const parsed = parseGatesYamlT0(readFileSync(path, 'utf8'));
  if (parsed === null || parsed.total === 0) {
    return {
      dimension: 'gate-pass-rate',
      score: null,
      measured: 'GATES.yaml present but T0 section unparseable',
      source: '.far/requirements/GATES.yaml',
      limitation: '解析失败 = 不可测',
    };
  }
  const rate = parsed.pass / parsed.total;
  return {
    dimension: 'gate-pass-rate',
    score: Math.min(1, rate),
    measured: `T0 ${parsed.pass}/${parsed.total} registered PASS`,
    source: '.far/requirements/GATES.yaml byStatus（requirements:compile 确定性生成）',
    limitation: '登记状态（status_input.json 派生）≠ 逐门实跑；产物新鲜度由 compile --check 保证',
  };
}

/** 维度 3：benchmark 资产真实 import 计数。 */
function dimensionBenchmark(): DimensionScore {
  const n = BENCHMARK_SEEDS.length;
  return {
    dimension: 'benchmark-coverage',
    score: Math.min(1, n / SCORE_BASELINES.benchmarkSeeds),
    measured: `${n} benchmark seed problems (D2 固化事实 30/28 domains)`,
    source: 'src/demo_seeds/registry.ts BENCHMARK_SEEDS 真实 import',
    limitation: '问题数是广度代理，不度量每个 problem 的判定深度与领域真实性',
  };
}

const RED_TEAM_RE = /counter-case|反例|adversarial|red.?team|tamper/i;

/** 维度 4：红队反例存在性（tests 词面标记）。 */
function dimensionRedTeam(repoRoot: string): DimensionScore {
  const files: string[] = [];
  walk(join(repoRoot, 'tests'), isTestFile, files);
  const hits = files.filter((f) => RED_TEAM_RE.test(readFileSync(f, 'utf8'))).length;
  return {
    dimension: 'red-team-counter-cases',
    score: Math.min(1, hits / SCORE_BASELINES.redTeamTestFiles),
    measured: `${hits} test files carry counter-case/adversarial/tamper markers`,
    source: 'tests/**/*.test.{ts,mjs} 内容词面扫描（counter-case|反例|adversarial|red-team|tamper）',
    limitation: '词面匹配是粗代理：命中 ≠ 强反例；用别的词写的真反例测不到',
  };
}

/** 维度 5：诚实边界覆盖（src Cannot-prove 声明文件数）。 */
function dimensionHonesty(repoRoot: string): DimensionScore {
  const files: string[] = [];
  walk(join(repoRoot, 'src'), isTsFile, files, ['node_modules']);
  const hits = files.filter((f) => readFileSync(f, 'utf8').includes('Cannot-prove')).length;
  return {
    dimension: 'honesty-boundaries',
    score: Math.min(1, hits / SCORE_BASELINES.cannotProveFiles),
    measured: `${hits} src files declare Cannot-prove boundaries`,
    source: 'src/**/*.ts 内容扫描（Cannot-prove 标记）',
    limitation: '声明存在 ≠ 边界正确（内容质量是 trust-reviewer 审查面）',
  };
}

export interface WorldScoreOptions {
  readonly repoRoot: string;
  /** GATES.yaml 覆盖路径（测试注入 fixture；缺省 .far/requirements/GATES.yaml）。 */
  readonly gatesYamlPath?: string | undefined;
}

/** 计算世界级维度评分（全部真实来源；不合成虚荣分）。 */
export function computeWorldScore(options: WorldScoreOptions): WorldScoreReport {
  const dimensions = [
    dimensionTests(options.repoRoot),
    dimensionGates(options.repoRoot, options.gatesYamlPath),
    dimensionBenchmark(),
    dimensionRedTeam(options.repoRoot),
    dimensionHonesty(options.repoRoot),
  ];
  const weakDimensions = dimensions.filter((d) => d.score === null || d.score < 1);
  const measurable = dimensions.filter((d): d is DimensionScore & { score: number } => d.score !== null);
  const aggregate = measurable.length === 0 ? null : measurable.reduce((s, d) => s + d.score, 0) / measurable.length;
  return {
    dimensions,
    weakDimensions,
    aggregateView: {
      value: aggregate,
      note: 'NAVIGATION OVERVIEW ONLY — arithmetic mean of machine-measurable proxies; NOT the goal itself and NOT a world-classness certificate. Excluded human-judgment dimensions: scientific utility, UX clarity, adoption.',
    },
  };
}
