/**
 * osc_pipeline —— Open Science Collaboration (2015) "Estimating the
 * reproducibility of psychological science" 真实论文端到端验证 pipeline。
 *
 * 论文：Open Science Collaboration (2015). Estimating the reproducibility of
 *       psychological science. Science, 349(6251), aac4716.
 *       DOI: 10.1126/science.aac4716
 *
 * 心理学可重复性危机的"坐标时刻"论文——100 个团队、97 项独立复制研究。
 * 核心发现：
 *   - 原始研究 97% 报告显著结果（97/100, p<0.05）
 *   - 复制研究仅 36% 显著（36/97, p<0.05）
 *   - 原始中位效应量 r = 0.403；复制中位效应量 r = 0.197（仅为原始的 49%）
 *
 * 科学叙事（DEGRADED_SCOPE 的典范）：
 *   OSC-2015 不是"效应不存在"，而是"效应存在但量级大幅缩水、显著率崩塌"。
 *   复制效应量 r=0.197 在 Fisher z 检验下仍显著大于 0（支持 claim 方向），
 *   但效应量只有原始的一半、显著率从 97% 崩到 36%——证据只覆盖了 claim 的
 *   一个退化子集（"效应非零"），而非完整 claim（"以可比量级与显著率复现"）。
 *   这正是 R4 DEGRADED_SCOPE 的判定语义。
 *
 * 诚实边界：
 *   - metricValue 来自论文公开摘要统计（非 sandbox 真实执行）
 *   - 使用论文报告的汇总统计（N、显著计数、中位 r），非原始试次级数据
 *   - Fisher r→z 变换在 src/statistics/ 中无现成实现，故在本文内以纯函数实现
 *     （rToZ/zToR，独立测试覆盖），与 repro/real_paper/osc_replication_recompute.py
 *     的 Python 轴交叉验证
 *   - 单侧检验：claim 方向是"复制效应 > 0"，与 OSC 的 meta-analytic 结论一致
 */

import type Database from 'better-sqlite3';
import { runMigrations } from '../db/migrator.ts';
import { fecAppendClaim, computePreliminaryVerdict } from '../fec/index.ts';
import type { FecAppendClaimArgs } from '../fec/index.ts';
import { GENESIS_PREV_HASH } from '../evidence_log/index.ts';
import { makeRealStatsFec } from '../falsifiability/index.ts';
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
import { machineSealableConclusion } from '../far_proof/demo_chain.ts';
import type { EvidenceDirection } from '../schema/enums.ts';
import {
  adjustPValues,
  normalSurvival,
} from '../statistics/index.ts';
import { runAntiTheaterLint } from '../anti_theater/index.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { buildAntiTheaterPipelineInput } from './anti_theater_input.ts';

// ---------------------------------------------------------------------------
// 论文元数据（真实公开信息）
// ---------------------------------------------------------------------------

/** OSC (2015) replication claim identifier. */
export const OSC_CLAIM_ID = 'C-OSC-2015-REPRO';
/** OSC metric key: replication median effect size (r). */
export const OSC_METRIC_KEY = 'osc_replication_effect_r';
/** OSC claim: published effects reproduce in independent replication. */
export const OSC_CLAIM_TEXT =
  'Effects reported in published psychological science are reproduced in independent replication at comparable magnitude and significance';
/** OSC falsification spec: replication effect must exceed zero (r > 0). */
export const OSC_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: OSC_CLAIM_TEXT,
  metric: OSC_METRIC_KEY,
  falsificationThreshold: 0,
  thresholdSemantics: 'gt',
};
/** OSC threshold spec: replication median r > 0 (nonzero effect). */
export const OSC_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0,
};
/** H0: replication median effect r = 0. */
export const OSC_NULL_R = 0;
/** OSC significance level (two-tailed .05). */
export const OSC_ALPHA = 0.05;
/** OSC paper publication date (Science 2015-08-28). */
export const OSC_FROZEN_AT = '2015-08-28T00:00:00.000Z';
/** Original studies selected (OSC selected 100 original studies). */
export const OSC_ORIGINAL_N = 100;
/** Original studies reporting significant results (97%). */
export const OSC_ORIGINAL_SIGNIFICANT = 97;
/** Replications conducted (97 replications with data). */
export const OSC_REPLICATION_N = 97;
/** Replications reporting significant results (36%). */
export const OSC_REPLICATION_SIGNIFICANT = 36;
/** Median original effect size r (reported). */
export const OSC_ORIGINAL_MEDIAN_R = 0.403;
/** Median replication effect size r (reported). */
export const OSC_REPLICATION_MEDIAN_R = 0.197;

// ---------------------------------------------------------------------------
// Fisher r→z 变换（src/statistics/ 无现成实现，此处为纯函数）
// ---------------------------------------------------------------------------

/**
 * Fisher r-to-z transform: z = 0.5 * ln((1+r)/(1-r)).
 * @param r correlation in (-1, 1)
 */
export function rToZ(r: number): number {
  if (!(r > -1 && r < 1)) {
    throw new Error(`rToZ: r must be strictly inside (-1, 1), got ${r}`);
  }
  return 0.5 * Math.log((1 + r) / (1 - r));
}

/** Inverse Fisher transform: r = tanh(z). */
export function zToR(z: number): number {
  return Math.tanh(z);
}

// ---------------------------------------------------------------------------
// OSC 统计计算（用 src/statistics/ 复算论文报告的汇总统计）
// ---------------------------------------------------------------------------

/** Real statistics from OSC (2015), recomputed by FAR-Lab. */
export interface OscStatistics {
  /** Original studies count (100). */
  readonly originalCount: number;
  /** Original significant rate (97/100 = 0.97). */
  readonly originalSignificantRate: number;
  /** Replications count (97). */
  readonly replicationCount: number;
  /** Replication significant rate (36/97 ≈ 0.3711). */
  readonly replicationSignificantRate: number;
  /** Median original effect size r (reported 0.403). */
  readonly originalMedianR: number;
  /** Median replication effect size r (reported 0.197). */
  readonly replicationMedianR: number;
  /** Fisher z-transform of the replication median r. */
  readonly replicationEffectZ: number;
  /** Fisher z standard error: 1/sqrt(N-3). */
  readonly replicationEffectSe: number;
  /** z-statistic for replication effect vs zero. */
  readonly replicationEffectZStat: number;
  /** One-sided p for replication effect > 0. */
  readonly replicationEffectP: number;
  /** Two-proportion z for the significance-rate collapse (97% -> 36%). */
  readonly rateDropZ: number;
  /** Two-sided p for the rate-drop test. */
  readonly rateDropP: number;
  /** Effect-size shrinkage: 1 - replicationR / originalR (≈0.51). */
  readonly effectShrinkage: number;
  /** BH-FDR adjusted p-values over the OSC test family. */
  readonly bhAdjustedPs: readonly number[];
  /** Whether the primary test survives FDR at alpha=0.05. */
  readonly survivesFdr: boolean;
  /** Evidence direction relative to the claim. */
  readonly effectDirection: EvidenceDirection;
  /** StatisticalResult for FEC kernel consumption. */
  readonly statisticalResult: StatisticalResult;
}

/**
 * Recompute OSC (2015) aggregate statistics using FAR-Lab's src/statistics/.
 *
 * 诚实声明：OSC 报告的是汇总统计（N、显著计数、中位 r），我们基于这些公开
 * 数字复算，而非对原始数据集的复算。
 *   - 主检验：复制中位效应量 r=0.197 经 Fisher z 变换后检验 H0: r=0（单侧）。
 *     SE = 1/sqrt(N-3)（Fisher 变换的标准误差），N=97。
 *   - 辅助检验：显著率崩塌（原始 97% vs 复制 36%）的两比例 z 检验——这是
 *     OSC 最震撼的发现，但它是"范围退化"的证据，不是主 claim 的正面检验。
 *   - 多重校正：对 { 效应量 z 检验, 显著率崩塌 z 检验 } 家族做 BH-FDR，
 *     与 Python 轴 repro/real_paper/osc_replication_recompute.py 一致。
 */
export function buildOscStatistics(metricKey: string): OscStatistics {
  const originalSignificantRate = OSC_ORIGINAL_SIGNIFICANT / OSC_ORIGINAL_N;
  const replicationSignificantRate = OSC_REPLICATION_SIGNIFICANT / OSC_REPLICATION_N;

  // Fisher z on the replication median effect size, tested against 0 (one-sided).
  const zRep = rToZ(OSC_REPLICATION_MEDIAN_R);
  const seRep = 1 / Math.sqrt(OSC_REPLICATION_N - 3);
  const zStat = zRep / seRep;
  const effectP = normalSurvival(zStat); // one-sided P(Z > z)

  // Two-proportion z on the significance-rate collapse (97% -> 36%).
  const pooled = (OSC_ORIGINAL_SIGNIFICANT + OSC_REPLICATION_SIGNIFICANT) /
    (OSC_ORIGINAL_N + OSC_REPLICATION_N);
  const seDrop = Math.sqrt(
    pooled * (1 - pooled) * (1 / OSC_ORIGINAL_N + 1 / OSC_REPLICATION_N),
  );
  const rateDropZ =
    (OSC_ORIGINAL_SIGNIFICANT / OSC_ORIGINAL_N - OSC_REPLICATION_SIGNIFICANT / OSC_REPLICATION_N) /
    seDrop;
  const rateDropP = 2 * normalSurvival(Math.abs(rateDropZ));

  const effectShrinkage = 1 - OSC_REPLICATION_MEDIAN_R / OSC_ORIGINAL_MEDIAN_R;

  // BH-FDR over the OSC test family { effect-size z, rate-drop z }.
  const adjusted = adjustPValues([effectP, rateDropP], 'bh_fdr', OSC_ALPHA);
  const adjustedEffect = adjusted[0]?.adjustedPValue ?? effectP;
  const survivesFdr = adjustedEffect < OSC_ALPHA;

  // 复制效应显著 > 0 → 支持 claim 方向（"效应非零"），但范围退化（R4）。
  const effectDirection: EvidenceDirection = 'supports';

  const statisticalResult: StatisticalResult = {
    testId: metricKey,
    status: 'ran',
    effectDirection,
    pValue: effectP,
    adjustedPValue: adjustedEffect,
    effectSizeObserved: OSC_REPLICATION_MEDIAN_R,
    confidenceInterval: [
      zToR(zRep - 1.96 * seRep),
      zToR(zRep + 1.96 * seRep),
    ],
    assumptionDiagnostics: [
      {
        kind: 'distribution_drift',
        severity: 'warn',
      },
    ],
  };

  return {
    originalCount: OSC_ORIGINAL_N,
    originalSignificantRate,
    replicationCount: OSC_REPLICATION_N,
    replicationSignificantRate,
    originalMedianR: OSC_ORIGINAL_MEDIAN_R,
    replicationMedianR: OSC_REPLICATION_MEDIAN_R,
    replicationEffectZ: zRep,
    replicationEffectSe: seRep,
    replicationEffectZStat: zStat,
    replicationEffectP: effectP,
    rateDropZ,
    rateDropP,
    effectShrinkage,
    bhAdjustedPs: adjusted.map((a) => a.adjustedPValue),
    survivesFdr,
    effectDirection,
    statisticalResult,
  };
}

// ---------------------------------------------------------------------------
// Pipeline 编排
// ---------------------------------------------------------------------------

/** Complete OSC pipeline result. */
export interface OscPipelineResult {
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  readonly statistics: OscStatistics;
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  readonly antiTheaterReport: AntiTheaterReport;
  readonly sealed: SealResult;
  readonly sealedConclusion: Verdict;
}

/** Human summary for anti-theater input. */
export const OSC_ANTI_THEATER_SUMMARY =
  'OSC (2015) replicated 97 studies: median replication r=0.197 vs original 0.403; ' +
  'only 36% of replications significant vs 97% original; FAR-Lab Fisher z shows a ' +
  'nonzero replication effect, but the evidence covers a degraded, narrow scope of ' +
  'the claim (partial reproducibility at ~half magnitude).';

/**
 * Build OSC (2015) real paper proof chain.
 *
 * @param db Open :memory: or file DB (migrations applied inside).
 *
 * 裁决路径说明：
 *   - 统计侧：复制效应 r=0.197 > 0（Fisher z, adjustedP < alpha），方向 supports。
 *   - scope 侧：证据记录了 range 退化（scopeNarrowerThanClaim=true →
 *     scopeCoverage.relation='partial' → scopePartial），且统计诊断带
 *     distribution_drift warn → evaluateScope 的 isDegraded=true。
 *   - 因此 R4（DEGRADED_SCOPE，line 406）在 R6/R7 之前触发：
 *     证据存在且方向支持，但只覆盖 claim 的退化子集。
 */
export function buildOscChain(db: Database.Database): OscPipelineResult {
  runMigrations(db);

  const fec = makeRealStatsFec({
    claimId: OSC_CLAIM_ID,
    falsificationSpec: OSC_FALSIFICATION_SPEC,
    thresholdSpec: OSC_THRESHOLD_SPEC,
    frozenAt: OSC_FROZEN_AT,
    alpha: OSC_ALPHA,
    multipleTestingCorrection: 'bh_fdr',
    confidenceIntervalMethod: 'normal_approximation_z',
    effectDirection: 'greater',
    metricUnit: 'effect_size_r',
    metricDescription: 'median replication effect size (r) across 97 studies (OSC 2015)',
    seedValue: 43,
  });

  const statistics = buildOscStatistics(fec.metric.metricKey);

  const evidenceClaim =
    `OSC (2015) replicated ${statistics.replicationCount} studies: median replication ` +
    `r=${statistics.replicationMedianR.toFixed(3)} vs original r=${statistics.originalMedianR.toFixed(3)}; ` +
    `${(statistics.replicationSignificantRate * 100).toFixed(0)}% significant vs ` +
    `${(statistics.originalSignificantRate * 100).toFixed(0)}% original; ` +
    `FAR-Lab Fisher z p=${statistics.replicationEffectP.toFixed(4)} (one-sided), ` +
    `BH-FDR adjusted p=${(statistics.bhAdjustedPs[0] ?? 0).toFixed(4)}.`;

  const supportsClaim = statistics.survivesFdr;

  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      metricValue: statistics.replicationMedianR,
      supportsClaim,
      refutesClaim: false,
      // 关键：证据只覆盖 claim 的退化子集（效应非零），未覆盖"以可比量级复现"。
      scopeNarrowerThanClaim: true,
      sourceAnchor: {
        gitCommitSha: 'o'.repeat(40),
        dashscopeRequestId: null,
        isoTimestamp: OSC_FROZEN_AT,
        rawResponseHash: 'c'.repeat(64),
        codeLocation: {
          filePath: 'repro/real_paper/osc_replication_recompute.py',
          location: 'OSC2015@published-stats',
          lineNumber: 40,
        },
      },
    },
  ];

  const baseFecArgs: FecAppendClaimArgs = {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'osc-2015-published-stats',
        dashscopeRequestId: null,
        reproHash: '3'.repeat(64),
        gitCommitSha: 'o'.repeat(40),
        isoTimestamp: OSC_FROZEN_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"source":"OSC 2015 Science 349(6251) aac4716 DOI:10.1126/science.aac4716"}',
      responsePayload: JSON.stringify({
        originalSignificantRate: statistics.originalSignificantRate,
        replicationSignificantRate: statistics.replicationSignificantRate,
        originalMedianR: statistics.originalMedianR,
        replicationMedianR: statistics.replicationMedianR,
        replicationEffectP: statistics.replicationEffectP,
        rateDropZ: statistics.rateDropZ,
        bhAdjustedPs: statistics.bhAdjustedPs,
      }),
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: {
      providerProfile: 'offline_replay',
    },
    evidencePayload: {
      claimId: OSC_CLAIM_ID,
      claim: OSC_CLAIM_TEXT,
      metric: OSC_METRIC_KEY,
      observedMean: statistics.replicationMedianR,
      pValue: statistics.replicationEffectP,
      adjustedPValue: statistics.bhAdjustedPs[0] ?? 0,
    },
    sourceAnchor: {
      gitCommitSha: 'o'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: OSC_FROZEN_AT,
      rawResponseHash: 'c'.repeat(64),
      codeLocation: {
        filePath: 'src/science_harness/osc_pipeline.ts',
        location: 'OSC2015@pipeline',
        lineNumber: 300,
      },
    },
    claim: OSC_CLAIM_TEXT,
    falsificationSpec: OSC_FALSIFICATION_SPEC,
    thresholdSpec: OSC_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
    contractInput: {
      claimId: OSC_CLAIM_ID,
      measurableImplication: OSC_FALSIFICATION_SPEC.prediction,
      metric: OSC_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: OSC_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: OSC_FROZEN_AT,
    },
  };

  // Run anti-theater detectors against OSC's aggregate design.
  const preliminaryVerdict = computePreliminaryVerdict(baseFecArgs);
  const artifactHash = hashCanonicalJson({
    paper: 'OSC_2015_Estimating_the_Reproducibility_of_Psychological_Science',
    originalN: OSC_ORIGINAL_N,
    originalSignificant: OSC_ORIGINAL_SIGNIFICANT,
    replicationN: OSC_REPLICATION_N,
    replicationSignificant: OSC_REPLICATION_SIGNIFICANT,
    originalMedianR: OSC_ORIGINAL_MEDIAN_R,
    replicationMedianR: OSC_REPLICATION_MEDIAN_R,
  });

  const antiTheaterReport = runAntiTheaterLint(
    buildAntiTheaterPipelineInput({
      fec,
      preliminaryVerdict,
      artifactHash,
      metricKey: fec.metric.metricKey,
      metricValue: statistics.replicationMedianR,
      frozenAt: OSC_FROZEN_AT,
      primarySeed: 43,
      envelopeId: `ENV-${OSC_CLAIM_ID}`,
      humanSummary: OSC_ANTI_THEATER_SUMMARY,
      datasetId: 'osc-2015-97-replications',
      runIdPrefix: 'osc2015-run-seed',
      declaredSeeds: [43],
      runRegistrySeeds: [43],
    }),
  );

  const fecResult = fecAppendClaim(db, { ...baseFecArgs, antiTheaterReport });

  const { conclusion: sealedConclusion, needsHumanEndorsement } =
    machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = needsHumanEndorsement
    ? [
        `OSC (2015) replicated effects are statistically nonzero (median r=${statistics.replicationMedianR.toFixed(3)}, Fisher z p=${statistics.replicationEffectP.toFixed(4)} one-sided), but the effect size is only ${((1 - statistics.effectShrinkage) * 100).toFixed(0)}% of the original`,
        `Significance rate collapses from ${(statistics.originalSignificantRate * 100).toFixed(0)}% (original) to ${(statistics.replicationSignificantRate * 100).toFixed(0)}% (replication) — evidence covers a degraded scope of the claim`,
        `Evidence is aggregate summary statistics from the published paper; raw trial-level data of all 97 replications is not fully public`,
      ]
    : [
        `OSC (2015) replication evidence supports only a degraded scope of the claim (effect exists but at half magnitude)`,
      ];

  const sealed = sealProofEnvelope(db, {
    claimId: OSC_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: OSC_FALSIFICATION_SPEC,
    sourceAnchor: {
      gitCommitSha: 'o'.repeat(40),
      dashscopeRequestId: null,
      isoTimestamp: OSC_FROZEN_AT,
      rawResponseHash: 'c'.repeat(64),
      codeLocation: {
        filePath: 'src/science_harness/osc_pipeline.ts',
        location: 'OSC2015@pipeline',
        lineNumber: 380,
      },
    },
    reproHash: '3'.repeat(64),
    sealedAt: OSC_FROZEN_AT,
  });

  return {
    db,
    claimId: OSC_CLAIM_ID,
    claimText: OSC_CLAIM_TEXT,
    statistics,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    antiTheaterReport,
    sealed,
    sealedConclusion,
  };
}
