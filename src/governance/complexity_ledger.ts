/**
 * complexity_ledger — CORE-COMPLEXITY-001 复杂度必须付租金（预算登记表）。
 *
 * 与既有机制的关系（不重复造轮子）：
 *   - scripts/complexity_budget_check.mjs 是 CI 拦截面（圈复杂度 ≤15 函数 /
 *     新文件 ≤800 行 / 存量债务基线化 scripts/complexity_budget_baseline.json），
 *     已在 .github/workflows/ci.yml blocking——本模块是它的**可 import 治理面**：
 *     (1) 每模块预算显式登记（MODULE_COMPLEXITY_BUDGETS：预算文件数 × 每文件
 *         行数上限的显式登记表，当前值来自真实扫描）；
 *     (2) 超预算 fail——新文件无 grandfather 豁免；存量超限文件必须携带
 *         显式豁免（引用 baseline 条目 + 复审期限），豁免过期 = fail；
 *     (3) 扫描算法与脚本的行计数口径一致（split('\n').length）。
 *
 * 确定性：真实文件系统扫描 + 显式 today 注入（豁免期限判定），同输入同输出。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 行数预算是复杂度的粗代理——它不度量概念耦合/扇出/循环复杂度
 *     （那是脚本圈复杂度面的职责，两边互补不互代）；
 *   - 豁免引用 baseline 只证明「债务被登记」，不证明清偿计划被执行；
 *   - 预算数字本身是工程判断（写在这里显式可审计），不是数学推导。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 单文件行数上限（与 scripts/complexity_budget_check.mjs 的 MAX_FILE_LINES 一致）。 */
export const MAX_LINES_PER_FILE = 800;

export interface ModuleBudget {
  /** src/ 下的模块目录名（如 'governance'、'campaign'）。 */
  readonly module: string;
  /** 该模块当前登记的预算文件数（超过 = 需要扩预算登记=新决策）。 */
  readonly budgetFiles: number;
}

/**
 * 模块复杂度预算登记表（真实扫描 @2026-08-18 登记·feat/t1-gov-core 批后）：
 * budgetFiles = 登记时真实 .ts 文件数。任何新增文件超预算 = 未付租金的复杂度
 * → checkComplexityLedger fail——扩预算必须在 git diff 里显式可见并带理由。
 */
export const MODULE_COMPLEXITY_BUDGETS: readonly ModuleBudget[] = [
{ module: 'agent_loop', budgetFiles: 26 },
  { module: 'anti_theater', budgetFiles: 35 },
  { module: 'api', budgetFiles: 36 },  // 依据: Open-World R1 复杂度租金——static_web.ts 单进程产品形态(API 直托 frontend/dist);2026-08-19 +routes/monitor.ts(v3.0 指令 Phase 3.3 监控端点挂既有实例),真实文件数对账,非阈值放松
  { module: 'architecture', budgetFiles: 1 },
  { module: 'audit', budgetFiles: 1 },
  { module: 'benchmark', budgetFiles: 4 },
  { module: 'campaign', budgetFiles: 13 },
  { module: 'cas', budgetFiles: 2 },
  { module: 'cli', budgetFiles: 57 },  // 依据: 2026-08-19 +commands/plugin.ts(far plugin verify·插件 conformance CLI 出口);对账为真实文件数
  { module: 'confounding_gate', budgetFiles: 7 },
  { module: 'data_governance', budgetFiles: 2 },
  { module: 'db', budgetFiles: 4 },
  { module: 'delegation', budgetFiles: 1 },
  { module: 'demo_seeds', budgetFiles: 32 },
  { module: 'discovery', budgetFiles: 24 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'evaluation', budgetFiles: 8 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'evidence', budgetFiles: 2 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'evidence_log', budgetFiles: 10 },
  { module: 'evidence_quality', budgetFiles: 5 },
  { module: 'falsifiability', budgetFiles: 20 },  // 依据: 2026-08-19 be968c7 +verdict_semantics.ts(三正交语义轴单一契约 far.verdict-semantics.v1),对账为真实文件数,非阈值放松
  { module: 'far_proof', budgetFiles: 9 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'fec', budgetFiles: 6 },
  { module: 'gates', budgetFiles: 7 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'governance', budgetFiles: 9 },
  { module: 'hardware', budgetFiles: 1 },
  { module: 'llm_gateway', budgetFiles: 29 },
  { module: 'math', budgetFiles: 16 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'monitor', budgetFiles: 5 },  // 依据: 2026-08-19 v3.0 指令 Phase 3.3——collect+alerts+run_command+sampler+persist(JSONL 落盘·架构 §2 最后一环·单文件轮转零依赖);监控唯一净新增运行时,对账为真实文件数
  { module: 'planning', budgetFiles: 9 },
  { module: 'platform', budgetFiles: 7 },  // 依据: 2026-08-19 复杂度租金——dotenv.ts(CLI 入口 .env 水合)+design_tokens.ts(v3.0 指令 Phase 2·设计 Token SSOT·三范式语义色单一事实源·Web CSS 双源漂移有契约测试锁定);对账为真实文件数,非阈值放松
  { module: 'plugins', budgetFiles: 6 },  // 依据: 2026-08-19 OSS-PLUGIN-001/SDK-001——manifest.ts(zod SSOT)+sandbox.ts(子进程隔离宿主侧)+runner.ts(子进程内侧·vm 确定性消毒)+registry.ts(哈希锚定注册)+conformance.ts(五类 Acceptance 探针)+sdk.ts(第三方构建入口);消费者=tests/plugins 5 文件,非无主注册表;对账为真实文件数
  { module: 'proof_envelope', budgetFiles: 13 },  // 依据: R3 复杂度租金——ask_envelope.ts(V2 信封生产构建器·D-2026-08-19-01 终结)入 v2/ 子域;对账为真实文件数,非阈值放松
  { module: 'release', budgetFiles: 5 },
  { module: 'report', budgetFiles: 8 },
  { module: 'research', budgetFiles: 39 },
  { module: 'retrieval', budgetFiles: 17 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'safety', budgetFiles: 1 },
  { module: 'schema', budgetFiles: 3 },
  { module: 'science', budgetFiles: 3 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'science_harness', budgetFiles: 22 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'security', budgetFiles: 6 },
  { module: 'statistics', budgetFiles: 11 },  // 依据: PR#101 复杂度租金支付——对账为当前真实文件数(checkComplexityLedger 实测),非阈值放松
  { module: 'trace', budgetFiles: 3 },
  { module: 'v2_domain', budgetFiles: 7 },
  { module: 'validation', budgetFiles: 1 },
  // vendor：第三方库逐字节副本（canonicalize@4.0.0, Apache-2.0）——文件数冻结即冻结，
  // 任何新增 = 供应链决策，必须走 borrow_registry + license_audit，不走复杂度豁免。
  { module: 'vendor', budgetFiles: 2 },
];

export interface FileOverage {
  readonly path: string;
  readonly lines: number;
  readonly exemption?: {
    readonly baselineEntry: string;
    readonly reviewBy: string; // ISO date
    readonly reason: string;
  };
}

export interface ComplexityLedgerCheck {
  readonly ok: boolean;
  /** 超行数上限的文件（豁免生效的不计入 fail，但列出供审计）。 */
  readonly overLineBudget: readonly FileOverage[];
  /** 超登记文件数预算的模块。 */
  readonly overFileBudget: readonly { module: string; budgetFiles: number; actualFiles: number }[];
  /** 豁免缺陷（引用不存在 / 已过期 / 无期限）。 */
  readonly brokenExemptions: readonly { path: string; problem: string }[];
  /** 未登记进 MODULE_COMPLEXITY_BUDGETS 的 src/ 一级模块（新模块必须有预算登记）。 */
  readonly unbudgetedModules: readonly string[];
  /** 各模块实测（module → 文件数）。 */
  readonly scan: Readonly<Record<string, number>>;
}

/** 递归收集目录下 .ts 文件（确定性：readdirSync 排序）。 */
function collectTsFiles(dir: string, out: string[], repoRoot: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectTsFiles(full, out, repoRoot);
    else if (name.endsWith('.ts')) out.push(full.replace(/\\/g, '/').replace(`${repoRoot.replace(/\\/g, '/')}/`, ''));
  }
}

export interface LedgerOptions {
  readonly repoRoot: string;
  /** 显式注入「今天」（豁免期限判定）；缺省真实时刻。 */
  readonly today?: () => Date;
  /** 显式豁免表（缺省空：新超限一律 fail）。 */
  readonly exemptions?: Readonly<Record<string, { baselineEntry: string; reviewBy: string; reason: string }>>;
  /** baseline 条目集合（校验豁免引用真实存在）；缺省不校验引用。 */
  readonly baselineEntries?: readonly string[];
}

/**
 * 复杂度预算登记检查：
 *   1. 扫 src/ 一级模块的 .ts 文件数与每文件行数；
 *   2. 文件 > MAX_LINES_PER_FILE：无豁免 → fail；有豁免但 baseline 引用不
 *      存在 / reviewBy 已过（含无期限解析失败）→ brokenExemption → fail；
 *   3. 模块文件数 > budgetFiles → overFileBudget → fail（新文件必须扩预算）；
 *   4. src/ 出现未登记模块 → unbudgetedModules → fail（新模块必须先登记预算）。
 */
export function checkComplexityLedger(options: LedgerOptions): ComplexityLedgerCheck {
  const today = options.today ?? (() => new Date());
  const exemptions = options.exemptions ?? {};
  const srcDir = join(options.repoRoot, 'src');
  const moduleDirs = existsSync(srcDir) ? readdirSync(srcDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];

  const scan: Record<string, number> = {};
  const files: string[] = [];
  for (const mod of moduleDirs) {
    const modFiles: string[] = [];
    collectTsFiles(join(srcDir, mod), modFiles, options.repoRoot);
    scan[mod] = modFiles.length;
    files.push(...modFiles);
  }

  const overLineBudget: FileOverage[] = [];
  const brokenExemptions: { path: string; problem: string }[] = [];
  for (const rel of files) {
    const lines = readFileSync(join(options.repoRoot, rel), 'utf8').split('\n').length;
    if (lines <= MAX_LINES_PER_FILE) continue;
    const ex = exemptions[rel];
    if (ex === undefined) {
      overLineBudget.push({ path: rel, lines });
      continue;
    }
    if (options.baselineEntries !== undefined && !options.baselineEntries.includes(ex.baselineEntry)) {
      brokenExemptions.push({ path: rel, problem: `exemption cites baseline entry "${ex.baselineEntry}" which does not exist` });
    }
    const reviewBy = Date.parse(ex.reviewBy);
    if (Number.isNaN(reviewBy)) {
      brokenExemptions.push({ path: rel, problem: `exemption reviewBy is not a valid date: ${ex.reviewBy}` });
    } else if (reviewBy < today().getTime()) {
      brokenExemptions.push({ path: rel, problem: `exemption expired on ${ex.reviewBy} (review deadline passed — repay or re-register)` });
    }
    overLineBudget.push({ path: rel, lines, exemption: ex });
  }

  const budgets = new Map(MODULE_COMPLEXITY_BUDGETS.map((b) => [b.module, b.budgetFiles]));
  const overFileBudget = [...budgets]
    .map(([module, budgetFiles]) => ({ module, budgetFiles, actualFiles: scan[module] ?? 0 }))
    .filter((x) => x.actualFiles > x.budgetFiles)
    .sort((a, b) => (a.module < b.module ? -1 : 1));
  const unbudgetedModules = moduleDirs.filter((m) => !budgets.has(m));

  const unexempted = overLineBudget.filter((f) => f.exemption === undefined);
  return {
    ok: unexempted.length === 0 && overFileBudget.length === 0 && brokenExemptions.length === 0 && unbudgetedModules.length === 0,
    overLineBudget,
    overFileBudget,
    brokenExemptions,
    unbudgetedModules,
    scan,
  };
}
