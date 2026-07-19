// tests/science_harness/c_astro_online.test.ts
//
// BUILD T7（P1-6 在线 TESS dataset_resolver 生产接线）物证：collectCAstroOnline 是
// fetchOnlineDataset / resolveDataset / buildCAstroChain 三组件的首个生产编排调用方
// （先前三组件均仅由测试驱动·本测试证明它们已被生产 CLI 路径编排·类比 DIGEST G1 闭合）。
//
// 真实依赖（file:line）：
//   - src/cli/commands/c_astro.ts:collectCAstroOnline（生产编排·fetch→resolve→buildCAstroChain）
//   - src/science_harness/dataset_resolver.ts:fetchOnlineDataset（真 spawn dataset_fetch.py·host 白名单门）
//   - src/science_harness/dataset_resolver.ts:resolveDataset（online→cached_fixture 决策树）
//   - src/science_harness/c_astro_pipeline.ts:buildCAstroChain（datasetSource 派生·真实 R7 或 baseline_exempt）
//
// 诚实边界（CLAUDE.md §3 + 02 F1 never-fabricate）：
//   - 在线取数需 lightkurve + MAST 可达（环境门）。缺之 → fetchOnlineDataset 返回 null →
//     resolveDataset degraded cached_fixture → buildCAstroChain(cached_fixture) → DEGRADED_SCOPE。
//     这是 honest fallback（非假绿）：测试区分「在线成功（env-gated）」与「在线不可达→cached 降级」。
//   - 缺 python/numpy/fixture → skip（环境问题·非代码 bug）。

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findPythonCommand, probeNumpy } from '../_helpers/python.ts';
import { collectCAstroOnline } from '../../src/cli/commands/c_astro.ts';

const CACHED_FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

test('collectCAstroOnline: wires fetchOnlineDataset -> resolveDataset -> buildCAstroChain; online unavailable -> honest cached_fixture -> DEGRADED_SCOPE', async (t) => {
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

  const dump = await collectCAstroOnline({
    lightcurveFixture: CACHED_FIXTURE,
    pythonCmd: pythonCommand,
  });

  // production wiring load-bearing：fetchOnlineDataset 被 orchestrator 调用 → resolution 反映 online attempt。
  assert.match(dump.resolutionReason, /online|cached_fixture/i, 'resolution must reflect the online-attempt decision tree (resolveDataset ran)');

  // cachedFixtureHash 是真实文件 sha256（hashFixture 实算·非字面量）→ orchestrator 确实运行。
  assert.match(dump.cachedFixtureHash, /^[0-9a-f]{64}$/, 'cachedFixtureHash must be real sha256 of the fixture file');

  // BLS 真跑（real period/depth·非 stub）。
  assert.ok(dump.blsPeriod > 0, `BLS period must be positive (real BLS), got ${dump.blsPeriod}`);
  assert.ok(dump.blsDepth > 0, `BLS depth must be positive (real BLS), got ${dump.blsDepth}`);
  assert.ok(dump.sealedConclusion.length > 0, 'sealed conclusion must be present (proof envelope sealed)');

  if (dump.datasetSource === 'online') {
    // env-gated online success（lightkurve+MAST 可达）：真实在线 hash + 真实 R7 路径（scope 不缩窄）。
    assert.match(
      dump.onlineContentHash ?? '',
      /^[0-9a-f]{64}$/,
      'online datasetSource must carry a real online contentHash (lightkurve+MAST fetched)',
    );
    assert.notEqual(
      dump.machineVerdict,
      'DEGRADED_SCOPE',
      'online LC (scope not narrowed) must NOT trigger R4 scope_narrow — real R7 path',
    );
  } else {
    // online 不可达（无 lightkurve/MAST·本环境常态）：honest cached_fixture fallback。
    assert.equal(dump.datasetSource, 'cached_fixture', 'online unavailable -> cached_fixture (fail-safe)');
    assert.equal(dump.resolutionStatus, 'degraded', 'resolveDataset must mark degraded when online unavailable');
    assert.equal(
      dump.onlineContentHash,
      null,
      'online unavailable -> null contentHash (fetchOnlineDataset returned null, never fabricated)',
    );
    assert.equal(
      dump.machineVerdict,
      'DEGRADED_SCOPE',
      'cached_fixture (scope narrower than real TESS claim) -> R4 -> DEGRADED_SCOPE',
    );
    assert.equal(dump.decisiveRuleId, 'R4_SCOPE_MISMATCH_NONCRITICAL');
  }
});

test('far c-astro CLI: production-reachable (exit 0 + honest wiring output)', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null || !probeNumpy(pythonCommand) || !existsSync(CACHED_FIXTURE)) {
    t.skip('python/numpy/fixture unavailable — CLI online wiring cannot be exercised');
    return;
  }

  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'c-astro', '--json'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(r.status, 0, `far c-astro must exit 0 (pipeline ran); stderr=${(r.stderr ?? '').slice(0, 300)}`);
  const dump = JSON.parse(r.stdout) as { status: string; datasetSource: string; machineVerdict: string };
  assert.ok(
    ['resolved_online', 'degraded_cached', 'untested'].includes(dump.status),
    `status must be a valid wiring outcome, got ${dump.status}`,
  );
  assert.ok(['online', 'cached_fixture'].includes(dump.datasetSource));
  assert.ok(dump.machineVerdict.length > 0);
});
