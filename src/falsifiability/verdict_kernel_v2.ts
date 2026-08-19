/**
 * verdict_kernel_v2 —— 确定性五值裁决内核（Deterministic Five-Value Verdict Kernel）。
 *
 * 核心契约（F1-F9 红线）：
 *   - **全程无 LLM**：verdict 由 deterministic rule trace 产出，LLM evidence 不得直接升 CONFIRMED/REFUTED（F3）。
 *   - **五值语义三轴(单一合同·C-1)**: 值序(展示/文档严重度序)DEGRADED_SCOPE > REFUTED > INCONCLUSIVE >
 *     CONFIRMED > UNTESTED ≠ 规则序(决策表实现权威·首条决定性规则胜出·R0→R9 顺序扫描)。
 *     R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE(→INCONCLUSIVE)在 R6_PRIMARY_TEST_REFUTES(→REFUTED)
 *     之前触发——矛盾显著证据 → INCONCLUSIVE 是保守设计, 不是「REFUTED 优先」。三轴权威定义见
 *     verdict_semantics.ts(合同版本号进信封 rulePriorityTableHash 哈希输入)。
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
import { gradeEvidenceQuality } from '../evidence_quality/grader.ts';
import type { EvidenceTier, RobAssessment, StudyDesign } from '../evidence_quality/types.ts';

// ===== 浮点比较（§7.3 line 892 + APPENDIX_B §4.1·容差 1e-7·三端一致）=====

/** Float comparison tolerance for all verdict-critical numeric comparisons (§7.3 + APPENDIX_B §4.1). Ensures three-platform consistency. */
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

/** Status of a single statistical test execution: ran, skipped, or failed. */
export type TestStatus = 'ran' | 'skipped' | 'failed';

/**
 * A diagnostic for a statistical assumption check (e.g. normality, distribution drift,
 * heteroscedasticity). `warn` severity triggers R8 INCONCLUSIVE; `critical` is not used
 * by the kernel directly but reserved for future expansion.
 */
export interface AssumptionDiagnostic {
  readonly kind: string; // 'distribution_drift' | 'normality' | 'heteroscedasticity' | ...
  readonly severity: 'warn' | 'critical';
}

/**
 * FUSION-OS-7：执行资源指纹三元组（Open Science per-cell resource 三元组范式·非 bit-exact）。
 *
 * wall=墙钟 / cpu=用户脚本 CPU 时间（time.process_time·排除 sleep/wait）/ peak_rss=峰值驻留集。
 * 首次执行记录为 StatisticalResult.executionFingerprint 基线；复算观测三元组与之比对，
 * 任一维度量级差异 > EXECUTION_FINGERPRINT_MAGNITUDE_THRESHOLD（默认 10x）→ 结果不可复现 → DEGRADED_SCOPE。
 * 0 = 未测量（Windows peak_rss / 类型层 caller 未提供）：比对视为不可比，不触发 mismatch（诚实降级·无误报）。
 */
export interface ExecutionFingerprint {
  readonly wallMs: number;
  readonly cpuMs: number;
  readonly peakRssKb: number;
}

/** FUSION-OS-7：量级差异阈值（>10x 视为复算资源轮廓发散·Open Science per-cell 范式）。 */
export const EXECUTION_FINGERPRINT_MAGNITUDE_THRESHOLD = 10;

/**
 * FUSION-OS-7：比对基线与复算观测的执行指纹，任一可比维度量级差异 > threshold → true。
 *
 * 纯函数（无 IO·无 LLM·确定性）。0 = 未测量 → 该维度不可比 → 不触发（防 Windows peak_rss=0 误报）。
 * caller（orchestrator）pre-compute 后设 VerdictKernelInput.executionFingerprintMismatch，镜像 OS-1 antiTheater 模式。
 */
export function flagExecutionFingerprintMagnitudeMismatch(
  baseline: ExecutionFingerprint,
  observed: ExecutionFingerprint,
  threshold: number = EXECUTION_FINGERPRINT_MAGNITUDE_THRESHOLD,
): boolean {
  return (
    magnitudeRatioExceeds(baseline.wallMs, observed.wallMs, threshold) ||
    magnitudeRatioExceeds(baseline.cpuMs, observed.cpuMs, threshold) ||
    magnitudeRatioExceeds(baseline.peakRssKb, observed.peakRssKb, threshold)
  );
}

/** 任一端 ≤ 0（未测量）→ 不可比 → false；否则 max/min > threshold → true。 */
function magnitudeRatioExceeds(a: number, b: number, threshold: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = a > b ? a / b : b / a;
  return ratio > threshold;
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
  /** FUSION-OS-13：值派生形式。与 FEC statisticalPlan.expectedDerivationForm 不一致 → formMismatch（值相等也降级）。optional·缺省零回归。 */
  readonly derivationForm?: 'literal' | 'derived' | 'formula' | 'auto';
  /** FUSION-OS-7：首次执行资源指纹基线。复算时 caller 比对观测三元组，量级差异>10x → executionFingerprintMismatch → DEGRADED_SCOPE。optional·缺省零回归。 */
  readonly executionFingerprint?: ExecutionFingerprint;
}

/** 协议偏离（R3·critical → UNTESTED）。 */
export interface ProtocolDeviation {
  readonly kind: string; // 'alpha_rewrite' | 'metric_swap' | 'late_exclusion' | 'stopping_violation' | ...
  readonly severity: 'critical' | 'non-critical';
  readonly detectedAt?: string;
  readonly details?: string;
}

/** Severity of a kernel-projected anti-theater finding: `fail` → UNTESTED, `warn` → R8 INCONCLUSIVE, `pass` → no effect. */
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

/** identifier 声明（R-identifier-fabrication·FUSION-OS-14）。claim 带可校验 identifier 但系统侧 trace 无果 → REFUTED。 */
export interface IdentifierClaim {
  readonly kind: 'doi' | 'arxiv' | 'accession' | 'author_year';
  readonly value: string;
  readonly resolutionStatus: 'resolved' | 'not_found' | 'unresolved';
  readonly harnessVerifiedSource: boolean;
}

/** How completely the evidence covers the claim's scope: full, partial, or none. */
export type CoverageRelation = 'full' | 'partial' | 'none';

/** scope 评估报告（§7.4 evaluate_scope 输出·R4/R6/R7 消费）。 */
export interface ScopeReport {
  readonly isDegraded: boolean;
  readonly coverage: CoverageRelation;
  readonly impactedScopeEdges: readonly ScopeCoverage[];
  readonly scopeSlipText: string | null;
  readonly hasSameScopeRefutation: boolean;
}

/** Statistical power status: adequate (meets MDE), underpowered (below MDE), or unknown (no power analysis). */
export type PowerStatus = 'adequate' | 'underpowered' | 'unknown';
/** Whether the collected evidence is sufficient to support a verdict: sufficient, insufficient, or unknown. */
export type EvidenceSufficiencyStatus = 'sufficient' | 'insufficient' | 'unknown';

/** 证据充分性（caller pre-compute·R7/R8 消费 powerStatus）。 */
export interface EvidenceSufficiencyReport {
  readonly status: EvidenceSufficiencyStatus;
  readonly powerStatus: PowerStatus;
}

/** The effective direction of the aggregated evidence: supports, refutes, neutral, not_applicable, or unknown. */
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
  /** FUSION-OS-13：任一 statistical result 的 derivationForm 与 FEC expectedDerivationForm 不一致。true → R-derivation-form INCONCLUSIVE。 */
  readonly formMismatch: boolean;
}

// ===== VerdictKernelInput / Output（§7.1 / §7.2）=====

/**
 * Input to the deterministic verdict kernel ({@link decideFiveValueVerdict}).
 * All fields are caller pre-computed; the kernel itself is a pure function
 * that reads no database and mutates nothing.
 */
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
  /** [VC] ConfoundingGate 裁决（caller pre-compute via adjudicateConfounding·镜像 evidenceSufficiency 模式）。claimType='causal' 时由调用方提供；R7 判定前 R-causal 门消费。注：claimType 已通过 ClaimEnvelope 进 proofHash（任务 #12 · T-029 F-8-003 闭环·2026-07-24），caller 偷改 claimType 会致 proofHash 失配 → PROOF_HASH_MISMATCH。 */
  readonly confoundingGateResult?: ConfoundingGateResult;
  /** [VC] identifier 声明（FUSION-OS-14·caller pre-compute via resolveIdentifierClaim）。任一 not_found → R-identifier-fabrication REFUTED；任一 unresolved → UNTESTED（环境故障非伪造·unresolved 优先于 not_found）。optional·缺省零回归。 */
  readonly identifierClaims?: readonly IdentifierClaim[];
  /** [VC] 执行指纹量级失配（FUSION-OS-7·caller pre-compute via flagExecutionFingerprintMagnitudeMismatch）。true → R-execution-fingerprint DEGRADED_SCOPE（复算资源轮廓发散>10x·结果不可复现）。optional·缺省零回归。 */
  readonly executionFingerprintMismatch?: boolean;
  /** [VC] 最早 MeasurementResult.collectedAt（ISO-8601·F8 #10 HARKing 纵深）。传入则 R1 内 compileFec 跑 #10——与 orchestrator mandate gate（orchestrator.ts:146）同条件 defense-in-depth，使直调 kernel 且不经 mandate gate 的路径仍能抓 HARKing。缺省 → compileFec 跳过 #10（compiler.ts:409·legacy 文献投票无实测时间线·正确语义）。optional·缺省零回归。 */
  readonly measurementCutoff?: string | null;
  /** [META] 研究设计（GRADE 证据层级透明度层）。传入则输出附 evidenceQualityTier/Note（不进 verdict·不进 proofHash·零回归）。 */
  readonly studyDesign?: StudyDesign;
  /** [META] Cochrane RoB 7 维评估（透明度层·缺省维度按 unclear fail-conservative）。 */
  readonly robAssessments?: readonly RobAssessment[];
}

/**
 * Trace entry for a single R0-R9 rule: its ID, whether it triggered,
 * and optional diagnostic details. Collected into the kernel output's
 * `ruleTrace` array for full auditability.
 */
export interface VerdictRuleTrace {
  readonly ruleId: string;
  readonly triggered: boolean;
  readonly details?: string;
}

/**
 * Structured output of the deterministic verdict kernel: the verdict, reason
 * codes, full R0-R9 rule trace, scope/statistical/evidence-sufficiency reports,
 * integrity flags, and whether the support is bounded (CONFIRMED ≠ scientific truth).
 */
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
  /** [META] 证据质量层级（GRADE·透明度层·不进 verdict 不进 proofHash）。studyDesign 传入时有值。 */
  readonly evidenceQualityTier?: EvidenceTier;
  /** [META] 证据质量说明（tier + RoB 聚合·人类可读）。 */
  readonly evidenceQualityNote?: string;
  /** [META] 决策路径追踪（A1·裁决可解释性·不进 verdict 不进 proofHash·透明度层）。让第三方看到 R7 的 8 条件状态 + 关键数值快照。 */
  readonly decisionTrace?: DecisionTrace;
}

// ===== 内核入口（§7.3 R0-R9 决策树）=====

/**
 * decideFiveValueVerdictInternal —— 确定性五值裁决核心（§7.3·R0-R9 决策树·与历史字节一致）。
 * 被公共包装 decideFiveValueVerdict 调用；分离是为了附加证据质量透明度层（零回归）。
 * 全程无 LLM；按规则序（verdict_semantics.RULE_ORDER 合同）首条决定性规则胜出。
 * complexity-exempt: R0-R9 顺序决策表单函数实现——规则序即合同，拆分将切断「首条决定性规则胜出」的顺序可读性。复杂度 24 为 HEAD 存量值，2026-08-19 头注释扩行致基线行号键漂移，依豁免通道显式登记。
 */
export function decideFiveValueVerdictInternal(input: VerdictKernelInput): VerdictKernelOutput {
  // ─────────────────────────────────────────────────────────────────────────────
  // R 规则优先级表（显式化·审计 P0-3）：本函数是顺序决策表，命中即返回——
  // 优先级由代码顺序隐式表达，此处显式固化，防止未来新增规则时误插优先级。
  //   1.  R0   SCHEMA_INVALID              (UNTESTED)
  //   2.  R1   FEC_NOT_COMPILABLE          (UNTESTED)
  //   3.  R2   NO_VALID_DATASET_BINDING    (UNTESTED)
  //   4.  R3   CRITICAL_PROTOCOL_DEVIATION (UNTESTED)   [副作用：push harking/p_hacking flags]
  //   5.  R-EF R_EXECUTION_FINGERPRINT     (DEGRADED_SCOPE) [§FUSION-OS-7：复算资源轮廓发散
  //           则统计结论不可信·优先级高于 R5+ 统计结论]
  //   6.  AT   ANTI_THEATER_FAIL           (UNTESTED)   [§7.3 line 852]
  //   7.  R5   CONTRADICTORY_SIGNIFICANT   (INCONCLUSIVE)
  //   8.  R-I  R_IDENTIFIER_*              (UNTESTED/REFUTED) [unresolved 优先 not_found]
  //   9.  R6   PRIMARY_TEST_REFUTES        (REFUTED)
  //  10.  R-D  R_DERIVATION_FORM_MISMATCH  (INCONCLUSIVE)
  //  11.  R-C  R_CAUSAL_CONFOUNDING_*      (DEGRADED_SCOPE/INCONCLUSIVE) [在 R7 判定前·r7Pass 参与]
  //  12.  R7   PRIMARY_TEST_CONFIRMS       (CONFIRMED)
  //  13.  R8   INSUFFICIENT_POWER_OR_NULL  (INCONCLUSIVE)
  //  14.  R9   ALL_TESTS_SKIPPED           (UNTESTED)
  //  15.  —    NO_DECISION_PATH            (UNTESTED)   [兜底]
  // ─────────────────────────────────────────────────────────────────────────────
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
    formMismatch: false,
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
  const compiledFec =
    input.fec === null ? null : compileFec({ fec: input.fec, measurementCutoff: input.measurementCutoff ?? null });
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

  // ── R-execution-fingerprint（FUSION-OS-7·复算资源指纹量级差异>10x → DEGRADED_SCOPE）──
  // caller pre-compute（flagExecutionFingerprintMagnitudeMismatch）：比较 StatisticalResult.executionFingerprint
  // 基线三元组与复算观测三元组，任一可比维度量级差异>10x → 结果不可复现（Open Science per-cell 三元组范式·非 bit-exact）。
  // 优先级 DEGRADED_SCOPE 高于统计结论（R5+）：复算资源轮廓发散则统计结论不可信。
  // scopeSlipText 须非空（recordVerdict 要求 DEGRADED_SCOPE 非空 rationale·镜像 R-causal line 408-412）。
  if (input.executionFingerprintMismatch === true) {
    const fingerprintScopeReport: ScopeReport = {
      ...scopeReport,
      isDegraded: true,
      scopeSlipText: 'execution fingerprint magnitude mismatch (>10x): recomputed resource profile diverges from recorded baseline',
    };
    return makeOutput('DEGRADED_SCOPE', ['R_EXECUTION_FINGERPRINT_MISMATCH'], 'R_EXECUTION_FINGERPRINT_MISMATCH', {
      scopeReport: fingerprintScopeReport,
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

  // ── R-identifier-fabrication（FUSION-OS-14·claim 带 identifier 无 harness-verified 来源 → REFUTED）──
  // 三态（design doc line 328-338）：unresolved（环境故障·网络/DB 无法解析）→ UNTESTED（严守边界·非伪造）；
  // not_found（解析了但追溯无果）→ REFUTED（五值优先级 REFUTED > UNTESTED·反剧场强姿态）；resolved → 不触发。
  // unresolved 优先于 not_found（环境抖动不误判伪造·落点约束 R3）。precedence：R5（统计矛盾）优先；R6（统计反证）之后。
  if (input.identifierClaims !== undefined && input.identifierClaims.length > 0) {
    const hasUnresolved = input.identifierClaims.some((c) => c.resolutionStatus === 'unresolved');
    if (hasUnresolved) {
      return makeOutput('UNTESTED', ['R_IDENTIFIER_RESOLUTION_ENV_FAILURE'], 'R_IDENTIFIER_RESOLUTION_ENV_FAILURE', {
        scopeReport,
        statisticalReport,
        evidenceSufficiency: input.evidenceSufficiency,
        integrityFlags,
        untestedReason: 'R_IDENTIFIER_RESOLUTION_ENV_FAILURE',
      });
    }
    const hasFabricated = input.identifierClaims.some((c) => c.resolutionStatus === 'not_found');
    if (hasFabricated) {
      return makeOutput('REFUTED', ['UNVERIFIED_IDENTIFIER'], 'R_IDENTIFIER_FABRICATION', {
        scopeReport,
        statisticalReport,
        evidenceSufficiency: input.evidenceSufficiency,
        integrityFlags,
      });
    }
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

  // ── R-derivation-form（FUSION-OS-13·form 不匹配即使值相等也降级 INCONCLUSIVE）──
  // StatisticalResult.derivationForm 与 FEC statisticalPlan.expectedDerivationForm 不一致 → 值相等也不可信
  // （Open Science Agreement-is-not-verification 范式·反剧场 sentinel-form）。GV-13。
  if (statisticalReport.formMismatch) {
    return makeOutput('INCONCLUSIVE', ['R_DERIVATION_FORM_MISMATCH'], 'R_DERIVATION_FORM_MISMATCH', {
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

/**
 * decideFiveValueVerdict —— 确定性五值裁决公共入口（§7.3·R0-R9 决策树）。
 *
 *  增强（零回归）：当调用方提供 input.studyDesign（可选·透明度输入）时，
 * 输出附带 evidenceQualityTier / evidenceQualityNote（GRADE 证据层级 + Cochrane RoB 聚合）。
 * 该层**不进 verdict 判定**（R0-R9 逻辑字节不变）也**不进 proofHash**（VC 白名单不变）——
 * 仅作为透明元数据供 report/audit 消费。未提供 studyDesign → 输出与历史完全一致。
 */
export function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput {
  const base = decideFiveValueVerdictInternal(input);
  // A1（裁决可解释性·批次 3 透明度层）：附加决策路径追踪。
  // 镜像评估（纯函数·不改裁决逻辑·不进 proofHash）。详见 buildDecisionTrace 文档。
  const decisionTrace = buildDecisionTrace(input, base);
  if (input.studyDesign === undefined) {
    return { ...base, decisionTrace };
  }
  const grade = gradeEvidenceQuality(input.studyDesign, input.robAssessments ?? []);
  return {
    ...base,
    evidenceQualityTier: grade.tier,
    evidenceQualityNote:
      `${grade.overall} (tier ${grade.tier} · RoB low ${grade.robLowCount}/7 high ${grade.robHighCount}/7)`,
    decisionTrace,
  };
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
      formMismatch: false,
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

  // FUSION-OS-13：derivationForm 不匹配（值相等也不信·Open Science Agreement-is-not-verification）。
  // expectedDerivationForm undefined 或所有 result.derivationForm undefined → false（零回归）。
  const expectedForm = input.fec.statisticalPlan.expectedDerivationForm;
  const formMismatch =
    expectedForm !== undefined &&
    all.some((s) => s.derivationForm !== undefined && s.derivationForm !== expectedForm);

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
    formMismatch,
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

// ===== Decision Trace（A1: 裁决可解释性·批次 3 透明度层）=====
//
// 设计契约：
//   - **全程无 LLM**：trace 由确定性镜像评估产出（F3 红线继承）。
//   - **不进 proofHash**：decisionTrace 是透明度元数据（白名单不变·类似 evidenceQualityTier 先例）。
//   - **不改裁决逻辑**：buildDecisionTrace 只读取 input + output，不调用 decideFiveValueVerdictInternal。
//   - **零重复计算**：从 output 读取已计算的 scopeReport/statisticalReport/integrityFlags。
//
// 诚实边界（"cannot prove" 声明）：decisionTrace 是事后解释，不能证明裁决正确——
// 裁决正确性由 R0-R9 确定性逻辑 + 测试套件守护。trace 只提供透明度（让第三方看到为何 R7 触发/未触发）。

/** R7 CONFIRMED 门的 7 个条件评估（最复杂规则·最需解释为何 CONFIRMED/未 CONFIRMED）。 */
export interface R7GateEvaluation {
  /** statisticalReport.supports（存在显著的 supports 方向统计）。 */
  readonly supports: boolean;
  /** primaryAdjustedPValue ≤ α（容差 1e-7·verdictLte）。 */
  readonly primaryAdjustedPValueSignificant: boolean;
  /** primaryEffectSize ≥ mde（mde undefined 时为 null·该 gate 被跳过·verdictGte）。 */
  readonly effectSizeSufficient: boolean | null;
  /** evidenceSufficiency.status === 'sufficient'。 */
  readonly evidenceSufficient: boolean;
  /** !scopeReport.hasSameScopeRefutation（无同 scope 显著反证）。 */
  readonly noSameScopeRefutation: boolean;
  /** integrityFlags.length === 0（无完整性 flag·合并后）。 */
  readonly noIntegrityFlags: boolean;
  /** !statisticalReport.hasWarnAssumption（无统计 warn + 无 anti-theater warn）。 */
  readonly noWarnAssumption: boolean;
  /** 所有 7 条件 PASS（与 decideFiveValueVerdictInternal L503-512 的 r7Pass 一致·测试守护）。 */
  readonly overallPassed: boolean;
}

/** 裁决时刻的关键数值快照（供审计/可视化/演示）。 */
export interface DecisionTraceMetrics {
  readonly alpha: number | null;
  readonly mde: number | null;
  readonly primaryAdjustedPValue: number | null;
  readonly primaryEffectSize: number | null;
  /** 95% CI [lower, upper]（primary test）。 */
  readonly primaryConfidenceInterval: readonly [number, number] | null;
  readonly powerStatus: string;
  readonly evidenceStatus: string;
  readonly effectiveDirection: string;
  readonly antiTheaterFailCount: number;
  readonly antiTheaterWarnCount: number;
  /** 合并后的 integrity flags（input + compiledFec·与 output.integrityFlags 一致）。 */
  readonly integrityFlags: readonly string[];
  readonly totalStatistics: number;
  readonly skippedStatistics: number;
}

/** 决策路径追踪（additive 透明度层·不进 proofHash）。 */
export interface DecisionTrace {
  /** 触发的规则 ID（与 VerdictKernelOutput.decisiveRuleId 一致·测试守护一致性）。 */
  readonly firedRuleId: string;
  /** R7 门评估（无论是否触发 R7，都记录 7 条件状态·最需解释的规则）。null = fec null/alpha 不可得（R0-R2 场景）。 */
  readonly r7Gate: R7GateEvaluation | null;
  /** 裁决时刻数值快照。 */
  readonly metrics: DecisionTraceMetrics;
  /** R0-R9 决策树的规则总数（文档化·当前 18 个触发点·见 L300-312 优先级表）。 */
  readonly totalRulesInTree: number;
  /** 诚实声明：decisionTrace 是事后解释，不能证明裁决正确。 */
  readonly cannotProveStatement: string;
}

/** 镜像 decideFiveValueVerdictInternal L503-512 的 R7 条件评估（纯函数·不改裁决逻辑）。 */
function evaluateR7Gate(
  statisticalReport: StatisticalReport,
  alpha: number,
  mde: number | undefined,
  evidenceSufficiency: EvidenceSufficiencyReport,
  scopeReport: ScopeReport,
  integrityFlags: readonly string[],
): R7GateEvaluation {
  const supports = statisticalReport.supports;
  const primaryAdjustedPValueSignificant =
    statisticalReport.primaryAdjustedPValue !== null &&
    verdictLte(statisticalReport.primaryAdjustedPValue, alpha);
  const effectSizeSufficient =
    mde === undefined
      ? null
      : statisticalReport.primaryEffectSize !== null &&
        verdictGte(statisticalReport.primaryEffectSize, mde);
  const evidenceSufficient = evidenceSufficiency.status === 'sufficient';
  const noSameScopeRefutation = !scopeReport.hasSameScopeRefutation;
  const noIntegrityFlags = integrityFlags.length === 0;
  const noWarnAssumption = !statisticalReport.hasWarnAssumption;
  const overallPassed =
    supports &&
    primaryAdjustedPValueSignificant &&
    (effectSizeSufficient ?? true) &&
    evidenceSufficient &&
    noSameScopeRefutation &&
    noIntegrityFlags &&
    noWarnAssumption;
  return {
    supports,
    primaryAdjustedPValueSignificant,
    effectSizeSufficient,
    evidenceSufficient,
    noSameScopeRefutation,
    noIntegrityFlags,
    noWarnAssumption,
    overallPassed,
  };
}

/**
 * 构建决策路径追踪（A1·裁决可解释性）。
 *
 * 纯函数（无 IO·无 LLM·确定性）。从 output 读取已计算的 scopeReport/statisticalReport/
 * integrityFlags（零重复计算），从 input.fec 读取 alpha/mde（仅读取·不编译）。
 * firedRuleId 取自 output.decisiveRuleId（测试守护一致性）。
 *
 * @param input  裁决内核输入（用于读 FEC alpha/mde + statistics 计数）。
 * @param output 裁决内核输出（用于读已计算的 scope/stat/integrityFlags·避免重复评估）。
 * @returns DecisionTrace 透明度对象。
 */
export function buildDecisionTrace(
  input: VerdictKernelInput,
  output: VerdictKernelOutput,
): DecisionTrace {
  const { statisticalReport, scopeReport, integrityFlags, decisiveRuleId } = output;

  // alpha/mde 从 input.fec 读取（仅读取字段·不重新编译 FEC）。
  const alpha = input.fec?.statisticalPlan.alpha ?? null;
  const mdeRaw = input.fec?.powerPlan?.minimumDetectableEffect;
  const mde = mdeRaw === undefined ? null : mdeRaw;

  // R7 门评估（alpha 不可得 = R0-R2 场景，R7 不适用 → null）。
  const r7Gate = alpha !== null
    ? evaluateR7Gate(
        statisticalReport,
        alpha,
        mdeRaw,
        input.evidenceSufficiency,
        scopeReport,
        integrityFlags,
      )
    : null;

  const antiTheaterFailCount = input.antiTheaterFindings.filter((f) => f.severity === 'fail').length;
  const antiTheaterWarnCount = input.antiTheaterFindings.filter((f) => f.severity === 'warn').length;
  const totalStatistics = input.statistics.length;
  const skippedStatistics = input.statistics.filter((s) => s.status === 'skipped').length;

  const metrics: DecisionTraceMetrics = {
    alpha,
    mde,
    primaryAdjustedPValue: statisticalReport.primaryAdjustedPValue,
    primaryEffectSize: statisticalReport.primaryEffectSize,
    primaryConfidenceInterval: statisticalReport.primaryConfidenceInterval,
    powerStatus: input.evidenceSufficiency.powerStatus,
    evidenceStatus: input.evidenceSufficiency.status,
    effectiveDirection: statisticalReport.effectiveDirection,
    antiTheaterFailCount,
    antiTheaterWarnCount,
    integrityFlags,
    totalStatistics,
    skippedStatistics,
  };

  return {
    firedRuleId: decisiveRuleId,
    r7Gate,
    metrics,
    totalRulesInTree: 18,
    cannotProveStatement:
      'decisionTrace is a post-hoc explanation for transparency; it cannot prove the verdict is correct. ' +
      'Verdict correctness is guaranteed by the deterministic R0-R9 logic and the test suite, not by this trace.',
  };
}
