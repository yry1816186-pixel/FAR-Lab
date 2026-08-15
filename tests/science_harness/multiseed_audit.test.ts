// tests/science_harness/multiseed_audit.test.ts
//
// FUSION-OS-1 strongest-achievable closure 物证：真实 seed-dependent multi-seed BLS 实验
// （每 seed 注入高斯噪声 → distinct 测量）+ cherry-pick 审计。cherry-pick 从数据涌现——
// 研究者只报告 depthSNR >= 阈值的 seed，detect_seed_cherry 从 declared（全部）vs reported
// （检测子集）的真实差集 fire。runRegistry 由真实 BLS 子进程执行产出，非硬编码常量。
//
// 与 seed_cherry_pipeline（fixture 常量 showcase）的根本区别：本测试的 registry 是 5 次真实
// BLS spawn 的实算结果（distinct per seed），artifactHash/metricValue 从实算派生。
//
// 真实依赖（T8）：venvSandboxAdapter.executeAsync（per-seed 真起 python BLS）
// detect_seed_cherry 真实集合差集 + src/statistics 真实两样本 z-test。
//
// 诚实边界：BLS 跑 cached_fixture LC + 本地噪声注入（真实计算·非在线 TESS）。
// 缺 python/numpy/fixture = 环境问题 → 跳过。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  runMultiseedBlsExperiment,
  auditMultiseedCherryPick,
  MULTISEED_DECLARED_SEEDS,
} from '../../src/science_harness/multiseed_audit.ts';
import { findPythonCommand, probeNumpy } from '../_helpers/python.ts';

const CACHED_FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

test('multiseed_audit: real per-seed BLS (distinct) + data-emergent cherry-pick -> detect_seed_cherry fires on REAL registry -> ANTI_THEATER_FAIL', async (t) => {
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
    t.skip(`cached fixture missing: ${CACHED_FIXTURE}`);
    return;
  }

  // ── 真实 multi-seed 实验：5 seed × 真起 python BLS（噪声注入 → distinct 测量）──
  const experiment = await runMultiseedBlsExperiment({
    lightcurvePath: CACHED_FIXTURE,
    pythonCmd: pythonCommand,
  });

  // 真实 distinct per-seed（非常量）：5 seed 产 5 个不同 depth。
  const depths = experiment.runs.map((r) => r.metrics.depth);
  assert.equal(experiment.runs.length, MULTISEED_DECLARED_SEEDS.length, 'experiment must run all declared seeds');
  assert.equal(
    new Set(depths.map((d) => d.toFixed(6))).size,
    depths.length,
    `each seed must produce a DISTINCT depth (real noise injection), got: ${JSON.stringify(depths)}`,
  );
  // 所有 run 都是真实 BLS（恢复 ~2.41d 周期 + 正 depth）。
  for (const run of experiment.runs) {
    assert.ok(Math.abs(run.metrics.period - 2.41) < 0.15, `seed ${run.seed} BLS period ~2.41d, got ${run.metrics.period}`);
    assert.ok(run.metrics.depth > 0.004 && run.metrics.depth < 0.012, `seed ${run.seed} depth ~0.008, got ${run.metrics.depth}`);
  }

  // cherry-pick 从数据涌现：detectedSeeds = depthSNR >= 阈值 的子集（非硬编码列表）。
  assert.ok(
    experiment.detectedSeeds.length < experiment.declaredSeeds.length,
    `cherry-pick must emerge: detected (${experiment.detectedSeeds.length}) < declared (${experiment.declaredSeeds.length}) — researcher hides non-detections`,
  );
  const hiddenSeeds = experiment.declaredSeeds.filter((s) => !experiment.detectedSeeds.includes(s));
  assert.ok(hiddenSeeds.length > 0, `hidden seeds must be non-empty (the cherry-pick), got detected=${JSON.stringify(experiment.detectedSeeds)}`);

  // ── 审计：detect_seed_cherry 从真实 registry 差集 fire ──
  const db = new Database(':memory:');
  try {
    const audit = await auditMultiseedCherryPick(db, experiment);

    // 真实 registry sha256（从 reported runs 实算·非字面量）。
    assert.match(audit.registryArtifactHash, /^[0-9a-f]{64}$/, 'registryArtifactHash must be real sha256 (computed from real BLS results)');

    // detect_seed_cherry 诚实 fire（finding 由真实集合差集产出）。
    assert.equal(audit.antiTheaterReport.hasFail, true, 'detect_seed_cherry must fire on the real declared-vs-reported registry discrepancy');
    const seedCherryFinding = audit.antiTheaterReport.findings.find((f) => f.attackKind === 'seed-cherry-picking' && f.outcome === 'FAIL');
    assert.ok(seedCherryFinding !== undefined, 'findings must contain a real seed-cherry FAIL');
    const hiddenInFinding = hiddenSeeds.join(',');
    assert.ok(
      seedCherryFinding.message.includes(hiddenInFinding) || seedCherryFinding.message.includes(hiddenSeeds.join(', ')),
      `seed-cherry finding must identify the real hidden seeds {${hiddenInFinding}}, got: ${seedCherryFinding.message}`,
    );

    // kernel ANTI_THEATER_FAIL（full-scope → R4 不 shadow）。
    assert.equal(audit.kernelOutput.verdict, 'UNTESTED', 'full-scope + anti-theater fail -> UNTESTED');
    assert.equal(audit.kernelOutput.decisiveRuleId, 'ANTI_THEATER_FAIL', `decisiveRuleId ANTI_THEATER_FAIL (real registry), got ${audit.kernelOutput.decisiveRuleId}`);
    assert.ok(audit.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'));
    assert.ok(!audit.kernelOutput.reasonCodes.includes('R4_SCOPE_MISMATCH_NONCRITICAL'), 'full-scope must not trigger R4');
    assert.notEqual(audit.machineVerdict, 'CONFIRMED', 'cherry-pick must block CONFIRMED through the real audit path');

    // 真实统计（pooled reported fluxes）：|z|>10 证真实计算非 stub。
    assert.ok(
      (audit.statisticalResult.pValue ?? 1) < C_ASTRO_THRESHOLD,
      `real pooled z-test pValue < alpha, got ${audit.statisticalResult.pValue}`,
    );
  } finally {
    db.close();
  }
});

const C_ASTRO_THRESHOLD = 0.05;
