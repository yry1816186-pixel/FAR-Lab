/**
 * fec_contract —— FEC V2 类型层（Falsification Evidence Contract V2）。
 *
 *            EffectComparator / NetworkPolicy / EvidenceDirection enum 权威）。
 *
 * 与 V1（src/falsifiability/contracts.ts FalsifiabilityContract）的关系：
 *   - V1 是历史预登记契约（preregistrationHash/alpha/seed 等扁平字段），V2 是完整冻结契约。
 *   - V2 compiler（compiler.ts）消费 FecContractV2，产 FalsificationPlan（stat_lock/verdict_mapping/proof_checks）。
 *   - V1 不删除（功能保留·零容忍 #5），V2 是新增强制路径（fec_mandate.ts 强制缺 FEC → fail-closed UNTESTED）。
 *
 * 命名对齐：APPENDIX_A 用 VerdictKind，项目实际类型 Verdict（schema/enums.ts SSOT·5 值一致）。
 *   本文件 export `VerdictKind = Verdict` 别名以对齐 SSOT 术语，避免类型分裂（零容忍 #1）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。全 readonly 字段。模型中立。
 */

import type {
  EffectComparator,
  NetworkPolicy,
  ProofCheckOutcome,
  Verdict,
} from '../schema/enums.ts';

/** SSOT 术语对齐：VerdictKind === 项目 Verdict（schema/enums.ts 5 值·APPENDIX_A §6.1）。 */
export type VerdictKind = Verdict;

// ===== FEC V2 编译期枚举（03 §2.1 reasonCode + severity + verdict mapping path）=====

/** 编译失败码（03 §2.1 表·10 项 + T-008 修复 #11·冻结·对应 kernel R1/R3/R5/R8）。 */
export const COMPILE_ERROR_CODES = [
  'FEC_NOT_COMPILABLE',
  'SCOPE_UNBOUNDED',
  'METRIC_MISSING',
  'THRESHOLD_MISSING',
  'EVIDENCE_REQUIREMENT_MISSING',
  'STAT_PLAN_MISSING',
  'MULTIPLE_TESTING_UNCORRECTED',
  'PROTOCOL_INCOMPLETE',
  'LLM_FROZEN',
  'HARKING_REVISION_AFTER_RESULT',
  // T-008 · 2026-07-24 评委逼问第 1 轮 F-2-005 修复：FEC freeze 须绑定 git commit SHA
  // 作为第三方可验证锚定（git 历史公开可查·禁自签时间戳）。
  'GIT_COMMIT_SHA_UNBOUND',
  // T-027 · 2026-07-24 评委逼问第 3 轮 F-7-003 修复：opt-in 时 FEC 须含合法 PowerPlan
  // （power analysis sampleSize > 0），否则"垃圾 spec"（阈值宽松到永不被证伪）也能过 FEC 门。
  'POWER_PLAN_REQUIRED',
] as const;
export type CompileErrorCode = (typeof COMPILE_ERROR_CODES)[number];

/**
 * 编译失败严重性（03 §2.3 降级规则）：
 *   - HARD_FAIL_UNTESTED → fail-closed UNTESTED（reasonCode 1-6, 8, 10）
 *   - HARD_FAIL_CI_BLOCK → CI 阻断 freeze（reasonCode 9 LLM_FROZEN·禁静默吞 LLM-as-judge）
 *   - WARN_DOWNGRADE_INCONCLUSIVE → 不阻断 compile，但降级 verdict INCONCLUSIVE（reasonCode 7）
 */
export const FEC_COMPILE_SEVERITIES = [
  'HARD_FAIL_UNTESTED',
  'HARD_FAIL_CI_BLOCK',
  'WARN_DOWNGRADE_INCONCLUSIVE',
] as const;
export type FecCompileSeverity = (typeof FEC_COMPILE_SEVERITIES)[number];

/** verdict_mapping 5 路径（03 §7 / APPENDIX_B §1·静态决策表·compiler 产·kernel 消费）。 */
export const VERDICT_MAPPING_PATHS = [
  'all_pass',
  'any_refute',
  'data_missing',
  'scope_narrow',
  'mixed',
] as const;
export type VerdictMappingPath = (typeof VERDICT_MAPPING_PATHS)[number];

/** scope 有界维度（03 §2.1 #2·三要素非空·否则 SCOPE_UNBOUNDED）。 */
export const FEC_SCOPE_BOUNDED_DIMENSIONS = ['population', 'timeWindow', 'domainConstraint'] as const;
export type FecScopeBoundedDimension = (typeof FEC_SCOPE_BOUNDED_DIMENSIONS)[number];

/** StatisticalPlan 必填字段（03 §1.3 JSON Schema required·10 项·缺任一 → STAT_PLAN_MISSING）。 */
export const STAT_PLAN_REQUIRED_FIELDS = [
  'primaryMetric',
  'nullHypothesis',
  'alternativeHypothesis',
  'alpha',
  'effectDirection',
  'confidenceIntervalMethod',
  'multipleTestingCorrection',
  'missingDataPolicy',
  'outlierPolicy',
  'stoppingRule',
] as const;
export type StatPlanRequiredField = (typeof STAT_PLAN_REQUIRED_FIELDS)[number];

// ===== FEC V2 子类型（逐字对齐 APPENDIX_A §2 + 03 §1.2）=====

export interface ScopeCoverage {
  readonly dimension: string;
  readonly value: string;
  readonly relation: 'within' | 'partial' | 'outside';
}

export interface ScopeSpec {
  readonly population: string;
  readonly timeWindow: string;
  readonly domainConstraint: string;
  readonly boundaryConditions?: readonly string[];
  readonly knownNarrowing?: readonly ScopeCoverage[];
}

export interface MetricSpec {
  /** 稳定 key，禁描述性短语（compiler isDescriptivePhrase 校验·否则 METRIC_MISSING）。 */
  readonly metricKey: string;
  readonly description: string;
  readonly unit: string;
  readonly computationRef: string;
  readonly isDeterministic: boolean;
}

export interface ThresholdSpec {
  readonly value: number;
  /** 须 === MetricSpec.unit（compiler 校验·否则 THRESHOLD_MISSING）。 */
  readonly unit: string;
  readonly thresholdSemantics: 'lt' | 'gt' | 'eq' | 'ne' | 'range';
  readonly rangeUpper?: number;
  readonly preregistered: boolean;
}

export interface StatisticalPlan {
  /** 须 === MetricSpec.metricKey（compiler 校验）。 */
  readonly primaryMetric: string;
  readonly nullHypothesis: string;
  readonly alternativeHypothesis: string;
  /** 0 < alpha < 1（compiler 校验）。 */
  readonly alpha: number;
  readonly effectDirection: 'greater' | 'less' | 'two_sided';
  readonly confidenceIntervalMethod: string;
  readonly multipleTestingCorrection: 'none' | 'bonferroni' | 'holm' | 'bh_fdr';
  readonly missingDataPolicy: string;
  readonly outlierPolicy: string;
  readonly stoppingRule: string;
  readonly scopeLimitation?: string;
  /** FUSION-OS-13：期望派生形式。与 StatisticalResult.derivationForm 不一致 → formMismatch → R-derivation-form INCONCLUSIVE。optional·缺省零回归。 */
  readonly expectedDerivationForm?: 'literal' | 'derived' | 'formula' | 'auto';
}

export interface PowerPlan {
  readonly targetPower: number;
  readonly minimumDetectableEffect: number;
  readonly sampleSize: number;
  readonly powerMethod: string;
  /** 须 === StatisticalPlan.alpha（compiler 校验）。 */
  readonly alphaAssumed: number;
}

export interface MultipleTestingPlan {
  readonly correction: 'bonferroni' | 'holm' | 'bh_fdr';
  readonly familySize: number;
  readonly adjustedAlpha: number;
  readonly preregistered: boolean;
}

export interface SeedPolicy {
  readonly fixed: boolean;
  /** fixed=true 必填（compiler 校验·涉及随机时）。 */
  readonly seedValue?: number;
  readonly allowCherryPick: boolean;
  readonly justification?: string;
}

export interface DeviationPolicy {
  readonly criticalCategories: readonly string[];
  readonly nonCriticalHandling: 'tolerate' | 'degrade' | 'block';
  readonly requireExplicitLog: boolean;
}

export interface ActorRef {
  readonly actorKind: 'deterministic_compiler' | 'deterministic_freezer' | 'human' | 'ci_runner';
  readonly actorId: string;
}

export interface ProtocolFreeze {
  /** sha256(canonical JSON of FEC VC fields)——compiler computeFecHash 重算互验。 */
  readonly fecHash: string;
  readonly actor: ActorRef;
  /** ISO-8601，须 ≤ 任一 MeasurementResult.collectedAt（compiler HARKing 校验·否则 HARKING_REVISION_AFTER_RESULT）。 */
  readonly timestamp: string;
  readonly environmentPolicy: string;
  readonly deviationPolicyHash: string;
  /** F3·须为 'deterministic_freezer'（否则 LLM_FROZEN → CI 阻断）。 */
  readonly frozenBy: 'deterministic_freezer';
  /**
   * T-008 · 第三方锚定 git commit SHA（40-hex sha1·公开可查·禁自签时间戳）。
   *
   * [VC] 字段——进 computeFecHash（与 freeze 其余字段同进 hash 流）。
   *
   * - V1 缺省：可选（向后兼容现有 demo seed · freeze.timestamp 仍为自签 ISO-8601）；
   * - V2 计划：所有真实研究路径 FEC 强制绑定（requireGitCommitShaBinding=true →
   *   compiler #11 校验：缺/格式错 → GIT_COMMIT_SHA_UNBOUND → HARD_FAIL_UNTESTED）。
   *
   * 修复背景（评审记录/总榜_v1.md T-008）：原 freeze.timestamp 自签无第三方锚定——
   * 评委可质疑"你冻结时真的在这个时间点吗？还是事后回填的？"。绑定 git commit SHA 后，
   * 任何人可在 git 历史中验证：该 commit 的 author/committer date 须 ≤ freeze.timestamp，
   * 且该 commit 的 tree 包含冻结时的契约文件（确定性锚定·不可回填）。
   *
   * 注：OSF 第三方时间戳锚定（D-007）属 V2 候选，当前仅 git 锚定（V1 边界·诚实登记）。
   */
  readonly gitCommitSha?: string;
}

export interface EvidenceRequirement {
  readonly evidenceId: string;
  readonly kind: 'dataset' | 'workflow' | 'measurement' | 'statistical' | 'external';
  readonly critical: boolean;
  readonly description: string;
  readonly verificationCheckId: string;
}

export interface DatasetRequirement {
  readonly name: string;
  readonly contentHashAlgorithm: string;
  readonly allowSynthetic: boolean;
  readonly requiredLicense?: string;
  readonly consentOrPrivacyTag?: string;
  readonly schemaFingerprintRequired: boolean;
}

export interface WorkflowRequirement {
  readonly name: string;
  readonly engine: 'nextflow' | 'snakemake' | 'cwl' | 'notebook' | 'script' | 'manual';
  readonly requireContainerDigest: boolean;
  readonly requireCommandHash: boolean;
  readonly expectedNetworkPolicy: NetworkPolicy;
  readonly requireFixedSeed: boolean;
}

// ===== FecContractV2 顶层（03 §1.2·16 字段·contractVersion='FEC/2.0'）=====

export interface FecContractV2 {
  /** [VC] FEC 全局唯一 id，如 'FEC-ASTRO-0001'。进 canonicalHash 与 proofHash。 */
  readonly fecId: string;
  /** [VC] 固定字面量（JSON schema const）。 */
  readonly contractVersion: 'FEC/2.0';
  /** [VC] 回指 Claim.id。 */
  readonly claimId: string;
  /** [VC] POPPER 风格可测蕴含·非空（否则 FEC_NOT_COMPILABLE）。 */
  readonly measurableImplication: string;
  /** [VC] scope 声明·三要素非空（否则 SCOPE_UNBOUNDED）。 */
  readonly scope: ScopeSpec;
  /** [VC] 必需证据清单·minItems≥1。 */
  readonly requiredEvidence: readonly EvidenceRequirement[];
  /** [VC] 数据集要求·minItems≥1（被 DatasetBinding 匹配·§3.1）。 */
  readonly datasetRequirements: readonly DatasetRequirement[];
  /** [VC] 工作流要求·minItems≥1（被 WorkflowBinding 匹配·§3.2）。 */
  readonly workflowRequirements: readonly WorkflowRequirement[];
  /** [VC] primary metric（无 → METRIC_MISSING）。 */
  readonly metric: MetricSpec;
  /** [VC] threshold（无 → THRESHOLD_MISSING）。 */
  readonly threshold: ThresholdSpec;
  /** [VC] effect 与 threshold 比较方向。 */
  readonly direction: EffectComparator;
  /** [VC] 统计计划·全必填字段（缺 → STAT_PLAN_MISSING）。 */
  readonly statisticalPlan: StatisticalPlan;
  /** [VC] optional·缺失或不足可能触发 INCONCLUSIVE（R8）。 */
  readonly powerPlan?: PowerPlan;
  /** [VC] implication>1 时强制非空且 correction≠none。 */
  readonly multipleTestingPlan?: MultipleTestingPlan;
  /** [VC] 随机种子策略·涉及随机时 fixed=true+seedValue（否则 PROTOCOL_INCOMPLETE）。 */
  readonly seedPolicy: SeedPolicy;
  /** [VC] 协议偏离处置·critical deviation → UNTESTED（§7 CRITICAL_DEVIATION）。 */
  readonly deviationPolicy: DeviationPolicy;
  /** [VC] 协议冻结快照·frozenBy='deterministic_freezer'（F3）。 */
  readonly freeze: ProtocolFreeze;
  /** [VC] harking_risk / p_hacking_risk 等·compiler #7 多重检验未校正时追加 p_hacking_risk。 */
  readonly integrityFlags: readonly string[];
  /**
   * T-003 · Evidence provenance binding 开关（2026-07-24 评委逼问第 1 轮 F-2-005 修复）。
   *
   * [META] 非编译期 VC 字段（不进 computeFecHash·不进 proofHash）——它是 orchestrator 运行时
   * 调用 `assertPrimaryEvidenceProvenanceBound` 的开关，决定是否对 EvidenceRecord.executionProvenanceHash
   * 强制 fail-closed 校验。
   *
   * - 缺省/ false → V1 向后兼容（demo seed 的 fixture metricValue 不强制 provenance 绑定）；
   * - true → primary 证据（supportsClaim=true 且 refutesClaim=false）的 metricValue 必须绑定
   *   sandbox 执行 stdoutHash（64-hex sha256），否则 fail-closed 拒绝裁决
   *   （`EVIDENCE_PROVENANCE_UNBOUND` 进 integrityFlags → kernel R7 阻断 CONFIRMED）。
   *
   * V2 计划：所有真实研究路径 FEC 强制 true。
   *
   * V1 诚实边界（2026-07-24 第 2 轮复评修正）：本轮 grep 核实 makeRealStatsFec（legacy_kernel_adapter.ts:218）
   * **未**设置此标志——即 V1 **无任何路径 opt-in**，本机制为休眠的 opt-in 能力（默认 false · 向后兼容
   * demo seed / hero pipeline 的 fixture metricValue）。hero pipeline（C-MMLU-A 等）仍走 V1 默认路径
   * （统计由 src/statistics 真实计算，但 metricValue 不绑定 sandbox provenance hash）。V2 真实研究路径
   * 接入 sandbox execution 后将强制 opt-in。
   */
  readonly requireExecutionProvenance?: boolean;
  /**
   * T-008 · FEC freeze.gitCommitSha 强制绑定开关（2026-07-24 评委逼问第 1 轮 T-008 修复）。
   *
   * [META] 非编译期 VC 字段（不进 computeFecHash·不进 proofHash）——它是 compiler 编译期
   * 调用 `checkGitCommitShaBinding` (#11) 的开关，决定是否对 `freeze.gitCommitSha`
   * 强制 HARD_FAIL_UNTESTED 校验。
   *
   * - 缺省/false → V1 向后兼容（demo seed 的 freeze.timestamp 仍为自签 ISO-8601 · 不强制 git 锚定）；
   * - true → `freeze.gitCommitSha` 必须为合法 40-hex sha1，否则 compiler 抛
   *   `GIT_COMMIT_SHA_UNBOUND`（HARD_FAIL_UNTESTED · fail-closed UNTESTED · 拒绝落 CONFIRMED）。
   *
   * V2 计划：所有真实研究路径 FEC 强制 true。
   *
   * V1 诚实边界（2026-07-24 第 2 轮复评修正）：本轮 grep 核实 makeRealStatsFec **未**设置此标志——
   * 即 V1 **无任何路径 opt-in**，本机制为休眠的 opt-in 能力（默认 false · 向后兼容 demo seed /
   * hero pipeline 的自签 freeze.timestamp）。hero pipeline 的 SourceAnchor.gitCommitSha 是占位符
   * （'a'.repeat(40) 等·非真实 commit）且不触发 #11（#11 校验的是 freeze.gitCommitSha·非 SourceAnchor）。
   * V2 真实研究路径将绑定真实 git commit SHA + opt-in。
   * OSF 第三方时间戳锚定（D-007）属 V2 候选，当前仅 git 锁定机制就绪（V1 边界·诚实登记）。
   */
  readonly requireGitCommitShaBinding?: boolean;
  /**
   * T-027 · FEC PowerPlan 强制开关（2026-07-24 评委逼问第 3 轮 F-7-003 修复）。
   *
   * [META] 非编译期 VC 字段（不进 computeFecHash·不进 proofHash）——它是 compiler 编译期
   * 调用 `checkPowerPlanRequired` (#12) 的开关，决定是否对 `powerPlan`（含 sampleSize）强制
   * HARD_FAIL_UNTESTED 校验。
   *
   * 根因（评委07 F-7-003·评审记录/总榜_v1.md T-027）：
   *   - 原 `powerPlan?: PowerPlan` 是 optional——可不填 = 无强制 power analysis；
   *   - FEC 只保证「有 spec」不保证「spec 严格」。一个垃圾 spec（阈值宽松到永不被证伪）
   *     也能过 FEC 门——FEC 的强制力被「宽松 spec」绕过；
   *   - 这是方法学漏洞（评委07）：FAR-Lab 宣称「复现危机防线」但允许无 power analysis 的 claim。
   *
   * 行为契约：
   *   - 缺省/false → V1 向后兼容（demo seed 的 powerPlan 仍 optional · 不强制）；
   *   - true → `powerPlan` 必填且 `sampleSize > 0` 且 `targetPower >= 0.5`（power 须有意义），
   *     否则 compiler 抛 `POWER_PLAN_REQUIRED`（HARD_FAIL_UNTESTED · fail-closed UNTESTED ·
   *     拒绝落 CONFIRMED）。
   *
   * V1 诚实边界：默认 false——demo seed / hero pipeline 的 powerPlan 多为占位（sampleSize 凑数），
   *   不强制 opt-in；V2 真实研究路径 FEC 强制 true（科学 claim 无 power analysis = 不可发表）。
   * 与 T-003/T-008 同 opt-in 模式（向后兼容 + 机制能力补齐 + V2 真实路径强制）。
   */
  readonly requirePowerPlan?: boolean;
}

// ===== 编译器输入/输出（03 §2.2 伪代码 + 设计 interfaces）=====

export interface CompileFecInput {
  readonly fec: FecContractV2;
  /**
   * §2.2 line 285 HARKing 检查需 earliestMeasurementCollectedAt（≤ freeze.timestamp）。
   * 由 caller 从 MeasurementResult[] 注入（compiler 纯函数不读 DB）。无 measurement 时 undefined（跳过 #10 检查）。
   */
  readonly measurementCutoff?: string | null;
}

export interface CompileError {
  readonly code: CompileErrorCode;
  readonly severity: FecCompileSeverity;
  readonly message: string;
  /** 触发字段路径，如 'statisticalPlan.alpha'。 */
  readonly field?: string;
}

export interface ProofCheckDescriptor {
  readonly checkId: string;
  readonly checkKind: 'falsification_sufficiency' | 'threshold' | 'statistical_plan_lock' | 'seed_policy';
  readonly expectedOutcome: ProofCheckOutcome;
  readonly mappedVerdictPath: VerdictMappingPath;
}

export interface FalsificationPlan {
  /** 产物 1：stat_lock —— 冻结统计参数 canonicalHash（首里程碑交付·03 §1.4）。 */
  readonly statLock: {
    readonly hash: string;
    readonly alpha: number;
    readonly correction: string;
    readonly primaryMetric: string;
  };
  /** 产物 2：verdict_mapping —— 5 路径 → 5 verdict 静态决策表（首里程碑交付）。 */
  readonly verdictMapping: Readonly<Record<VerdictMappingPath, VerdictKind>>;
  /** 产物 3：proof_checks —— 转译 ProofCheck[]（首里程碑交付·04 ProofEnvelope 消费）。 */
  readonly proofChecks: readonly ProofCheckDescriptor[];
  /** 产物 4/5/6：首里程碑不交付（03 §1.4 诚实声明·W3-W4 增量），留空数组（非桩·明确未交付）。 */
  readonly testPlan: readonly never[];
  readonly refutationRoutes: readonly never[];
  readonly reproSpec: readonly never[];
  readonly integrityFlags: readonly string[];
}

/**
 * compileFec 返回（03 §2.2）：
 *   - ok=true：编译成功，产 FalsificationPlan（warnings 不阻断·通过 integrityFlags 传递）。
 *   - ok=false：有 HARD_FAIL error·failClosedVerdict 由最严重 severity 决定（UNTESTED 或 CI_BLOCK 占位）。
 *     decisiveVerdictPath 是触发失败的最相关 verdict mapping 路径（data_missing 默认）。
 */
export type CompileFecResult =
  | { readonly ok: true; readonly plan: FalsificationPlan; readonly fec: FecContractV2 }
  | {
      readonly ok: false;
      readonly errors: readonly CompileError[];
      readonly decisiveVerdictPath: VerdictMappingPath;
      readonly failClosedVerdict: VerdictKind;
    };
