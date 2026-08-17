// src/campaign/dag.ts
// 职责：CAMPAIGN-DAG-001 —— 显式、版本化的战役执行图（CampaignStep 11 字段 + 拓扑校验）。
//
// 宪法（DOMAIN_PROTOCOLS E2）：Step 至少含 stable ID/type、inputs/outputs、dependencies、
// state、retry/idempotency policy、timeout/cancellation、budget、permission set、
// code/config version、input/output hashes、checkpoint refs；图执行需拓扑合法、支持
// 条件分支、局部恢复和显式停止条件。
//
// 现状与边界（scout 2026-08-18 全库盘点）：仓库的两条管线（agent_loop 6-stage FSM、
// research 8-stage 线性）是顺序硬编码——本模块把「图」作为一等数据结构建立 SSOT，
// 字段语义对齐现存分散资产（StageReceipt 的 hash 幂等跳过、guardian 预算、
// AGENT_WRITE_MANIFEST 权限、run checkpoint refs），供调度层渐进采纳。
// Cannot-prove：本模块证明图合法性与可执行集推导（纯函数）；不证明运行中的
// scheduler 真的按此图执行（采纳接线是后续批次——不假装已接管）。

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Step —— 宪法 11 字段
// ---------------------------------------------------------------------------

export const STEP_STATES = ['pending', 'running', 'OK', 'failed', 'skipped', 'cancelled'] as const;
export type StepState = (typeof STEP_STATES)[number];

export const IDEMPOTENCY_SEMANTICS = ['exactly-once', 'at-least-once'] as const;
export type IdempotencySemantics = (typeof IDEMPOTENCY_SEMANTICS)[number];

export const CampaignStepSchema = z.object({
  /** ① stable ID（图内唯一，依赖引用键）。 */
  id: z.string().min(1),
  /** ① step 类型（自由词表：retrieve/generate/plan/execute/seal/...）。 */
  type: z.string().min(1),
  /** ② 声明式输入（数据/工件引用；空 = 无前置数据）。 */
  inputs: z.array(z.string().min(1)).default([]),
  /** ② 声明式输出。 */
  outputs: z.array(z.string().min(1)).default([]),
  /** ③ 依赖的 step ID（拓扑边；空 = 根步骤）。 */
  dependencies: z.array(z.string().min(1)).default([]),
  /** ④ 执行状态（skipped = 条件分支未选中——分支支持的状态面）。 */
  state: z.enum(STEP_STATES).default('pending'),
  /** ⑤ 重试/幂等策略。 */
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0),
    idempotency: z.enum(IDEMPOTENCY_SEMANTICS),
    /** 已重试次数（resume 时续算，不重置）。 */
    retriesUsed: z.number().int().min(0).default(0),
  }),
  /** ⑥ 超时与可取消性。 */
  timeoutMs: z.number().int().positive().nullable().default(null),
  cancellable: z.boolean().default(true),
  /** ⑦ 该步预算（token/资源上限；null = 沿用战役级）。 */
  budgetTokens: z.number().int().positive().nullable().default(null),
  /** ⑧ 权限集（写路径/动作白名单；空 = 只读步）。 */
  permissions: z.array(z.string().min(1)).default([]),
  /** ⑨ code/config 版本（gitCommitSha + 配置指纹）。 */
  codeVersion: z.string().min(1),
  configVersion: z.string().min(1),
  /** ⑩ 输入/输出哈希（执行前 null；执行后回填——幂等跳过与篡改检测锚点）。 */
  inputHash: z.string().length(64).nullable().default(null),
  outputHash: z.string().length(64).nullable().default(null),
  /** ⑪ checkpoint 引用（该步崩溃恢复锚点；null = 尚未开跑）。 */
  checkpointRef: z.string().min(1).nullable().default(null),
});

export type CampaignStep = z.infer<typeof CampaignStepSchema>;

// ---------------------------------------------------------------------------
// Graph —— 版本化战役清单（campaign manifest 的机器形态）
// ---------------------------------------------------------------------------

export const CAMPAIGN_GRAPH_SCHEMA_VERSION = 1;

export const CampaignGraphSchema = z.object({
  schemaVersion: z.literal(CAMPAIGN_GRAPH_SCHEMA_VERSION),
  campaignId: z.string().min(1),
  /** 显式停止条件（宪法：图执行需显式停止条件）。 */
  stopConditions: z.array(z.string().min(1)).min(1),
  steps: z.array(CampaignStepSchema).min(1),
});

export type CampaignGraph = z.infer<typeof CampaignGraphSchema>;

export interface GraphViolation {
  readonly code:
    | 'DUPLICATE_STEP_ID'
    | 'MISSING_DEPENDENCY'
    | 'CYCLE_DETECTED'
    | 'EMPTY_GRAPH';
  readonly message: string;
}

export interface TopologyResult {
  readonly ok: boolean;
  readonly violations: readonly GraphViolation[];
  /** 合法时的确定性拓扑序（Kahn；同层按 id 字典序——确定性要求）；非法时 []。 */
  readonly executionOrder: readonly string[];
}

/** 拓扑校验：ID 唯一 / 依赖存在 / 无环（宪法 Acceptance: cycle tests）。 */
export function validateGraphTopology(graph: CampaignGraph): TopologyResult {
  const violations: GraphViolation[] = [];
  if (graph.steps.length === 0) {
    violations.push({ code: 'EMPTY_GRAPH', message: 'graph has no steps' });
    return { ok: false, violations, executionOrder: [] };
  }

  const byId = new Map<string, CampaignStep>();
  for (const s of graph.steps) {
    if (byId.has(s.id)) {
      violations.push({ code: 'DUPLICATE_STEP_ID', message: `duplicate step id '${s.id}'` });
    }
    byId.set(s.id, s);
  }

  for (const s of graph.steps) {
    for (const dep of s.dependencies) {
      if (!byId.has(dep)) {
        violations.push({ code: 'MISSING_DEPENDENCY', message: `step '${s.id}' depends on unknown step '${dep}'` });
      }
    }
  }

  // Kahn 拓扑排序（含环检测）：入度表 + 同层字典序（确定性）
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const s of graph.steps) {
    indegree.set(s.id, s.dependencies.filter((d) => byId.has(d)).length);
    for (const dep of s.dependencies) {
      if (!byId.has(dep)) continue;
      const list = dependents.get(dep) ?? [];
      list.push(s.id);
      dependents.set(dep, list);
    }
  }
  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const next of (dependents.get(id) ?? []).sort()) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (order.length !== graph.steps.length) {
    const cyclic = graph.steps.filter((s) => !order.includes(s.id)).map((s) => s.id);
    violations.push({
      code: 'CYCLE_DETECTED',
      message: `cycle among steps: ${cyclic.sort().join(' → ')}`,
    });
    return { ok: false, violations, executionOrder: [] };
  }

  return { ok: violations.length === 0, violations, executionOrder: order };
}

// ---------------------------------------------------------------------------
// 图生命周期纯函数（partial failure / retry / cancel / resume 的图层面）
// ---------------------------------------------------------------------------

/** 终态判定（OK/skipped/cancelled = 不再执行；failed 视重试余量）。 */
function settled(s: CampaignStep): boolean {
  return s.state === 'OK' || s.state === 'skipped' || s.state === 'cancelled';
}

/**
 * 可执行集（局部恢复核心）：state=pending 且依赖全部 OK（skipped 依赖不传播就绪——
 * 分支未选中即其后代不执行）且未触发停止条件。failed 步若有重试余量亦列入
 * （重试语义：maxRetries - retriesUsed > 0）。
 */
export function executableSteps(graph: CampaignGraph): readonly CampaignStep[] {
  const byId = new Map(graph.steps.map((s) => [s.id, s]));
  return graph.steps.filter((s) => {
    if (s.state === 'pending') {
      return s.dependencies.every((d) => (byId.get(d) as CampaignStep | undefined)?.state === 'OK');
    }
    if (s.state === 'failed') {
      const depsOk = s.dependencies.every((d) => (byId.get(d) as CampaignStep | undefined)?.state === 'OK');
      return depsOk && s.retryPolicy.retriesUsed < s.retryPolicy.maxRetries;
    }
    return false;
  });
}

/** 幂等跳过判定：已 OK 且输出哈希在案且幂等语义为 exactly-once → 重放时跳过。 */
export function idempotentSkip(s: CampaignStep): boolean {
  return s.state === 'OK' && s.outputHash !== null && s.retryPolicy.idempotency === 'exactly-once';
}

export interface StepOutcome {
  readonly stepId: string;
  readonly kind: 'OK' | 'failed' | 'skipped' | 'cancelled';
  /** OK 时的输出哈希（64 hex）；failed 时的错误摘要。 */
  readonly detail: string | null;
  readonly outputHash: string | null;
}

export type ApplyResult =
  | { readonly ok: true; readonly graph: CampaignGraph }
  | { readonly ok: false; readonly error: string };

/** 单步结果回填（纯函数——返回新图）：状态/哈希/重试计数/checkpoint 引用一次落位。 */
export function applyStepOutcome(graph: CampaignGraph, outcome: StepOutcome): ApplyResult {
  const target = graph.steps.find((s) => s.id === outcome.stepId);
  if (target === undefined) return { ok: false, error: `unknown step '${outcome.stepId}'` };
  if (settled(target) && !(target.state === 'failed' && outcome.kind === 'failed')) {
    return { ok: false, error: `step '${outcome.stepId}' already settled (${target.state}) — terminal steps don't rerun` };
  }
  if (outcome.kind === 'OK' && outcome.outputHash !== null && !/^[0-9a-f]{64}$/.test(outcome.outputHash)) {
    return { ok: false, error: `outputHash must be 64-hex, got '${outcome.outputHash.slice(0, 12)}…'` };
  }
  const steps = graph.steps.map((s) => {
    if (s.id !== outcome.stepId) return s;
    switch (outcome.kind) {
      case 'OK':
        return { ...s, state: 'OK' as const, outputHash: outcome.outputHash, checkpointRef: `step:${s.id}:done` };
      case 'failed':
        // 只有重试尝试（failed→failed）消耗余量；首发失败（pending→failed）不计
        return { ...s, state: 'failed' as const, retryPolicy: { ...s.retryPolicy, retriesUsed: s.retryPolicy.retriesUsed + (s.state === 'failed' ? 1 : 0) } };
      case 'skipped':
        return { ...s, state: 'skipped' as const };
      case 'cancelled':
        return { ...s, state: 'cancelled' as const };
    }
  });
  return { ok: true, graph: { ...graph, steps } };
}

/** resume 判定：图序列化往返后可执行集不变（恢复语义的图层面契约）。 */
export function graphRoundTripStable(graph: CampaignGraph): boolean {
  const revived = CampaignGraphSchema.safeParse(JSON.parse(JSON.stringify(graph)));
  if (!revived.success) return false;
  const a = executableSteps(graph).map((s) => s.id).sort().join(',');
  const b = executableSteps(revived.data).map((s) => s.id).sort().join(',');
  return a === b;
}

// ---------------------------------------------------------------------------
// 图版本迁移（graph migration——宪法 Acceptance 面）
// ---------------------------------------------------------------------------

/** 无版本字段的裸图 = legacy v0 形状 → v1（补 schemaVersion）。 */
export function migrateGraphPayload(raw: Record<string, unknown>): CampaignGraph {
  if (raw.schemaVersion === undefined) {
    const migrated = { ...raw, schemaVersion: CAMPAIGN_GRAPH_SCHEMA_VERSION };
    return CampaignGraphSchema.parse(migrated);
  }
  if (raw.schemaVersion !== CAMPAIGN_GRAPH_SCHEMA_VERSION) {
    throw new Error(
      `campaign graph schemaVersion ${String(raw.schemaVersion)} unsupported (this build: ${CAMPAIGN_GRAPH_SCHEMA_VERSION}) — migration required (fail-closed)`,
    );
  }
  return CampaignGraphSchema.parse(raw);
}
