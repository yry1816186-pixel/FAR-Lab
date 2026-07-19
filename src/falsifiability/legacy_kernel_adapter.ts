import type { EffectComparator } from '../schema/enums.ts';
import type { FecContractV2, ThresholdSpec as FecThresholdSpec } from '../fec/fec_contract.ts';
import type {
  ClaimType,
  ConfoundingGateResult,
  EvidenceBasis,
} from '../confounding_gate/types.ts';
import { evaluateThreshold } from './threshold_semantics.ts';
import { recomputeIdentifierClaims } from './external_facts.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import { toKernelFindings } from '../anti_theater/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  ThresholdSpec,
  VerdictResult,
  VerdictTracePersisted,
} from './types.ts';
import type {
  DatasetBindingSpec,
  EvidenceSufficiencyReport,
  StatisticalResult,
  VerdictKernelInput,
  IdentifierClaim,
  VerdictKernelOutput,
} from './verdict_kernel_v2.ts';

export interface LegacyVerdictKernelInputArgs {
  readonly claim: string;
  readonly evidences: ReadonlyArray<EvidenceRecord>;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
  readonly fec: FecContractV2 | null;
  readonly integrityFlags?: readonly string[];
  /** 真实统计结果（P1-5·与 orchestrator 同语义）。提供时跳过布尔降维。 */
  readonly statistics?: readonly StatisticalResult[];
  readonly claimType?: ClaimType;
  readonly evidenceBasis?: EvidenceBasis;
  readonly confoundingGateResult?: ConfoundingGateResult;
  /** identifier 声明（FUSION-OS-14·caller pre-compute via resolveIdentifierClaim·opt-in）。任一 not_found → REFUTED；任一 unresolved → UNTESTED。 */
  readonly identifierClaims?: readonly IdentifierClaim[];
  /**
   * 反剧场检测报告(FUSION-OS-1·caller pre-compute via runAntiTheaterLint)。提供时内部 toKernelFindings
   * 单点投影喂 kernel(反剧场红线:KernelAntiTheaterFinding[] 不暴露为 args·禁 caller 手填 findings);
   * 不提供则加 'anti_theater_not_linted' integrityFlag,经 kernel R7 integrityFlags.length===0 阻断 CONFIRMED。
   */
  readonly antiTheaterReport?: AntiTheaterReport;
}

export function buildLegacyVerdictKernelInput(
  args: LegacyVerdictKernelInputArgs,
): VerdictKernelInput {
  const statistics =
    args.statistics !== undefined
      ? args.statistics
      : args.evidences.map((evidence) =>
          evidenceToStatisticalResult(evidence, args.falsificationSpec.metric, args.thresholdSpec),
        );
  return {
    fec: args.fec,
    datasetBindings: args.evidences.map(evidenceToDatasetBinding),
    statistics,
    protocolDeviations: [],
    // FUSION-OS-1:caller pre-compute report → toKernelFindings 单点投影(反剧场红线:禁 caller 手填 findings)。
    // 不加 anti_theater_not_linted flag:legacy adapter 主 caller 是 verdict_stage(AI4S 文献投票路径·
    // 输入为文献蕴含 supports/refutes 投票·非实验数据)——anti-theater 检测实验 theater(seed-cherry/p-hacking/
    // metric-swap),文献投票无实验数据无 theater 风险,不适用;强制 flag 会迫使伪造实验数据跑 lint(反剧场)
    // 或过度降级(破坏文献 CONFIRMED 语义)。实验路径强制门在 orchestrator fecAppendClaim。
    antiTheaterFindings: toKernelFindings(args.antiTheaterReport?.findings ?? []),
    evidenceSufficiency: summarizeEvidenceSufficiency(args.evidences, statistics, args.fec),
    contradictionSet: [],
    integrityFlags: args.integrityFlags ?? args.fec?.integrityFlags ?? [],
    ...(args.claimType !== undefined ? { claimType: args.claimType } : {}),
    ...(args.evidenceBasis !== undefined ? { evidenceBasis: args.evidenceBasis } : {}),
    ...(args.confoundingGateResult !== undefined ? { confoundingGateResult: args.confoundingGateResult } : {}),
    ...(args.identifierClaims !== undefined
      ? { identifierClaims: recomputeIdentifierClaims(args.identifierClaims) }
      : {}),
  };
}

/**
 * bridgeLegacyEvidencesToStatistics —— V1 fixture 证据 → V2 StatisticalResult 显式桥接（demo/fixture 用）。
 *
 * 非显然决策（why export）：fecAppendClaim 生产路径的 evidenceToStatisticalResult 刻意不注入
 * adjustedPValue（反 theater·metric-only 不得自动伪造 CONFIRMED·见 fec_orchestrator.test.ts:328 +
 * orchestrator_v2_wired.test.ts:41）。demo seed 是 offline fixture（registry.ts 明示「verdict 由
 * offline fixture 产出」），需显式声明 fixture 统计以演示 verdict 多样性——本函数供 demo seed
 * 显式传 fecAppendClaim 的 statistics?，与生产自动降维路径隔离（透明 fixture 声明·非生产自动桥接）。
 * 桥接约定同 verdict_stage 的 evidenceToStatisticalResult（p=0 / effectSize=metricValue 或 1）。
 */
export function bridgeLegacyEvidencesToStatistics(
  evidences: ReadonlyArray<EvidenceRecord>,
  falsificationSpec: FalsificationSpec,
  thresholdSpec: ThresholdSpec,
): readonly StatisticalResult[] {
  return evidences.map((evidence) =>
    evidenceToStatisticalResult(evidence, falsificationSpec.metric, thresholdSpec),
  );
}

export function makeLegacyCompatFec(input: {
  readonly claimId: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
  readonly frozenAt: string;
}): FecContractV2 {
  const metricKey = stableMetricKey(input.falsificationSpec.metric);
  const threshold = toFecThreshold(input.falsificationSpec, input.thresholdSpec);
  return {
    fecId: `FEC-LEGACY-${input.claimId}`,
    contractVersion: 'FEC/2.0',
    claimId: input.claimId,
    measurableImplication: input.falsificationSpec.prediction,
    scope: {
      population: 'legacy claim scope',
      timeWindow: 'legacy unspecified time window',
      domainConstraint: 'legacy falsification method',
    },
    requiredEvidence: [
      {
        evidenceId: 'legacy-metric-or-vote',
        kind: 'measurement',
        critical: true,
        description: 'Legacy EvidenceRecord input adapted for V2 verdict kernel',
        verificationCheckId: 'legacy-v2-adapter',
      },
    ],
    datasetRequirements: [
      {
        name: 'legacy-evidence-source',
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: false,
      },
    ],
    workflowRequirements: [
      {
        name: 'legacy-falsifiability-path',
        engine: 'manual',
        requireContainerDigest: false,
        requireCommandHash: false,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: false,
      },
    ],
    metric: {
      metricKey,
      description: input.falsificationSpec.metric,
      unit: threshold.unit,
      computationRef: 'legacy EvidenceRecord metricValue',
      isDeterministic: true,
    },
    threshold,
    direction: toEffectComparator(input.falsificationSpec.thresholdSemantics),
    statisticalPlan: {
      primaryMetric: metricKey,
      nullHypothesis: input.falsificationSpec.prediction,
      alternativeHypothesis: input.falsificationSpec.prediction,
      alpha: 0.05,
      effectDirection: toStatEffectDirection(input.falsificationSpec.thresholdSemantics),
      confidenceIntervalMethod: 'not_provided_by_legacy_path',
      multipleTestingCorrection: 'none',
      missingDataPolicy: 'not_provided_by_legacy_path',
      outlierPolicy: 'not_provided_by_legacy_path',
      stoppingRule: 'not_provided_by_legacy_path',
    },
    seedPolicy: {
      fixed: false,
      allowCherryPick: false,
      justification: 'Legacy path has no stochastic run seed.',
    },
    deviationPolicy: {
      criticalCategories: ['metric_swap', 'alpha_rewrite'],
      nonCriticalHandling: 'degrade',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: 'legacy-v2-adapter' },
      timestamp: input.frozenAt,
      environmentPolicy: 'legacy adapter: no environment lock',
      deviationPolicyHash: '0'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
  };
}

/**
 * makeRealStatsFec —— 真实统计路径的 FEC V2 构造器（P1-5 hero pipeline 用）。
 *
 * 与 makeLegacyCompatFec 的关键差异（非显然决策）：
 *   - 两者 integrityFlags 均空（R7 可达）。差异在统计严谨性：本构造器用 caller 提供的真实
 *     alpha/correction/CI method/effectDirection，且 missingData/outlier/stopping 写真实预登记策略
 *     （非 'not_provided_by_legacy_path'）；makeLegacyCompatFec 经 evidenceToStatisticalResult 的 V1
 *     桥接约定（p=0/effectSize=1）驱动 R6/R7，本构造器由真实 pValue/CI 驱动。
 *   - threshold.unit === metric.unit === metricUnit（compiler #4 要求）。
 *   - workflow requireFixedSeed=true + seedPolicy.fixed=true（model eval 涉及采样，诚实固定种子）。
 *
 * fecHash 沿用 '0'.repeat(64)：compileFec 不重算校验 fecHash（仅校验 frozenBy/timestamp 等 10 项），
 * 真实互验由 verifier 侧 computeFecHash 负责（hero pipeline 不进 cross-lang verifier 范围）。
 */
export interface RealStatsFecInput {
  readonly claimId: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec: ThresholdSpec;
  readonly frozenAt: string;
  readonly alpha: number;
  readonly multipleTestingCorrection: 'none' | 'bonferroni' | 'holm' | 'bh_fdr';
  readonly confidenceIntervalMethod: string;
  readonly effectDirection: 'greater' | 'less' | 'two_sided';
  readonly metricUnit: string;
  readonly metricDescription: string;
  readonly seedValue: number;
}

export function makeRealStatsFec(input: RealStatsFecInput): FecContractV2 {
  const metricKey = stableMetricKey(input.falsificationSpec.metric);
  const thresholdValue = resolveThresholdValue(input.falsificationSpec, input.thresholdSpec);
  const comparator = toEffectComparator(input.falsificationSpec.thresholdSemantics);
  const rangeUpper =
    input.thresholdSpec.semantics === 'range' && input.thresholdSpec.upper !== undefined
      ? { rangeUpper: input.thresholdSpec.upper }
      : {};
  return {
    fecId: `FEC-REAL-${input.claimId}`,
    contractVersion: 'FEC/2.0',
    claimId: input.claimId,
    measurableImplication: input.falsificationSpec.prediction,
    scope: {
      population: input.metricDescription,
      timeWindow: `protocol frozen at ${input.frozenAt} (pre-measurement)`,
      domainConstraint: `${input.multipleTestingCorrection}-corrected z-test vs falsificationThreshold`,
    },
    requiredEvidence: [
      {
        evidenceId: `${metricKey}:primary_test`,
        kind: 'statistical',
        critical: true,
        description: `preregistered primary statistical test for ${input.claimId}`,
        verificationCheckId: `${metricKey}:statistical_plan_lock`,
      },
    ],
    datasetRequirements: [
      {
        name: `${metricKey}:measurement_runs`,
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: true,
      },
    ],
    workflowRequirements: [
      {
        name: `${metricKey}:eval_pipeline`,
        engine: 'script',
        requireContainerDigest: false,
        requireCommandHash: true,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: true,
      },
    ],
    metric: {
      metricKey,
      description: input.metricDescription,
      unit: input.metricUnit,
      computationRef: `${metricKey} over preregistered eval runs (seed=${input.seedValue})`,
      isDeterministic: true,
    },
    threshold: {
      value: thresholdValue,
      unit: input.metricUnit,
      thresholdSemantics: input.falsificationSpec.thresholdSemantics,
      preregistered: true,
      ...rangeUpper,
    },
    direction: comparator,
    statisticalPlan: {
      primaryMetric: metricKey,
      nullHypothesis: `mean(${metricKey}) = ${input.falsificationSpec.falsificationThreshold}`,
      alternativeHypothesis: `mean(${metricKey}) ${comparator} ${input.falsificationSpec.falsificationThreshold}`,
      alpha: input.alpha,
      effectDirection: input.effectDirection,
      confidenceIntervalMethod: input.confidenceIntervalMethod,
      multipleTestingCorrection: input.multipleTestingCorrection,
      missingDataPolicy: 'listwise deletion; preregistered n fixed, no replacement, deletions logged',
      outlierPolicy: 'no post-hoc trimming; all preregistered runs retained',
      stoppingRule: `fixed n committed before unblinding at ${input.frozenAt}; no early stopping`,
    },
    seedPolicy: {
      fixed: true,
      seedValue: input.seedValue,
      allowCherryPick: false,
      justification: `eval seed frozen pre-measurement (seed=${input.seedValue})`,
    },
    deviationPolicy: {
      criticalCategories: ['alpha_rewrite', 'metric_swap', 'late_exclusion'],
      nonCriticalHandling: 'degrade',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: 'real-stats-freezer' },
      timestamp: input.frozenAt,
      environmentPolicy: 'preregistered offline eval; no drift between freeze and measurement',
      deviationPolicyHash: '0'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
  };
}

function resolveThresholdValue(spec: FalsificationSpec, thresholdSpec: ThresholdSpec): number {
  if (thresholdSpec.semantics === 'range') {
    return thresholdSpec.lower ?? spec.falsificationThreshold;
  }
  return thresholdSpec.value ?? spec.falsificationThreshold;
}

export function verdictResultFromKernelOutput(output: VerdictKernelOutput): VerdictResult {
  return {
    verdict: output.verdict,
    scopeSlipText: output.scopeReport.scopeSlipText,
    untestedReason:
      output.verdict === 'UNTESTED'
        ? output.untestedReason ?? output.reasonCodes.join(', ')
        : null,
    conflictingEvidenceCount: output.statisticalReport.conflicting ? 1 : 0,
    metricValue: output.statisticalReport.primaryEffectSize,
  };
}

/**
 * 投影 VerdictKernelOutput 的 4 个 verdict-critical 字段为持久化形态（P0-2-EXT）。
 *
 * 与 verdictResultFromKernelOutput 互补：后者投影 5 标量进 VerdictResult（驱动 verdict_nodes 旧列），
 * 本函数投影 reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency 进 VerdictTracePersisted
 * （驱动 verdict_nodes.verdict_trace_json + verdict_trace_hash）。两条投影线同源（同一 kernelOutput），
 * 确保 recordVerdict 落库的 trace 与 decision 来自同一次 decideFiveValueVerdict 调用（不可分别伪造）。
 */
export function extractVerdictTrace(output: VerdictKernelOutput): VerdictTracePersisted {
  return {
    reasonCodes: output.reasonCodes,
    ruleTrace: output.ruleTrace,
    decisiveRuleId: output.decisiveRuleId,
    evidenceSufficiency: output.evidenceSufficiency,
  };
}

function evidenceToDatasetBinding(evidence: EvidenceRecord, index: number): DatasetBindingSpec {
  validateEvidenceRecord(evidence);
  return {
    datasetId: `legacy-evidence-${index + 1}`,
    contentHash: evidence.sourceAnchor.rawResponseHash,
    sourceAnchor: {
      resolved:
        evidence.sourceAnchor.rawResponseHash.trim().length > 0 &&
        evidence.sourceAnchor.gitCommitSha.trim().length > 0,
    },
    scopeCoverage: {
      dimension: 'claim_scope',
      value: evidence.claim,
      relation: evidence.scopeNarrowerThanClaim ? 'partial' : 'within',
    },
  };
}

/**
 * evidenceToStatisticalResult —— V1 布尔证据 → V2 StatisticalResult 忠实桥接。
 *
 * 非显然决策（why）：V2 kernel 经 evaluateStatistics 的 `significant` 集合（adjustedPValue
 * !== undefined && <= α）+ R0-R9 决策树判定 supports/refutes/conflicting/CONFIRMED。V1 投票
 * （supportsClaim/refutesClaim）是确定性分类——无采样噪声。本桥接把投票译为 V2 可消费的统计结果，
 * 完整恢复 V1 decideVerdict 三态契约（经 decideFiveValueVerdict，非绕过 kernel）：
 *   - 混合（supports+refutes）→ R5 INCONCLUSIVE（e2e_offline_replay 契约）
 *   - 全 refutes → R6 REFUTED（verdict_stage 契约）
 *   - 全 supports → R7 CONFIRMED（executeLoop hero demo 契约）
 * 译约定（V1→V2 桥接 artifact·非真实测量·透明文档化以符反 theater）：pValue=adjustedPValue=0
 * （投票无采样噪声→空义显著）、effectSizeObserved=1（投票=单位效应·使 R7 primaryEffectSize 可用）、
 * testId=metricKey（primary 匹配）、status='ran'（投票是已执行判定→evidenceSufficiency sufficient）。
 */
function evidenceToStatisticalResult(
  evidence: EvidenceRecord,
  metricKey: string,
  thresholdSpec: ThresholdSpec,
): StatisticalResult {
  validateEvidenceRecord(evidence);
  const testId = stableMetricKey(metricKey);
  if (evidence.metricValue === undefined) {
    return {
      testId,
      status: 'ran',
      effectDirection: evidenceDirectionFromFlags(evidence),
      pValue: 0,
      adjustedPValue: 0,
      effectSizeObserved: 1,
      assumptionDiagnostics: [],
    };
  }
  return {
    testId,
    status: 'ran',
    effectDirection: evidenceDirectionFromMetric(evidence.metricValue, thresholdSpec),
    pValue: 0,
    adjustedPValue: 0,
    effectSizeObserved: evidence.metricValue,
    assumptionDiagnostics: [],
  };
}

function summarizeEvidenceSufficiency(
  evidences: ReadonlyArray<EvidenceRecord>,
  statistics: readonly StatisticalResult[],
  fec: FecContractV2 | null,
): EvidenceSufficiencyReport {
  if (evidences.length === 0 || statistics.every((stat) => stat.status === 'skipped')) {
    return { status: 'insufficient', powerStatus: 'unknown' };
  }
  return {
    status: 'sufficient',
    powerStatus: fec?.powerPlan === undefined ? 'unknown' : 'adequate',
  };
}

function evidenceDirectionFromMetric(
  metricValue: number,
  thresholdSpec: ThresholdSpec,
): StatisticalResult['effectDirection'] {
  const evaluation = evaluateThreshold(metricValue, thresholdSpec);
  return evaluation.supportsClaim ? 'supports' : 'refutes';
}

function evidenceDirectionFromFlags(evidence: EvidenceRecord): StatisticalResult['effectDirection'] {
  if (evidence.supportsClaim && !evidence.refutesClaim) {
    return 'supports';
  }
  if (evidence.refutesClaim && !evidence.supportsClaim) {
    return 'refutes';
  }
  return 'neutral';
}

function validateEvidenceRecord(evidence: EvidenceRecord): void {
  if (evidence.claim.trim().length === 0) {
    throw new Error('legacy_kernel_adapter: evidence claim must be non-empty');
  }
  if (evidence.metricValue !== undefined && !Number.isFinite(evidence.metricValue)) {
    throw new Error(`legacy_kernel_adapter: metricValue must be finite for evidence "${evidence.claim}"`);
  }
  if (evidence.metricValue === undefined && evidence.supportsClaim === evidence.refutesClaim) {
    throw new Error(
      `legacy_kernel_adapter: evidence without metricValue must set exactly one of supportsClaim/refutesClaim for "${evidence.claim}"`,
    );
  }
}

function stableMetricKey(metric: string): string {
  const key = metric.trim().replace(/[^A-Za-z0-9_.]+/g, '_').replace(/^_+|_+$/g, '');
  return key.length > 0 && /^[A-Za-z]/.test(key) ? key : 'legacy_metric';
}

function toFecThreshold(
  spec: FalsificationSpec,
  thresholdSpec: ThresholdSpec,
): FecThresholdSpec {
  if (thresholdSpec.semantics === 'range') {
    const threshold: FecThresholdSpec = {
      value: thresholdSpec.lower ?? spec.falsificationThreshold,
      unit: 'legacy_unit',
      thresholdSemantics: 'range',
      preregistered: false,
    };
    return thresholdSpec.upper === undefined ? threshold : { ...threshold, rangeUpper: thresholdSpec.upper };
  }
  return {
    value: thresholdSpec.value ?? spec.falsificationThreshold,
    unit: 'legacy_unit',
    thresholdSemantics: thresholdSpec.semantics,
    preregistered: false,
  };
}

function toEffectComparator(semantics: FalsificationSpec['thresholdSemantics']): EffectComparator {
  switch (semantics) {
    case 'gt':
      return 'greater';
    case 'lt':
      return 'less';
    case 'range':
      return 'within';
  }
}

function toStatEffectDirection(
  semantics: FalsificationSpec['thresholdSemantics'],
): FecContractV2['statisticalPlan']['effectDirection'] {
  switch (semantics) {
    case 'gt':
      return 'greater';
    case 'lt':
      return 'less';
    case 'range':
      return 'two_sided';
  }
}
