// src/evaluation/pareto.ts
// 职责：EVAL-PARETO-001 质量-成本-延迟（能耗/算力）共同评价的 Pareto 机器层。
//
// 宪法条款：报告质量–成本、质量–延迟和质量–能耗/算力的 Pareto 前沿或
// 等价比较；只提高质量但使实际使用不可持续的方案需要明确权衡；同条件
// cost accounting、缓存披露和敏感性分析通过；Failure：不得称为无条件改进。
//
// 机制：
//   paretoDominates / paretoFrontier   支配关系（质量最大化 + 成本/延迟/
//                                      能耗最小化）与非支配前沿（确定性：
//                                      输出按 id 排序）
//   costAccountingCheck               同条件检查（不同 condition 标签的条目
//                                      不可直接比较）+ 缓存披露检查（缓存/
//                                      非缓存混排必须显式标记）
//   frontierSensitivity               质量扰动 ±delta 下前沿成员资格稳定性
//   improvementClaimGate              「改进」声称门：非前沿点不得称为改进；
//                                      前沿点也只能声称「记录条件下 Pareto
//                                      最优」，不得声称无条件改进
//
// 确定性纪律：纯函数；浮点比较用显式 epsilon；无迭代顺序依赖（排序后输出）。
//
// Cannot-prove：本机制证明「在所供给的质量/成本/延迟数值上支配关系与前沿
// 计算正确」，不证明 (a) 供给数值本身准确（测量口径由供给方负责——
// costAccountingCheck 只能检查条件标签一致性，不能验证实验室温度）；
// (b) 未记录的第三轴权衡（如安全性/可维护性不在目标轴内时，前沿最优
// 不等于全局最优）；(c) 能耗数值的真实性（energyKwh 是声明值）。

/** 浮点比较容差（支配关系的严格性以 epsilon 保护，避免浮点噪声制造伪支配）。 */
export const PARETO_EPSILON = 1e-9;

/** 最小化轴（成本面）——目标轴 quality 恒为最大化。 */
export const PARETO_COST_AXES = ['costUsd', 'latencyMs', 'energyKwh'] as const;
export type ParetoCostAxis = (typeof PARETO_COST_AXES)[number];

export interface ParetoCandidate {
  readonly id: string;
  /** 质量分（越大越好）。 */
  readonly quality: number;
  /** 成本 USD（越小越好；缺失 = 该候选未记录此轴）。 */
  readonly costUsd?: number;
  /** 延迟 ms（越小越好）。 */
  readonly latencyMs?: number;
  /** 能耗 kWh（越小越好；声明值）。 */
  readonly energyKwh?: number;
  /** 成本核算条件标签（模型配置/硬件/batch 等同条件标识）。 */
  readonly condition: string;
  /** 是否命中缓存（缓存命中的成本与冷成本不可直接比）。 */
  readonly cacheUsed: boolean;
}

// ---------------------------------------------------------------------------
// 支配关系与前沿
// ---------------------------------------------------------------------------

/**
 * a 支配 b：quality(a) ≥ quality(b) 且在全部可比成本轴上 a ≤ b，且至少
 * 一轴严格优（超出 epsilon）。任一轴在 a/b 间缺失（一方有一方无）→
 * 不可比较（返回 false——缺数据不得推定优势，fail-closed）。
 */
export function paretoDominates(a: ParetoCandidate, b: ParetoCandidate): boolean {
  if (a.quality + PARETO_EPSILON < b.quality) return false;
  let strictlyBetter = a.quality > b.quality + PARETO_EPSILON;
  for (const axis of PARETO_COST_AXES) {
    const va = a[axis];
    const vb = b[axis];
    if (va === undefined || vb === undefined) return false; // 轴覆盖不全 → 不可比
    if (va > vb + PARETO_EPSILON) return false;
    if (va + PARETO_EPSILON < vb) strictlyBetter = true;
  }
  return strictlyBetter;
}

export interface FrontierReport {
  /** 非支配前沿（按 id 排序——确定性输出）。 */
  readonly frontier: readonly ParetoCandidate[];
  /** 被支配点及其支配者（按 id 排序）。 */
  readonly dominated: readonly { readonly id: string; readonly dominatedBy: readonly string[] }[];
  /** 参与比较的轴（全部候选都有值的成本轴；空 = 只有质量轴，前沿无意义）。 */
  readonly comparedAxes: readonly ParetoCostAxis[];
  /** 轴覆盖不完整（部分候选缺该轴）→ 该轴被排除出比较，如实列出。 */
  readonly excludedAxes: readonly ParetoCostAxis[];
  readonly ok: boolean;
}

/**
 * Pareto 前沿。只在本体（全部候选均有值）成本轴上比较；被任何轴覆盖
 * 不完整排除后无可比成本轴 → ok=false（纯质量排序不是 Pareto 分析）。
 */
export function paretoFrontier(candidates: readonly ParetoCandidate[]): FrontierReport {
  if (candidates.length === 0) {
    return { frontier: [], dominated: [], comparedAxes: [], excludedAxes: [...PARETO_COST_AXES], ok: false };
  }
  const comparedAxes = PARETO_COST_AXES.filter((axis) => candidates.every((c) => c[axis] !== undefined));
  const excludedAxes = PARETO_COST_AXES.filter((axis) => !comparedAxes.includes(axis));
  if (comparedAxes.length === 0) {
    return { frontier: [], dominated: [], comparedAxes, excludedAxes, ok: false };
  }
  const dominated: { id: string; dominatedBy: string[] }[] = [];
  const frontier: ParetoCandidate[] = [];
  for (const c of candidates) {
    const dominators = candidates.filter((o) => o.id !== c.id && paretoDominates(o, c));
    if (dominators.length === 0) frontier.push(c);
    else dominated.push({ id: c.id, dominatedBy: dominators.map((d) => d.id).sort() });
  }
  frontier.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  dominated.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { frontier, dominated, comparedAxes, excludedAxes, ok: true };
}

// ---------------------------------------------------------------------------
// 同条件成本核算 + 缓存披露
// ---------------------------------------------------------------------------

export type CostAccountingVerdict =
  | { readonly ok: true; readonly conditions: readonly string[]; readonly cacheMixed: boolean }
  | { readonly ok: false; readonly reason: string; readonly conditions: readonly string[]; readonly cacheMixed: boolean };

/**
 * 同条件检查：混条件（>1 个 condition 标签）→ 不可直接比较（fail-closed）；
 * 缓存混排（部分 cacheUsed=true 部分 false）→ 必须显式披露标记
 * （cacheMixed=true 由调用方呈现为披露义务，不静默）。
 */
export function costAccountingCheck(candidates: readonly ParetoCandidate[]): CostAccountingVerdict {
  const conditions = [...new Set(candidates.map((c) => c.condition))].sort();
  const cacheMixed = candidates.some((c) => c.cacheUsed) && candidates.some((c) => !c.cacheUsed);
  if (conditions.length > 1) {
    return {
      ok: false,
      reason: `cross-condition comparison blocked: ${conditions.length} distinct cost-accounting conditions (${conditions.join(', ')}) — rerun under one condition or report per-condition frontiers separately`,
      conditions,
      cacheMixed,
    };
  }
  return { ok: true, conditions, cacheMixed };
}

// ---------------------------------------------------------------------------
// 敏感性分析：质量扰动下的前沿成员稳定性
// ---------------------------------------------------------------------------

export interface SensitivityEntry {
  readonly id: string;
  /** 各扰动档位下仍在前沿的比例（1 = 全扰动稳定；低 = 边界脆弱点）。 */
  readonly stability: number;
  /** 逐档位在前沿与否（与 deltas 一一对应）。 */
  readonly onFrontierPerDelta: readonly boolean[];
}

/**
 * 敏感性分析：对每个候选，把其质量分 ±各档位扰动后重算前沿，报告成员
 * 资格稳定性。稳定性低的「改进」声称对测量噪声敏感——不应作为结论。
 */
export function frontierSensitivity(
  candidates: readonly ParetoCandidate[],
  deltas: readonly number[] = [-0.02, -0.01, 0.01, 0.02],
): readonly SensitivityEntry[] {
  return [...candidates]
    .sort((x, y) => (x.id < y.id ? -1 : 1))
    .map((c) => {
      const flags = deltas.map((d) => {
        const perturbed = candidates.map((o) => (o.id === c.id ? { ...o, quality: o.quality + d } : o));
        const report = paretoFrontier(perturbed);
        return report.frontier.some((f) => f.id === c.id);
      });
      return { id: c.id, stability: flags.filter(Boolean).length / deltas.length, onFrontierPerDelta: flags };
    });
}

// ---------------------------------------------------------------------------
// 改进声称门
// ---------------------------------------------------------------------------

export type ImprovementClaim =
  | { readonly ok: true; readonly conditionalClaim: string }
  | { readonly ok: false; readonly reason: string; readonly dominatedBy: readonly string[] };

/**
 * 改进声称门：
 *   - 被支配点：不得称为改进（有更便宜且不差的同条件方案）；
 *   - 前沿点：只能声称「记录条件下 Pareto 最优」——宪法禁「无条件改进」。
 * 前提：frontier report 必须来自同条件成本核算（accounting.ok=false 时
 * 一切比较无效 → 拒绝门）。
 */
export function improvementClaimGate(
  candidateId: string,
  candidates: readonly ParetoCandidate[],
): ImprovementClaim {
  const candidate = candidates.find((c) => c.id === candidateId);
  if (candidate === undefined) {
    return { ok: false, reason: `candidate "${candidateId}" not present in the compared set`, dominatedBy: [] };
  }
  const accounting = costAccountingCheck(candidates);
  if (!accounting.ok) {
    return { ok: false, reason: `cost accounting failed: ${accounting.reason}`, dominatedBy: [] };
  }
  const report = paretoFrontier(candidates);
  if (!report.ok) {
    return { ok: false, reason: 'no common cost axis across all candidates — Pareto comparison undefined', dominatedBy: [] };
  }
  const dominatedEntry = report.dominated.find((d) => d.id === candidateId);
  if (dominatedEntry !== undefined) {
    return {
      ok: false,
      reason: `candidate "${candidateId}" is dominated by ${dominatedEntry.dominatedBy.join(', ')} under condition "${candidate.condition}" — not an improvement at any operating point`,
      dominatedBy: dominatedEntry.dominatedBy,
    };
  }
  return {
    ok: true,
    conditionalClaim: `Pareto-optimal under recorded condition "${candidate.condition}" on axes [quality↑, ${report.comparedAxes.join('↓')}] — NOT an unconditional improvement`,
  };
}
