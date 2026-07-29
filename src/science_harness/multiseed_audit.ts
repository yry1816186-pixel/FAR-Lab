/**
 * multiseed_audit —— 真实 seed-dependent multi-seed BLS 实验 + cherry-pick 审计（FUSION-OS-1 strongest achievable closure）。
 *
 * 与 seed_cherry_pipeline（fixture 常量·detector-validation showcase）的根本区别：本模块的 runRegistry
 * 由 **真实 BLS 子进程执行** 产出——每个 seed 经 bls_compute.run(lightcurvePath, seed) 注入 seed-dependent
 * 高斯噪声（观测不确定性 bootstrap），产真实 distinct 测量。cherry-pick 从数据涌现：研究者只报告
 * "检测到"（depthSNR ≥ 阈值）的 seed，隐去非检测 seed；detect_seed_cherry 从 declared（全部 seed）
 * vs reported（检测子集）的真实差集 fire。无硬编码 declaredSeeds/reportedSeeds 列表。
 *
 * 诚实边界：BLS 跑 cached_fixture LC + 本地噪声注入（真实计算·非真实在线 TESS）。
 * 真 online TESS multi-seed 是 P1-6 V2 产品化路径（MAST 此环境不可达）。
 *
 * 单一真实依赖（T8）：venvSandboxAdapter.executeAsync 真起 python BLS（per-seed）+
 * detect_seed_cherry 真实集合差集 + src/statistics 真实两样本 z-test。
 *
 * Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-1 + CLAUDE.md §4 P-FUSION。
 */

import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runMigrations } from '../db/migrator.ts';
import { fecAppendClaim, computePreliminaryVerdict } from '../fec/index.ts';
import type { FecAppendClaimArgs } from '../fec/index.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/index.ts';
import { makeRealStatsFec } from '../falsifiability/index.ts';
import type { EvidenceRecord, FalsificationSpec, ThresholdSpec, Verdict, VerdictKernelOutput } from '../falsifiability/index.ts';
import type { FecGateDecision } from '../fec/fec_mandate.ts';
import { machineSealableConclusion } from '../far_proof/demo_chain.ts';
import { runBlsInSandbox, C_ASTRO_ALPHA, C_ASTRO_FROZEN_AT, C_ASTRO_SOURCE_ANCHOR } from './c_astro_pipeline.ts';
import type { BlsMetrics } from './c_astro_pipeline.ts';
import type { VenvSandboxAdapter } from './types.ts';
import { runAntiTheaterLint } from '../anti_theater/index.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import { buildAntiTheaterPipelineInput } from './anti_theater_input.ts';
import {
  adjustPValues,
  differenceInMeansConfidenceInterval,
  twoSampleEffectSize,
  twoSampleWelchZTest,
} from '../statistics/index.ts';
import type { StatisticalResult } from '../falsifiability/index.ts';
import type { EvidenceDirection } from '../schema/enums.ts';

export const MULTISEED_CLAIM_ID = 'C-MULTISEED-0001';
export const MULTISEED_METRIC_KEY = 'transit_depth_significance';
export const MULTISEED_PIPELINE_CLAIM =
  'TIC 268644982 shows a transit signal recovered across multiple pre-registered seeds (depthSNR >= detection threshold)';
export const MULTISEED_FROZEN_AT = C_ASTRO_FROZEN_AT;

// 研究者预注册的 5 个 seed（全跑）+ 声称的"检测阈值"（depthSNR >= 此值算检测到）。
// cherry-pick 从数据涌现：只报告 depthSNR >= 阈值的 seed，隐去非检测 seed。
export const MULTISEED_DECLARED_SEEDS: readonly number[] = [0, 1, 2, 3, 4];
export const MULTISEED_DETECTION_THRESHOLD = 8.5;

export const MULTISEED_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: MULTISEED_PIPELINE_CLAIM,
  metric: MULTISEED_METRIC_KEY,
  falsificationThreshold: 0,
  thresholdSemantics: 'gt',
};
export const MULTISEED_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0 };

export interface MultiseedRun {
  readonly seed: number;
  readonly metrics: BlsMetrics;
  readonly detected: boolean;
}

export interface MultiseedExperiment {
  /** 每个 seed 的真实 BLS 测量（子进程实算·distinct per seed）。 */
  readonly runs: readonly MultiseedRun[];
  /** 研究者"检测到"（depthSNR >= 阈值）的 seed 子集——cherry-pick 报告集（从数据涌现）。 */
  readonly detectedSeeds: readonly number[];
  /** 全部 declared seed（预注册·全跑）。 */
  readonly declaredSeeds: readonly number[];
  readonly detectionThreshold: number;
}

/**
 * 真起 venv BLS per seed：每个 seed 注入 seed-dependent 噪声 → 真实 distinct 测量。
 * detectedSeeds 从数据涌现（depthSNR >= 阈值）——非硬编码列表。
 */
export async function runMultiseedBlsExperiment(options: {
  readonly lightcurvePath: string;
  readonly pythonCmd?: string;
  readonly adapter?: VenvSandboxAdapter;
  readonly seeds?: readonly number[];
  readonly detectionThreshold?: number;
}): Promise<MultiseedExperiment> {
  const seeds = options.seeds ?? MULTISEED_DECLARED_SEEDS;
  const threshold = options.detectionThreshold ?? MULTISEED_DETECTION_THRESHOLD;
  const runs: MultiseedRun[] = [];
  for (const seed of seeds) {
    // 每 seed 独立 workingDir（bls_metrics.json 不冲突）。
    const work = mkdtempSync(resolve(tmpdir(), `far-mseed-s${seed}-`));
    try {
      const out = await runBlsInSandbox({
        lightcurvePath: options.lightcurvePath,
        workingDir: work,
        ...(options.pythonCmd !== undefined ? { pythonCmd: options.pythonCmd } : {}),
        ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
        blsSeed: seed,
      });
      runs.push({ seed, metrics: out.metrics, detected: out.metrics.depthSNR >= threshold });
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  const detectedSeeds = runs.filter((r) => r.detected).map((r) => r.seed);
  return { runs, detectedSeeds, declaredSeeds: seeds, detectionThreshold: threshold };
}

export interface MultiseedAuditResult {
  readonly db: Database.Database;
  readonly experiment: MultiseedExperiment;
  /** 真实 registry sha256（从 reported runs 的 metrics 实算）。 */
  readonly registryArtifactHash: string;
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  readonly antiTheaterReport: AntiTheaterReport;
  readonly statisticalResult: StatisticalResult;
  readonly sealedConclusion: Verdict;
}

/**
 * 审计 multi-seed submission：declared=全部 seed，runRegistry=检测子集（cherry-pick hides 非检测 seed）。
 * detect_seed_cherry 从真实 registry 差集 fire → verdict path → ANTI_THEATER_FAIL。
 *
 * @param db 已打开 DB。
 * @param experiment runMultiseedBlsExperiment 产出（真实 per-seed 测量 + 涌现的 detectedSeeds）。
 */
export async function auditMultiseedCherryPick(
  db: Database.Database,
  experiment: MultiseedExperiment,
): Promise<MultiseedAuditResult> {
  runMigrations(db);

  // reported runs = 检测子集（研究者 cherry-pick：只报告 depthSNR >= 阈值的 seed）。
  const reportedRuns = experiment.runs.filter((r) => experiment.detectedSeeds.includes(r.seed));
  if (reportedRuns.length === 0) {
    throw new Error('auditMultiseedCherryPick: no detected runs (experiment produced no seeds above threshold)');
  }

  // 真实统计：pool reported runs 的 in/out fluxes → 两样本 z-test（real src/statistics）。
  const pooledIn = reportedRuns.flatMap((r) => r.metrics.inFluxes);
  const pooledOut = reportedRuns.flatMap((r) => r.metrics.outFluxes);
  const zTest = twoSampleWelchZTest(pooledIn, pooledOut, 'less');
  const effectSize = twoSampleEffectSize(pooledOut, pooledIn);
  const ci = differenceInMeansConfidenceInterval(pooledOut, pooledIn, 0.95);
  const adjusted = adjustPValues([zTest.pValue], 'bonferroni', C_ASTRO_ALPHA);
  const adjustedPValue = adjusted[0]?.adjustedPValue ?? zTest.pValue;
  const meanDepth = reportedRuns.reduce((sum, r) => sum + r.metrics.depth, 0) / reportedRuns.length;
  const effectDirection: EvidenceDirection = meanDepth > 0 ? 'supports' : 'refutes';
  const statisticalResult: StatisticalResult = {
    testId: MULTISEED_METRIC_KEY,
    status: 'ran',
    effectDirection,
    pValue: zTest.pValue,
    adjustedPValue,
    effectSizeObserved: effectSize.cohensD,
    confidenceInterval: [ci.lower, ci.upper],
    assumptionDiagnostics: [],
  };

  // 真实 registry sha256（从 reported runs 的 metrics 实算·非字面量）。
  const registryArtifactHash = createHash('sha256')
    .update(JSON.stringify(reportedRuns.map((r) => ({ seed: r.seed, depth: r.metrics.depth, depthSNR: r.metrics.depthSNR }))))
    .digest('hex');

  const fec = makeRealStatsFec({
    claimId: MULTISEED_CLAIM_ID,
    falsificationSpec: MULTISEED_FALSIFICATION_SPEC,
    thresholdSpec: MULTISEED_THRESHOLD_SPEC,
    frozenAt: MULTISEED_FROZEN_AT,
    alpha: C_ASTRO_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'welch_difference_normal_approximation',
    effectDirection: 'greater',
    metricUnit: 'transit_depth',
    metricDescription: 'pooled BLS transit depth across reported (detected) seeds',
    seedValue: reportedRuns[0]!.seed,
  });

  const evidenceClaim =
    `multi-seed BLS (${experiment.declaredSeeds.length} seeds declared, ` +
    `${reportedRuns.length} reported/detected at depthSNR>=${experiment.detectionThreshold}): ` +
    `pooled mean depth=${meanDepth.toFixed(5)}, period~${reportedRuns[0]!.metrics.period.toFixed(3)}d`;
  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      metricValue: meanDepth,
      supportsClaim: effectDirection === 'supports',
      refutesClaim: effectDirection === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    },
  ];

  const baseFecArgs: FecAppendClaimArgs = {
    callRecord: {
      stageId: 'stage4_evidence',
      cred: {
        modelId: 'offline-replay-multiseed',
        dashscopeRequestId: null,
        reproHash: '6'.repeat(64),
        gitCommitSha: C_ASTRO_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: MULTISEED_FROZEN_AT,
      },
      payloadKind: 'observation',
      purposeTag: 'eval',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-MULTISEED-0001 multi-seed audit"}',
      responsePayload: `{"meanDepth":${meanDepth.toFixed(6)},"reportedSeeds":${reportedRuns.length}}`,
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: {
      claimId: MULTISEED_CLAIM_ID,
      claim: MULTISEED_PIPELINE_CLAIM,
      metric: MULTISEED_METRIC_KEY,
      declaredSeedCount: experiment.declaredSeeds.length,
      reportedSeedCount: reportedRuns.length,
      hiddenSeeds: experiment.declaredSeeds.filter((s) => !experiment.detectedSeeds.includes(s)),
      meanDepth,
      adjustedPValue,
    },
    sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    claim: MULTISEED_PIPELINE_CLAIM,
    falsificationSpec: MULTISEED_FALSIFICATION_SPEC,
    thresholdSpec: MULTISEED_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'evidence',
    fecV2: { contract: fec },
    statistics: [statisticalResult],
    contractInput: {
      claimId: MULTISEED_CLAIM_ID,
      measurableImplication: MULTISEED_FALSIFICATION_SPEC.prediction,
      metric: MULTISEED_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: MULTISEED_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: MULTISEED_FROZEN_AT,
    },
  };

  // detect_seed_cherry 诚实 fire：declaredSeeds=全部 seed ⊄ runRegistrySeeds=检测子集 → 真实差集（hidden seeds）。
  // registry 的 artifactHash + metricValue 由真实 per-seed BLS 实算产出（非模块常量）。
  const preliminaryVerdict = computePreliminaryVerdict(baseFecArgs);
  const antiTheaterReport = runAntiTheaterLint(
    buildAntiTheaterPipelineInput({
      fec,
      preliminaryVerdict,
      artifactHash: registryArtifactHash,
      metricKey: fec.metric.metricKey,
      metricValue: meanDepth,
      frozenAt: MULTISEED_FROZEN_AT,
      primarySeed: reportedRuns[0]!.seed,
      envelopeId: `ENV-${MULTISEED_CLAIM_ID}`,
      humanSummary: 'C-MULTISEED multi-seed BLS audit: see structured verdict + real per-seed registry.',
      datasetId: 'multiseed-castro-lightcurve',
      runIdPrefix: 'mseed-run-seed',
      declaredSeeds: experiment.declaredSeeds,
      runRegistrySeeds: experiment.detectedSeeds,
    }),
  );
  const fecResult = fecAppendClaim(db, { ...baseFecArgs, antiTheaterReport });
  const { conclusion: sealedConclusion } = machineSealableConclusion(fecResult.decision.verdict);

  return {
    db,
    experiment,
    registryArtifactHash,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    antiTheaterReport,
    statisticalResult,
    sealedConclusion,
  };
}
