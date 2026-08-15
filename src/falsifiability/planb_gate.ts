import type { VerdictDecision } from './types.ts';

// ---------------------------------------------------------------------------
// PlanB 三风险裁决门
//
// 依据：三风险降级路径
// 三风险并行判定 + 证据汇总 + 决策记录；命中 ≥1 即 triggered。
//
// 风险映射：
//   A4  行星轨道衰减    GT 不可构造        → DEGRADED_SCOPE
//   A16 脉冲星初始自旋 P0  方法越护栏        → INCONCLUSIVE
//   E2  CO2 碳通量       novelty theater   → UNTESTED
// ---------------------------------------------------------------------------

/** Risk kinds assessed by the Plan-B degradation gate (e.g. scope_degradation, power_loss, assumption_violation). */
export const PLANB_RISK_KINDS = [
  'A4_GT_NOT_CONSTRUCTIBLE',
  'A16_METHOD_OUT_OF_GUARDRAIL',
  'E2_NOVELTY_THEATER',
] as const;

/** Type alias for a Plan-B risk kind. @see PLANB_RISK_KINDS */
export type PlanBRiskKind = (typeof PLANB_RISK_KINDS)[number];

/** A4 降级文案 — 对齐 ROADMAP §5.2 scope_slip 文案要点 */
export const A4_SCOPE_SLIP_TEXT =
  'PlanB A4: GT不可构造——E&W 2016 实为参数空间网格非固定样本；' +
  '正样本仅 WASP-12b+Kepler-1658b 2颗，不足构造确定性的 ground truth。' +
  '降级为纯假设生成。';

/** E2 降级文案 — 对齐 ROADMAP §5.2 scope_slip 文案要点 */
export const E2_UNTESTED_REASON =
  'PlanB E2: novelty=0——IPCC/GCP/FLUXNET-com/Jung RS-ML 已 established ' +
  'tree-based ML upscaling，CO2碳通量种子缺乏 novelty 增量。' +
  '降级为通用性证明 demo，不声称发现。';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** Assessment of a single Plan-B risk factor: its kind, severity, and detected evidence. */
export interface PlanBRiskAssessment {
  /**
   * A4 行星轨道衰减 —— GT 是否可构造？
   * false → insufficient_evidence → DEGRADED_SCOPE
   */
  readonly gtConstructible: boolean;
  /**
   * A16 脉冲星 P0 测定 —— 方法是否在确定性护栏内？
   * false → method_out_of_guardrail → INCONCLUSIVE
   */
  readonly methodWithinGuardrail: boolean;
  /**
   * E2 碳通量 —— 科学发现是否有 novelty？
   * false → no_novelty → UNTESTED
   */
  readonly hasNovelty: boolean;
}

/** The Plan-B gate's verdict on whether degradation is acceptable or requires escalation. */
export interface PlanBDegradationVerdict {
  readonly verdict: VerdictDecision['verdict'];
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
  /** 跨风险联动标记（如 A4+E2 → A16 必须走 VI） */
  readonly crossRiskFlags: ReadonlyArray<string>;
}

/** Complete result of the Plan-B risk assessment: all assessments, the aggregate verdict, and recommended actions. */
export interface PlanBRiskResult {
  /** 是否命中任意 PlanB 风险 */
  readonly triggered: boolean;
  /** 命中的风险列表 */
  readonly risks: ReadonlyArray<PlanBRiskKind>;
  /** 降级裁決（triggered=false 时为 null） */
  readonly degradationVerdict: PlanBDegradationVerdict | null;
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

/**
 * PlanB 三风险预检门。
 *
 * 在 decideVerdict 之前运行。若命中风险，返回的 degradationVerdict
 * 直接作为最终裁決，无需再走正常的 evidence-count 裁决逻辑。
 *
 * 降级优先级：A4 (DEGRADED_SCOPE) > E2 (UNTESTED) > A16 (INCONCLUSIVE)
 * 因为 DEGRADED_SCOPE 含 scope_slip 声明最具信息量，
 * UNTESTED 表示未真正测试，INCONCLUSIVE 仅表示方法冲突。
 */
export function planbRiskGate(assessment: PlanBRiskAssessment): PlanBRiskResult {
  const risks: PlanBRiskKind[] = [];

  if (!assessment.gtConstructible) {
    risks.push('A4_GT_NOT_CONSTRUCTIBLE');
  }
  if (!assessment.methodWithinGuardrail) {
    risks.push('A16_METHOD_OUT_OF_GUARDRAIL');
  }
  if (!assessment.hasNovelty) {
    risks.push('E2_NOVELTY_THEATER');
  }

  if (risks.length === 0) {
    return { triggered: false, risks: [], degradationVerdict: null };
  }

  const degradationVerdict = resolveDegradationVerdict(risks);

  return { triggered: true, risks, degradationVerdict };
}

// ---------------------------------------------------------------------------
// 降级裁決解析
// ---------------------------------------------------------------------------

interface DegradationParts {
  readonly verdict: VerdictDecision['verdict'];
  readonly scopeSlipText: string | null;
  readonly untestedReason: string | null;
  readonly conflictingEvidenceCount: number;
}

function resolveDegradationVerdict(risks: ReadonlyArray<PlanBRiskKind>): PlanBDegradationVerdict {
  const crossRiskFlags = computeCrossRiskFlags(risks);
  const parts = pickDegradation(risks);

  return {
    verdict: parts.verdict,
    scopeSlipText: parts.scopeSlipText,
    untestedReason: parts.untestedReason,
    conflictingEvidenceCount: parts.conflictingEvidenceCount,
    crossRiskFlags,
  };
}

/**
 * 降级优先级：A4 (DEGRADED_SCOPE) > E2 (UNTESTED) > A16 (INCONCLUSIVE)
 *
 * 若 A4 触发 → DEGRADED_SCOPE（scopeSlipText 标注所有触发风险）
 * 否则若 E2 触发 → UNTESTED（untestedReason 标注所有触发风险）
 * 否则 A16 单独触发 → INCONCLUSIVE
 */
function pickDegradation(risks: ReadonlyArray<PlanBRiskKind>): DegradationParts {
  const hasA4 = risks.includes('A4_GT_NOT_CONSTRUCTIBLE');
  const hasE2 = risks.includes('E2_NOVELTY_THEATER');

  if (hasA4) {
    return {
      verdict: 'DEGRADED_SCOPE',
      scopeSlipText: A4_SCOPE_SLIP_TEXT,
      untestedReason: null,
      conflictingEvidenceCount: 0,
    };
  }

  if (hasE2) {
    return {
      verdict: 'UNTESTED',
      scopeSlipText: null,
      untestedReason: E2_UNTESTED_REASON,
      conflictingEvidenceCount: 0,
    };
  }

  // A16 only
  return {
    verdict: 'INCONCLUSIVE',
    scopeSlipText: null,
    untestedReason: null,
    conflictingEvidenceCount: 1,
  };
}

/** 跨风险联动规则（ROADMAP §5.3）：A4+E2 同时触发 → A16 必须走 VI */
function computeCrossRiskFlags(risks: ReadonlyArray<PlanBRiskKind>): string[] {
  const flags: string[] = [];
  const hasA4 = risks.includes('A4_GT_NOT_CONSTRUCTIBLE');
  const hasE2 = risks.includes('E2_NOVELTY_THEATER');

  if (hasA4 && hasE2) {
    flags.push('A4_E2_CROSS_RISK_A16_MUST_GO_VI');
  }

  return flags;
}

// ---------------------------------------------------------------------------
// 集成入口：在 decideVerdict 前应用 PlanB 门
// ---------------------------------------------------------------------------

/** The final applied decision after Plan-B risk assessment, extending {@link VerdictDecision} with degradation and escalation details. */
export interface PlanBAppliedDecision extends VerdictDecision {
  readonly planbTriggered: boolean;
  readonly planbRisks: ReadonlyArray<PlanBRiskKind>;
  readonly planbCrossRiskFlags: ReadonlyArray<string>;
}

/**
 * applyPlanBGate — 将 PlanB 三风险预检嵌入裁決流程。
 *
 * 调用方在 decideVerdict 之前调用此函数：
 * 1. 若 PlanB 风险触发 → 直接返回降级裁決
 * 2. 否则 → 执行正常 decideVerdict 逻辑
 */
export function applyPlanBGate(
  assessment: PlanBRiskAssessment,
  decideVerdictFn: () => VerdictDecision,
): PlanBAppliedDecision {
  const result = planbRiskGate(assessment);

  if (result.triggered && result.degradationVerdict !== null) {
    const dv = result.degradationVerdict;
    return {
      verdict: dv.verdict,
      scopeSlipText: dv.scopeSlipText,
      untestedReason: dv.untestedReason,
      conflictingEvidenceCount: dv.conflictingEvidenceCount,
      // R10（night-r2 S1 连带字段）：PlanB 风险降级发生在 decideVerdict 之前（证据基
      // 未被评估）→ 无偏倚注记。非触发路径经下方 `...normalVerdict` 展开自动透传。
      evidenceBaseBias: null,
      planbTriggered: true,
      planbRisks: result.risks,
      planbCrossRiskFlags: dv.crossRiskFlags,
    };
  }

  const normalVerdict = decideVerdictFn();
  return {
    ...normalVerdict,
    planbTriggered: false,
    planbRisks: [],
    planbCrossRiskFlags: [],
  };
}
