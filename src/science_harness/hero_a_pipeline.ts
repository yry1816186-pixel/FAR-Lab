/**
 * hero_a_pipeline —— hero-A-001 真实 proof chain（Pipeline B · P1-5 · STAT-1 接线）。
 *
 * 与 hero_a_harness.ts（Pipeline A：buildHeroAChecks→mapChecksToVerdict 布尔路径）并存：
 *   - Pipeline A 保留（布尔计数器路径仍有效，其测试不动）。
 *   - 本文件走 Pipeline B：fixture 样本 → src/statistics/ 真实计算 → fecAppendClaim(statistics?)
 *     → decideFiveValueVerdict（R5-R8 真实触发）→ machineSealableConclusion → sealProofEnvelope。
 *
 * 单一真实依赖（T8）：src/statistics/（oneSampleZTest/meanConfidenceInterval/cohensDOneSample/adjustPValues）
 * —— 本文件是其**首个生产 caller**（STAT-1 BUILT_UNWIRED→WIRED 起点；此前仅 tests/statistics 调用）。
 *
 * 诚实边界（ASK-9）：机器裁决可产 CONFIRMED（真实 R7），但 sealProofEnvelope 禁签 CONFIRMED →
 *   machineSealableConclusion 降级 CONFIRMED→INCONCLUSIVE（记 knownFailure 需人类背书）。
 *
 * 模型中立：全程 offline_replay，无 qwen/dashscope 字面量。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言 / 桩。
 */

import type Database from 'better-sqlite3';
import { runMigrations } from '../db/migrator.ts';
import { fecAppendClaim, computePreliminaryVerdict } from '../fec/index.ts';
import type { FecAppendClaimArgs } from '../fec/index.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/index.ts';
import {
  makeRealStatsFec,
} from '../falsifiability/index.ts';
import type {
  EvidenceRecord,
  FalsificationSpec,
  StatisticalResult,
  ThresholdSpec,
  Verdict,
  VerdictKernelOutput,
} from '../falsifiability/index.ts';
import type { FecGateDecision } from '../fec/fec_mandate.ts';
import {
  GENESIS_PROOF_HASH,
  sealProofEnvelope,
} from '../proof_envelope/index.ts';
import type { SealResult } from '../proof_envelope/index.ts';
import type { SourceAnchor } from '../evidence_log/types.ts';
import { machineSealableConclusion } from '../far_proof/demo_chain.ts';
import type { EvidenceDirection } from '../schema/enums.ts';
import {
  adjustPValues,
  cohensDOneSample,
  meanConfidenceInterval,
  oneSampleZTest,
  sampleMean,
} from '../statistics/index.ts';
import type { ConfidenceInterval, ZTestResult } from '../statistics/index.ts';
import { runAntiTheaterLint } from '../anti_theater/index.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import type { AntiTheaterLintInput } from '../anti_theater/types.ts';
import type { FecContractV2 } from '../fec/fec_contract.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';

// ---------------------------------------------------------------------------
// 确定性常量（fixture · preregistered before unblinding）
// ---------------------------------------------------------------------------

export const HERO_A_PIPELINE_CLAIM_ID = 'C-MMLU-A-0001';

/**
 * stableMetricKey 对干净 snake_case 为 identity；falsificationSpec.metric 与 StatisticalResult.testId
 * 必须同此值（kernel primary test 匹配：`statistics.filter(s => s.testId === fec.metric.metricKey)`）。
 */
export const HERO_A_METRIC_KEY = 'mmlu_physics_accuracy';

export const HERO_A_PIPELINE_CLAIM =
  'model A achieves mean per-run accuracy >= 0.72 on MMLU-physics held-out split';

export const HERO_A_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: HERO_A_PIPELINE_CLAIM,
  metric: HERO_A_METRIC_KEY,
  falsificationThreshold: 0.72,
  thresholdSemantics: 'gt',
};

export const HERO_A_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.72,
};

/** H0: mean(per-run accuracy) = 0.72（claim 的证伪阈值即为 null）。 */
export const HERO_A_NULL_MEAN = 0.72;

/**
 * 预登记总体 SD（pilot 估计·freeze 前固定·z-test 用）。oneSampleZTest 用此值（非样本 SD）算 SE，
 * 故样本 SD 不影响 pValue——pValue 由样本均值 + 此 preregistered popSD 决定。
 */
export const HERO_A_POPULATION_SD = 0.04;

export const HERO_A_ALPHA = 0.05;
export const HERO_A_CONFIDENCE_LEVEL = 0.95;
export const HERO_A_SEED = 42;
export const HERO_A_FROZEN_AT = '2026-07-01T00:00:00.000Z';

/**
 * fixture：20 次 MMLU-physics eval run 的单次准确率（固定 seed=42 产出·确定性）。
 * 诚实声明：fixture 数值（非真实沙箱产物）；P1-6 venv 沙箱落地后由真实评测替换（Phase 5 同模式）。
 * 其价值是驱动 src/statistics/ 真实计算（pValue/CI/effectSize 非字面量），不是充当真实测量。
 */
export const HERO_A_RUN_ACCURACIES: readonly number[] = [
  0.74, 0.76, 0.73, 0.77, 0.75, 0.78, 0.74, 0.76, 0.72, 0.75,
  0.77, 0.76, 0.74, 0.78, 0.75, 0.73, 0.76, 0.77, 0.75, 0.74,
];

export const HERO_A_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'a'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: HERO_A_FROZEN_AT,
  rawResponseHash: 'b'.repeat(64),
  codeLocation: {
    filePath: 'eval/mmlu_physics/adapter_a.py',
    location: 'AdapterA.evaluate@seed42',
    lineNumber: 88,
  },
};

// ---------------------------------------------------------------------------
// 真实统计计算（src/statistics/ 生产 caller）
// ---------------------------------------------------------------------------

export interface HeroAStatistics {
  readonly sample: readonly number[];
  readonly observedMean: number;
  readonly zTest: ZTestResult;
  readonly confidenceInterval: ConfidenceInterval;
  readonly cohensD: number;
  readonly adjustedPValue: number;
  readonly effectDirection: EvidenceDirection;
  readonly statisticalResult: StatisticalResult;
}

/**
 * 对 HERO_A_RUN_ACCURACIES 做真实统计，产 StatisticalResult（pValue/adjustedPValue/CI/effectSize 全由 src/statistics/ 算出）。
 *
 * @param metricKey 来自 FEC（=== fec.metric.metricKey），保证 StatisticalResult.testId 与 kernel primary 匹配。
 */
export function buildHeroAStatistics(metricKey: string): HeroAStatistics {
  const sample = HERO_A_RUN_ACCURACIES;
  const observedMean = sampleMean(sample);
  const zTest = oneSampleZTest(sample, HERO_A_NULL_MEAN, HERO_A_POPULATION_SD, 'greater');
  const confidenceInterval = meanConfidenceInterval(sample, HERO_A_CONFIDENCE_LEVEL);
  const cohensD = cohensDOneSample(sample, HERO_A_NULL_MEAN);
  const adjusted = adjustPValues([zTest.pValue], 'bonferroni', HERO_A_ALPHA);
  const adjustedPValue = adjusted[0]?.adjustedPValue ?? zTest.pValue;

  // effectDirection：claim 为 'gt'（accuracy >= 0.72）；观测均值 > null 阈值 → 在 claim 方向 → supports。
  // kernel `significant` 门（adjustedPValue<=alpha）已保证仅显著时 supports 才计入裁决。
  const effectDirection: EvidenceDirection = observedMean > HERO_A_NULL_MEAN ? 'supports' : 'refutes';

  const statisticalResult: StatisticalResult = {
    testId: metricKey,
    status: 'ran',
    effectDirection,
    pValue: zTest.pValue,
    adjustedPValue,
    effectSizeObserved: cohensD,
    confidenceInterval: [confidenceInterval.lower, confidenceInterval.upper],
    assumptionDiagnostics: [],
  };

  return {
    sample,
    observedMean,
    zTest,
    confidenceInterval,
    cohensD,
    adjustedPValue,
    effectDirection,
    statisticalResult,
  };
}

// ---------------------------------------------------------------------------
// Pipeline B 编排（镜像 demo_chain.ts buildDemoChain shape）
// ---------------------------------------------------------------------------

export interface HeroAPipelineResult {
  /** 调用方负责关闭 db。 */
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  readonly statistics: HeroAStatistics;
  /** FEC 编排产出的机器裁决（密封前·真实 R7 驱动时可 = CONFIRMED）。 */
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  /** FUSION-OS-1：full-scope 生产 caller 真跑 runAntiTheaterLint 产 report（anti-theater :373 可达·R4 不 shadow）。 */
  readonly antiTheaterReport: AntiTheaterReport;
  readonly sealed: SealResult;
  /** 实际密封 conclusion（绝不 = CONFIRMED）。 */
  readonly sealedConclusion: Verdict;
}

export const HERO_A_ANTI_THEATER_SUMMARY =
  'Hero-A MMLU-physics accuracy eval result summary: see structured verdict and preregistered fixture samples for the directional-support conclusion.';

export interface HeroAAntiTheaterInputArgs {
  readonly fec: FecContractV2;
  readonly preliminaryVerdict: VerdictKernelOutput;
  readonly artifactHash: string;
  readonly metricKey: string;
  readonly metricValue: number;
  readonly frozenAt: string;
  readonly seed: number;
  readonly envelopeId: string;
  readonly humanSummary: string;
  /** 测试用攻击注入（诚实代表 cherry-picked run registry）。生产不传 → declaredSeeds=[seed]=runRegistry → 干净。 */
  readonly declaredSeeds?: readonly number[];
  readonly runRegistrySeeds?: readonly number[];
}

// FUSION-OS-1 闭合 caller：hero_a 是 full-scope（scopeNarrowerThanClaim=false）→ R4 不 fire →
// anti-theater verdict_kernel_v2.ts:373 可达（c_astro cached_fixture 被 R4 :345 shadow·结构性不可达）。
// 反剧场红线：caller 不手填 findings——findings 由 runAntiTheaterLint(detectors) 真实产出。
export function buildHeroAAntiTheaterInput(args: HeroAAntiTheaterInputArgs): AntiTheaterLintInput {
  const artifactRef = `sha256:${args.artifactHash}`;
  const baseRunId = `heroA-run-seed${args.seed}`;
  const declaredSeeds = args.declaredSeeds ?? [args.seed];
  const runRegistrySeeds = args.runRegistrySeeds ?? [args.seed];
  const primaryEvidenceId = args.fec.requiredEvidence[0]?.evidenceId;
  const thresholdHash = hashCanonicalJson({
    threshold: args.fec.threshold,
    direction: args.fec.direction,
    thresholdSemantics: args.fec.threshold.thresholdSemantics,
  });
  const primaryMetricHash = hashCanonicalJson({ metric: args.fec.metric });
  const seedPolicyHash = hashCanonicalJson({ seedPolicy: args.fec.seedPolicy });
  return {
    fec: args.fec,
    bindings: [
      {
        kind: 'dataset',
        datasetId: 'hero-a-mmlu-fixture',
        contentHash: args.artifactHash,
        schemaHash: args.artifactHash,
        statsFingerprint: '',
      },
    ],
    executionTrace: {
      measurements: [
        {
          ...(primaryEvidenceId !== undefined ? { requirementId: primaryEvidenceId } : {}),
          role: 'primary',
          rawArtifactHashes: [artifactRef],
          runId: baseRunId,
          splitName: 'hidden',
          metricKey: args.metricKey,
          metricValue: args.metricValue,
        },
      ],
      runs: runRegistrySeeds.map((runSeed, index) => ({
        runId: `${baseRunId}-${index}`,
        endedAt: args.frozenAt,
        isInterim: false,
        earlyStopped: false,
        seed: runSeed,
      })),
    },
    verdict: args.preliminaryVerdict,
    envelopeDraft: {
      envelopeId: args.envelopeId,
      humanSummary: args.humanSummary,
      nullResults: [],
    },
    preregistrationRecord: {
      thresholdHash,
      primaryMetricHash,
      alpha: args.fec.statisticalPlan.alpha,
      seedPolicyHash,
      hypothesisSealedAt: args.frozenAt,
      toleranceFrozen: true,
      declaredSeeds,
    },
    runRegistry: {
      runs: runRegistrySeeds.map((runSeed, index) => ({ runId: `${baseRunId}-${index}`, seed: runSeed })),
      declaredNullResults: [],
    },
  };
}

/**
 * 构造 hero-A 真实 proof chain：samples → statistics → FEC → fecAppendClaim(statistics?) → ASK-9 → seal。
 *
 * @param db 已打开的 :memory: 或文件 DB（函数内应用全部迁移）。
 */
export function buildHeroAChain(
  db: Database.Database,
  options?: {
    /** 测试用攻击注入（诚实代表 cherry-picked run registry）。生产不传 → declaredSeeds=[seed]=runRegistry → 干净。 */
    readonly antiTheaterDeclaredSeeds?: readonly number[];
    readonly antiTheaterRunRegistrySeeds?: readonly number[];
  },
): HeroAPipelineResult {
  runMigrations(db);

  const fec = makeRealStatsFec({
    claimId: HERO_A_PIPELINE_CLAIM_ID,
    falsificationSpec: HERO_A_FALSIFICATION_SPEC,
    thresholdSpec: HERO_A_THRESHOLD_SPEC,
    frozenAt: HERO_A_FROZEN_AT,
    alpha: HERO_A_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'normal_approximation_z',
    effectDirection: 'greater',
    metricUnit: 'accuracy_proportion',
    metricDescription: 'mean per-run accuracy on MMLU-physics held-out split',
    seedValue: HERO_A_SEED,
  });

  const statistics = buildHeroAStatistics(fec.metric.metricKey);

  const evidenceClaim = `measured mean per-run accuracy = ${statistics.observedMean.toFixed(4)} across ${HERO_A_RUN_ACCURACIES.length} runs (popSD=${HERO_A_POPULATION_SD} preregistered, seed=${HERO_A_SEED})`;
  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      metricValue: statistics.observedMean,
      supportsClaim: statistics.effectDirection === 'supports',
      refutesClaim: statistics.effectDirection === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor: HERO_A_SOURCE_ANCHOR,
    },
  ];

  const baseFecArgs: FecAppendClaimArgs = {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: '1'.repeat(64),
        gitCommitSha: HERO_A_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: HERO_A_FROZEN_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-MMLU-A-0001 eval fixture"}',
      responsePayload: `{"mean_accuracy":${statistics.observedMean.toFixed(6)}}`,
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: {
      providerProfile: 'offline_replay',
    },
    evidencePayload: {
      claimId: HERO_A_PIPELINE_CLAIM_ID,
      claim: HERO_A_PIPELINE_CLAIM,
      metric: HERO_A_METRIC_KEY,
      observedMean: statistics.observedMean,
      pValue: statistics.zTest.pValue,
      adjustedPValue: statistics.adjustedPValue,
    },
    sourceAnchor: HERO_A_SOURCE_ANCHOR,
    claim: HERO_A_PIPELINE_CLAIM,
    falsificationSpec: HERO_A_FALSIFICATION_SPEC,
    thresholdSpec: HERO_A_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
    contractInput: {
      claimId: HERO_A_PIPELINE_CLAIM_ID,
      measurableImplication: HERO_A_FALSIFICATION_SPEC.prediction,
      metric: HERO_A_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: HERO_A_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: HERO_A_FROZEN_AT,
    },
  };

  // FUSION-OS-1：full-scope 生产 caller 真跑 runAntiTheaterLint 注入 fecAppendClaim（R4 不 shadow·:373 可达）。
  const preliminaryVerdict = computePreliminaryVerdict(baseFecArgs);
  const heroAArtifactHash = hashCanonicalJson({ runs: HERO_A_RUN_ACCURACIES });
  const antiTheaterReport = runAntiTheaterLint(
    buildHeroAAntiTheaterInput({
      fec,
      preliminaryVerdict,
      artifactHash: heroAArtifactHash,
      metricKey: fec.metric.metricKey,
      metricValue: statistics.observedMean,
      frozenAt: HERO_A_FROZEN_AT,
      seed: HERO_A_SEED,
      envelopeId: `ENV-${HERO_A_PIPELINE_CLAIM_ID}`,
      humanSummary: HERO_A_ANTI_THEATER_SUMMARY,
      ...(options?.antiTheaterDeclaredSeeds !== undefined ? { declaredSeeds: options.antiTheaterDeclaredSeeds } : {}),
      ...(options?.antiTheaterRunRegistrySeeds !== undefined ? { runRegistrySeeds: options.antiTheaterRunRegistrySeeds } : {}),
    }),
  );
  const fecResult = fecAppendClaim(db, { ...baseFecArgs, antiTheaterReport });

  const { conclusion: sealedConclusion, needsHumanEndorsement } =
    machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = needsHumanEndorsement
    ? [
        `machine verdict was CONFIRMED (real R7, adjustedP=${statistics.adjustedPValue.toExponential(3)}) but downgraded to INCONCLUSIVE for sealing (ASK-9: CONFIRMED requires human endorsement)`,
        'MMLU eval fixture is preregistered synthetic samples; real sandbox measurement is P1-6 V2 roadmap',
      ]
    : [
        'MMLU eval fixture is preregistered synthetic samples; real sandbox measurement is P1-6 V2 roadmap',
      ];

  const sealed = sealProofEnvelope(db, {
    claimId: HERO_A_PIPELINE_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: HERO_A_FALSIFICATION_SPEC,
    sourceAnchor: HERO_A_SOURCE_ANCHOR,
    reproHash: '1'.repeat(64),
    sealedAt: HERO_A_FROZEN_AT,
  });

  return {
    db,
    claimId: HERO_A_PIPELINE_CLAIM_ID,
    claimText: HERO_A_PIPELINE_CLAIM,
    statistics,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    antiTheaterReport,
    sealed,
    sealedConclusion,
  };
}
