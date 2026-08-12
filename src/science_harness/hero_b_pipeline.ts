/**
 * hero_b_pipeline —— hero-B-002 真实 proof chain（Pipeline B · P1-5 Phase 3 · R-causal 门接线）。
 *
 * 与 hero_b_harness.ts（Pipeline A：buildHeroBChecks→mapChecksToVerdict）并存：
 *   - Pipeline A 保留（其测试不动）。
 *   - 本文件走 Pipeline B：两组 fixture 样本 → src/statistics/ 真实两样本统计 →
 *     adjudicateConfounding（确定性 d-separation·F6）→ fecAppendClaim(statistics? + claimType='causal'
 *     + evidenceBasis + confoundingGateResult) → decideFiveValueVerdict R-causal 门 → DEGRADED_SCOPE → seal。
 *
 * 单一真实依赖（T8）：
 *   - src/statistics/（twoSampleWelchTTest/twoSampleEffectSize/differenceInMeansConfidenceIntervalWelch/adjustPValues）
 *   - src/confounding_gate/adjudicate.ts（adjudicateConfounding·d-separation 图算法·非 LLM）
 *
 * F6 因果诚实叙事（真实驱动）：真实统计显著支持（cot 幻觉率显著低于 baseline → 本会 R7 CONFIRMED），
 *   但 HERO_B_CAUSAL_MODEL 的 prior_knowledge 后门路径未阻断 + unmeasuredConfoundersSuspected 非空 →
 *   ConfoundingGate FAIL → kernel R-causal 门（verdict_kernel_v2.ts:344-367）拦截 → DEGRADED_SCOPE。
 *   即「相关 ≠ 因果」：观测显著相关 + 观测-only 证据 + 未测混杂 → 禁因果 CONFIRMED（F6 红线）。
 *
 * 模型中立：全程 offline_replay，无 qwen/dashscope 字面量。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言 / 桩。
 */

import type Database from 'better-sqlite3';
import { runMigrations } from '../db/migrator.ts';
import { fecAppendClaim } from '../fec/index.ts';
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
import { adjudicateConfounding } from '../confounding_gate/index.ts';
import type { ConfoundingGateResult } from '../confounding_gate/index.ts';
import {
  HERO_B_CAUSAL_MODEL,
  HERO_B_EVIDENCE_BASIS,
  HERO_B_EXPOSURE,
  HERO_B_OUTCOME,
} from './hero_b_harness.ts';
import {
  adjustPValues,
  differenceInMeansConfidenceIntervalWelch,
  sampleMean,
  twoSampleEffectSize,
  twoSampleWelchTTest,
} from '../statistics/index.ts';
import type { ConfidenceInterval, TwoSampleEffectSize, TTestResult } from '../statistics/index.ts';

// ---------------------------------------------------------------------------
// 确定性常量（fixture · preregistered before unblinding）
// ---------------------------------------------------------------------------
/** Hero-B claim identifier (preregistered before unblinding). */
export const HERO_B_PIPELINE_CLAIM_ID = 'C-COT-B-0002';
/** Hero-B primary metric key: hallucination rate reduction (baseline minus cot). */
export const HERO_B_METRIC_KEY = 'hallucination_rate_reduction';
/** Hero-B claim: Chain-of-Thought prompting reduces mean LLM hallucination
 * rate vs baseline (causal claim). */
export const HERO_B_PIPELINE_CLAIM =
  'Chain-of-Thought prompting reduces mean LLM hallucination rate vs baseline (cot < baseline · causal)';
/** Hero-B falsification spec: reduction must exceed 0 threshold. */
export const HERO_B_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: HERO_B_PIPELINE_CLAIM,
  metric: HERO_B_METRIC_KEY,
  falsificationThreshold: 0,
  thresholdSemantics: 'gt',
};
/** Hero-B threshold spec: greater-than-zero semantics. */
export const HERO_B_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0,
};
/** Hero-B significance level (5%). */
export const HERO_B_ALPHA = 0.05;
/** Hero-B confidence level for interval estimates (95%). */
export const HERO_B_CONFIDENCE_LEVEL = 0.95;
/** Hero-B fixed random seed (SR-2, anti-p-hacking). */
export const HERO_B_SEED = 42;
/** Hero-B preregistration freeze timestamp (ISO 8601). */
export const HERO_B_FROZEN_AT = '2026-07-01T00:00:00.000Z';

/**
 * fixture：两组 per-stratum 幻觉率（baseline 无 CoT / cot 有 CoT，各 12 strata，固定 seed=42）。
 * 诚实声明：fixture 数值（非真实沙箱产物）；P1-6 venv 沙箱落地后由真实评测替换。
 * 设计：baseline 均值 ~0.206、cot 均值 ~0.156 → reduction ~0.05；twoSampleWelchTTest(cot, baseline, 'less')
 * 给 z~-4.5 → pValue~3e-6（显著支持「CoT 降低」方向，但不饱和到 0）。
 */
export const HERO_B_BASELINE_RATES: readonly number[] = [
  0.22, 0.17, 0.24, 0.19, 0.21, 0.18, 0.23, 0.20, 0.16, 0.25, 0.20, 0.22,
];
/** Fixture: per-stratum hallucination rates with Chain-of-Thought prompting (12 strata). */
export const HERO_B_COT_RATES: readonly number[] = [
  0.17, 0.13, 0.19, 0.14, 0.16, 0.12, 0.18, 0.15, 0.11, 0.20, 0.15, 0.17,
];
/** Hero-B source anchor: reproducibility fingerprint for the hallucination eval. */
export const HERO_B_SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: HERO_B_FROZEN_AT,
  rawResponseHash: 'c'.repeat(64),
  codeLocation: {
    filePath: 'eval/hallucination/cot_vs_baseline.py',
    location: 'HallucinationEval.compare@seed42',
    lineNumber: 120,
  },
};

// ---------------------------------------------------------------------------
// 真实统计 + 因果裁决
// ---------------------------------------------------------------------------
/** Real two-sample statistics from Hero-B hallucination rate comparison.
 * Includes confounding gate result (d-separation adjudication). */
export interface HeroBStatistics {
  readonly baseline: readonly number[];
  readonly cot: readonly number[];
  readonly baselineMean: number;
  readonly cotMean: number;
  readonly observedReduction: number;
  readonly tTest: TTestResult;
  readonly effectSize: TwoSampleEffectSize;
  readonly confidenceInterval: ConfidenceInterval;
  readonly adjustedPValue: number;
  readonly effectDirection: EvidenceDirection;
  readonly statisticalResult: StatisticalResult;
  readonly confoundingGate: ConfoundingGateResult;
}

/**
 * 真实两样本统计（cot vs baseline）+ ConfoundingGate 裁决（HERO_B_CAUSAL_MODEL·确定性 d-separation）。
 *
 * @param metricKey 来自 FEC（=== fec.metric.metricKey），保证 StatisticalResult.testId 与 kernel primary 匹配。
 */
export function buildHeroBStatistics(metricKey: string): HeroBStatistics {
  const baseline = HERO_B_BASELINE_RATES;
  const cot = HERO_B_COT_RATES;
  const baselineMean = sampleMean(baseline);
  const cotMean = sampleMean(cot);
  const observedReduction = baselineMean - cotMean;

  // H1: mean(cot) < mean(baseline)（CoT 降低幻觉率）。显著拒绝 H0 → reduction > 0 = 支持 claim。
  const tTest = twoSampleWelchTTest(cot, baseline, 'less');
  const effectSize = twoSampleEffectSize(baseline, cot);
  const confidenceInterval = differenceInMeansConfidenceIntervalWelch(baseline, cot, HERO_B_CONFIDENCE_LEVEL);
  const adjusted = adjustPValues([tTest.pValue], 'bonferroni', HERO_B_ALPHA);
  const adjustedPValue = adjusted[0]?.adjustedPValue ?? tTest.pValue;

  const effectDirection: EvidenceDirection = observedReduction > 0 ? 'supports' : 'refutes';

  const statisticalResult: StatisticalResult = {
    testId: metricKey,
    status: 'ran',
    effectDirection,
    pValue: tTest.pValue,
    adjustedPValue,
    effectSizeObserved: effectSize.cohensD,
    confidenceInterval: [confidenceInterval.lower, confidenceInterval.upper],
    assumptionDiagnostics: [],
  };

  const confoundingGate = adjudicateConfounding(
    HERO_B_CAUSAL_MODEL,
    HERO_B_EXPOSURE,
    HERO_B_OUTCOME,
  );

  return {
    baseline,
    cot,
    baselineMean,
    cotMean,
    observedReduction,
    tTest,
    effectSize,
    confidenceInterval,
    adjustedPValue,
    effectDirection,
    statisticalResult,
    confoundingGate,
  };
}

// ---------------------------------------------------------------------------
// Pipeline B 编排
// ---------------------------------------------------------------------------
/** Complete Hero-B pipeline result: statistics, machine verdict, FEC gate, and sealed proof. */
export interface HeroBPipelineResult {
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  readonly statistics: HeroBStatistics;
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  readonly sealed: SealResult;
  readonly sealedConclusion: Verdict;
}

/**
 * 构造 hero-B 真实 proof chain：两组样本 → 真实两样本统计 + ConfoundingGate → FEC →
 * fecAppendClaim(statistics? + claimType='causal' + evidenceBasis + confoundingGateResult) →
 * R-causal 门 DEGRADED_SCOPE → seal。
 */
export function buildHeroBChain(db: Database.Database): HeroBPipelineResult {
  runMigrations(db);

  const fec = makeRealStatsFec({
    claimId: HERO_B_PIPELINE_CLAIM_ID,
    falsificationSpec: HERO_B_FALSIFICATION_SPEC,
    thresholdSpec: HERO_B_THRESHOLD_SPEC,
    frozenAt: HERO_B_FROZEN_AT,
    alpha: HERO_B_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'welch_difference_normal_approximation',
    effectDirection: 'greater',
    metricUnit: 'rate_reduction',
    metricDescription: 'baseline_minus_cot mean hallucination-rate reduction (two-sample)',
    seedValue: HERO_B_SEED,
  });

  const statistics = buildHeroBStatistics(fec.metric.metricKey);

  const evidenceClaim = `two-sample hallucination-rate comparison over ${HERO_B_BASELINE_RATES.length} strata: baseline mean=${statistics.baselineMean.toFixed(4)} vs cot mean=${statistics.cotMean.toFixed(4)} (reduction=${statistics.observedReduction.toFixed(4)}, seed=${HERO_B_SEED})`;
  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      metricValue: statistics.observedReduction,
      supportsClaim: statistics.effectDirection === 'supports',
      refutesClaim: statistics.effectDirection === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor: HERO_B_SOURCE_ANCHOR,
    },
  ];

  const fecResult = fecAppendClaim(db, {
    callRecord: {
      stageId: 'stage3_hypothesis',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: '2'.repeat(64),
        gitCommitSha: HERO_B_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: HERO_B_FROZEN_AT,
      },
      payloadKind: 'hypothesis',
      purposeTag: 'hypothesis',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-COT-B-0002 cot vs baseline hallucination fixture"}',
      responsePayload: `{"reduction":${statistics.observedReduction.toFixed(6)}}`,
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: {
      providerProfile: 'offline_replay',
    },
    evidencePayload: {
      claimId: HERO_B_PIPELINE_CLAIM_ID,
      claim: HERO_B_PIPELINE_CLAIM,
      metric: HERO_B_METRIC_KEY,
      baselineMean: statistics.baselineMean,
      cotMean: statistics.cotMean,
      observedReduction: statistics.observedReduction,
      pValue: statistics.tTest.pValue,
      adjustedPValue: statistics.adjustedPValue,
    },
    sourceAnchor: HERO_B_SOURCE_ANCHOR,
    claim: HERO_B_PIPELINE_CLAIM,
    falsificationSpec: HERO_B_FALSIFICATION_SPEC,
    thresholdSpec: HERO_B_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'hypothesis',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
    claimType: 'causal',
    evidenceBasis: HERO_B_EVIDENCE_BASIS,
    confoundingGateResult: statistics.confoundingGate,
    contractInput: {
      claimId: HERO_B_PIPELINE_CLAIM_ID,
      measurableImplication: HERO_B_FALSIFICATION_SPEC.prediction,
      metric: HERO_B_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: HERO_B_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: HERO_B_FROZEN_AT,
    },
  });

  // 机器裁决由 R-causal 门给出 DEGRADED_SCOPE（ observational_only + ConfoundingGate FAIL）。
  // DEGRADED_SCOPE 非 CONFIRMED → machineSealableConclusion 原样返回，ASK-9 不降级。
  const { conclusion: sealedConclusion } = machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = [
    `observational-only causal claim: real two-sample stats supported the association (adjustedP=${statistics.adjustedPValue.toExponential(3)}) but ConfoundingGate FAIL (${statistics.confoundingGate.outcome}, unmeasuredConfounders=[${statistics.confoundingGate.unmeasuredConfounders.join(',')}]) → DEGRADED_SCOPE (F6: correlation != causation)`,
    'hallucination eval is preregistered synthetic strata; real sandbox measurement is a V2 roadmap item',
  ];

  const sealed = sealProofEnvelope(db, {
    claimId: HERO_B_PIPELINE_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: HERO_B_FALSIFICATION_SPEC,
    sourceAnchor: HERO_B_SOURCE_ANCHOR,
    reproHash: '2'.repeat(64),
    sealedAt: HERO_B_FROZEN_AT,
  });

  return {
    db,
    claimId: HERO_B_PIPELINE_CLAIM_ID,
    claimText: HERO_B_PIPELINE_CLAIM,
    statistics,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    sealed,
    sealedConclusion,
  };
}
