// src/campaign/guard_registry.ts
// 职责：CAMPAIGN-GUARD-001 —— Campaign Guard 监控清单（12 项）+ 三个新机制
// （锁租约过期 / 队列积压暴露 / provider·model 退役检测）+ guard event log。
//
// scout 2026-08-18 盘点（12 项：4 实 + 5 部分 + 3 缺）：
//   实：budget breaker（guardian+budget.ts）/ rate-limit（rate_limiter+retry_policy）/
//       unsafe output（sanitizer+R1）/ corpus 完整性（snapshot_integrity 五层）。
//   部分：provider breaker（fallback 链无熔断状态机）/ cache·disk·memory（部分暴露）/
//       process liveness（服务级非 worker 级）/ corpus·config drift（一次性非持续）/
//       repeated failure（单题重试上限非跨题聚合）/ audit·log failure（上浮非监控）。
//   本批新机制：lock expiration（LeaseRegistry）/ queue backlog（BacklogGauge）/
//       provider·model retirement（RetirementCheck）。
//
// Cannot-prove：注册表证明「12 项各有归属与机制、三项新机制确定性可检」；「部分」
// 项的完整化（如 provider 熔断状态机、worker 级 liveness）不在此批假装完成——
// registry 如实标 partial。soak report 属 CAMPAIGN-SOAK-001（T1），不在本批伪造。

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 12 项监控清单（机器可读 inventory——Evidence 面）
// ---------------------------------------------------------------------------

export const GUARD_ITEMS = [
  'budget-breaker',
  'provider-breaker',
  'rate-limit',
  'resource-pressure',
  'queue-backlog',
  'process-liveness',
  'provider-retirement',
  'corpus-config-drift',
  'lock-expiration',
  'repeated-failure',
  'unsafe-output',
  'audit-log-failure',
] as const;
export type GuardItem = (typeof GUARD_ITEMS)[number];

export type GuardMaturity = 'implemented' | 'partial' | 'new-this-batch';

export interface GuardInventoryEntry {
  readonly item: GuardItem;
  readonly maturity: GuardMaturity;
  /** 权威机制位置（implemented/partial）或本批新机制说明。 */
  readonly authority: string;
  readonly note: string;
}

/** 12 项清单：每项的成熟度如实标注（partial 不冒充 implemented）。 */
export const GUARD_INVENTORY: readonly GuardInventoryEntry[] = [
  { item: 'budget-breaker', maturity: 'implemented', authority: 'campaign/guardian.ts + llm_gateway/budget.ts', note: '前置预算跳闸 + tokens/duration/loops 三维硬断路（CostBudgetExceeded）' },
  { item: 'provider-breaker', maturity: 'partial', authority: 'llm_gateway/fallback_chain/error_classifier.ts', note: 'fallback 链逐调用切换——无开/半开/关熔断状态机与冷却期（完整化留后续，如实标 partial）' },
  { item: 'rate-limit', maturity: 'implemented', authority: 'llm_gateway/rate_limiter.ts + agent_loop/retry_policy.ts', note: '并发信号量+单调钟节流；429 退避；限流诚实停机不冒充完成' },
  { item: 'resource-pressure', maturity: 'partial', authority: 'api/routes/metrics.ts + retrieval/cache.ts TTL', note: 'memory 指标暴露 + cache TTL；disk 压力与 eviction 未做（partial）' },
  { item: 'queue-backlog', maturity: 'new-this-batch', authority: 'campaign/guard_registry.ts BacklogGauge', note: '本批：深度三档（ok/soft-throttle/hard-stop-honest）+ 趋势入 guard event' },
  { item: 'process-liveness', maturity: 'partial', authority: 'api/routes/health.ts + events.ts SSE 心跳', note: '服务级 liveness/readiness；campaign worker 进程级心跳未做（partial）' },
  { item: 'provider-retirement', maturity: 'new-this-batch', authority: 'campaign/guard_registry.ts RetirementCheck', note: '本批：退役清单（机器可读）对拍活跃 profile → 命中即 guard event + 停用' },
  { item: 'corpus-config-drift', maturity: 'partial', authority: 'retrieval/snapshot_integrity.ts + far_proof/env_fingerprint.ts', note: '快照五层篡改检测 + 导出时环境指纹一次性；持续漂移监控 partial' },
  { item: 'lock-expiration', maturity: 'new-this-batch', authority: 'campaign/guard_registry.ts LeaseRegistry', note: '本批：写路径文件锁租约（TTL 过期强制释放 + 事件入账）——补 store.ts 单写者假设的机制面' },
  { item: 'repeated-failure', maturity: 'partial', authority: 'campaign/scheduler.ts（崩溃恰重试一次）', note: '单题重试上限防死循环；跨题重复失败聚合监控 partial' },
  { item: 'unsafe-output', maturity: 'implemented', authority: 'llm_gateway/sanitizer.ts + fsm_runner R1 门', note: '注入检测+中性化+findings 审计；R1_MODEL_UNSAFE/R1_MUTEX fail-closed' },
  { item: 'audit-log-failure', maturity: 'partial', authority: 'run_lifecycle.ts error 上浮 + event_log.ts 拒坏链追加', note: '写失败 loudly surfaced；统一监控器 partial' },
];

export function guardInventoryCompleteness(): { ok: boolean; missing: GuardItem[] } {
  const listed = new Set(GUARD_INVENTORY.map((e) => e.item));
  const missing = GUARD_ITEMS.filter((i) => !listed.has(i));
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// 新机制 ①：锁租约过期（lock expiration——写路径单写者的机制化）
// ---------------------------------------------------------------------------

export interface Lease {
  readonly owner: string;
  readonly path: string;
  readonly acquiredAt: number;
  readonly ttlMs: number;
}

export interface LeaseCheck {
  readonly ok: boolean;
  readonly expired: readonly { lease: Lease; now: number }[];
}

/** 获取租约（同路径既有未过期租约存在且属他人 → 拒绝；过期 → 抢占并记录事件）。 */
export function acquireLease(
  existing: readonly Lease[],
  path: string,
  owner: string,
  ttlMs: number,
  now: number,
): { ok: true; leases: readonly Lease[] } | { ok: false; reason: string; heldBy: string } {
  const current = existing.find((l) => l.path === path);
  if (current !== undefined) {
    const expired = now >= current.acquiredAt + current.ttlMs;
    if (!expired && current.owner !== owner) {
      return { ok: false, reason: `path '${path}' held by '${current.owner}' until ${current.acquiredAt + current.ttlMs}`, heldBy: current.owner };
    }
  }
  const lease: Lease = { owner, path, acquiredAt: now, ttlMs };
  return { ok: true, leases: [...existing.filter((l) => l.path !== path), lease] };
}

/** 全量租约过期检查（guard 周期任务用）：过期即列名——调用方强制释放并记 guard event。 */
export function checkLeaseExpiry(leases: readonly Lease[], now: number): LeaseCheck {
  const expired = leases
    .filter((l) => now >= l.acquiredAt + l.ttlMs)
    .map((l) => ({ lease: l, now }));
  return { ok: expired.length === 0, expired };
}

/** 续租（owner 匹配且未过期才可续——他人不得续我的租约）。 */
export function renewLease(leases: readonly Lease[], path: string, owner: string, now: number, ttlMs: number):
  | { ok: true; leases: readonly Lease[] }
  | { ok: false; reason: string } {
  const current = leases.find((l) => l.path === path);
  if (current === undefined) return { ok: false, reason: `no lease on '${path}'` };
  if (current.owner !== owner) return { ok: false, reason: `lease on '${path}' owned by '${current.owner}'` };
  if (now >= current.acquiredAt + current.ttlMs) {
    return { ok: false, reason: `lease on '${path}' already expired at ${current.acquiredAt + current.ttlMs} — reacquire, not renew` };
  }
  return { ok: true, leases: leases.map((l) => (l.path === path ? { ...l, acquiredAt: now, ttlMs } : l)) };
}

// ---------------------------------------------------------------------------
// 新机制 ②：队列积压暴露（queue backlog——三档深度 + 诚实停机）
// ---------------------------------------------------------------------------

export type BacklogLevel = 'ok' | 'soft' | 'hard';

export interface BacklogStatus {
  readonly level: BacklogLevel;
  /** 宪法 Acceptance 面的动作语义：degrade（节流降速）/ pause（诚实暂停待恢复）/ none。 */
  readonly action: 'none' | 'degrade' | 'pause';
  readonly depth: number;
  readonly detail: string;
}

export function backlogStatus(depth: number, softLimit: number, hardLimit: number): BacklogStatus {
  if (depth >= hardLimit) {
    return { level: 'hard', action: 'pause', depth, detail: `backlog ${depth} ≥ hard ${hardLimit} — honest pause, not silent queue growth` };
  }
  if (depth >= softLimit) {
    return { level: 'soft', action: 'degrade', depth, detail: `backlog ${depth} ≥ soft ${softLimit} — throttle intake` };
  }
  return { level: 'ok', action: 'none', depth, detail: `backlog ${depth} within soft ${softLimit}` };
}

// ---------------------------------------------------------------------------
// 新机制 ③：provider/model 退役检测（retirement——机器可读退役清单对拍）
// ---------------------------------------------------------------------------

export interface RetirementList {
  /** 已退役 profile 名单（操作者维护的机器可读清单）。 */
  readonly retiredProfiles: readonly string[];
  /** 清单版本（漂移审计锚点）。 */
  readonly listVersion: string;
}

export interface RetirementHit {
  readonly profile: string;
  readonly listVersion: string;
  readonly action: 'stop-using';
  readonly detail: string;
}

export function checkRetirement(activeProfiles: readonly string[], list: RetirementList): readonly RetirementHit[] {
  const retired = new Set(list.retiredProfiles);
  return activeProfiles
    .filter((p) => retired.has(p))
    .map((p) => ({
      profile: p,
      listVersion: list.listVersion,
      action: 'stop-using' as const,
      detail: `profile '${p}' retired (list v${list.listVersion}) — stop scheduling on it, migrating runs to successors`,
    }));
}

// ---------------------------------------------------------------------------
// Guard event log（append-only，seq 连续；自动降级/暂停/恢复的事件面）
// ---------------------------------------------------------------------------

export const GUARD_SEVERITIES = ['info', 'warn', 'stop'] as const;
export type GuardSeverity = (typeof GUARD_SEVERITIES)[number];

export const GUARD_ACTIONS = ['none', 'degrade', 'pause', 'resume', 'stop'] as const;
export type GuardAction = (typeof GUARD_ACTIONS)[number];

export const GuardEventSchema = z.object({
  seq: z.number().int().positive(),
  at: z.string().min(1),
  guard: z.enum(GUARD_ITEMS),
  severity: z.enum(GUARD_SEVERITIES),
  action: z.enum(GUARD_ACTIONS),
  detail: z.string().min(1),
});

export type GuardEvent = z.infer<typeof GuardEventSchema>;

export function buildGuardEvent(
  log: readonly GuardEvent[],
  input: Omit<GuardEvent, 'seq'>,
): GuardEvent {
  const tail = log.at(-1);
  return GuardEventSchema.parse({ ...input, seq: (tail?.seq ?? 0) + 1 });
}

export interface GuardLogCheck {
  readonly valid: boolean;
  readonly firstBrokenSeq: number | null;
  readonly reason: string | null;
}

/** seq 连续校验（1..n；断号/重复/乱序 fail-closed）。 */
export function verifyGuardEventLog(log: readonly GuardEvent[]): GuardLogCheck {
  for (let i = 0; i < log.length; i += 1) {
    const e = log[i] as GuardEvent;
    if (e.seq !== i + 1) {
      return { valid: false, firstBrokenSeq: e.seq, reason: `seq discontinuity at position ${i + 1} (got ${e.seq})` };
    }
  }
  return { valid: true, firstBrokenSeq: null, reason: null };
}

/** 故障 → 动作 的确定性映射（自动降级/暂停/恢复语义的 SSOT）。 */
export function guardActionFor(severity: GuardSeverity): GuardAction {
  switch (severity) {
    case 'stop':
      return 'stop';
    case 'warn':
      return 'degrade';
    case 'info':
      return 'none';
  }
}

/** 恢复事件构建（暂停后的恢复必须显式入账——不隐式复活）。 */
export function resumeEvent(log: readonly GuardEvent[], guard: GuardItem, at: string, detail: string): GuardEvent {
  return buildGuardEvent(log, { at, guard, severity: 'info', action: 'resume', detail });
}
