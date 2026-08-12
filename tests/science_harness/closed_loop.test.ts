// tests/science_harness/closed_loop.test.ts
//
// 赛道一·B 核心物证：C-ASTRO 闭环实验迭代（规划→BLS→验证→缩放加密网格→实测提升）。
// 真实依赖：repro/science_harness/bls_compute.py:run（numpy BLS·逐轮真 spawn）+
// src/science_harness/closed_loop.ts:runClosedLoopAstro（网格策略闭环）。
//
// 诚实边界：合成 fixture 上真 BLS 计算（确定性）；真实在线 TESS 运行时待 MAST 数据。
// 缺 python/numpy → t.skip（环境问题·非代码 bug）。

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findPythonCommand, probeNumpy } from '../_helpers/python.ts';
import { runClosedLoopAstro } from '../../src/science_harness/closed_loop.ts';

const CACHED_FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

test('c-astro closed loop: real per-round BLS + grid zoom/refine -> narrowed grid, higher resolution (赛道一·B)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null || !probeNumpy(pythonCommand)) {
    t.skip('python3/python + numpy not available on PATH');
    return;
  }
  if (!existsSync(CACHED_FIXTURE)) {
    t.skip('cached fixture missing (regenerate: python tests/fixtures/science_harness/generate_tic_sample.py)');
    return;
  }

  const workingDir = mkdtempSync(resolve(tmpdir(), 'far-closedloop-'));
  try {
    const result = await runClosedLoopAstro({
      lightcurvePath: CACHED_FIXTURE,
      workingDir,
      rounds: 3,
      pythonCmd: pythonCommand,
    });

    // 结构断言：3 轮，每轮有 plan + 真实测量。
    assert.equal(result.rounds.length, 3, 'ran exactly 3 closed-loop rounds');
    for (const r of result.rounds) {
      assert.ok(r.depthSnr > 0, `round ${r.plan.round} depthSNR is a real positive measurement (=${r.depthSnr})`);
      assert.ok(r.bestPeriod > 0, `round ${r.plan.round} bestPeriod is real (=${r.bestPeriod})`);
    }

    // 闭环核心断言：网格收窄 + 分辨率提升（逐轮规划真的在缩放加密）。
    assert.ok(
      result.periodGridNarrowedTo < 1,
      `grid narrowed across rounds (ratio=${result.periodGridNarrowedTo.toFixed(4)} < 1)`,
    );
    const r1 = result.rounds[0];
    const r3 = result.rounds[2];
    assert.ok(r1 !== undefined && r3 !== undefined, 'rounds 1 and 3 produced');
    assert.ok(
      r3.nTrials > r1.nTrials,
      `resolution increased (r1 trials=${r1.nTrials} -> r3 trials=${r3.nTrials})`,
    );

    // period 收敛：末轮 best period 接近合成真值 2.41d。
    assert.ok(
      Math.abs(result.finalBestPeriod - 2.41) < 0.05,
      `converged to true period 2.41d (final=${result.finalBestPeriod.toFixed(4)})`,
    );

    // 信息性：打印逐轮 depthSNR 轨迹（诚实——是否单调提升取决于真实测量，非剧本）。
    const trajectory = result.rounds.map((r) => r.depthSnr.toFixed(2)).join(' -> ');
    // 合成强信号 + 网格细化 → 期望 depthSNR 不降（真实提升的体现）。
    assert.ok(
      result.finalDepthSnr >= result.initialDepthSnr - 0.5,
      `closed-loop did not degrade detection (initial=${result.initialDepthSnr.toFixed(2)}, final=${result.finalDepthSnr.toFixed(2)}; trajectory=${trajectory})`,
    );
  } finally {
    rmSync(workingDir, { recursive: true, force: true });
  }
});

test('runClosedLoopAstro: arg guards (rounds integer>=1, zoomFactor in (0,0.5), resolutionBoost>1)', async () => {
  const workingDir = mkdtempSync(resolve(tmpdir(), 'far-closedloop-guard-'));
  try {
    await assert.rejects(
      () => runClosedLoopAstro({ lightcurvePath: 'x', workingDir, rounds: 0 }),
      /rounds must be an integer >= 1/,
    );
    await assert.rejects(
      () => runClosedLoopAstro({ lightcurvePath: 'x', workingDir, rounds: 2, zoomFactor: 0.6 }),
      /zoomFactor must be in \(0, 0\.5\)/,
    );
    await assert.rejects(
      () => runClosedLoopAstro({ lightcurvePath: 'x', workingDir, rounds: 2, resolutionBoost: 1 }),
      /resolutionBoost must be > 1/,
    );
  } finally {
    rmSync(workingDir, { recursive: true, force: true });
  }
});
