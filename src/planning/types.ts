// src/planning/types.ts
// 职责：规划门禁方法论源代码化 —— 规划域类型 SSOT（zod schemas + 推导类型）。
//
// 融入设计（全局规划命令 → FAR-Lab 可编程能力）：
//   /plan         → Plan（目标 + DAG 步骤，每步可独立验证）
//   /spec         → Spec（story + Delta + ≥3 可验证验收标准 + trust-kernel 声明）
//   /state        → PlanningStage（6 阶段状态机 + 压缩门控）
//   /risk         → RiskLevel（P0-P4 分级 + 模糊向上取整）
//   /verify-full  → VerificationItem / VerificationReport（四步门函数 + not_run 纪律）
//   /checkpoint   → Checkpoint（PROGRESS.md 检查点协议）
//
// 设计原则：
//   1. zod schema 是 SSOT（与 v2_receipts_schemas.ts 同模式），类型用 z.infer 推导。
//   2. 全部为确定性纯数据 —— 无 LLM、无 IO、无随机（与 FAR-Lab 确定性哲学一致）。
//   3. 结构可机检：任意 agent / 人类 / 未来 API 都能用同一份 schema 校验规划产物。

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 风险分级 P0-P4
// ---------------------------------------------------------------------------

export const RISK_LEVELS = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RiskLevelSchema = z.enum(RISK_LEVELS);

/** 风险分级输入信号（gradeRisk 的输入，见 risk.ts）。 */
export interface RiskSignals {
  /** 只读调查（读 src/、侦察）—— 无写。 */
  readonly readOnly: boolean;
  /** 低风险可逆写（docs/ 编辑、注释）。 */
  readonly docOnly: boolean;
  /** 可逆有界写（单文件 bug 修复、新测试）。 */
  readonly boundedWrite: boolean;
  /** 触及 trust-kernel（Claim/FEC/Evidence/Verdict/Proof / src/falsifiability 等）。 */
  readonly touchesTrustKernel: boolean;
  /** 新 CLI 命令 / 新 API 路由 / schema 新 migration。 */
  readonly newCliOrApi: boolean;
  /** 跨模块（3+ 文件 / 核心模块）。 */
  readonly crossModule: boolean;
  /** 破坏性（批量删 / 编辑现有 migration / 广影响）。 */
  readonly destructive: boolean;
  /** 不可逆（git push / tag / publish / 生产 / force-push）。 */
  readonly irreversible: boolean;
  /** 信号模糊（不确定 P2 还是 P3）—— 向上取整。 */
  readonly ambiguous: boolean;
}

// ---------------------------------------------------------------------------
// Plan —— 深度规划 DAG
// ---------------------------------------------------------------------------

export const PlanStepSchema = z.object({
  /** 步骤 ID（唯一，依赖引用键）。 */
  id: z.string().min(1),
  /** 该步骤的动作描述（≤ 一行）。 */
  action: z.string().min(1),
  /** 该步骤的风险级。 */
  risk: RiskLevelSchema,
  /** 建议工具（Read/Bash/Edit/Write/...）。 */
  tools: z.array(z.string().min(1)).default(['Bash']),
  /** 依赖的步骤 ID（空 = 无前置依赖）。 */
  dependsOn: z.array(z.string().min(1)).default([]),
  /** 该步骤的验证命令 —— 不可独立验证的步骤是占位符，不是计划。 */
  verification: z.string().min(1),
});

export const PlanSchema = z.object({
  /** 计划目标（≤ 20 词）。 */
  goal: z.string().min(1).max(200),
  /** DAG 步骤（≥ 1，否则拒绝）。 */
  steps: z.array(PlanStepSchema).min(1),
  /** 可选：任务分类（简单修复/模块功能/跨域功能/trust-kernel/架构重构/发布）。 */
  taskClass: z.string().optional(),
  /** 可选：生命周期深度（SPEC→DONE 压缩 / pipeline / full_lifecycle）。 */
  lifecycleDepth: z.string().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;
export type Plan = z.infer<typeof PlanSchema>;

/** validatePlan 的返回：拓扑序步骤 + 违规清单。 */
export interface PlanValidationResult {
  readonly ok: boolean;
  /** 违规项（每条 = 步骤 id 或全局 + 代码 + 消息）。 */
  readonly violations: readonly PlanViolation[];
  /** 合法时的确定性执行顺序（拓扑序；非法时为 []）。 */
  readonly executionOrder: readonly string[];
}

export interface PlanViolation {
  readonly stepId: string;
  readonly code: PlanViolationCode;
  readonly message: string;
}

export type PlanViolationCode =
  | 'EMPTY_PLAN'
  | 'DUPLICATE_STEP_ID'
  | 'MISSING_DEPENDENCY'
  | 'CYCLE_DETECTED'
  | 'MISSING_VERIFICATION'
  | 'INVALID_RISK'
  | 'EMPTY_ACTION';

// ---------------------------------------------------------------------------
// Spec —— 可验证规格
// ---------------------------------------------------------------------------

export const SpecAcceptanceCriterionSchema = z.object({
  /** 验收标准 ID（唯一，如 AC-1）。 */
  id: z.string().min(1),
  /** 验收标准声明（可验证的行为描述）。 */
  statement: z.string().min(1),
  /** 验证方法（命令 / 测试名 / 断言）—— 不可验证 = 门禁阻塞。 */
  verification: z.string().min(1),
});

export const SpecDeltaSchema = z.object({
  /** ADDED: 新增文件/能力。 */
  added: z.array(z.string().min(1)).default([]),
  /** MODIFIED: 修改点。 */
  modified: z.array(z.string().min(1)).default([]),
  /** REMOVED: 删除项（非空时 removedJustification 必填）。 */
  removed: z.array(z.string().min(1)).default([]),
});

export const SpecTrustKernelDeclarationSchema = z.object({
  /** 是否触及 trust-kernel（命中 src/falsifiability 等路径）。 */
  additiveOnly: z.boolean(),
  /** 该机制不能证明什么（AGENTS.md §7 cannotProveStatement）。 */
  cannotProveStatement: z.string().min(1),
});

export const SpecSchema = z.object({
  /** 一句话故事（谁要什么为什么）。 */
  story: z.string().min(1),
  /** 变更声明（Delta，禁止模糊描述）。 */
  delta: SpecDeltaSchema,
  /** 验收标准（≥ 3 条，每条可验证）。 */
  acceptanceCriteria: z.array(SpecAcceptanceCriterionSchema).min(1),
  /** 数据流（来源 → 变换 → 目标）。 */
  dataFlow: z.string().optional(),
  /** 风险级。 */
  risk: RiskLevelSchema,
  /** trust-kernel 适配声明（触及 trust-kernel 时必填）。 */
  trustKernel: SpecTrustKernelDeclarationSchema.optional(),
  /** REMOVED 非空时的破坏性变更理由（删 ≥5 行/改 API/删文件 → 必须说明）。 */
  removedJustification: z.string().optional(),
  /** 任务 ID（可选）。 */
  taskId: z.string().optional(),
});

export type SpecAcceptanceCriterion = z.infer<typeof SpecAcceptanceCriterionSchema>;
export type SpecDelta = z.infer<typeof SpecDeltaSchema>;
export type SpecTrustKernelDeclaration = z.infer<typeof SpecTrustKernelDeclarationSchema>;
export type Spec = z.infer<typeof SpecSchema>;

export interface SpecValidationResult {
  readonly ok: boolean;
  readonly violations: readonly SpecViolation[];
}

export interface SpecViolation {
  readonly code: SpecViolationCode;
  readonly message: string;
}

export type SpecViolationCode =
  | 'EMPTY_STORY'
  | 'EMPTY_DELTA'
  | 'TOO_FEW_CRITERIA'
  | 'CRITERION_NOT_VERIFIABLE'
  | 'DUPLICATE_CRITERION_ID'
  | 'TRUST_KERNEL_MISSING_DECLARATION'
  | 'TRUST_KERNEL_NOT_ADDITIVE'
  | 'REMOVED_WITHOUT_JUSTIFICATION';

// ---------------------------------------------------------------------------
// 状态机 —— ANALYZE → PLAN → EXECUTE → VERIFY → REVIEW → REPORT
// ---------------------------------------------------------------------------

export const PLANNING_STAGES = [
  'ANALYZE',
  'PLAN',
  'EXECUTE',
  'VERIFY',
  'REVIEW',
  'REPORT',
] as const;
export type PlanningStage = (typeof PLANNING_STAGES)[number];

/** 压缩门控模式：full = 只能相邻推进；compressed = 允许跳过中间阶段（工件不可缺席）。 */
export type StateMachineMode = 'full' | 'compressed';

export interface StageTransitionResult {
  readonly ok: boolean;
  readonly from: PlanningStage;
  readonly to: PlanningStage;
  /** 非法转移的原因（PROTOCOL_DEVIATION）。 */
  readonly reason?: string;
  /** 从当前阶段合法的去向。 */
  readonly allowedNext: readonly PlanningStage[];
}

// ---------------------------------------------------------------------------
// 验证门禁 —— 四步门函数（IDENTIFY→RUN→READ→VERIFY）
// ---------------------------------------------------------------------------

export const VerificationStatusSchema = z.enum(['pass', 'fail', 'not_run']);

export const VerificationItemSchema = z.object({
  /** 验证项 ID（唯一）。 */
  id: z.string().min(1),
  /** 验证项名称（typecheck/lint/test/...）。 */
  name: z.string().min(1),
  /** 运行的命令。 */
  command: z.string().min(1),
  /** 通过标准。 */
  expected: z.string().min(1),
});

export const VerificationRunResultSchema = z.object({
  /** 实际输出（命令输出的关键行）。 */
  actual: z.string().min(1),
  /** 状态：pass / fail / not_run（未跑必须显式标注，绝不默认通过）。 */
  status: z.enum(['pass', 'fail', 'not_run']),
});

export const VerificationReportSchema = z.object({
  items: z.array(VerificationItemSchema),
  /** 每个验证项的实际运行结果（key = item id）。 */
  results: z.record(z.string(), VerificationRunResultSchema),
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type VerificationItem = z.infer<typeof VerificationItemSchema>;
export type VerificationRunResult = z.infer<typeof VerificationRunResultSchema>;

/** 门禁结论（grade）。 */
export type GateConclusion = 'DONE' | 'IMPLEMENTED_UNVERIFIED' | 'BLOCKED';

export interface GateReport {
  readonly items: readonly VerificationItem[];
  readonly results: Readonly<Record<string, VerificationRunResult>>;
  readonly passed: readonly string[];
  readonly failed: readonly string[];
  readonly notRun: readonly string[];
  readonly conclusion: GateConclusion;
  /** 结论依据（为什么是这个 grade）。 */
  readonly rationale: string;
}

// ---------------------------------------------------------------------------
// Checkpoint —— PROGRESS.md 检查点协议
// ---------------------------------------------------------------------------

export const CheckpointSchema = z.object({
  /** 任务 ID（用于标题行 "# PROGRESS — <taskId> @ <ts>"）。 */
  taskId: z.string().min(1),
  /** 当前目标（≤ 20 词）。 */
  goal: z.string().min(1),
  /** 已完成（带证据）。 */
  completed: z.array(z.string()).default([]),
  /** 当前 git 状态（branch / commit / dirty）。 */
  state: z.string().min(1),
  /** 下一步（具体可执行的下一动作）。 */
  nextStep: z.string().min(1),
  /** 阻塞 / 风险。 */
  blockers: z.array(z.string()).default([]),
  /** 已排除方案（防恢复时盲目重试）。 */
  excludedApproaches: z.array(z.string()).default([]),
  /** 未验证的假设。 */
  assumptions: z.array(z.string()).default([]),
  /**
   * CORE-VALUE-001 · 价值三元组（batch report 必须回答「为什么值得做」）。
   * valueHypothesis：预期交付什么价值给谁（一句话，可被后续证据证实/证伪）。
   * successCriteria：怎么算达成（可验收判据，收尾时逐条对账）。
   * evidenceGaps：宣布达成还缺什么证据（诚实缺口清单）。
   * unachieved：未达成项（item + 未达成原因——收尾未覆盖 goal 的部分必须显式交代）。
   */
  valueHypothesis: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).default([]),
  evidenceGaps: z.array(z.string().min(1)).default([]),
  unachieved: z
    .array(
      z.object({
        item: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

export interface ParsedCheckpoint {
  readonly ok: boolean;
  readonly taskId: string | undefined;
  readonly sections: Readonly<Record<string, string>>;
  readonly error?: string;
}
