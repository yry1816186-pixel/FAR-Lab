/**
 * conflict_analysis —— EVID-CONTRADICTION-001 的四类冲突检测层（确定性纯函数）。
 *
 * 宪法判据：「矛盾集、Simpson 类分层问题、单位冲突和时间版本冲突测试通过。」
 * 矛盾集已由 evidence_contract.structureContradictions + kernel R5 覆盖；本模块补齐其余三类的
 * 检测 + 聚合分类（一致/混合/证据不足/不可比较）。
 *
 * 设计红线（与 evidence_quality 模块一致）：
 *   - 透明度检测层：不进 verdict（R0-R9 不变）、不进 proofHash（VC 白名单不变）——
 *     检出结果供 orchestrator/report 消费：INCOMPARABLE 时不得聚合（宪法 Failure 分支）。
 *   - 纯函数、零 LLM、零 IO；「冲突不得通过平均分掩盖」由检测显式化（聚合掩盖 = 检测红）。
 *   - 本模块不能证明的：亚组划分本身的正确性（分组是研究设计决策，机器只检验给定分组的一致性）；
 *     单位换算因子的物理正确性（声明式信任，换算错误需外部核）。
 */

// ---------------------------------------------------------------------------
// 聚合四分类（宪法：一致/混合/证据不足/不可比较）
// ---------------------------------------------------------------------------

export type AggregationClass = 'consistent' | 'mixed' | 'insufficient' | 'incomparable';

export interface AggregationClassification {
  readonly klass: AggregationClass;
  readonly detail: string;
}

/**
 * 由证据方向集合 + 单位可比性 + 样本量分类聚合（确定性映射）。
 * 优先级：不可比较 > 混合 > 证据不足 > 一致（fail-closed：坏消息优先）。
 */
export function classifyAggregation(input: {
  readonly directions: readonly ('supports' | 'refutes' | 'neutral')[];
  readonly unitComparable: boolean;
  readonly sufficientPower: boolean;
}): AggregationClassification {
  if (!input.unitComparable) {
    return { klass: 'incomparable', detail: 'unit mismatch — aggregation blocked (averaging would mask incomparability)' };
  }
  const hasSupports = input.directions.includes('supports');
  const hasRefutes = input.directions.includes('refutes');
  if (hasSupports && hasRefutes) {
    return { klass: 'mixed', detail: 'supports and refutes coexist — must resolve to INCONCLUSIVE or scoped verdict, never averaged' };
  }
  if (!input.sufficientPower) {
    return { klass: 'insufficient', detail: 'statistical power insufficient — no aggregate claim' };
  }
  if (!hasSupports && !hasRefutes) {
    return { klass: 'insufficient', detail: 'no directional evidence (all neutral)' };
  }
  return { klass: 'consistent', detail: hasSupports ? 'all directional evidence supports' : 'all directional evidence refutes' };
}

// ---------------------------------------------------------------------------
// (b) Simpson 类分层问题
// ---------------------------------------------------------------------------

export interface StratificationSubgroup {
  readonly id: string;
  /** 亚组效应估计（与假设方向同符号约定：正 = 支持方向）。 */
  readonly estimate: number;
  readonly n: number;
}

export type StratificationFinding =
  | { readonly kind: 'STRATIFICATION_REVERSAL'; readonly detail: string }
  | { readonly kind: 'SUBGROUP_SIGN_CONFLICT'; readonly detail: string }
  | { readonly kind: 'INSUFFICIENT_STRATIFICATION'; readonly detail: string };

/** 最小亚组样本量（低于此值分层判定不成立——诚实回退而非弱判定）。 */
export const MIN_SUBGROUP_N = 10;

/**
 * Simpson 反转检测：各亚组效应符号一致、但与聚合估计符号相反 → 反转。
 * 亚组间符号互相冲突 → SUBGROUP_SIGN_CONFLICT（亚组异质，聚合必然误导）。
 * 任一亚组 n < 10 → INSUFFICIENT_STRATIFICATION（判定证据不足，不产反转结论）。
 */
export function detectStratificationReversal(input: {
  readonly subgroups: readonly StratificationSubgroup[];
  readonly aggregateEstimate: number;
  readonly zeroTolerance?: number;
}): StratificationFinding[] {
  const tol = input.zeroTolerance ?? 1e-9;
  const findings: StratificationFinding[] = [];
  if (input.subgroups.length < 2) {
    return [{ kind: 'INSUFFICIENT_STRATIFICATION', detail: 'fewer than 2 subgroups — stratification judgment not applicable' }];
  }
  const small = input.subgroups.filter((g) => g.n < MIN_SUBGROUP_N);
  if (small.length > 0) {
    findings.push({
      kind: 'INSUFFICIENT_STRATIFICATION',
      detail: `subgroup(s) ${small.map((g) => g.id).join(', ')} have n < ${MIN_SUBGROUP_N} — stratification judgment withheld`,
    });
    return findings;
  }
  const signs = input.subgroups.map((g) => Math.abs(g.estimate) <= tol ? 0 : Math.sign(g.estimate));
  const hasPos = signs.includes(1);
  const hasNeg = signs.includes(-1);
  if (hasPos && hasNeg) {
    findings.push({
      kind: 'SUBGROUP_SIGN_CONFLICT',
      detail: `subgroup effects conflict in sign (${input.subgroups.map((g) => `${g.id}:${g.estimate > 0 ? '+' : g.estimate < 0 ? '-' : '0'}`).join(' ')}) — aggregate is misleading`,
    });
  } else {
    // 亚组符号一致（全正或全负，忽略零）→ 与聚合符号比对
    const subSign = hasPos ? 1 : hasNeg ? -1 : 0;
    const aggSign = Math.abs(input.aggregateEstimate) <= tol ? 0 : Math.sign(input.aggregateEstimate);
    if (subSign !== 0 && aggSign !== 0 && subSign !== aggSign) {
      findings.push({
        kind: 'STRATIFICATION_REVERSAL',
        detail: `all subgroups ${subSign > 0 ? 'positive' : 'negative'} but aggregate ${aggSign > 0 ? 'positive' : 'negative'} — Simpson-class stratification problem`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// (c) 单位冲突
// ---------------------------------------------------------------------------

export interface UnitAnnotatedEvidence {
  readonly testId: string;
  /** 计量单位（如 'kg'、'accuracy'、'cohen_d'）；null = 未声明。 */
  readonly unit: string | null;
  /** 声明式换算（toUnit + factor）：unit × factor = toUnit 的量。 */
  readonly conversion?: { readonly toUnit: string; readonly factor: number };
}

export interface UnitConflictResult {
  readonly comparable: boolean;
  readonly normalizedUnit: string | null;
  readonly conflicts: readonly string[];
}

/**
 * 单位可比性检测：同一 claim 的证据集合，
 *   - 任一 unit 未声明 → 不可比（fail-closed：单位不明禁止聚合）；
 *   - 单位不同且无换算声明 → UNIT_MISMATCH；
 *   - 有换算 → 归一到同一单位后可比（换算因子物理正确性由外部核，本层信任声明）。
 */
export function detectUnitConflicts(items: readonly UnitAnnotatedEvidence[]): UnitConflictResult {
  const conflicts: string[] = [];
  const declared = items.filter((i) => i.unit !== null);
  const undeclared = items.filter((i) => i.unit === null);
  if (undeclared.length > 0) {
    conflicts.push(`undeclared unit on ${undeclared.map((i) => i.testId).join(', ')} — comparability unprovable`);
  }
  if (declared.length === 0) {
    return { comparable: false, normalizedUnit: null, conflicts };
  }
  const units = new Set(declared.map((i) => i.unit as string));
  if (units.size > 1) {
    // 基单位取首个声明单位：基单位项免换算，其余项必须声明到基单位的换算。
    const base = declared[0]!.unit as string;
    const convertible = declared
      .filter((i) => i.unit !== base)
      .every((i) => i.conversion !== undefined && i.conversion.toUnit === base);
    if (!convertible) {
      conflicts.push(`unit mismatch: ${[...units].join(' vs ')} without a declared conversion to the base unit '${base}'`);
    }
    return {
      comparable: conflicts.length === 0 && undeclared.length === 0,
      normalizedUnit: convertible ? base : null,
      conflicts,
    };
  }
  const single = [...units][0] as string;
  return { comparable: conflicts.length === 0, normalizedUnit: single, conflicts };
}

// ---------------------------------------------------------------------------
// (d) 时间版本冲突
// ---------------------------------------------------------------------------

export interface TemporalVersion {
  readonly id: string;
  readonly verdict: 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE' | 'DEGRADED_SCOPE' | 'UNTESTED';
  readonly recordedAt: string;
  /** 后继版本 id（supersede 链）；null = 该版本仍是活跃尾端。 */
  readonly supersededBy: string | null;
}

export type TemporalFinding =
  | { readonly kind: 'VERSION_AMBIGUITY'; readonly detail: string }
  | { readonly kind: 'CHURN_RISK'; readonly detail: string }
  | { readonly kind: 'TEMPORAL_FLIP_RETAINED'; readonly detail: string };

/** supersede 链深度超过此值 → churn 风险（证据基础不稳定）。 */
export const CHURN_CHAIN_DEPTH = 3;

/**
 * 时间版本冲突检测：
 *   VERSION_AMBIGUITY —— 同一 claim-evidence 对存在两条非 superseded 的不同裁决版本
 *                        （既非链也非覆盖——版本语义不明，不得静默取最新）；
 *   TEMPORAL_FLIP_RETAINED —— 链上出现裁决翻转（旧结论被 supersede 但**保留在矛盾集**，
 *                        时间历史不抹除——与 evidence_log append-only 一致）；
 *   CHURN_RISK —— 链深度 > CHURN_CHAIN_DEPTH（频繁翻转 = 证据基础不稳定信号）。
 */
export function detectTemporalConflicts(versions: readonly TemporalVersion[]): TemporalFinding[] {
  const findings: TemporalFinding[] = [];
  const byId = new Map(versions.map((v) => [v.id, v]));
  const supersededIds = new Set(
    versions.flatMap((v) => (v.supersededBy !== null ? [v.supersededBy] : [])),
  );
  const active = versions.filter((v) => !supersededIds.has(v.id));
  if (active.length > 1) {
    const verdicts = new Set(active.map((v) => v.verdict));
    if (verdicts.size > 1) {
      findings.push({
        kind: 'VERSION_AMBIGUITY',
        detail: `${active.length} active versions with differing verdicts (${active.map((v) => `${v.id}:${v.verdict}`).join(', ')}) — no supersede linkage, latest-wins is not allowed silently`,
      });
    }
  }
  // 链遍历（从头端=未被任何版本指向 supersededBy 的源头出发）
  const heads = versions.filter((v) => {
    const isSuperseded = supersededIds.has(v.id);
    return !isSuperseded && v.supersededBy !== null;
  });
  const chainFrom = (startId: string): TemporalVersion[] => {
    const chain: TemporalVersion[] = [];
    let cur: string | null = startId;
    while (cur !== null) {
      const v = byId.get(cur);
      if (v === undefined) break;
      chain.push(v);
      cur = v.supersededBy;
    }
    return chain;
  };
  for (const head of heads) {
    const chain = chainFrom(head.id);
    if (chain.length > CHURN_CHAIN_DEPTH) {
      findings.push({
        kind: 'CHURN_RISK',
        detail: `supersede chain depth ${chain.length} > ${CHURN_CHAIN_DEPTH} (${chain.map((v) => v.id).join('→')}) — unstable evidence base`,
      });
    }
    const flips = chain.slice(1).filter((v, i) => {
      const prev = chain[i] as TemporalVersion;
      return (prev.verdict === 'CONFIRMED' && v.verdict === 'REFUTED') ||
        (prev.verdict === 'REFUTED' && v.verdict === 'CONFIRMED');
    });
    if (flips.length > 0) {
      findings.push({
        kind: 'TEMPORAL_FLIP_RETAINED',
        detail: `verdict flip(s) on chain from ${head.id}: ${flips.map((f) => f.id).join(', ')} — history retained in the contradiction set, never averaged away`,
      });
    }
  }
  return findings;
}
