/**
 * router — ORCH-ROUTER-001 路由决策基于能力、风险和成本。
 *
 * 模型（确定性纯函数，无网络无时钟）：
 *   - 任务侧 RoutingTask：capability 需求（types.ts 的 LLM_CAPABILITIES 子集）、
 *     contextTokens 需求、structuredOutput（是否要求 json_schema 可靠结构化）、
 *     riskLevel（high = 信任内核相邻任务：裁决输入生成/证明链文案——要求
 *     reproducible 档案化 profile）、reproducibility（结果必须可重放）、
 *     offlineOnly（无密钥/离线环境）、budget（costPerMTokens 上限 +
 *     p50LatencyMs 上限）；
 *   - profile 侧 ProfileCatalogEntry：真实 profile 能力声明（与
 *     KNOWN_PROVIDER_PROFILES 对齐）+ 成本/延迟/上下文窗口/独立提供方标记；
 *   - route()：先硬约束过滤（能力 ⊇ 需求、context ≥ 需求、结构化支持、
 *     预算上限、offline/reproducible 约束），幸存者按 (cost, latency, id)
 *     字典序确定性排序取最优；**无幸存者 → RouterNoProfileError 携带逐
 *     profile 拒绝理由表**（fail-closed：绝不静默回退默认 profile）；
 *   - 决策日志：每次路由返回结构化 rationale（选中原因 + 全部候选的接受/
 *     拒绝理由），供 audit 与复盘（宪法 routing 决策可审计面）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - catalog 的能力/成本/延迟数字是**登记快照**（外部动态事实——
 *     GOV-EXTERNAL-001：provider 变价/降配不自动反映，freshness 由登记方负责）；
 *   - 路由不证明选中 provider 在调用时刻健康（provider health 的实时面由
 *     fallback_chain 运行时处理，本模块是事前决策）；
 *   - 「独立性要求」（多 provider 交叉验证）只通过 independentProvider
 *     标记支持同批次去重——不证明两个标记独立的 provider 真实利益独立。
 */

import type { LlmCapability, ProviderProfile } from './types.ts';

/** 任务风险等级：high = 信任内核相邻（裁决输入/证明链/对外声明）。 */
export type TaskRisk = 'low' | 'high';

export interface RoutingBudget {
  /** 每百万 token 成本上限（USD；null = 无成本约束）。 */
  readonly maxCostPerMTokens: number | null;
  /** p50 延迟毫秒上限（null = 无延迟约束）。 */
  readonly maxP50LatencyMs: number | null;
}

export interface RoutingTask {
  readonly taskId: string;
  readonly requiredCapabilities: readonly LlmCapability[];
  readonly contextTokens: number;
  readonly structuredOutput: boolean;
  readonly riskLevel: TaskRisk;
  /** 结果必须可重放（tape/fixture 档案化）。 */
  readonly reproducible: boolean;
  /** 离线环境（无密钥/无网络）——只允许 offline profile。 */
  readonly offlineOnly: boolean;
  readonly budget: RoutingBudget;
}

export interface ProfileCatalogEntry {
  readonly profile: ProviderProfile;
  readonly capabilities: readonly LlmCapability[];
  readonly contextWindowTokens: number;
  readonly structuredOutputSupport: boolean;
  readonly costPerMTokens: number;
  readonly p50LatencyMs: number;
  /** 调用是否可确定性重放（tape/fixture）。 */
  readonly reproducible: boolean;
  /** 是否离线可用（不触发网络/密钥）。 */
  readonly offline: boolean;
  readonly independentProvider: string;
}

/**
 * 真实 profile catalog（登记快照 @2026-08-18——与 KNOWN_PROVIDER_PROFILES
 * 四 profile 对齐；数字是工程登记值，非实时报价）。
 */
export const PROFILE_CATALOG: readonly ProfileCatalogEntry[] = [
  {
    profile: 'competition_aliyun_qwen',
    capabilities: ['reasoning', 'structured', 'code'],
    contextWindowTokens: 131072,
    structuredOutputSupport: true,
    costPerMTokens: 1.6,
    p50LatencyMs: 3500,
    reproducible: true, // tape.ts 会话级录制 + repro_anchor
    offline: false,
    independentProvider: 'alibaba-cloud',
  },
  {
    profile: 'research_best_available',
    capabilities: ['reasoning', 'structured', 'code', 'vision'],
    contextWindowTokens: 200000,
    structuredOutputSupport: true,
    costPerMTokens: 3.2,
    p50LatencyMs: 5200,
    reproducible: false, // best-available 是动态选择——不可保证重放同一模型
    offline: false,
    independentProvider: 'negotiated-best',
  },
  {
    profile: 'local_open_weights',
    capabilities: ['reasoning', 'code'],
    contextWindowTokens: 32768,
    structuredOutputSupport: false,
    costPerMTokens: 0.2,
    p50LatencyMs: 9000,
    reproducible: true,
    offline: false, // 本地推理仍需本地服务在位——不是无依赖离线
    independentProvider: 'self-hosted',
  },
  {
    profile: 'offline_replay',
    capabilities: ['reasoning', 'structured'],
    contextWindowTokens: 8192,
    structuredOutputSupport: true,
    costPerMTokens: 0,
    p50LatencyMs: 15,
    reproducible: true,
    offline: true,
    independentProvider: 'fixture-tape',
  },
];

export interface CandidateVerdict {
  readonly profile: ProviderProfile;
  readonly accepted: boolean;
  readonly reasons: readonly string[];
}

export interface RoutingDecision {
  readonly taskId: string;
  readonly selected: ProviderProfile;
  readonly rationale: readonly string[];
  readonly candidates: readonly CandidateVerdict[];
}

/** fail-closed 无匹配错误：携带逐 profile 拒绝理由（可诊断，非静默默认）。 */
export class RouterNoProfileError extends Error {
  readonly taskId: string;
  readonly candidates: readonly CandidateVerdict[];

  constructor(taskId: string, candidates: readonly CandidateVerdict[]) {
    super(
      `router: no profile satisfies task ${taskId} — ${candidates.map((c) => `${c.profile}: ${c.reasons.join(',') || 'unknown'}`).join(' | ')}`,
    );
    this.name = 'RouterNoProfileError';
    this.taskId = taskId;
    this.candidates = candidates;
  }
}

/** 单 profile 对单任务的硬约束评估（纯）。 */
function evaluate(
  task: RoutingTask,
  entry: ProfileCatalogEntry,
  healthOffline: readonly ProviderProfile[],
): CandidateVerdict {
  const reasons: string[] = [];
  const missing = task.requiredCapabilities.filter((c) => !entry.capabilities.includes(c));
  if (missing.length > 0) reasons.push(`missing capabilities: ${missing.join('+')}`);
  if (entry.contextWindowTokens < task.contextTokens) {
    reasons.push(`context ${entry.contextWindowTokens} < required ${task.contextTokens}`);
  }
  if (task.structuredOutput && !entry.structuredOutputSupport) reasons.push('no structured-output support');
  if (task.budget.maxCostPerMTokens !== null && entry.costPerMTokens > task.budget.maxCostPerMTokens) {
    reasons.push(`cost ${entry.costPerMTokens} > budget ${task.budget.maxCostPerMTokens}`);
  }
  if (task.budget.maxP50LatencyMs !== null && entry.p50LatencyMs > task.budget.maxP50LatencyMs) {
    reasons.push(`latency ${entry.p50LatencyMs} > budget ${task.budget.maxP50LatencyMs}`);
  }
  if (task.reproducible && !entry.reproducible) reasons.push('task requires reproducible replay but profile is not archivable');
  if (task.offlineOnly && !entry.offline) reasons.push('offline-only task but profile needs network/credentials');
  if (task.riskLevel === 'high' && !entry.reproducible) {
    reasons.push('high-risk task requires an auditable (reproducible) profile');
  }
  if (healthOffline.includes(entry.profile)) reasons.push('provider health: reported unavailable');
  return { profile: entry.profile, accepted: reasons.length === 0, reasons };
}

export interface RouteOptions {
  /** catalog 覆盖（测试/登记更新注入；缺省 PROFILE_CATALOG）。 */
  readonly catalog?: readonly ProfileCatalogEntry[];
  /** 运行时不可用 profile（provider health 注入面）。 */
  readonly unhealthyProfiles?: readonly ProviderProfile[];
}

/**
 * 路由决策（确定性）：硬约束过滤 → (cost, latency, profile 字典序) 排序取
 * 最优。无幸存者 → RouterNoProfileError（fail-closed）。
 */
export function route(task: RoutingTask, options: RouteOptions = {}): RoutingDecision {
  const catalog = options.catalog ?? PROFILE_CATALOG;
  const unhealthy = options.unhealthyProfiles ?? [];
  const candidates = catalog.map((e) => evaluate(task, e, unhealthy));
  const survivors = candidates.filter((c) => c.accepted).map((c) => c.profile);
  if (survivors.length === 0) {
    throw new RouterNoProfileError(task.taskId, candidates);
  }
  const byProfile = new Map(catalog.map((e) => [e.profile as string, e]));
  const best = survivors
    .map((p) => byProfile.get(p as string)!)
    .sort((a, b) =>
      a.costPerMTokens !== b.costPerMTokens
        ? a.costPerMTokens - b.costPerMTokens
        : a.p50LatencyMs !== b.p50LatencyMs
          ? a.p50LatencyMs - b.p50LatencyMs
          : a.profile < b.profile
            ? -1
            : 1,
    )[0]!;
  const rationale = [
    `selected ${best.profile}: satisfies all hard constraints (capabilities ⊇ {${task.requiredCapabilities.join(',')}}, context ≥ ${task.contextTokens}${task.structuredOutput ? ', structured' : ''})`,
    `cost ${best.costPerMTokens}/M tokens, p50 ${best.p50LatencyMs}ms — cheapest surviving candidate under budget`,
    `risk=${task.riskLevel} reproducible=${task.reproducible} offline=${task.offlineOnly}`,
    `survivors considered: ${survivors.join(', ') || 'none'}`,
  ];
  return { taskId: task.taskId, selected: best.profile, rationale, candidates };
}

/**
 * 独立性批次路由：同一验证批次要求 N 个相互独立的 provider（交叉验证）——
 * 从幸存者中按 independentProvider 去重选最多 N 个；不足 → RouterNoProfileError。
 */
export function routeIndependentBatch(task: RoutingTask, count: number, options: RouteOptions = {}): readonly ProviderProfile[] {
  const catalog = options.catalog ?? PROFILE_CATALOG;
  const unhealthy = options.unhealthyProfiles ?? [];
  const accepted = catalog.filter((e) => evaluate(task, e, unhealthy).accepted);
  const picked: ProviderProfile[] = [];
  const providers = new Set<string>();
  for (const e of [...accepted].sort((a, b) =>
    a.costPerMTokens !== b.costPerMTokens ? a.costPerMTokens - b.costPerMTokens : a.profile < b.profile ? -1 : 1,
  )) {
    if (providers.has(e.independentProvider)) continue;
    providers.add(e.independentProvider);
    picked.push(e.profile);
    if (picked.length === count) return picked;
  }
  throw new RouterNoProfileError(
    `${task.taskId} (independent batch of ${count})`,
    catalog.map((e) => evaluate(task, e, unhealthy)),
  );
}
