/**
 * verdict_kernel_v2 —— 确定性五值裁决内核（Deterministic Five-Value Verdict Kernel）。
 *
 * Authority: PROJECT_PLAN/03 §7（VerdictKernelInput/Output + R0-R9 伪代码）+ §7.4（evaluate_scope/statistics）+
 *            APPENDIX_B_GOLDEN §1（R0-R9 优先级 SSOT）+ §2（GV-01..GV-12）+ §4.1（浮点容差 1e-7）。
 *
 * 核心契约（F1-F9 红线）：
 *   - **全程无 LLM**：verdict 由 deterministic rule trace 产出，LLM evidence 不得直接升 CONFIRMED/REFUTED（F3）。
 *   - **R0-R9 固定优先级**：DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED（§6 F2 锁死）。
 *   - **首条决定性规则胜出**：tie-break sort evidence by (evidenceId, sourceHash), tests by testId（§6.3）。
 *   - **浮点容差 1e-7**：所有 verdict-critical 数值比较用同一容差（§7.3 line 892 + APPENDIX_B §4.1）。
 *
 * 关键裁决（与 SSOT 对齐）：
 *   1. evaluate_statistics 看所有 significant statistics 算 supports/refutes/conflicting（覆盖 GV-08 multi-implication 矛盾），
 *      primaryAdjustedPValue/primaryEffectSize 取 primary（testId === metricKey）。
 *   2. anti-theater：仅 `fail` → UNTESTED（§7.3 line 852 hasFail）；`warn` 归入 hasWarnAssumption → R8 INCONCLUSIVE。
 *   3. R7 加 `!hasWarnAssumption`（GV-01 反 theater 自检：WARN 不得 CONFIRMED）+ integrityFlags 空。
 *   4. mde（powerPlan.minimumDetectableEffect）optional：undefined → 跳过 effectSize gate（R7/R8）。
 *   5. seed cherry-pick（GV-12）：p_hacking_risk integrityFlag 阻断 R7 → R8 + SEED_CHERRY_PICK_WARN。
 *
 * 模型中立（R8/C1）：本文件无 qwen/dashscope 字面量，纯 deterministic 算法。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数（不读 DB · 不 mutate 输入）。
 */

import type { EvidenceDirection } from '../schema/enums.ts';
import type {
  FecContractV2,
  ScopeCoverage,
  VerdictKind,
} from '../fec/fec_contract.ts';
import { compileFec } from '../fec/compiler.ts';
import type { ClaimType, ConfoundingGateResult, EvidenceBasis } from '../confounding_gate/types.ts';
import { confoundingOutcomeVerdictEffect } from '../confounding_gate/adjudicate.ts';

// ===== 浮点比较（§7.3 line 892 + APPENDIX_B §4.1·容差 1e-7·三端一致）=====

export const VERDICT_FLOAT_TOLERANCE = 1e-7;

/** a ≤ b（含等号·容差防边界误判）：a ≤ b + 1e-7 → 视为 a ≤ b。 */
export function verdictLte(a: number, b: number): boolean {
  return a <= b + VERDICT_FLOAT_TOLERANCE;
}

/** a ≥ b：a ≥ b - 1e-7 → 视为 a ≥ b。 */
export function verdictGte(a: number, b: number): boolean {
  return a >= b - VERDICT_FLOAT_TOLERANCE;
}

// ===== 子类型（§7.1 VerdictKernelInput 字段 + §7.4 evaluate 输出）=====

/** 数据集绑定 spec（§3.1 DatasetBinding 简化·R2 消费 sourceAnchor.resolved）。 */
export interface DatasetBindingSpec {
  readonly datasetId: string;
  readonly contentHash: string;
  readonly sourceAnchor: { readonly resolved: boolean; readonly resolverRef?: string };
  readonly scopeCoverage: ScopeCoverage;
}

export type TestStatus = 'ran' | 'skipped' | 'failed';

export interface AssumptionDiagnostic {
  readonly kind: string; // 'distribution_drift' | 'normality' | 'heteroscedasticity' | ...
  readonly severity: 'warn' | 'critical';
}

/** 统计检验结果（EV·单个 test）。testId 须对应 FEC implication / metricKey。 */
export interface StatisticalResult {
  readonly testId: string;
  readonly status: TestStatus;
  readonly effectDirection: EvidenceDirection;
  readonly pValue?: number;
  readonly adjustedPValue?: number;
  readonly effectSizeObserved?: number;
  readonly confidenceInterval?: readonly [number, number];
  readonly assumptionDiagnostics: readonly AssumptionDiagnostic[];
}

/** 协议偏离（R3·critical → UNTESTED）。 */
export interface ProtocolDeviation {
  readonly kind: string; // 'alpha_rewrite' | 'metric_swap' | 'late_exclusion' | 'stopping_violation' | ...
  readonly severity: 'critical' | 'non-critical';
  readonly detectedAt?: string;
  readonly details?: string;
}

export type KernelAntiTheaterFindingSeverity = 'fail' | 'warn' | 'pass';

/**
 * 反剧场发现（kernel 输入投影型·§7.1 antiTheaterFindings·fail → UNTESTED·warn → R8 INCONCLUSIVE）。
 *
 * 重命名裁决（D1·类型统一）：本类型是 verdict kernel 的**输入投影型**，与 src/anti_theater/types.ts
 * 的存储型 AntiTheaterFinding（APPENDIX_A §7·7 字段）分离。投影由 src/anti_theater/adapters/kernel_adapter.ts
 * 的 toKernelFinding 完成（存储型 outcome → kernel severity / attackKind → kernel kind）。
 * 消费方（kernel）用 attackKind kebab-case 字面量（如 'seed-cherry-picking'）。
 */
export interface KernelAntiTheaterFinding {
  readonly kind: string; // attackKind kebab-case（'seed-cherry-picking' | 'metric-swapping' | ...）
  readonly severity: KernelAntiTheaterFindingSeverity;
  readonly details?: string;
}

/** 矛盾证据（R5/R6·crossesRefutationThreshold + sameScope → hasSameScopeRefutation）。 */
export interface ContradictionEvidence {
  readonly crossesRefutationThreshold: boolean;
  readonly sameScope: boolean;
}

export type CoverageRelation = 'full' | 'partial' | 'none';

/** scope 评估报告（§7.4 evaluate_scope 输出·R4/R6/R7 消费）。 */
export interface ScopeReport {
  readonly isDegraded: boolean;
  readonly coverage: CoverageRelation;
  readonly impactedScopeEdges: readonly ScopeCoverage[];
  readonly scopeSlipText: string | null;
  readonly hasSameScopeRefutation: boolean;
}

export type PowerStatus = 'adequate' | 'underpowered' | 'unknown';
export type EvidenceSufficiencyStatus = 'sufficient' | 'insufficient' | 'unknown';

/** 证据充分性（caller pre-compute·R7/R8 消费 powerStatus）。 */
export interface EvidenceSufficiencyReport {
  readonly status: EvidenceSufficiencyStatus;
  readonly powerStatus: PowerStatus;
}

export type EffectiveDirection = EvidenceDirection | 'unknown';

/** 统计聚合报告（§7.4 evaluate_statistics 输出·R5/R6/R7/R8 消费）。 */
export interface StatisticalReport {
  readonly refutes: boolean;
  readonly supports: boolean;
  readonly conflicting: boolean;
  readonly underpowered: boolean;
  readonly effectiveDirection: EffectiveDirection;
  readonly primaryAdjustedPValue: number | null;
  readonly primaryEffectSize: number | null;
  readonly primaryConfidenceInterval: readonly [number, number] | null;
  readonly hasWarnAssumption: boolean;
}

// ===== VerdictKernelInput / Output（§7.1 / §7.2）=====

export interface VerdictKernelInput {
  /** [VC] 被裁决的 FEC。null → R0/R1 → UNTESTED。 */
  readonly fec: FecContractV2 | null;
  /** [VC] 数据集绑定列表。空或全无效 → R2 → UNTESTED。 */
  readonly datasetBindings: readonly DatasetBindingSpec[];
  /** [EV] 统计结果列表（R5/R6/R7/R8 消费）。 */
  readonly statistics: readonly StatisticalResult[];
  /** [VC] 协议偏离列表。含 critical → R3 → UNTESTED。 */
  readonly protocolDeviations: readonly ProtocolDeviation[];
  /** [VC] 反剧场发现列表（kernel 输入投影型·由 anti_theater/adapters/kernel_adapter.ts toKernelFinding 投影）。fail → UNTESTED；warn → R8 INCONCLUSIVE。 */
  readonly antiTheaterFindings: readonly KernelAntiTheaterFinding[];
  /** [VC] 证据充分性（caller pre-compute·R7 status / R8 powerStatus）。 */
  readonly evidenceSufficiency: EvidenceSufficiencyReport;
  /** [VC] 矛盾证据集合（evaluate_scope 消费 hasSameScopeRefutation）。 */
  readonly contradictionSet: readonly ContradictionEvidence[];
  /** [VC] integrityFlags（R7 要求空·seed cherry-pick/metric swap 追加 p_hacking_risk）。 */
  readonly integrityFlags: readonly string[];
  /** [VC] claim 类型（22 T-W2-06·任务 #12）。'causal' 触发 R-causal ConfoundingGate（F6·§7.5:945）。缺省 → 非因果，R0-R9 cascade 字节不变。 */
  readonly claimType?: ClaimType;
  /** [VC] 证据基础（F6 红线·03 §7.5:961）。'observational_only' + ConfoundingGate FAIL → reasonCodes 追加 F6_CAUSAL_HONESTY。 */
  readonly evidenceBasis?: EvidenceBasis;
  /** [VC] ConfoundingGate 裁决（caller pre-compute via adjudicateConfounding·镜像 evidenceSufficiency 模式）。claimType='causal' 时由调用方提供；R7 判定前 R-causal 门消费。注：claimType 非哈希保护（kernel 输入提示·任务 #12 范围·ClaimEnvelope 哈希扩展延后）。 */
  readonly confoundingGateResult?: ConfoundingGateResult;
}

export interface VerdictRuleTrace {
  readonly ruleId: string;
  readonly triggered: boolean;
  readonly details?: string;
}

export interface VerdictKernelOutput {
  readonly verdict: VerdictKind;
  readonly reasonCodes: readonly string[];
  readonly ruleTrace: readonly VerdictRuleTrace[];
  readonly decisiveRuleId: string;
  readonly scopeReport: ScopeReport;
  readonly statisticalReport: StatisticalReport;
  readonly evidenceSufficiency: EvidenceSufficiencyReport;
  readonly untestedReason: string | null;
  readonly integrityFlags: readonly string[];
  /** CONFIRMED 时 true（bounded support·非科学真理）。 */
  readonly boundedSupport: boolean;
}

// ===== 内核入口（§7.3 R0-R9 决策树）=====

/**
 * decideFiveValueVerdict —— 确定性五值裁决（§7.3）。
 * 全程无 LLM；按 R0..R9 固定优先级，首条决定性规则胜出。
 */
export function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput {
  const inputIntegrityFlags = [...input.integrityFlags];
  const emptyScope: ScopeReport = {
    isDegraded: false,
    coverage: 'none',
    impactedScopeEdges: [],
    scopeSlipText: null,
    hasSameScopeRefutation: false,
  };
  const emptyStat: StatisticalReport = {
    refutes: false,
    supports: false,
    conflicting: false,
    underpowered: false,
    effectiveDirection: 'unknown',
    primaryAdjustedPValue: null,
    primaryEffectSize: null,
    primaryConfidenceInterval: null,
    hasWarnAssumption: false,
  };

  // ── R0 schema invalid（contractVersion 不被 verifier 支持·§1 line 45：fec 非 null 时）──
  // 注意：fec===null 归 R1（未提交），R0 仅捕获 contractVersion 结构不支持（如 'FEC/1.0'）。
  if (input.fec !== null && input.fec.contractVersion !== 'FEC/2.0') {
    return makeOutput('UNTESTED', ['R0_SCHEMA_INVALID'], 'R0_SCHEMA_INVALID', {
      scopeReport: emptyScope,
      statisticalReport: emptyStat,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags: inputIntegrityFlags,
      untestedReason: 'SCHEMA_INVALID',
    });
  }

  // ── R1 FEC not compilable（fec===null 未提交·或 compileFec HARD_FAIL·GV-03）──
  const compiledFec = input.fec === null ? null : compileFec({ fec: input.fec });
  if (compiledFec === null || !compiledFec.ok) {
    return makeOutput('UNTESTED', ['R1_FEC_NOT_COMPILABLE'], 'R1_FEC_NOT_COMPILABLE', {
      scopeReport: emptyScope,
      statisticalReport: emptyStat,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags: inputIntegrityFlags,
      untestedReason: 'FEC_NOT_READY',
    });
  }

  const fec = compiledFec.fec;
  const integrityFlags = mergeIntegrityFlags(inputIntegrityFlags, compiledFec.plan.integrityFlags);

  // ── R2 no valid dataset binding ──
  if (!hasValidDatasetBinding(input)) {
    return makeOutput('UNTESTED', ['R2_NO_VALID_DATASET_BINDING'], 'R2_NO_VALID_DATASET_BINDING', {
      scopeReport: emptyScope,
      statisticalReport: emptyStat,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
      untestedReason: 'EVIDENCE_MISSING',
    });
  }

  // ── R3 critical protocol deviation（post-hoc alpha / metric swap / late exclusion / stopping 违反）──
  const criticalDeviations = input.protocolDeviations.filter((d) => d.severity === 'critical');
  if (criticalDeviations.length > 0) {
    for (const d of criticalDeviations) {
      if (d.kind === 'alpha_rewrite' && !integrityFlags.includes('harking_risk')) {
        integrityFlags.push('harking_risk');
      }
      if (d.kind === 'metric_swap' && !integrityFlags.includes('p_hacking_risk')) {
        integrityFlags.push('p_hacking_risk');
      }
    }
    const scopeReport = evaluateScope(input);
    const statisticalReport = evaluateStatistics(input);
    const extraCodes = criticalDeviations.map((d) => deviationReasonCode(d.kind));
    return makeOutput('UNTESTED', ['R3_CRITICAL_PROTOCOL_DEVIATION', ...extraCodes], 'R3_CRITICAL_PROTOCOL_DEVIATION', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
      untestedReason: 'CRITICAL_DEVIATION',
    });
  }

  // 评估 scope / statistics（确定性产出·供 R4-R9 消费）。
  const scopeReport = evaluateScope(input);
  const statisticalReport = evaluateStatistics(input);
  const alpha = fec.statisticalPlan.alpha;
  const mde = fec.powerPlan?.minimumDetectableEffect;

  // ── R4 scope mismatch noncritical（无同 scope 显著反证·否则升 R6）──
  if (scopeReport.isDegraded && !scopeReport.hasSameScopeRefutation) {
    const driftCodes = scopeDriftCodes(input);
    return makeOutput('DEGRADED_SCOPE', ['R4_SCOPE_MISMATCH_NONCRITICAL', ...driftCodes], 'R4_SCOPE_MISMATCH_NONCRITICAL', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
    });
  }

  // ── anti-theater hasFail（§7.3 line 852·FAIL → UNTESTED）──
  if (input.antiTheaterFindings.some((f) => f.severity === 'fail')) {
    return makeOutput('UNTESTED', ['ANTI_THEATER_FAIL'], 'ANTI_THEATER_FAIL', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
      untestedReason: 'ANTI_THEATER_FAIL',
    });
  }

  // ── R5 contradictory significant evidence（support 与 refute 均显著·GV-08）──
  if (statisticalReport.conflicting) {
    return makeOutput('INCONCLUSIVE', ['R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE'], 'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
    });
  }

  // ── R6 primary test refutes（adjustedP ≤ α 且 direction=refutes·GV-02）──
  if (statisticalReport.refutes) {
    return makeOutput('REFUTED', ['R6_PRIMARY_TEST_REFUTES'], 'R6_PRIMARY_TEST_REFUTES', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
    });
  }

  // ── R7 primary test confirms（所有 hard gate PASS·GV-01）──
  const r7Pass =
    statisticalReport.supports &&
    statisticalReport.primaryAdjustedPValue !== null &&
    verdictLte(statisticalReport.primaryAdjustedPValue, alpha) &&
    statisticalReport.primaryEffectSize !== null &&
    (mde === undefined || verdictGte(statisticalReport.primaryEffectSize, mde)) &&
    input.evidenceSufficiency.status === 'sufficient' &&
    !scopeReport.hasSameScopeRefutation &&
    integrityFlags.length === 0 &&
    !statisticalReport.hasWarnAssumption;

  // ── R-causal ConfoundingGate（F6·§7.5:945·R7 CONFIRMED 判定前的因果门）──
  // 仅 claimType='causal' 且 caller 提供了 confoundingGateResult 时触发；非因果 claim 双重 guard 短路 → no-op → R0-R9 cascade 字节不变（零回归）。
  // outcome→verdict 经 confoundingOutcomeVerdictEffect（决策 D·与 science_harness 共用同一 SSOT 表）：
  //   FAIL → DEGRADED_SCOPE（F2 优先级 > CONFIRMED·observational_only 追加 F6_CAUSAL_HONESTY reasonCode）。
  //   WARN + r7Pass（本会 CONFIRMED）→ INCONCLUSIVE（降级）。
  //   WARN + !r7Pass / PASS → no-op（落正常 R7-R9）。
  if (input.claimType === 'causal' && input.confoundingGateResult !== undefined) {
    const causalEffect = confoundingOutcomeVerdictEffect(
      input.confoundingGateResult.outcome,
      input.evidenceBasis,
      r7Pass,
    );
    if (causalEffect.verdictEffect === 'degrade_to_degraded_scope') {
      // R-causal 降级是 scope 降级的一种（可证伪的因果 scope 窄于观测关联 scope）：附 confounding rationale
      // 作 scopeSlipText，使 recordVerdict（要求 DEGRADED_SCOPE 非空 scopeSlipText）可持久化——
      // R-causal 路径此前只经 kernel 外 decideVerdictWithConfounding 单测，未端到端接到 recordVerdict/seal。
      // rationale 由 adjudicateConfounding→generateRationale 确定性产出（CG-6 纯模板·非空·非 LLM）。
      const causalScopeReport: ScopeReport = {
        ...scopeReport,
        isDegraded: true,
        scopeSlipText: input.confoundingGateResult.rationale,
      };
      return makeOutput('DEGRADED_SCOPE', causalEffect.reasonCodes, 'R_CAUSAL_CONFOUNDING_FAIL', {
        scopeReport: causalScopeReport,
        statisticalReport,
        evidenceSufficiency: input.evidenceSufficiency,
        integrityFlags,
      });
    }
    if (causalEffect.verdictEffect === 'downgrade_to_inconclusive') {
      return makeOutput('INCONCLUSIVE', causalEffect.reasonCodes, 'R_CAUSAL_CONFOUNDING_WARN', {
        scopeReport,
        statisticalReport,
        evidenceSufficiency: input.evidenceSufficiency,
        integrityFlags,
      });
    }
    // verdictEffect==='none'（PASS·或 WARN+!r7Pass）→ 落正常 R7-R9 cascade。
  }

  if (r7Pass) {
    return makeOutput('CONFIRMED', ['R7_PRIMARY_TEST_CONFIRMS'], 'R7_PRIMARY_TEST_CONFIRMS', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
      boundedSupport: true,
    });
  }

  // ── R8 insufficient power or null（adjusted p > α / underpowered / effect 太小 / warn assumption / p_hacking 残留）──
  const r8Trigger =
    (statisticalReport.primaryAdjustedPValue !== null && !verdictLte(statisticalReport.primaryAdjustedPValue, alpha)) ||
    input.evidenceSufficiency.powerStatus === 'underpowered' ||
    (statisticalReport.primaryEffectSize !== null && mde !== undefined && !verdictGte(statisticalReport.primaryEffectSize, mde)) ||
    statisticalReport.hasWarnAssumption ||
    integrityFlags.includes('p_hacking_risk');
  if (r8Trigger) {
    const codes = ['R8_INSUFFICIENT_POWER_OR_NULL'];
    if (input.antiTheaterFindings.some((f) => f.kind === 'seed-cherry-picking')) {
      codes.push('SEED_CHERRY_PICK_WARN');
    }
    return makeOutput('INCONCLUSIVE', codes, 'R8_INSUFFICIENT_POWER_OR_NULL', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
    });
  }

  // ── R9 all tests skipped（FEC 可编译·dataset 已绑·无 critical deviation·GV 隐含）──
  if (input.statistics.length > 0 && input.statistics.every((s) => s.status === 'skipped')) {
    return makeOutput('UNTESTED', ['R9_ALL_TESTS_SKIPPED'], 'R9_ALL_TESTS_SKIPPED', {
      scopeReport,
      statisticalReport,
      evidenceSufficiency: input.evidenceSufficiency,
      integrityFlags,
      untestedReason: 'NO_DECISION_PATH',
    });
  }

  return makeOutput('UNTESTED', ['NO_DECISION_PATH'], 'NO_DECISION_PATH', {
    scopeReport,
    statisticalReport,
    evidenceSufficiency: input.evidenceSufficiency,
    integrityFlags,
    untestedReason: 'NO_DECISION_PATH',
  });
}

// ===== 辅助评估函数（§7.4）=====

/** evaluate_scope（§7.4 line 897）：评估证据 scope 是否窄于 claim scope。 */
export function evaluateScope(input: VerdictKernelInput): ScopeReport {
  if (input.fec === null) {
    return {
      isDegraded: false,
      coverage: 'none',
      impactedScopeEdges: [],
      scopeSlipText: null,
      hasSameScopeRefutation: false,
    };
  }
  const evidenceScope = input.datasetBindings.map((b) => b.scopeCoverage);
  // scope 部分：任一 binding scopeCoverage.relation != 'within' → 窄于 claim（GV-05）。
  const scopePartial = evidenceScope.some((s) => s.relation !== 'within');
  // dataset drift warn → scope 收窄（GV-06）。
  const driftWarn = input.statistics.some((s) =>
    s.assumptionDiagnostics.some((d) => d.kind === 'distribution_drift' && d.severity === 'warn'),
  );
  const isDegraded = scopePartial || driftWarn;
  const coverage: CoverageRelation = evidenceScope.length === 0 ? 'none' : isDegraded ? 'partial' : 'full';
  const impacted = evidenceScope.filter((s) => s.relation !== 'within');
  const hasSameScopeRefutation = input.contradictionSet.some((c) => c.crossesRefutationThreshold && c.sameScope);
  return {
    isDegraded,
    coverage,
    impactedScopeEdges: impacted,
    scopeSlipText: isDegraded ? renderScopeSlip(impacted, driftWarn) : null,
    hasSameScopeRefutation,
  };
}

/** evaluate_statistics（§7.4 line 919）：聚合统计结果。 */
export function evaluateStatistics(input: VerdictKernelInput): StatisticalReport {
  if (input.fec === null) {
    return {
      refutes: false,
      supports: false,
      conflicting: false,
      underpowered: false,
      effectiveDirection: 'unknown',
      primaryAdjustedPValue: null,
      primaryEffectSize: null,
      primaryConfidenceInterval: null,
      hasWarnAssumption: false,
    };
  }
  const alpha = input.fec.statisticalPlan.alpha;
  const metricKey = input.fec.metric.metricKey;
  const all = input.statistics;
  const primary = all.filter((s) => s.testId === metricKey);

  // supports/refutes 看所有 significant statistics（覆盖 GV-08 multi-implication 跨 test 矛盾）。
  const significant = all.filter((s) => s.adjustedPValue !== undefined && verdictLte(s.adjustedPValue, alpha));
  const supports = significant.some((s) => s.effectDirection === 'supports');
  const refutes = significant.some((s) => s.effectDirection === 'refutes');
  const conflicting = supports && refutes;
  const underpowered = input.evidenceSufficiency.powerStatus === 'underpowered';
  // hasWarnAssumption：statistical warn + anti-theater warn（GV-01 自检 / GV-12 seed cherry-pick）。
  const hasWarnAssumption =
    all.some((s) => s.assumptionDiagnostics.some((d) => d.severity === 'warn')) ||
    input.antiTheaterFindings.some((f) => f.severity === 'warn');

  const primaryFirst = primary[0];
  const effectiveDirection: EffectiveDirection = supports ? 'supports' : refutes ? 'refutes' : 'unknown';

  return {
    refutes,
    supports,
    conflicting,
    underpowered,
    effectiveDirection,
    primaryAdjustedPValue: primaryFirst?.adjustedPValue ?? null,
    primaryEffectSize: primaryFirst?.effectSizeObserved ?? null,
    primaryConfidenceInterval: primaryFirst?.confidenceInterval ?? null,
    hasWarnAssumption,
  };
}

// ===== 内部 helpers =====

function makeOutput(
  verdict: VerdictKind,
  reasonCodes: readonly string[],
  decisiveRuleId: string,
  ctx: {
    readonly scopeReport: ScopeReport;
    readonly statisticalReport: StatisticalReport;
    readonly evidenceSufficiency: EvidenceSufficiencyReport;
    readonly integrityFlags: readonly string[];
    readonly untestedReason?: string;
    readonly boundedSupport?: boolean;
  },
): VerdictKernelOutput {
  return {
    verdict,
    reasonCodes,
    ruleTrace: [{ ruleId: decisiveRuleId, triggered: true }],
    decisiveRuleId,
    scopeReport: ctx.scopeReport,
    statisticalReport: ctx.statisticalReport,
    evidenceSufficiency: ctx.evidenceSufficiency,
    untestedReason: ctx.untestedReason ?? null,
    integrityFlags: ctx.integrityFlags,
    boundedSupport: ctx.boundedSupport ?? false,
  };
}

/** any_valid_dataset_binding（§7.3 line 827）：任一 binding sourceAnchor.resolved=true。 */
function hasValidDatasetBinding(input: VerdictKernelInput): boolean {
  return input.datasetBindings.some((b) => b.sourceAnchor.resolved);
}

function mergeIntegrityFlags(
  inputFlags: readonly string[],
  compiledFlags: readonly string[],
): string[] {
  const merged = [...inputFlags];
  for (const flag of compiledFlags) {
    if (!merged.includes(flag)) {
      merged.push(flag);
    }
  }
  return merged;
}

/** scope_drift_codes（§7.3 line 847）：R4 额外 reasonCode（GV-06 DATASET_DRIFT_WARN）。 */
function scopeDriftCodes(input: VerdictKernelInput): string[] {
  const codes: string[] = [];
  if (
    input.statistics.some((s) => s.assumptionDiagnostics.some((d) => d.kind === 'distribution_drift'))
  ) {
    codes.push('DATASET_DRIFT_WARN');
  }
  return codes;
}

/** deviationReasonCode：critical deviation kind → reasonCode（GV-09 ALPHA_REWRITE_DETECTED / GV-11 METRIC_SWAP_DETECTED）。 */
function deviationReasonCode(kind: string): string {
  switch (kind) {
    case 'alpha_rewrite':
      return 'ALPHA_REWRITE_DETECTED';
    case 'metric_swap':
      return 'METRIC_SWAP_DETECTED';
    default:
      return `${kind.toUpperCase()}_DETECTED`;
  }
}

/** render_scope_slip（§7.4 line 912）：degraded 时产非空 scopeSlipText（R4 输出要求）。 */
function renderScopeSlip(impacted: readonly ScopeCoverage[], driftWarn: boolean): string {
  const parts = impacted
    .map((s) => `${s.dimension}=${s.value}(${s.relation})`)
    .filter((p) => p.length > 0);
  if (driftWarn) {
    parts.push('dataset distribution drift');
  }
  return parts.length > 0 ? `scope narrowed: ${parts.join('; ')}` : 'scope narrowed';
}
