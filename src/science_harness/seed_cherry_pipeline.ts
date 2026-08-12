/**
 * seed_cherry_pipeline —— cherry-picked adversarial 系外行星 submission 审计（FUSION-OS-1 detector-validation·fixture replay·非 production wiring）。
 *
 * 代表 FAR-Lab 审计一个**已提交的** cherry-picked 声明：研究者预注册 5 个种子 [0,1,2,3,4]，
 * 实际只报告了 [0,1,2]（隐去 seed 3,4 因其无 transit）。detect_seed_cherry 从真实 runRegistry 差集
 * {3,4} 诚实 fire HIDDEN_FAILED_RUN → anti-theater verdict_kernel_v2.ts:373 → UNTESTED/ANTI_THEATER_FAIL。
 *
 * 诚实性（vs 已撤销的 test-hook 设计·防火墙终裁）：cherry-pick 是 **fixture 数据**（declaredSeeds/
 * runRegistrySeeds 显式模块常量·本 pipeline 的身份即"审计此 adversarial submission"），非 call-time
 * 注入参数。detect_seed_cherry 对真实 registry 做真实集合差集，finding 由 detector 产出非 caller 手填。
 * 类比 GV-14（identifier_fabrication 是 fixture 数据驱动真实 kernel REFUTED）。
 *
 * 单一真实依赖（T8）：venvSandboxAdapter.executeAsync 真起 python 子进程跑 numpy BLS（复用 c_astro infra）
 * + src/statistics/ 真实两样本 z-test + detect_seed_cherry 真实集合差集。
 *
 * 全 scope（scopeNarrowerThanClaim=false）→ R4 不 shadow → anti-theater :373 可达（c_astro cached_fixture 被 R4 shadow）。
 * 模型中立：offline_replay。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言 / 桩。
 *
 * Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-1 + CLAUDE.md §4 P-FUSION。
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
  ThresholdSpec,
  Verdict,
  VerdictKernelOutput,
} from '../falsifiability/index.ts';
import type { FecGateDecision } from '../fec/fec_mandate.ts';
import { GENESIS_PROOF_HASH, sealProofEnvelope } from '../proof_envelope/index.ts';
import type { SealResult } from '../proof_envelope/index.ts';
import { machineSealableConclusion } from '../far_proof/demo_chain.ts';
import {
  buildCAstroStatistics,
  runBlsInSandbox,
  C_ASTRO_ALPHA,
  C_ASTRO_FROZEN_AT,
  C_ASTRO_SOURCE_ANCHOR,
} from './c_astro_pipeline.ts';
import type { VenvSandboxAdapter } from './types.ts';
import { runAntiTheaterLint } from '../anti_theater/index.ts';
import type { AntiTheaterReport } from '../anti_theater/index.ts';
import { buildAntiTheaterPipelineInput } from './anti_theater_input.ts';
/** Seed-cherry audit claim identifier. */
export const SEED_CHERRY_CLAIM_ID = 'C-CHERRY-0001';
/** Seed-cherry primary metric key: transit depth significance. */
export const SEED_CHERRY_METRIC_KEY = 'transit_depth_significance';
/** Seed-cherry claim: TIC 268644982 shows a transit signal detected
 * across 5 pre-registered seeds (cherry-picked adversarial submission). */
export const SEED_CHERRY_PIPELINE_CLAIM =
  'TIC 268644982 shows a transit signal (period ~2.41d, depth ~0.8%) detected across 5 pre-registered seeds';

// cherry-pick fixture：研究者预注册 5 个种子，实际只报告 3 个（隐去 seed 3,4 — 无 transit）。
// detect_seed_cherry 从 declaredSeeds ⊄ ranSeeds 的差集 {3,4} 诚实 fire HIDDEN_FAILED_RUN。
/** Primary seed for the seed-cherry fixture (seed 0 of 5 declared). */
export const SEED_CHERRY_PRIMARY_SEED = 0;
/** Researcher pre-registered 5 seeds (all declared, cherry-pick hides 3,4). */
export const SEED_CHERRY_DECLARED_SEEDS: readonly number[] = [0, 1, 2, 3, 4];
/** Researcher actually reported 3 seeds (cherry-picked: seeds 3,4 hidden). */
export const SEED_CHERRY_REPORTED_SEEDS: readonly number[] = [0, 1, 2];
/** Seed-cherry falsification spec: transit depth significance > 0. */
export const SEED_CHERRY_FALSIFICATION_SPEC: FalsificationSpec = {
  prediction: SEED_CHERRY_PIPELINE_CLAIM,
  metric: SEED_CHERRY_METRIC_KEY,
  falsificationThreshold: 0,
  thresholdSemantics: 'gt',
};
/** Seed-cherry threshold spec: greater-than-zero semantics. */
export const SEED_CHERRY_THRESHOLD_SPEC: ThresholdSpec = {
  semantics: 'gt',
  value: 0,
};
/** AntiTheaterLintInput neutral summary text for seed-cherry (no strength words,
 * detect_report_mismatch does not trigger). */
export const SEED_CHERRY_ANTI_THEATER_SUMMARY =
  'C-CHERRY BLS transit search result summary: pre-registered 5 seeds; see structured verdict for the audit conclusion.';
/** Complete seed-cherry pipeline result: statistics, machine verdict,
 * anti-theater report, and sealed proof. */
export interface SeedCherryPipelineResult {
  readonly db: Database.Database;
  readonly claimId: string;
  readonly claimText: string;
  readonly statistics: ReturnType<typeof buildCAstroStatistics>;
  readonly machineVerdict: Verdict;
  readonly kernelOutput: VerdictKernelOutput;
  readonly fecGate: FecGateDecision;
  readonly antiTheaterReport: AntiTheaterReport;
  readonly sealed: SealResult;
  readonly sealedConclusion: Verdict;
}
/** Pre-constructed FEC inputs for the seed-cherry chain (decoupled from
 * DB writes so tests can compare with/without antiTheaterReport). */
export interface SeedCherryPreparedInputs {
  readonly fec: ReturnType<typeof makeRealStatsFec>;
  readonly statistics: ReturnType<typeof buildCAstroStatistics>;
  readonly baseFecArgs: FecAppendClaimArgs;
  readonly preliminaryVerdict: VerdictKernelOutput;
  readonly antiTheaterReport: AntiTheaterReport;
}

/**
 * 构造 seed_cherry 链的 fecAppendClaim 输入（真实 venv BLS + 真实统计 + detect_seed_cherry 真实 fire 的 report），
 * 不触 DB / 不调 fecAppendClaim。生产 builder 与 controlled-mutation 物证测试共享此构造器（单次真实 sandbox
 * 计算），使测试能在同一真实输入上对比「传 report → ANTI_THEATER_FAIL」vs「省 report → CONFIRMED（攻击得逞）」——
 * 把 antiTheaterReport wiring 的 load-bearing 性从 prose 论证变成可执行的双跑断言（FUSION-OS-1 base/head）。
 *
 * 非反剧场红线意义上的 test-hook：不引入改变生产行为的 call-time 种子注入参数；仅把输入构造与裁决/密封解耦。
 */
export async function prepareSeedCherryChain(options: {
  readonly lightcurvePath: string;
  readonly workingDir: string;
  readonly pythonCmd?: string;
  readonly adapter?: VenvSandboxAdapter;
}): Promise<SeedCherryPreparedInputs> {
  const sandbox = await runBlsInSandbox({
    lightcurvePath: options.lightcurvePath,
    workingDir: options.workingDir,
    ...(options.pythonCmd !== undefined ? { pythonCmd: options.pythonCmd } : {}),
    ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
  });

  const fec = makeRealStatsFec({
    claimId: SEED_CHERRY_CLAIM_ID,
    falsificationSpec: SEED_CHERRY_FALSIFICATION_SPEC,
    thresholdSpec: SEED_CHERRY_THRESHOLD_SPEC,
    frozenAt: C_ASTRO_FROZEN_AT,
    alpha: C_ASTRO_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'welch_difference_normal_approximation',
    effectDirection: 'greater',
    metricUnit: 'transit_depth',
    metricDescription: 'BLS transit depth reported across pre-registered seeds',
    seedValue: SEED_CHERRY_PRIMARY_SEED,
  });

  const statistics = buildCAstroStatistics(fec.metric.metricKey, sandbox.metrics);

  const evidenceClaim =
    `BLS transit search (full-scope lightcurve): period=${sandbox.metrics.period.toFixed(4)}d ` +
    `depth=${sandbox.metrics.depth.toFixed(5)} depthSNR=${sandbox.metrics.depthSNR.toFixed(2)} ` +
    `(${SEED_CHERRY_REPORTED_SEEDS.length}/${SEED_CHERRY_DECLARED_SEEDS.length} pre-registered seeds reported, seed=${SEED_CHERRY_REPORTED_SEEDS[0]})`;
  const evidences: EvidenceRecord[] = [
    {
      claim: evidenceClaim,
      metricValue: sandbox.metrics.depth,
      supportsClaim: statistics.effectDirection === 'supports',
      refutesClaim: statistics.effectDirection === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    },
  ];

  const baseFecArgs: FecAppendClaimArgs = {
    callRecord: {
      stageId: 'stage4_evidence',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: '5'.repeat(64),
        gitCommitSha: C_ASTRO_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: C_ASTRO_FROZEN_AT,
      },
      payloadKind: 'observation',
      purposeTag: 'eval',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-CHERRY-0001 adversarial BLS audit"}',
      responsePayload: `{"period":${sandbox.metrics.period.toFixed(6)},"depth":${sandbox.metrics.depth.toFixed(6)}}`,
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: {
      providerProfile: 'offline_replay',
    },
    evidencePayload: {
      claimId: SEED_CHERRY_CLAIM_ID,
      claim: SEED_CHERRY_PIPELINE_CLAIM,
      metric: SEED_CHERRY_METRIC_KEY,
      declaredSeedCount: SEED_CHERRY_DECLARED_SEEDS.length,
      reportedSeedCount: SEED_CHERRY_REPORTED_SEEDS.length,
      blsPeriod: sandbox.metrics.period,
      blsDepth: sandbox.metrics.depth,
      blsDepthSNR: sandbox.metrics.depthSNR,
      pValue: statistics.tTest.pValue,
      adjustedPValue: statistics.adjustedPValue,
      artifactTreeHash: sandbox.result.artifactTreeHash,
    },
    sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    claim: SEED_CHERRY_PIPELINE_CLAIM,
    falsificationSpec: SEED_CHERRY_FALSIFICATION_SPEC,
    thresholdSpec: SEED_CHERRY_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'evidence',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
    contractInput: {
      claimId: SEED_CHERRY_CLAIM_ID,
      measurableImplication: SEED_CHERRY_FALSIFICATION_SPEC.prediction,
      metric: SEED_CHERRY_FALSIFICATION_SPEC.metric,
      comparator: 'gt',
      thresholdValue: SEED_CHERRY_FALSIFICATION_SPEC.falsificationThreshold,
      compiledAt: C_ASTRO_FROZEN_AT,
    },
  };

  // detect_seed_cherry 诚实 fire：declaredSeeds=[0,1,2,3,4] ⊄ runRegistrySeeds=[0,1,2] → 差集 {3,4} → HIDDEN_FAILED_RUN。
  // cherry-pick 是 fixture 数据（非 call-time 注入）；finding 由 detect_seed_cherry 真实集合差集产出（非 caller 手填）。
  const preliminaryVerdict = computePreliminaryVerdict(baseFecArgs);
  const antiTheaterReport = runAntiTheaterLint(
    buildAntiTheaterPipelineInput({
      fec,
      preliminaryVerdict,
      artifactHash: sandbox.result.artifactTreeHash,
      metricKey: fec.metric.metricKey,
      metricValue: sandbox.metrics.depth,
      frozenAt: C_ASTRO_FROZEN_AT,
      primarySeed: SEED_CHERRY_PRIMARY_SEED,
      envelopeId: `ENV-${SEED_CHERRY_CLAIM_ID}`,
      humanSummary: SEED_CHERRY_ANTI_THEATER_SUMMARY,
      datasetId: 'cherry-castro-lightcurve',
      runIdPrefix: 'cherry-run-seed',
      declaredSeeds: SEED_CHERRY_DECLARED_SEEDS,
      runRegistrySeeds: SEED_CHERRY_REPORTED_SEEDS,
    }),
  );

  return { fec, statistics, baseFecArgs, preliminaryVerdict, antiTheaterReport };
}

/**
 * 构造 cherry-picked adversarial proof chain（生产 builder·委托 prepareSeedCherryChain）：
 *   prepare（真实 BLS + 统计 + report）→ fecAppendClaim(antiTheaterReport) → kernel ANTI_THEATER_FAIL → seal。
 *
 * @param db 已打开的 :memory: 或文件 DB（函数内应用全部迁移）。
 * @param options lightcurvePath / workingDir / 可选 pythonCmd / adapter（透传 prepareSeedCherryChain）。
 */
export async function buildSeedCherryAdversarialChain(
  db: Database.Database,
  options: {
    readonly lightcurvePath: string;
    readonly workingDir: string;
    readonly pythonCmd?: string;
    readonly adapter?: VenvSandboxAdapter;
  },
): Promise<SeedCherryPipelineResult> {
  runMigrations(db);
  const { baseFecArgs, antiTheaterReport, statistics } = await prepareSeedCherryChain(options);
  const fecResult = fecAppendClaim(db, { ...baseFecArgs, antiTheaterReport });

  const { conclusion: sealedConclusion } = machineSealableConclusion(fecResult.decision.verdict);

  const knownFailures = [
    `cherry-picked submission detected: declared ${SEED_CHERRY_DECLARED_SEEDS.length} seeds but runRegistry only logs ${SEED_CHERRY_REPORTED_SEEDS.length} (seeds ${SEED_CHERRY_DECLARED_SEEDS.filter((s) => !SEED_CHERRY_REPORTED_SEEDS.includes(s)).join(',')} hidden)`,
    'lightcurve is the same synthetic cached_fixture as c_astro; real online TESS multi-seed is a V2 productization item',
  ];

  const sealed = sealProofEnvelope(db, {
    claimId: SEED_CHERRY_CLAIM_ID,
    verdictNodeId: fecResult.verdictNode.verdictId,
    conclusion: sealedConclusion,
    prevProofHash: GENESIS_PROOF_HASH,
    checks: [],
    knownFailures,
    falsificationSpec: SEED_CHERRY_FALSIFICATION_SPEC,
    sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    reproHash: '5'.repeat(64),
    sealedAt: C_ASTRO_FROZEN_AT,
  });

  return {
    db,
    claimId: SEED_CHERRY_CLAIM_ID,
    claimText: SEED_CHERRY_PIPELINE_CLAIM,
    statistics,
    machineVerdict: fecResult.decision.verdict,
    kernelOutput: fecResult.kernelOutput,
    fecGate: fecResult.fecGate,
    antiTheaterReport,
    sealed,
    sealedConclusion,
  };
}
