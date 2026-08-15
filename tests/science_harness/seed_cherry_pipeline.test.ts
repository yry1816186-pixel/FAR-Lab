// tests/science_harness/seed_cherry_pipeline.test.ts
//
// FUSION-OS-1 detector-validation 物证：buildSeedCherryAdversarialChain 回放一个 cherry-picked adversarial
// submission（研究者预注册 5 seed [0,1,2,3,4] 但 runRegistry 只报告 [0,1,2]）→ 真实 venv BLS + 真实统计
// → detect_seed_cherry 从真实 registry 差集 {3,4} fire HIDDEN_FAILED_RUN → kernel ANTI_THEATER_FAIL。
//
// 诚实性（vs 已撤销 test-hook 设计）：cherry-pick 是 fixture 数据（declaredSeeds/runRegistrySeeds 是
// seed_cherry_pipeline.ts 的模块常量·非 call-time 注入参数）。detect_seed_cherry 对真实 registry 做真实
// 集合差集，finding 由 detector 产出非 caller 手填。类比 GV-14（identifier_fabrication 是 fixture 数据）。
//
// load-bearing 反证：full-scope（scopeNarrowerThanClaim=false）+ 真实显著 transit 信号 → preliminaryVerdict
// 本可达 R7 CONFIRMED；唯一使其落 UNTESTED/ANTI_THEATER_FAIL 的是 antiTheaterReport wiring。突变该 wiring
// （不传 antiTheaterReport）→ verdict 回 CONFIRMED → 本测试 FAIL（证 wiring load-bearing）。
//
// 真实依赖（T8 单一真实依赖）：
//   - src/science_harness/sandbox_runner.ts:venvSandboxAdapter.executeAsync（真 spawn python 子进程）
//   - repro/science_harness/bls_compute.py:run（numpy BLS 周期搜索·真实测量）
//   - src/statistics/ twoSampleWelchZTest（真实 in/out fluxes 两样本 z-test）
//   - src/anti_theater/detectors/seed_cherry.ts:detect_seed_cherry（真实 declared-vs-ran 集合差集）
//
// 诚实边界：缺 python/numpy/fixture = 环境问题 → t.skip。BLS 跑同一 cached_fixture LC
// （真实 BLS 计算）；真实在线 TESS multi-seed 是 P1-6 V2 产品化路径（本 closure 测 detector 诚实 fire）。
//
// Authority: FUSION-OS-1。

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { findPythonCommand, probeNumpy, buildPythonPath, restorePythonPath } from '../_helpers/python.ts';

import {
  buildSeedCherryAdversarialChain,
  prepareSeedCherryChain,
  SEED_CHERRY_DECLARED_SEEDS,
  SEED_CHERRY_REPORTED_SEEDS,
} from '../../src/science_harness/seed_cherry_pipeline.ts';
import { runMigrations } from '../../src/db/migrator.ts';
import { fecAppendClaim } from '../../src/fec/index.ts';

const CACHED_FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

test('seed_cherry_pipeline: real venv BLS + fixture-data cherry-pick -> detect_seed_cherry fires REAL -> ANTI_THEATER_FAIL (FUSION-OS-1 honest closure)', async (t) => {
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
  const work = mkdtempSync(resolve(tmpdir(), 'far-cherry-bls-'));
  const db = new Database(':memory:');
  try {
    const chain = await buildSeedCherryAdversarialChain(db, {
      lightcurvePath: CACHED_FIXTURE,
      workingDir: work,
      pythonCmd: pythonCommand,
    });
    const { statistics } = chain;
    const bls = chain.statistics.bls;

    // ── 真实 BLS 测量（sandbox 子进程实算·非常量）──
    assert.ok(Math.abs(bls.period - 2.41) < 0.1, `real BLS period must recover ~2.41d, got ${bls.period}`);
    assert.ok(bls.depth > 0.004 && bls.depth < 0.012, `real BLS depth ~0.008 within [0.004,0.012], got ${bls.depth}`);
    assert.ok(bls.depthSNR > 7, `real BLS depthSNR > 7 (strong transit), got ${bls.depthSNR}`);

    // ── 真实两样本统计（M1：in vs out fluxes · |z|>10 证明真实计算非 stub）──
    assert.ok(
      statistics.tTest.statistic < -10,
      `real twoSampleWelchZTest |z|>10 (in<out dip), got ${statistics.tTest.statistic}`,
    );
    assert.ok(statistics.adjustedPValue <= 0.05, `real adjusted pValue <= alpha, got ${statistics.adjustedPValue}`);

    // ── detect_seed_cherry 诚实 fire：fixture cherry-pick（declared [0,1,2,3,4] ⊄ ran [0,1,2] → {3,4}）──
    // finding 由 detect_seed_cherry 真实集合差集产出（非 caller 手填·非 call-time 注入）。
    assert.equal(
      chain.antiTheaterReport.hasFail,
      true,
      'detect_seed_cherry must fire on the fixture cherry-pick (declared seeds missing from runRegistry)',
    );
    const seedCherryFinding = chain.antiTheaterReport.findings.find(
      (f) => f.attackKind === 'seed-cherry-picking' && f.outcome === 'FAIL',
    );
    assert.ok(seedCherryFinding !== undefined, 'findings must contain a REAL seed-cherry-picking FAIL from detect_seed_cherry');
    assert.ok(
      seedCherryFinding.message.includes('3,4') || seedCherryFinding.message.includes('3, 4'),
      `seed-cherry finding must identify hidden seeds {3,4}, got: ${seedCherryFinding.message}`,
    );

    // ── kernel ANTI_THEATER_FAIL（full-scope → R4 不 shadow → :373 可达）──
    // load-bearing 反证：full-scope + 真实显著信号 → preliminaryVerdict 本可达 R7 CONFIRMED；
    // 唯一使其落 UNTESTED 的是 antiTheaterReport wiring。
    assert.equal(chain.kernelOutput.verdict, 'UNTESTED', 'full-scope + anti-theater fail -> kernel UNTESTED');
    assert.equal(
      chain.kernelOutput.decisiveRuleId,
      'ANTI_THEATER_FAIL',
      `decisiveRuleId must be ANTI_THEATER_FAIL (R4 did not shadow full-scope evidence), got ${chain.kernelOutput.decisiveRuleId}`,
    );
    assert.ok(chain.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'));
    assert.ok(
      !chain.kernelOutput.reasonCodes.includes('R4_SCOPE_MISMATCH_NONCRITICAL'),
      'full-scope evidence must NOT trigger R4 (anti-theater not shadowed)',
    );
    assert.equal(chain.machineVerdict, 'UNTESTED');
    assert.notEqual(chain.machineVerdict, 'CONFIRMED', 'anti-theater fail must block CONFIRMED');

    // ── cherry-pick fixture 不变量：declared ⊃ reported（这是 detect_seed_cherry fire 的根因）──
    assert.ok(
      SEED_CHERRY_DECLARED_SEEDS.length > SEED_CHERRY_REPORTED_SEEDS.length,
      'fixture invariant: declared seeds must exceed reported seeds (cherry-pick)',
    );
    const hidden = SEED_CHERRY_DECLARED_SEEDS.filter((s) => !SEED_CHERRY_REPORTED_SEEDS.includes(s));
    assert.deepEqual(hidden, [3, 4], 'fixture hides exactly seeds 3,4 (the cherry-pick)');
  } finally {
    db.close();
    restorePythonPath(previous);
    rmSync(work, { recursive: true, force: true });
  }
});

// FUSION-OS-1 controlled-mutation 物证（base/head 双跑）：同一真实 sandbox 输入，仅 antiTheaterReport 有无之差。
// base（省 report·模拟 unwire）→ cherry-pick 攻击得逞 → CONFIRMED；head（传 report·wiring 在位）→ ANTI_THEATER_FAIL。
// 这把 commit prose 里的「dropping the antiTheaterReport → CONFIRMED」从论断变成可执行断言，证 wiring load-bearing。
test('seed_cherry_pipeline: load-bearing controlled-mutation — omit antiTheaterReport lets attack reach CONFIRMED (FUSION-OS-1 base/head)', async (t) => {
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
  const work = mkdtempSync(resolve(tmpdir(), 'far-cherry-mut-'));
  try {
    // 单次真实 sandbox 计算；base/head 复用同一 baseFecArgs（仅 antiTheaterReport 有无之差）。
    const prep = await prepareSeedCherryChain({
      lightcurvePath: CACHED_FIXTURE,
      workingDir: work,
      pythonCmd: pythonCommand,
    });

    // preliminary（anti-theater 通道关）必须可达 R7 CONFIRMED：真实显著 full-scope 信号——wiring load-bearing 的前提。
    assert.equal(
      prep.preliminaryVerdict.verdict,
      'CONFIRMED',
      `preliminary verdict (no anti-theater channel) must be CONFIRMED on the real significant full-scope signal, got ${prep.preliminaryVerdict.verdict}`,
    );

    // ── base arm（省 antiTheaterReport·模拟 unwire）→ 攻击得逞 → CONFIRMED ──
    const baseDb = new Database(':memory:');
    try {
      runMigrations(baseDb);
      const base = fecAppendClaim(baseDb, prep.baseFecArgs);
      assert.equal(
        base.kernelOutput.verdict,
        'CONFIRMED',
        `BASE (antiTheaterReport omitted): cherry-pick attack must reach CONFIRMED, got ${base.kernelOutput.verdict}`,
      );
      assert.equal(base.decision.verdict, 'CONFIRMED', 'BASE decision.verdict must be CONFIRMED (attack succeeds without the wiring)');
      assert.notEqual(base.kernelOutput.decisiveRuleId, 'ANTI_THEATER_FAIL', 'BASE must not trip anti-theater (channel off)');
    } finally {
      baseDb.close();
    }

    // ── head arm（传 antiTheaterReport·wiring 在位）→ ANTI_THEATER_FAIL ──
    const headDb = new Database(':memory:');
    try {
      runMigrations(headDb);
      const head = fecAppendClaim(headDb, { ...prep.baseFecArgs, antiTheaterReport: prep.antiTheaterReport });
      assert.equal(
        head.kernelOutput.decisiveRuleId,
        'ANTI_THEATER_FAIL',
        `HEAD (antiTheaterReport wired): decisiveRuleId must be ANTI_THEATER_FAIL, got ${head.kernelOutput.decisiveRuleId}`,
      );
      assert.notEqual(head.decision.verdict, 'CONFIRMED', 'HEAD: anti-theater fail must block CONFIRMED');
    } finally {
      headDb.close();
    }
  } finally {
    restorePythonPath(previous);
    rmSync(work, { recursive: true, force: true });
  }
});
