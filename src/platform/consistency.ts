// src/platform/consistency.ts
// 职责：ENG-TRANSACTION-001 —— 跨边界写入一致性模型（ADR 载体 + SoT 地图 +
// 单一 owner 校验 + 四故障面 fault report）。
//
// ═══ Consistency ADR（Accepted 2026-08-19；本文件即 ADR 正文——docs/ 为
// gitignored 机器本地层，仓库内证据须入源码）═══
//
// 决策：采用 **台账优先（ledger-first）+ 单写者租约 + 原子写 + 重放补偿** 模型，
// 不引入分布式事务/saga 编排器：
//   1. 单一 Source of Truth：每个持久化事实恰有一个权威存储（下方实体→SoT 地图）。
//      一切派生视图（API 投影/缓存/UI）皆可从 SoT 重放重建——删派生物不损历史。
//   2. 单写者 + 租约：同一 SoT 写路径唯一，跨进程由 LeaseRegistry 守卫
//      （持有拒/到期抢占/续租 owner-only）。无锁管理器即无锁序死锁面
//      （lock-ordering 按 by-design-absent 处理，见 concurrency_inventory）。
//   3. Append-only 哈希链：台账/收据/审计账追加式（seq+prevHash）——reorder 与
//      duplicate 在链校验处 fail-closed 检出。
//   4. 原子写：单文件状态 tmp+rename（writeAtomic）；半写/ENOSPC 要么全无要么
//      fail-closed 可检（批 18 两态测试）。
//   5. 补偿 = 重放：跨边界失败不回滚多写（没有多写），从 SoT 重放重建
//      （scheduler 崩溃协议/resume 只重跑未完成 stage）。outbox 等价物 = 事件
//      台账 + stage 收据（写路径先入账后生效）。
//
// 被否候选：①两阶段提交/saga 编排器——单机单写者场景引入协调者只增故障面，
// 重放补偿已覆盖等价语义；②多写者+锁管理器——需锁序纪律与死锁检测，复杂度
// 不对等收益（单写者假设已由租约机制化）。
//
// 后果：正面=模型各件已机制化且有测试面（四故障面映射表见下）；负面=单写者
// 限制吞吐（战役目录并行度=1，按当前规模接受）。边界（cannot-prove）：静态地图
// 证明声明的 SoT 唯一性；绕过 SoT 的旁路写（直接 SQL UPDATE）由 write manifest
// + guards 拦截，不归本模型。
//
// 四故障面映射（fault report 的测试锚点）：
//   partial-commit     → tests/campaign/checkpoint_recovery.test.ts（ENOSPC 两态）
//   reorder            → tests/platform/concurrency_consistency.test.ts（真链交换）
//   duplicate          → 同上（campaign 双起防重——真原语；appendEvent 重复 payload
//                        是合法重试记录非 duplicate）
//   compensation-failure → tests/campaign/dag.test.ts（重试余量耗尽退出）

export const CONSISTENCY_ENTITIES = [
  { entity: 'verdict', sot: 'db:verdict_nodes', writer: 'fec/kernel 经 recordVerdict（写清单在册）' },
  { entity: 'campaign-state', sot: 'file:.far/campaigns/<id>/events.jsonl（台账）', writer: 'scheduler 单写者（lease 守卫）' },
  { entity: 'run-checkpoint', sot: 'file:.far/research-runs/<id>/checkpoint.json', writer: 'run_lifecycle 原子写（tmp+rename）' },
  { entity: 'stage-receipts', sot: 'file:.far/research-runs/<id>/receipts/', writer: 'stage_receipt_store 追加（哈希链）' },
  { entity: 'config', sot: 'typed schema 解析结果（platform/config）', writer: 'resolveConfig（谱系入 provenance）' },
  { entity: 'operation-audit', sot: 'file:操作审计账（append-only）', writer: 'appendOperationAudit（seq 连续）' },
] as const;

export interface DualOwnerCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 单一 owner 校验：实体名唯一 + SoT 目标唯一（同一 SoT 路径被两实体共享 = 疑似双 owner）。 */
export function checkNoDualOwner(
  entities: readonly { entity: string; sot: string }[] = CONSISTENCY_ENTITIES,
): DualOwnerCheck {
  const problems: string[] = [];
  const byEntity = new Set<string>();
  const bySot = new Map<string, string>();
  for (const e of entities) {
    if (byEntity.has(e.entity)) problems.push(`duplicate entity '${e.entity}'`);
    byEntity.add(e.entity);
    const existing = bySot.get(e.sot);
    if (existing !== undefined && existing !== e.entity) {
      problems.push(`SoT '${e.sot}' claimed by both '${existing}' and '${e.entity}' — dual owner`);
    }
    bySot.set(e.sot, e.entity);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 四故障面（Acceptance：partial commit / reorder / duplicate / compensation failure）
// ---------------------------------------------------------------------------

export type FaultFace = 'partial-commit' | 'reorder' | 'duplicate' | 'compensation-failure';

export interface FaultScenarioResult {
  readonly face: FaultFace;
  readonly detected: boolean;
  readonly detail: string;
}

export interface FaultReport {
  readonly scenarios: readonly FaultScenarioResult[];
  readonly allDetected: boolean;
}

/**
 * 四故障面统一入口（fault report 的机器面）。各场景由测试用真实原语驱动，
 * 本函数聚合结果——报告由真实检测结果构成，不由声明构成。
 */
export function buildFaultReport(scenarios: readonly FaultScenarioResult[]): FaultReport {
  return {
    scenarios,
    allDetected: scenarios.every((s) => s.detected),
  };
}
