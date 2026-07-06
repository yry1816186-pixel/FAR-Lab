/**
 * benchmark 聚合器 —— 跑全部 Science-125 demo seed，聚合为 BenchmarkReport。
 *
 * 职责（纯函数·无副作用·可复现）：
 *   1. 串行跑每个 seed（:memory: db·互不污染）；
 *   2. 对每个 seed 的 db 算 computeChainMerkleRoot → 整链 Merkle 根（integrityRoot）；
 *   3. 收集 verdict / reproHash / chainVerify / 阶段数等真实指标；
 *   4. 把所有 integrityRoot 作为叶再 Merkle 折叠一次 → suiteIntegrityRoot（套件级指纹）；
 *   5. 统计 verdict 分布 + 领域分布。
 *
 * 分层（src 不依赖 tests）：
 *   本模块**不 import tests/demo_seeds**——而是接受 SeedRunner[] 参数（依赖反转）。
 *   seed registry（带 DemoSeedResult 的具体 run 函数）留在 tests/demo_seeds/registry.ts，
 *   由 generate 脚本 + 测试组装后传入。DemoSeedResult 结构兼容 BenchmarkSeedInput（结构子集）。
 *
 * 确定性（可作 CI golden 锚）：
 *   seed 全程 offline_replay + 确定性常量（gitCommitSha/isoTimestamp/reproHashProvider），
 *   故 integrityRoot / suiteIntegrityRoot 跨 fresh-clone 字节相同（测试断言）。
 *   generatedAt / gitCommitSha 由 opts 注入（非 suiteIntegrityRoot 输入）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。db.close 在 finally。
 */

import type { Database } from 'better-sqlite3';

import { computeChainMerkleRoot, computeMerkleRoot } from '../evidence_log/merkle_root.ts';
import { VERDICTS, type Verdict } from '../schema/enums.ts';
import type {
  BenchmarkEntry,
  BenchmarkReport,
  DomainDistribution,
  VerdictDistribution,
} from './types.ts';

// ---------- 聚合器所需的最小 seed 输入契约（duck-typed·DemoSeedResult 结构兼容）----------

/**
 * 聚合器从单个 seed 结果中需要的字段子集。
 *
 * 故意定义为本模块自有接口（而非 import DemoSeedResult）——避免 src 依赖 tests/。
 * DemoSeedResult 含全部这些字段（结构超集），TS 结构类型允许其传入。
 */
export interface BenchmarkSeedInput {
  /** 六阶段循环终态（聚合器读 terminationReason + artifacts.length）。 */
  readonly loopState: {
    readonly terminationReason: string;
    readonly artifacts: readonly unknown[];
  };
  /** FEC 编排层产出的裁决节点（聚合器读 verdict）。 */
  readonly verdictNode: {
    readonly verdict: Verdict;
  };
  /** 链头复现哈希（64-hex）。 */
  readonly reproHash: string;
  /** 链式验证结果（聚合器读 ok）。 */
  readonly chainVerify: {
    readonly ok: boolean;
  };
  /** 证据源卡片（聚合器读 sourceId）。 */
  readonly sourceCard: {
    readonly sourceId: string;
  };
  /** 数据库实例（聚合器算 computeChainMerkleRoot 后负责 close）。 */
  readonly db: Database;
}

/**
 * seed registry 条目：元数据 + run 函数。
 *
 * run 返回 BenchmarkSeedInput（DemoSeedResult 结构兼容）。聚合器负责 result.db.close()。
 */
export interface SeedRunner {
  /** 问题标识（A4 / A16 / E2 ...）。 */
  readonly problemId: string;
  /** 问题标题（中文）。 */
  readonly problemTitle: string;
  /** 科学领域。 */
  readonly domain: string;
  /** Science-125 问题标签（kebab-case）。 */
  readonly science125Tag: string;
  /** 跑该 seed（完整 6-stage agent loop + FEC 编排·返回含 db 的结果）。 */
  readonly run: () => Promise<BenchmarkSeedInput>;
}

/** 默认时间戳生成器（真实 ISO·generate/测试注入确定值以可复现 diff）。 */
function defaultNow(): string {
  return new Date().toISOString();
}

/** 统计 verdict 分布（全 5 键恒在·未出现的 verdict 计 0）。 */
function tallyVerdicts(entries: readonly BenchmarkEntry[]): VerdictDistribution {
  const dist = {} as Record<Verdict, number>;
  for (const v of VERDICTS) {
    dist[v] = 0;
  }
  for (const entry of entries) {
    dist[entry.verdict] += 1;
  }
  return dist;
}

/** 统计领域分布（按 domain 字符串分组）。 */
function tallyDomains(entries: readonly BenchmarkEntry[]): DomainDistribution {
  const dist: Record<string, number> = {};
  for (const entry of entries) {
    const prev = dist[entry.domain] ?? 0;
    dist[entry.domain] = prev + 1;
  }
  return dist;
}

/** 诚实声明（与 HonestyWall 同源精神·如实标注已知边界）。 */
const HONESTY_NOTES: readonly string[] = [
  'verdict 由 offline fixture 产出（无真实 LLM 调用·非真实科学裁决）；本榜展示的是证据链的工程完整性广度，非科学结论排名。',
  'suiteIntegrityRoot 由各 problem 的 integrityRoot 再 Merkle 折叠而成，证明跨问题可聚合审计；它不证明科学正确性。',
  '各 problem 的 evidence/hypothesis fixture 是领域特定演示数据；真实科研需接通真实 provider（competition adapter 已就绪·core 模型中立）。',
  '本报告确定性可复现：fresh-clone 跑 generate 脚本得相同 suiteIntegrityRoot（CI golden 锚定）。',
  'reproHash（链头 currentHash）含 ulid verdictId，是 run 实例标识——每次重新生成报告会不同；CI golden 仅锚 suiteIntegrityRoot（由不含 ulid 的 call_records 折叠·确定可复现）。',
];

/**
 * 跑全部 seed 并聚合为 BenchmarkReport（纯函数·确定性）。
 *
 * @param seeds seed registry（元数据 + run 函数）。
 * @param opts.now 时间戳生成器（默认真实 ISO·generate 注入确定值）。
 * @param opts.gitCommitSha 报告锁定的 commit（默认 null·generate 注入 fresh-clone 锚）。
 * @returns BenchmarkReport（entries 按 problemId 升序·suiteIntegrityRoot 确定性）
 *
 * db 生命周期：每个 seed 的 result.db 在收集完指标后于 finally 块 close（防泄漏）。
 */
export async function runBenchmark(
  seeds: readonly SeedRunner[],
  opts: { readonly now?: () => string; readonly gitCommitSha?: string | null } = {},
): Promise<BenchmarkReport> {
  const entries: BenchmarkEntry[] = [];

  for (const seed of seeds) {
    // seed 须串行（各自 :memory: db·避免并发干扰·确定性顺序）
    const result = await seed.run();
    try {
      const { root, leafCount } = computeChainMerkleRoot(result.db);
      entries.push({
        problemId: seed.problemId,
        problemTitle: seed.problemTitle,
        domain: seed.domain,
        science125Tag: seed.science125Tag,
        verdict: result.verdictNode.verdict,
        integrityRoot: root,
        leafCount,
        reproHash: result.reproHash,
        stagesCompleted: result.loopState.artifacts.length,
        converged: result.loopState.terminationReason === 'feedback_converged',
        chainVerified: result.chainVerify.ok,
        sourceId: result.sourceCard.sourceId,
      });
    } finally {
      result.db.close();
    }
  }

  // 按 problemId 升序（确定性叶序·保证 suiteIntegrityRoot 可复现）
  const sorted = [...entries].sort((a, b) => a.problemId.localeCompare(b.problemId));

  // 套件级聚合根：所有 problem 的 integrityRoot 作为叶再 Merkle 折叠
  const suiteIntegrityRoot = computeMerkleRoot(sorted.map((e) => e.integrityRoot));
  const totalLeaves = sorted.reduce((sum, e) => sum + e.leafCount, 0);

  return {
    schemaVersion: 1,
    generatedAt: (opts.now ?? defaultNow)(),
    problemCount: sorted.length,
    entries: sorted,
    suiteIntegrityRoot,
    totalLeaves,
    verdictDistribution: tallyVerdicts(sorted),
    domainDistribution: tallyDomains(sorted),
    gitCommitSha: opts.gitCommitSha ?? null,
    honestyNotes: HONESTY_NOTES,
  };
}
