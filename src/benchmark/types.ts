/**
 * benchmark 类型 —— Science-125 完整性广度套件的聚合报告契约。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science125 种子→VerdictNode）+
 *            09_可复现性规范_REPRO_DETERMINISM.md §4（integrity root）+
 *            17_FINAL_AUDIT.md §7（每个 demo seed 要求）.
 *
 * 诚实定位（红线·反幻觉·与 00 §1.4 / 14 §3 一致）：
 *   本报告展示的是**系统的工程完整性广度**，非「科学结论排名」。
 *   每个 problem 的 verdict 由 offline fixture 产出（非真实科学裁决·无真实 LLM 调用）；
 *   suiteIntegrityRoot 证明的是「每条证据链的密码学完整性 + 跨问题可聚合审计」，
 *   非「科学正确性」。已知边界 / 未完成项见 BenchmarkReport.honestyNotes。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { Verdict } from '../schema/enums.ts';

/**
 * 单个 Science-125 problem 的完整性条目（一行 leaderboard 记录）。
 *
 * 字段全部由 demo seed 的真实运行产出（computeChainMerkleRoot / verifyChainHead / FEC 裁决），
 * 非编造。verdict 字段携带诚实标注（fixture 产出）。
 */
export interface BenchmarkEntry {
  /** 问题标识（A4 / A16 / E2 / B7 / C3 / G5 ...·与 Science-125 种子编号对齐）。 */
  readonly problemId: string;
  /** 问题标题（中文·展示用）。 */
  readonly problemTitle: string;
  /** 科学领域（天文学 / 生态气候 / 生物学 / 化学 / 地球科学·展示用·不进 hash）。 */
  readonly domain: string;
  /** Science-125 问题标签（kebab-case·展示用）。 */
  readonly science125Tag: string;
  /** FEC 裁决（诚实标注：offline fixture 产出·非真实科学裁决）。 */
  readonly verdict: Verdict;
  /** 该 problem 证据链的 Merkle 根（64-hex·computeChainMerkleRoot·整链折叠指纹）。 */
  readonly integrityRoot: string;
  /** call_records 叶数（证据链长度）。 */
  readonly leafCount: number;
  /** 链头复现哈希（64-hex·reproHash·run 主信任锚）。 */
  readonly reproHash: string;
  /** 完成的阶段数（6 = 完整六阶段 agent loop）。 */
  readonly stagesCompleted: number;
  /** 是否经 feedback 收敛（terminationReason === 'feedback_converged'）。 */
  readonly converged: boolean;
  /** verifyChainHead 是否通过（链式 hash 逐条完整）。 */
  readonly chainVerified: boolean;
  /** sourceCard.sourceId（证据源定位）。 */
  readonly sourceId: string;
}

/** verdict 分布（key = Verdict 枚举值·value = 计数·全 5 键恒在）。 */
export type VerdictDistribution = Readonly<Record<Verdict, number>>;

/** 领域分布（key = domain 字符串·value = 计数）。 */
export type DomainDistribution = Readonly<Record<string, number>>;

/**
 * Science-125 完整性广度套件的聚合报告。
 *
 * 这是 benchmark 的顶层产物：所有 problem 条目 + 套件级聚合完整性根 + 分布统计 + 诚实声明。
 * 由 src/benchmark/aggregator.ts 的 runBenchmark 纯函数产出，generate 脚本序列化为 JSON。
 */
export interface BenchmarkReport {
  /** 契约版本（锁定演进·序列化兼容）。 */
  readonly schemaVersion: 1;
  /** 报告生成时间（ISO·generate 脚本注入确定值·非 suiteIntegrityRoot 输入）。 */
  readonly generatedAt: string;
  /** 问题总数（= entries.length）。 */
  readonly problemCount: number;
  /** 按 problemId 升序的条目（确定性顺序·保证 suiteIntegrityRoot 可复现）。 */
  readonly entries: readonly BenchmarkEntry[];
  /**
   * 套件级聚合完整性根（64-hex）：所有 entry.integrityRoot 作为叶再 Merkle 折叠一次。
   *
   * 整个 benchmark 套件的单个密码学指纹——证明所有问题的证据链**可聚合审计**：
   * 任一 problem 的链被篡改，suiteIntegrityRoot 立即失效。这是 FAR-Chain 的差异化护城河
   * （单链完整性 → 跨链可聚合的套件级信任根）。
   */
  readonly suiteIntegrityRoot: string;
  /** 所有链的总叶数（Σ entries.leafCount）。 */
  readonly totalLeaves: number;
  /** verdict 分布（全 5 键）。 */
  readonly verdictDistribution: VerdictDistribution;
  /** 领域分布。 */
  readonly domainDistribution: DomainDistribution;
  /** 生成此报告锁定的 gitCommitSha（fresh-clone 锚·demo 场景可为固定 fixture 值）。 */
  readonly gitCommitSha: string | null;
  /** 诚实声明（已知边界 / 未完成项·与 HonestyWall 同源精神）。 */
  readonly honestyNotes: readonly string[];
}
