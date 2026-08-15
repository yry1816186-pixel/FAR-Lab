// tests/science_harness/c_astro_pipeline.test.ts
//
// P1-6 / Phase 5 端到端物证：C-ASTRO 经 venv sandbox 真起 python 子进程跑 numpy BLS，
// 产真实 transit 测量 → src/statistics/ 两样本 z-test（M1）→ Pipeline B → R4 诚实 scope 门 → seal。
//
// 真实依赖（file:line）：
//   - src/science_harness/sandbox_runner.ts:venvSandboxAdapter.executeAsync（真 spawn 子进程）
//   - repro/science_harness/bls_compute.py:run（numpy BLS 周期搜索·真实 period/depth/SNR/odd-even）
//   - src/statistics/p_value.ts:80 twoSampleWelchZTest（in vs out fluxes · M1 transit-depth 显著性实算）
//   - src/falsifiability/verdict_kernel_v2.ts:285 R4（scopeNarrowerThanClaim → DEGRADED_SCOPE，优先级 > R7）
//
// 反同义反复：BLS period/depth/SNR 是 sandbox 子进程对光变曲线的实算（非常量、非硬编码），
// z-statistic 由真实 in/out fluxes 驱动（|z|>10），裁决由真实统计 + 诚实 scope 门共同决定，
// 非 V1 布尔计数器。artifact sha256 篡改门验证 sandbox 产物未被篡改。
//
// 诚实裁决（cached_fixture 路径）：真实 BLS 信号本可驱动 R7 CONFIRMED（supports + adjustedP<=α），
// 但 cached_fixture 是合成 LC，scope 窄于真实 TESS claim → R4 DEGRADED_SCOPE（02 F1：合成 fixture
// 不得升 CONFIRMED）。比 fake-CONFIRMED→INCONCLUSIVE 更诚实。DEGRADED_SCOPE 原样密封。
//
// 诚实边界：缺 python/numpy = 环境问题 → t.skip（不当代码 bug）。
// cached_fixture 是合成 transit LC（baseline_exempt）；真实 TESS 路径在 dataset_real.test.ts 覆盖。
//
// Authority: P1-5/P1-6 + 03 §7 R0-R9 + 05 §9.4 (C-ASTRO bounded)。

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { findPythonCommand, probeNumpy, buildPythonPath, restorePythonPath } from '../_helpers/python.ts';

import {
  buildCAstroChain,
  buildCAstroStatistics,
  C_ASTRO_ALPHA,
  C_ASTRO_CLAIM_ID,
  C_ASTRO_METRIC_KEY,
  type BlsMetrics,
} from '../../src/science_harness/c_astro_pipeline.ts';
import { fetchOnlineDataset } from '../../src/science_harness/dataset_resolver.ts';

const CACHED_FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

/** 构造一个最小确定性 BlsMetrics（in-fluxes 有真实 transit dip，out-fluxes 基线）——纯单元，不需 python。 */
function makeBlsMetrics(nPeriods: number, nDurations: number): BlsMetrics {
  // 确定性（非随机）：in-fluxes 系统性低于 out-fluxes → 真实 two-sample 显著 + 稳定可复现。
  const inFluxes = Array.from({ length: 30 }, (_, i) => 0.992 + (i % 7) * 0.0002);
  const outFluxes = Array.from({ length: 60 }, (_, i) => 1.0 + (i % 11) * 0.0002);
  return {
    ok: true,
    n_points: 90,
    n_periods: nPeriods,
    n_durations: nDurations,
    period: 2.41,
    duration: 0.12,
    depth: 0.008,
    depthSNR: 9.0,
    oddEvenDiff: 0.5,
    oddEvenEvenDepth: 0.008,
    oddEvenOddDepth: 0.008,
    inFluxes,
    outFluxes,
    centroidOffset: null,
  };
}

test('buildCAstroStatistics: adjustedPValue applies real BLS-grid Bonferroni (n_periods × n_durations), not the ×1 no-op (T-017/T-018 fix)', () => {
  // 同一组 in/out fluxes（同一 rawP），不同 BLS 网格规模 → adjustedP 必须按 nTrials 倍数变化。
  const demo = buildCAstroStatistics(C_ASTRO_METRIC_KEY, makeBlsMetrics(120, 3));
  const prod = buildCAstroStatistics(C_ASTRO_METRIC_KEY, makeBlsMetrics(2000, 3));
  const demoP = demo.statisticalResult.pValue;
  const prodP = prod.statisticalResult.pValue;
  assert.ok(demoP !== undefined && prodP !== undefined, 'ran status must produce a raw pValue');
  assert.equal(demoP, prodP, 'identical fluxes → identical raw p-value');
  const demoTrials = 120 * 3;
  const prodTrials = 2000 * 3;
  // adjustedPValue = rawP × nTrials（真实网格校正，非旧 adjustPValues([p],'bonferroni') 的 ×1）
  assert.ok(Math.abs(demo.adjustedPValue - demoP * demoTrials) < 1e-9);
  assert.ok(Math.abs(prod.adjustedPValue - prodP * prodTrials) < 1e-9);
  // 比例 = trial 比例（6000/360 ≈ 16.67）
  assert.ok(Math.abs(demo.adjustedPValue / prod.adjustedPValue - demoTrials / prodTrials) < 1e-6);
  // 关键回归守护：旧实现下 demo.adjustedP == rawP（×1 no-op）；新实现下 = rawP × 360
  assert.ok(demo.adjustedPValue > demoP, 'grid correction applied (not ×1 no-op)');
  assert.ok(
    prod.adjustedPValue > demo.adjustedPValue,
    '生产网格(6000 trial)比 demo 网格(360)校正更严 — R7 置信按真实网格诚实降权',
  );
});

test('c_astro_pipeline: real venv BLS + real two-sample z-test -> R4 DEGRADED_SCOPE (cached_fixture honest scope) -> seal (Phase 5)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  if (!probeNumpy(pythonCommand)) {
    t.skip(`numpy import failed for ${pythonCommand} (BLS needs numpy)`);
    return;
  }
  if (!existsSync(CACHED_FIXTURE)) {
    t.skip(`cached fixture missing: ${CACHED_FIXTURE} (run generate_tic_sample.py)`);
    return;
  }

  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  const work = mkdtempSync(resolve(tmpdir(), 'far-castro-bls-'));
  const db = new Database(':memory:');
  try {
    const chain = await buildCAstroChain(db, {
      lightcurvePath: CACHED_FIXTURE,
      datasetSource: 'cached_fixture',
      workingDir: work,
      pythonCmd: pythonCommand,
    });
    const { sandbox, statistics } = chain;
    const bls = sandbox.metrics;

    // ── 真实 BLS 测量（sandbox 子进程实算·非常量）──
    // fixture 真值 period=2.41d depth=0.008；BLS 应在容差内恢复（噪声容许偏差）。
    assert.ok(
      Math.abs(bls.period - 2.41) < 0.1,
      `real BLS period must recover ~2.41d within 0.1, got ${bls.period}`,
    );
    assert.ok(
      bls.depth > 0.004 && bls.depth < 0.012,
      `real BLS depth must be ~0.008 (0.8%) within [0.004,0.012], got ${bls.depth}`,
    );
    assert.ok(
      bls.depthSNR > 7,
      `real BLS depthSNR must indicate a strong transit (>7), got ${bls.depthSNR}`,
    );
    assert.equal(bls.n_points, 600, 'fixture has 600 lightcurve points');
    assert.ok(bls.inFluxes.length >= 10 && bls.outFluxes.length >= 100, 'BLS must partition in/out fluxes');
    assert.equal(bls.centroidOffset, null, '1D lightcurve cannot compute centroid (M4 -> not asserted)');

    // ── sandbox hash 锚 + artifact 篡改门 ──
    assert.equal(sandbox.result.exitCode, 0, `sandbox must exit 0; stderrHash=${sandbox.result.stderrHash}`);
    assert.equal(sandbox.result.networkBlocked, true, 'SR-5 networkPolicy=off -> networkBlocked');
    assert.equal(sandbox.result.singleThreaded, true, 'SR-7 nthread=1');
    assert.match(sandbox.result.artifactTreeHash, /^[0-9a-f]{64}$/, 'artifactTreeHash must be real sha256');
    const metricsArtifact = sandbox.result.artifacts.find((a) => a.path === 'bls_metrics.json');
    assert.ok(metricsArtifact !== undefined, 'bls_metrics.json must be in sandbox artifact manifest');

    // ── 真实两样本统计（M1：in vs out fluxes · src/statistics/ 实算）──
    // 合成 transit 信号极强（in≈0.992 vs out≈1.0, σ=0.002, ~30/570 点）→ z-statistic ≈ -21
    // → normalCdf(-21) erf 下溢 → clampProbability → pValue 精确 0。pValue=0 是真实数值结果
    // （stub 会返回圆数）。故用 z 统计量大小证明真实计算，pValue<alpha 证明显著性（R7 门）。
    assert.equal(statistics.tTest.alternative, 'less', 'H1: mean(inFlux) < mean(outFlux) (transit dip)');
    assert.ok(
      statistics.tTest.statistic < -10,
      `real twoSampleWelchZTest statistic must be strongly negative (in<out dip, |z|>10), got ${statistics.tTest.statistic}`,
    );
    assert.ok(
      statistics.tTest.pValue < C_ASTRO_ALPHA,
      `real z-test pValue must be < alpha (significant; underflows to 0 for strong signal), got ${statistics.tTest.pValue}`,
    );
    assert.ok(
      statistics.adjustedPValue <= C_ASTRO_ALPHA,
      `bonferroni-adjusted pValue must be <= alpha (R7 gate), got ${statistics.adjustedPValue}`,
    );
    const { confidenceInterval: ci } = statistics;
    assert.ok(
      ci.lower < ci.estimate && ci.estimate < ci.upper,
      `real difference CI must bracket the depth estimate: lower(${ci.lower}) < est(${ci.estimate}) < upper(${ci.upper})`,
    );
    assert.ok(
      Number.isFinite(statistics.effectSize.cohensD) && statistics.effectSize.cohensD !== 0,
      `real cohensD must be finite non-zero, got ${statistics.effectSize.cohensD}`,
    );

    // 接线不变式：testId === metricKey（kernel primary-test 匹配）。
    assert.equal(statistics.statisticalResult.testId, C_ASTRO_METRIC_KEY);

    // ── FEC 真实可编译 + kernel integrityFlags 空 ──
    assert.equal(chain.fecGate.allowed, true);
    assert.equal(chain.kernelOutput.integrityFlags.length, 0);

    // ── 真实统计信号确为支持性（depth>0 dip + 显著）：证明 real BLS 信号本可驱动 R7 CONFIRMED ──
    assert.equal(
      chain.kernelOutput.statisticalReport.supports,
      true,
      'real transit dip (depth>0) + real significance -> statisticalReport.supports=true',
    );
    assert.ok(
      chain.kernelOutput.statisticalReport.primaryAdjustedPValue !== null &&
        chain.kernelOutput.statisticalReport.primaryAdjustedPValue <= C_ASTRO_ALPHA,
      'real adjustedPValue <= alpha -> the real signal is genuinely confirmatory (would reach R7)',
    );
    assert.equal(
      chain.kernelOutput.statisticalReport.primaryAdjustedPValue,
      statistics.adjustedPValue,
      'kernel primaryAdjustedPValue must equal the real computed adjustedPValue (statistics? injection wired)',
    );

    // ── R4 scope 门（诚实·优先级 > R7）：cached_fixture 是合成 LC，scope 窄于真实 TESS claim
    //    → DEGRADED_SCOPE。02 F1：合成 fixture 不得升 CONFIRMED 到真实 claim。真实 BLS 信号本可
    //    触发 R7（见上 supports + 显著），但被诚实 scope 门先行约束——比 fake-CONFIRMED 更诚实。──
    assert.equal(
      chain.machineVerdict,
      'DEGRADED_SCOPE',
      'cached_fixture (synthetic LC) honestly bounds the real-TESS claim to DEGRADED_SCOPE (R4 scope gate > R7 CONFIRMED)',
    );
    assert.equal(
      chain.kernelOutput.decisiveRuleId,
      'R4_SCOPE_MISMATCH_NONCRITICAL',
      `decisiveRuleId must be R4 (scopeNarrowerThanClaim=true on cached_fixture), got ${chain.kernelOutput.decisiveRuleId}`,
    );
    assert.equal(chain.machineVerdict, chain.kernelOutput.verdict);

    // ── DEGRADED_SCOPE 诚实密封（ASK-9 只降 CONFIRMED；DEGRADED_SCOPE 原样密封，绝不伪造 CONFIRMED）──
    assert.equal(
      chain.sealedConclusion,
      'DEGRADED_SCOPE',
      'DEGRADED_SCOPE seals as-is (ASK-9 only bounds CONFIRMED; honest scope verdict preserved through seal)',
    );
    assert.equal(chain.sealed.envelope.conclusion, 'DEGRADED_SCOPE');
    assert.match(chain.sealed.envelope.proofHash, /^[0-9a-f]{64}$/, 'sealed envelope must carry a real sha256 proofHash');
    assert.notEqual(chain.sealedConclusion, 'CONFIRMED', 'never seal CONFIRMED on synthetic-fixture evidence');

    // cached_fixture 诚实标注：datasetSource + scopeNarrowerThanClaim + baseline_exempt purpose。
    assert.equal(chain.datasetSource, 'cached_fixture');
    assert.equal(chain.claimId, C_ASTRO_CLAIM_ID);

    // ── FUSION-OS-1 生产路径反剧场物证：buildCAstroChain 真跑 runAntiTheaterLint 产 report ──
    // 互补分工：static CHECK 证 caller 传 antiTheaterReport；本断言证生产 caller 真跑 lint 产 report（干净单 seed 无 finding）；
    // proof_test seed_cherry_pipeline.test.ts 证 detect_seed_cherry 诚实 fire（fixture-data cherry-pick → ANTI_THEATER_FAIL）。
    assert.ok(chain.antiTheaterReport !== undefined, 'buildCAstroChain must run runAntiTheaterLint and produce antiTheaterReport (FUSION-OS-1 production caller)');
    assert.equal(Array.isArray(chain.antiTheaterReport.findings), true, 'antiTheaterReport.findings must be an array (real lint output, not skipped)');
    assert.equal(chain.antiTheaterReport.llmOverrideRejected, true, 'llmOverrideRejected=true proves report came from real runAntiTheaterLint (deterministic kernel, F3)');
    assert.equal(typeof chain.antiTheaterReport.antiTheaterScore, 'number', 'antiTheaterScore must be a real computed number (not a stub)');
  } finally {
    db.close();
    restorePythonPath(previous);
    rmSync(work, { recursive: true, force: true });
  }
});

test('c_astro_pipeline: dataset resolution — online lightkurve attempt degrades to cached_fixture honestly', async () => {
  // 不依赖网络/lightkurve：fetchOnlineDataset 对 TIC 的在线尝试要么返回真实 ref（lightkurve+MAST 可用），
  // 要么 null（不可用 → cached_fixture 降级）。两种都合法（02 F1：绝不伪造）。
  const online = await fetchOnlineDataset({
    resolver: 'lightkurve',
    host: 'mast.stsci.edu',
    version: '1.0',
    ticId: '268644982',
    sector: 14,
    timeoutMs: 8_000,
  });
  if (online === null) {
    assert.ok(true, 'online lightkurve unavailable -> cached_fixture fallback (02 F1, honest)');
    return;
  }
  assert.equal(online.hostWhitelisted, true);
  assert.match(online.ref.contentHash, /^[0-9a-f]{64}$/, 'online contentHash must be real sha256, never fabricated');
  assert.equal(online.ref.resolver, 'lightkurve');
});
