/**
 * ritchie_pipeline —— Ritchie, Wiseman & French (2012) failed replication pipeline.
 *
 * 论文：Ritchie, S. J., Wiseman, R., & French, C. C. (2012). Failing the future:
 *       Three unsuccessful attempts to replicate Bem's "retroactive facilitation
 *       of recall" effect. PLoS ONE, 7(12), e48666.
 *       DOI: 10.1371/journal.pone.0048666
 *
 * 这是直接回应 Bem (2011) 的三组独立重复实验——全部失败。
 *   - 实验1 (Wiseman): N=50, t(49)=-0.26, p=.60 one-tailed (direction OPPOSITE to Bem)
 *   - 实验2 (Ritchie): N=50, t(49)=-1.03, p=.85 one-tailed (direction OPPOSITE)
 *   - 实验3 (French):  N=50, t(49)=0.20, p=.42 one-tailed (null, no effect)
 *
 * Bem 的 H1 方向：受试者能预知未来刺激位置（hit rate > 50%）。
 * Ritchie 三组实验均未在 Bem 方向上达到显著（两组方向相反，一组近零）。
 *
 * 科学上这是一个 **failed replication**（复制失败），不是 refutation（证伪）：
 *   - 三组 Fisher 合并 p ≈ 0.80（远非显著）→ 既不支持 Bem 方向，也未显著地反向。
 *   - Ritchie et al. 本人在论文标题与结论中写的是 "failing the future" / "failed to
 *     replicate"，而非 "refuted"。把非显著的 null 结果说成 REFUTED 会犯 "absence of
 *     evidence = evidence of absence" 的错误。
 *
 * 因此在 FAR-Lab 中，这产出 **INCONCLUSIVE**（R8_INSUFFICIENT_POWER_OR_NULL）——
 * 即 5 值裁决中"已检验但证据不足以确认或证伪"的诚实姿态。效应方向标记为 'neutral'
 * （combined test 非显著），meta-analytic 效应量用每组的 Cohen's d = 2t/√df 汇总，
 * 附带 k=3 研究级别的真实置信区间（必定宽·诚实反映 n 小）。
 *
 * 诚实边界：
 *   - metricValue 来自论文公开 t 统计量（非原始数据复算）
 *   - 使用精确 Student's t-distribution 复算 p-value（与 Bem pipeline 一致）
 *   - Cohen's d 与 CI 由公开 t/df 经标准换算导出（Rosenthal 1994），非原始试次数据
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
import type { SourceAnchor } from '../evidence_log/types.ts';
import { machineSealableConclusion } from '../far_proof/demo_chain.ts';
import type { EvidenceDirection } from '../schema/enums.ts';
import { sampleStandardDeviation, studentTSurvival } from '../statistics/index.ts';
import { runAntiTheaterLint } from '../anti_theater/index.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import { buildAntiTheaterPipelineInput } from './anti_theater_input.ts';

// ---------------------------------------------------------------------------
// 论文元数据
// ---------------------------------------------------------------------------

/** Ritchie (2012) claim identifier. */
export const RITCHIE_CLAIM_ID = 'C-RITCHIE-2012-REPLICATION';
/** Same metric as Bem: precognitive hit rate. */
export const RITCHIE_METRIC_KEY = 'bem_erotic_hit_rate';
/** Ritchie tested the SAME claim as Bem: can subjects anticipate future erotic stimuli? */
export const RITCHIE_CLAIM_TEXT =
  'Replication of Bem (2011) Exp1: subjects anticipate erotic stimulus position above chance (50%)';
/** Ritchie used the same falsification spec as Bem (claim = hit rate > 50%). */
export const RITCHIE_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: RITCHIE_CLAIM_TEXT,
  metric: RITCHIE_METRIC_KEY,
  falsificationThreshold: 0.50,
  thresholdSemantics: 'gt',
};
/** Ritchie threshold spec: greater-than 0.50. */
export const RITCHIE_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0.50,
};
/** Ritchie significance level (one-tailed .05, same as Bem). */
export const RITCHIE_ALPHA = 0.05;
/** Ritchie preregistration freeze timestamp. */
export const RITCHIE_FROZEN_AT = '2012-01-01T00:00:00.000Z';

/**
 * Ritchie (2012) Table 1: three independent replication attempts.
 *
 * 诚实提取：这些是论文公开报告的值。
 * 关键：实验1和2的 t 值为负——点估计方向与 Bem 的 H1 相反，但三组均未达显著，
 * 故这是 failed replication（null result），不是统计意义上的证伪。
 *
 * Source: Ritchie et al. (2012), Results section.
 */
export const RITCHIE_EXPERIMENTS: readonly {
  exp: number; lab: string; n: number; tStat: number; df: number; pReported: number;
}[] = [
  { exp: 1, lab: 'Wiseman',  n: 50, tStat: -0.26, df: 49, pReported: 0.60 },
  { exp: 2, lab: 'Ritchie',  n: 50, tStat: -1.03, df: 49, pReported: 0.85 },
  { exp: 3, lab: 'French',   n: 50, tStat:  0.20, df: 49, pReported: 0.42 },
];

/** Ritchie source anchor. */
export const RITCHIE_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'c'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: RITCHIE_FROZEN_AT,
  rawResponseHash: 'f'.repeat(64),
  codeLocation: {
    filePath: 'repro/real_paper/ritchie_pipeline.ts',
    location: 'Ritchie2012Replication@published-stats',
    lineNumber: 72,
  },
};

// ---------------------------------------------------------------------------
// 统计复算
// ---------------------------------------------------------------------------

/** Ritchie (2012) statistics recomputed by FAR-Lab. */
export interface RitchieStatistics {
  /** Published t-statistics from the three labs. */
  readonly publishedTStats: readonly number[];
  /** FAR-Lab recomputed p-values using exact Student's t-distribution. */
  readonly farLabExactPs: readonly number[];
  /** Combined p-value via Fisher's method (non-significant ⇒ failed replication). */
  readonly combinedP: number;
  /** Per-study Cohen's d (= 2t/√df) for each lab. */
  readonly cohensDPerStudy: readonly number[];
  /** Fixed-effects mean of the per-study Cohen's d. */
  readonly pooledCohensD: number;
  /** Mean effect direction across the three labs. */
  readonly meanDirection: EvidenceDirection;
  /** StatisticalResult for FEC kernel consumption. */
  readonly statisticalResult: StatisticalResult;
}

/**
 * Recompute Ritchie (2012) statistics using FAR-Lab's exact t-distribution.
 *
 * Each of the 3 labs reported a t-statistic for a one-tailed test in Bem's direction
 * (H1: hit rate > 50%). Ritchie's t-values are negative or near-zero, meaning the
 * observed effect was in the OPPOSITE direction or null — but none reached
 * significance, so the honest meta-analytic verdict is "failed replication"
 * (INCONCLUSIVE), not "refuted."
 *
 *   - Per-lab exact one-tailed p via studentTSurvival.
 *   - Combined p via Fisher's method (non-significant ⇒ null result).
 *   - Per-study Cohen's d = 2t/√df (Rosenthal 1994); pooled as fixed-effects mean.
 *   - 95% CI on the pooled d across k=3 studies (meta df = k−1 = 2).
 */
export function buildRitchieStatistics(metricKey: string): RitchieStatistics {
  const publishedTStats = RITCHIE_EXPERIMENTS.map(e => e.tStat);

  // Exact one-tailed p-value for each lab in Bem's direction (H1: hit rate > 50%).
  // For negative t, studentTSurvival returns p > 0.5 (point estimate opposite to Bem).
  const farLabExactPs = RITCHIE_EXPERIMENTS.map(e => studentTSurvival(e.tStat, e.df));

  // Fisher's method combines the three p-values into one meta-analytic test of
  // "is there any effect in Bem's direction?". chi² = -2·Σ ln(p_i) ~ chi²(2k) under H0.
  // All three p's are large ⇒ combined p ≈ 0.80 ⇒ decisively non-significant.
  const fisherStat = -2 * farLabExactPs.reduce((acc, p) => acc + Math.log(p), 0);
  const combinedP = chiSquareSurvival(fisherStat, 2 * farLabExactPs.length);

  // Per-study standardized effect size: Cohen's d = 2t/√df
  // (Rosenthal 1994; Rosnow & Rosenthal 1996 — the standard t→d conversion for a
  // one-sample/within-subject test on a mean). Unlike averaging t-statistics
  // (which is meaningless — t scales with √n), averaging d IS a valid
  // fixed-effects meta-analytic summary of the standardized mean difference.
  const cohensDPerStudy = RITCHIE_EXPERIMENTS.map(e => (2 * e.tStat) / Math.sqrt(e.df));
  const pooledCohensD = cohensDPerStudy.reduce((a, b) => a + b, 0) / cohensDPerStudy.length;

  // 95% CI on the pooled d across k=3 studies (meta df = k−1 = 2).
  // t_{0.975, df=2} = 4.30265273 (exact table value). With only k=3 studies
  // the interval is necessarily wide; it honestly reflects that a small effect in
  // either direction cannot be ruled out by these three labs alone.
  const seD = sampleStandardDeviation(cohensDPerStudy) / Math.sqrt(cohensDPerStudy.length);
  const tCritDf2 = 4.30265273; // t_{0.975, df=2}
  const ciLower = pooledCohensD - tCritDf2 * seD;
  const ciUpper = pooledCohensD + tCritDf2 * seD;

  // Failed replication: the combined test is non-significant, so the honest
  // direction is 'neutral' — neither supports nor refutes. Ritchie et al. wrote
  // "failed to replicate," not "refuted."
  const meanDirection: EvidenceDirection = 'neutral';

  const statisticalResult: StatisticalResult = {
    testId: metricKey,
    status: 'ran',
    effectDirection: meanDirection,
    pValue: combinedP,
    adjustedPValue: combinedP,
    effectSizeObserved: pooledCohensD,
    confidenceInterval: [ciLower, ciUpper],
    assumptionDiagnostics: [],
  };

  return {
    publishedTStats,
    farLabExactPs,
    combinedP,
    cohensDPerStudy,
    pooledCohensD,
    meanDirection,
    statisticalResult,
  };
}

/**
 * Upper-tail chi-square survival function via regularized incomplete gamma.
 * For combining independent p-values (Fisher's method).
 */
function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1;
  // Upper incomplete gamma Q(df/2, x/2) using series expansion for small x
  // and continued fraction for large x (Numerical Recipes §6.2)
  const a = df / 2;
  const xx = x / 2;
  // For our purposes (df=6, x typically 2-20), use the regularized gamma
  // Simple approximation via Wilson-Hilferty transform:
  // chi²_p ≈ df * (1 - 2/(9df) + z_p * sqrt(2/(9df)))³
  // where z_p is the standard normal quantile.
  // But we want the survival, so invert.
  // Use the series expansion of the lower incomplete gamma for better accuracy.
  return upperIncompleteGamma(a, xx);
}

/** Regularized upper incomplete gamma Q(a,x) via series/continued fraction. */
function upperIncompleteGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) return 1;
  if (x === 0) return 1;

  // lnΓ(a)
  const lnGammaA = logGammaSimple(a);
  const lnPrefix = a * Math.log(x) - x - lnGammaA;

  // Series for P(a,x) when x < a+1 (lower incomplete gamma)
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    const lower = Math.exp(lnPrefix) * sum;
    return Math.max(0, 1 - lower);
  }

  // Continued fraction for Q(a,x) when x >= a+1 (upper incomplete gamma)
  let b = x + 1 - a;
  let c = 1e30;
  let d = 1 / b;
  let h = d;
  for (let n = 1; n < 200; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  const upper = Math.exp(lnPrefix) * h;
  return Math.min(1, Math.max(0, upper));
}

/** Simple Lanczos log-gamma (mirrors t_distribution.ts). */
function logGammaSimple(x: number): number {
  const cof = [76.1800917294715, -86.5053203294168, 24.0140982408309,
               -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (y + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    const c = cof[j];
    if (c !== undefined) {
      ser += c / y;
    }
  }
  return -tmp + Math.log(2.5066282746310002 * ser / x);
}

// ---------------------------------------------------------------------------
// Pipeline 编排
// ---------------------------------------------------------------------------

/** Complete Ritchie pipeline result. */
export interface RitchiePipelineResult {
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  readonly statistics: RitchieStatistics;
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  readonly antiTheaterReport: AntiTheaterReport;
  readonly sealed: SealResult;
  readonly sealedConclusion: Verdict;
}

/** Ritchie human summary. */
export const RITCHIE_ANTI_THEATER_SUMMARY =
  'Ritchie, Wiseman & French (2012): three independent replication attempts of Bem (2011) Exp1. ' +
  'All three failed to reproduce the effect; two showed direction opposite to Bem.';

/**
 * Build Ritchie (2012) real paper proof chain.
 *
 * This pipeline tests the SAME claim as Bem (2011) but with DIFFERENT data (failed replications).
 * The expected verdict is INCONCLUSIVE (R8) — three labs failed to replicate, the combined
 * Fisher p is non-significant, so the evidence neither confirms nor refutes Bem's claim.
 *
 * @param db Open :memory: or file DB.
 */
export function buildRitchieChain(db: Database.Database): RitchiePipelineResult {
  runMigrations(db);

  const fec = makeRealStatsFec({
    claimId: RITCHIE_CLAIM_ID,
    falsificationSpec: RITCHIE_FALSIFICATION_SPEC,
    thresholdSpec: RITCHIE_THRESHOLD_SPEC,
    frozenAt: RITCHIE_FROZEN_AT,
    alpha: RITCHIE_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'normal_approximation_z',
    effectDirection: 'greater',
    metricUnit: 'proportion',
    metricDescription: 'hit rate for erotic stimulus precognition (Ritchie 2012 replication of Bem)',
    seedValue: 42,
  });

  const statistics = buildRitchieStatistics(fec.metric.metricKey);

  // Evidence: three labs failed to replicate; combined Fisher p is non-significant.
  const ci = statistics.statisticalResult.confidenceInterval;
  const ciLo = ci ? ci[0].toFixed(3) : 'n/a';
  const ciHi = ci ? ci[1].toFixed(3) : 'n/a';
  const evidenceClaim =
    `Ritchie et al. (2012) three labs: t-stats=[${statistics.publishedTStats.map(t => t.toFixed(2)).join(', ')}]; ` +
    `exact p-values=[${statistics.farLabExactPs.map(p => p.toFixed(4)).join(', ')}]; ` +
    `Fisher combined p=${statistics.combinedP.toFixed(4)} (non-significant). ` +
    `Pooled Cohen's d=${statistics.pooledCohensD.toFixed(3)} ` +
    `(95% CI [${ciLo}, ${ciHi}] crosses zero). ` +
    `All three labs failed to reproduce Bem's effect (two trended opposite).`;

  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      // Pooled Cohen's d across the three labs (near zero, slightly against Bem).
      metricValue: statistics.pooledCohensD,
      // Failed replication (non-significant combined test) → neutral, not refutes.
      supportsClaim: false,
      refutesClaim: false,
      scopeNarrowerThanClaim: false,
      sourceAnchor: RITCHIE_SOURCE_ANCHOR,
    },
  ];

  const baseFecArgs: FecAppendClaimArgs = {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'ritchie-2012-published-stats',
        dashscopeRequestId: null,
        reproHash: '3'.repeat(64),
        gitCommitSha: RITCHIE_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: RITCHIE_FROZEN_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"source":"Ritchie et al. 2012 PLoS ONE 7(12) e48666 DOI:10.1371/journal.pone.0048666"}',
      responsePayload: JSON.stringify({
        tStats: statistics.publishedTStats,
        exactPs: statistics.farLabExactPs,
        combinedP: statistics.combinedP,
        cohensDPerStudy: statistics.cohensDPerStudy,
        pooledCohensD: statistics.pooledCohensD,
      }),
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: {
      claimId: RITCHIE_CLAIM_ID,
      claim: RITCHIE_CLAIM_TEXT,
      metric: RITCHIE_METRIC_KEY,
      observedMean: statistics.pooledCohensD,
      pValue: statistics.combinedP,
      adjustedPValue: statistics.combinedP,
    },
    sourceAnchor: RITCHIE_SOURCE_ANCHOR,
    claim: RITCHIE_CLAIM_TEXT,
    falsificationSpec: RITCHIE_FALSIFICATION_SPEC,
    thresholdSpec: RITCHIE_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
    contractInput: {
      claimId: RITCHIE_CLAIM_ID,
      measurableImplication: RITCHIE_FALSIFICATION_SPEC.prediction,
      metric: RITCHIE_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: RITCHIE_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: RITCHIE_FROZEN_AT,
    },
  };

  const preliminaryVerdict = computePreliminaryVerdict(baseFecArgs);
  const artifactHash = hashCanonicalJson({
    paper: 'Ritchie_2012_Failing_the_Future',
    experiments: RITCHIE_EXPERIMENTS,
  });

  const antiTheaterReport = runAntiTheaterLint(
    buildAntiTheaterPipelineInput({
      fec,
      preliminaryVerdict,
      artifactHash,
      metricKey: fec.metric.metricKey,
      metricValue: statistics.pooledCohensD,
      frozenAt: RITCHIE_FROZEN_AT,
      primarySeed: 42,
      envelopeId: `ENV-${RITCHIE_CLAIM_ID}`,
      humanSummary: RITCHIE_ANTI_THEATER_SUMMARY,
      datasetId: 'ritchie-2012-three-labs',
      runIdPrefix: 'ritchie2012-run',
      declaredSeeds: [42],
      runRegistrySeeds: [42],
    }),
  );

  const fecResult = fecAppendClaim(db, { ...baseFecArgs, antiTheaterReport });
  const { conclusion: sealedConclusion } = machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = [
    `Ritchie et al. (2012) three independent labs all failed to replicate Bem (2011) Exp1`,
    `Two of three labs showed effect direction OPPOSITE to Bem's claim (t < 0)`,
    `Fisher combined p=${statistics.combinedP.toFixed(4)} across 3 labs`,
  ];

  const sealed = sealProofEnvelope(db, {
    claimId: RITCHIE_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: RITCHIE_FALSIFICATION_SPEC,
    sourceAnchor: RITCHIE_SOURCE_ANCHOR,
    reproHash: '3'.repeat(64),
    sealedAt: RITCHIE_FROZEN_AT,
  });

  return {
    db,
    claimId: RITCHIE_CLAIM_ID,
    claimText: RITCHIE_CLAIM_TEXT,
    statistics,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    antiTheaterReport,
    sealed,
    sealedConclusion,
  };
}
