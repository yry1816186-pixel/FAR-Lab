// tests/science_harness/c_astro_anti_theater_wired.test.ts
//
// FUSION-OS-1 端到端物证：c_astro_pipeline 首个生产 caller 真跑 runAntiTheaterLint → fecAppendClaim。
//
// 闭合的 WIRED_OPT_IN 缺口（DEPTH_LEDGER §C FUSION-OS-1 降级注记）：orchestrator.ts:252 的
// toKernelFindings(args.antiTheaterReport?.findings ?? []) 仅类型层投影——4/4 生产 caller 不传
// antiTheaterReport → ?? [] 恒空 → ANTI_THEATER_FAIL（verdict_kernel_v2.ts:373）运行时不可触发。
// runAntiTheaterLint 虽有 caller（verify.ts:397），但那是封后离线 envelope 重算，非实时 verdict 路径。
// 本测试经 c_astro 生产构造（buildCAstroAntiTheaterInput）真跑 lint → 注入 fecAppendClaim 实时路径。
//
// 真实依赖链（T8 单一真实依赖 = real runAntiTheaterLint·20 deterministic detectors）：
//   - src/science_harness/c_astro_pipeline.ts:buildCAstroAntiTheaterInput（真实 fec frozen hash + 真实 artifact hash）
//   - src/fec/orchestrator.ts:computePreliminaryVerdict（真实 decideFiveValueVerdict·anti-theater 前等价态）
//   - src/anti_theater/lint.ts:runAntiTheaterLint（20 detector 纯函数·真实 seed-cherry HIDDEN_FAILED_RUN）
//   - src/fec/orchestrator.ts:fecAppendClaim（真实 kernel 事务路径·非 FakeBackend·非 mock）
//
// 反同义反复：统计由 src/statistics/ 对真实 in/out fluxes 实算（非常量、非硬编码 metric）；
// seed-cherry finding 由真实 detect_seed_cherry 集合差集产出（非预制片断言）；裁决由真实 kernel 给出。
//
// 诚实边界（CLAUDE.md §3）：本测试不需 venv/lightkurve（FUSION-OS-1 测的是 anti-theater 通道接线，
// 非 BLS sandbox——后者由 c_astro_pipeline.test.ts P1-5c 覆盖）。统计用真实数组实算，通道用真实 kernel。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-1 + CLAUDE.md §4 P-FUSION FUSION-OS-1。

import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim, computePreliminaryVerdict } from '../../src/fec/index.ts';
import type { FecAppendClaimArgs } from '../../src/fec/index.ts';
import { makeRealStatsFec } from '../../src/falsifiability/index.ts';
import { runAntiTheaterLint } from '../../src/anti_theater/index.ts';
import {
  buildCAstroAntiTheaterInput,
  buildCAstroStatistics,
  C_ASTRO_ALPHA,
  C_ASTRO_ANTI_THEATER_SUMMARY,
  C_ASTRO_CLAIM_ID,
  C_ASTRO_FALSIFICATION_SPEC,
  C_ASTRO_FROZEN_AT,
  C_ASTRO_METRIC_KEY,
  C_ASTRO_SEED,
  C_ASTRO_SOURCE_ANCHOR,
  C_ASTRO_THRESHOLD_SPEC,
} from '../../src/science_harness/c_astro_pipeline.ts';
import type { BlsMetrics } from '../../src/science_harness/c_astro_pipeline.ts';
import type { EvidenceRecord } from '../../src/falsifiability/index.ts';
import { GENESIS_PREV_HASH } from '../../src/evidence_log/index.ts';

// 真实 in/out fluxes（transit dip · in < out · 非零方差·足够样本量驱动强显著两样本 z-test）。
// 不用常量数组（welch z 需非零方差）·确定性伪噪声·均值差 ~0.008（depth>0 支持 transit claim）。
const IN_FLUXES = Array.from({ length: 30 }, (_, i) => 0.992 + (i % 3) * 0.0005);
const OUT_FLUXES = Array.from({ length: 570 }, (_, i) => 1.0 + (i % 5) * 0.0002);

function buildRealBlsMetrics(): BlsMetrics {
  return {
    ok: true,
    n_points: IN_FLUXES.length + OUT_FLUXES.length,
    period: 2.41,
    duration: 3,
    depth: 0.008,
    depthSNR: 12,
    oddEvenDiff: 0.0005,
    oddEvenEvenDepth: 0.992,
    oddEvenOddDepth: 0.992,
    inFluxes: IN_FLUXES,
    outFluxes: OUT_FLUXES,
    centroidOffset: null,
  };
}

// 真实 sandbox artifact sha256（非字面量·createHash 实算·代表 sandbox.result.artifactTreeHash）。
const ARTIFACT_TREE_HASH = createHash('sha256').update('castro-anti-theater-test-artifact').digest('hex');

function buildOnlineStyleBaseArgs(statistics: ReturnType<typeof buildCAstroStatistics>): FecAppendClaimArgs {
  const fec = makeRealStatsFec({
    claimId: C_ASTRO_CLAIM_ID,
    falsificationSpec: C_ASTRO_FALSIFICATION_SPEC,
    thresholdSpec: C_ASTRO_THRESHOLD_SPEC,
    frozenAt: C_ASTRO_FROZEN_AT,
    alpha: C_ASTRO_ALPHA,
    multipleTestingCorrection: 'bonferroni',
    confidenceIntervalMethod: 'welch_difference_normal_approximation',
    effectDirection: 'greater',
    metricUnit: 'transit_depth',
    metricDescription: 'BLS transit depth (out-of-transit minus in-transit mean flux)',
    seedValue: C_ASTRO_SEED,
  });
  // online 等价：scopeNarrowerThanClaim=false → R4 不 fire → anti-theater 不被 shadow。
  const evidences: EvidenceRecord[] = [
    {
      claim: `BLS transit depth on full-scope lightcurve (depth=${statistics.bls.depth.toFixed(5)}, seed=${C_ASTRO_SEED})`,
      metricValue: statistics.bls.depth,
      supportsClaim: statistics.effectDirection === 'supports',
      refutesClaim: statistics.effectDirection === 'refutes',
      scopeNarrowerThanClaim: false,
      sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    },
  ];
  return {
    callRecord: {
      stageId: 'stage4_evidence',
      cred: {
        modelId: 'offline-replay-fixture',
        dashscopeRequestId: null,
        reproHash: '4'.repeat(64),
        gitCommitSha: C_ASTRO_SOURCE_ANCHOR.gitCommitSha,
        isoTimestamp: C_ASTRO_FROZEN_AT,
      },
      payloadKind: 'observation',
      purposeTag: 'eval',
      prevHash: GENESIS_PREV_HASH,
    },
    callAudit: {
      requestPayload: '{"prompt":"C-ASTRO-0001 anti-theater wiring"}',
      responsePayload: `{"depth":${statistics.bls.depth.toFixed(6)}}`,
      finishReason: 'stop',
      usageTokensTotal: 0,
    },
    appendOptions: { providerProfile: 'offline_replay' },
    evidencePayload: { claimId: C_ASTRO_CLAIM_ID, claim: C_ASTRO_FALSIFICATION_SPEC.prediction, metric: C_ASTRO_METRIC_KEY },
    sourceAnchor: C_ASTRO_SOURCE_ANCHOR,
    claim: C_ASTRO_FALSIFICATION_SPEC.prediction,
    falsificationSpec: C_ASTRO_FALSIFICATION_SPEC,
    thresholdSpec: C_ASTRO_THRESHOLD_SPEC,
    evidences,
    parentVerdictId: null,
    nodeKind: 'evidence',
    fecV2: { contract: fec },
    statistics: [statistics.statisticalResult],
  };
}

test('c_astro_production_caller_runs_real_anti_theater_lint_and_triggers_ANTI_THEATER_FAIL: real runAntiTheaterLint seed-cherry -> fecAppendClaim -> kernel UNTESTED (FUSION-OS-1)', () => {
  // ── 真实统计（src/statistics/ 对真实 in/out fluxes 实算·M1 transit-depth 显著性）──
  const statistics = buildCAstroStatistics(C_ASTRO_METRIC_KEY, buildRealBlsMetrics());
  assert.ok(
    statistics.zTest.statistic < -10,
    `real twoSampleWelchZTest must be strongly negative (in<out dip), got ${statistics.zTest.statistic}`,
  );
  assert.ok(
    statistics.adjustedPValue <= C_ASTRO_ALPHA,
    `real bonferroni-adjusted pValue must be <= alpha (would reach R7 CONFIRMED), got ${statistics.adjustedPValue}`,
  );

  const baseArgs = buildOnlineStyleBaseArgs(statistics);
  const fec = baseArgs.fecV2.contract;

  // ── preliminary verdict（真实 decideFiveValueVerdict·anti-theater 前等价态）──
  // online full-scope + 真实显著支持信号 → R7 CONFIRMED（证明无 anti-theater 时本可封 CONFIRMED）。
  const preliminaryVerdict = computePreliminaryVerdict(baseArgs);
  assert.equal(
    preliminaryVerdict.verdict,
    'CONFIRMED',
    `preliminary verdict must be CONFIRMED (real significant signal, full scope, no anti-theater), got ${preliminaryVerdict.verdict}`,
  );
  assert.equal(preliminaryVerdict.scopeReport.coverage, 'full', 'full-scope evidence -> coverage=full (R4 does not shadow)');

  // ── c_astro 生产构造 lint input + seed-cherry 攻击（declaredSeeds 含 runRegistry 未跑的种子）──
  const lintInput = buildCAstroAntiTheaterInput({
    fec,
    preliminaryVerdict,
    sandboxArtifactTreeHash: ARTIFACT_TREE_HASH,
    metricKey: fec.metric.metricKey,
    metricValue: statistics.bls.depth,
    frozenAt: C_ASTRO_FROZEN_AT,
    seed: C_ASTRO_SEED,
    envelopeId: `ENV-${C_ASTRO_CLAIM_ID}`,
    humanSummary: C_ASTRO_ANTI_THEATER_SUMMARY,
    declaredSeeds: [C_ASTRO_SEED, 999], // 声明跑了 seed=999 但 runRegistry 隐去它（cherry-pick）
    runRegistrySeeds: [C_ASTRO_SEED],
  });

  // ── 真实 runAntiTheaterLint（20 detector·真实 detect_seed_cherry 集合差集）──
  const report = runAntiTheaterLint(lintInput);
  assert.equal(report.hasFail, true, 'seed-cherry attack (declared seed 999 missing from runRegistry) must yield hasFail=true via real detector');
  assert.ok(
    report.findings.some((f) => f.attackKind === 'seed-cherry-picking' && f.outcome === 'FAIL'),
    `report.findings must contain a real seed-cherry-picking FAIL, got: ${JSON.stringify(report.findings.map((f) => ({ kind: f.attackKind, outcome: f.outcome })))}`,
  );

  // ── 注入 fecAppendClaim 实时路径（真实 kernel 事务·经 orchestrator.ts:252 toKernelFindings 投影）──
  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, { ...baseArgs, antiTheaterReport: report });

    // kernel R-anti-theater-fail（verdict_kernel_v2.ts:373）：severity='fail' 早返回 UNTESTED + ANTI_THEATER_FAIL。
    assert.equal(result.kernelOutput.verdict, 'UNTESTED', 'real anti-theater fail must drive kernel UNTESTED via production caller');
    assert.equal(
      result.kernelOutput.decisiveRuleId,
      'ANTI_THEATER_FAIL',
      `decisiveRuleId must be ANTI_THEATER_FAIL (channel live via c_astro production caller), got: ${result.kernelOutput.decisiveRuleId}`,
    );
    assert.ok(
      result.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'),
      `reasonCodes must include ANTI_THEATER_FAIL, got: ${JSON.stringify(result.kernelOutput.reasonCodes)}`,
    );
    assert.equal(result.decision.verdict, 'UNTESTED');
    assert.notEqual(result.decision.verdict, 'CONFIRMED', 'anti-theater fail must block CONFIRMED through the real production path');
  } finally {
    db.close();
  }
});

test('opt_out_no_anti_theater_report_does_not_trigger_ANTI_THEATER_FAIL: backward compat (channel-off passes CONFIRMED)', () => {
  // 反剧场 R1 决策：opt-out caller（不传 antiTheaterReport）行为等价接线前（findings 空·不误触发降级）。
  // 本用例锁该向后兼容契约 + 反证 wiring 是 ANTI_THEATER_FAIL 的唯一原因：同一 real 统计信号，
  // 不传 report → R7 CONFIRMED（通道死）；传 report（上例）→ ANTI_THEATER_FAIL（通道活）。
  const statistics = buildCAstroStatistics(C_ASTRO_METRIC_KEY, buildRealBlsMetrics());
  const baseArgs = buildOnlineStyleBaseArgs(statistics);

  const db = new Database(':memory:');
  try {
    runMigrations(db);
    const result = fecAppendClaim(db, baseArgs);

    assert.equal(
      result.kernelOutput.verdict,
      'CONFIRMED',
      `opt-out (no antiTheaterReport) on the same real signal must reach R7 CONFIRMED (channel off), got ${result.kernelOutput.verdict}`,
    );
    assert.ok(
      !result.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'),
      `opt-out must NOT trigger ANTI_THEATER_FAIL, got reasonCodes: ${JSON.stringify(result.kernelOutput.reasonCodes)}`,
    );
    assert.notEqual(result.kernelOutput.decisiveRuleId, 'ANTI_THEATER_FAIL');
  } finally {
    db.close();
  }
});
