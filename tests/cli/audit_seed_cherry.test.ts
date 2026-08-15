// tests/cli/audit_seed_cherry.test.ts
// `far audit-seed-cherry` 物证：FUSION-OS-1 detector-validation showcase 真跑 cherry-pick fixture 回放。
// collectAuditSeedCherry 经真实 BLS 子进程 + detect_seed_cherry 真实集合差集 → DETECTED（kernel ANTI_THEATER_FAIL）。
// 缺 python/numpy/fixture = 环境问题 → 跳过（诚实边界）。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectAuditSeedCherry } from '../../src/cli/commands/audit_seed_cherry.ts';
import { findPythonCommand, probeNumpy } from '../_helpers/python.ts';

const FIXTURE = resolve('tests/fixtures/science_harness/tic_sample.cache');

test('collectAuditSeedCherry: real BLS + detect_seed_cherry -> DETECTED (FUSION-OS-1 detector-validation showcase)', async () => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    return; // python unavailable on this axis — environment skip
  }
  if (!probeNumpy(pythonCommand)) {
    return; // numpy unavailable — environment skip
  }
  if (!existsSync(FIXTURE)) {
    return; // cached fixture missing — environment skip
  }

  const dump = await collectAuditSeedCherry({ lightcurvePath: FIXTURE, pythonCmd: pythonCommand });

  // 真实 BLS 测量（非常量）：恢复 ~2.41d 周期 + 显著 transit dip。
  assert.ok(Math.abs(dump.blsPeriod - 2.41) < 0.1, `real BLS period must recover ~2.41d, got ${dump.blsPeriod}`);
  assert.ok(dump.blsDepthSNR > 7, `real BLS depthSNR > 7, got ${dump.blsDepthSNR}`);

  // fixture 不变量：declared ⊃ reported（cherry-pick hides {3,4}）。
  assert.deepEqual(dump.hiddenSeeds, [3, 4], 'fixture hides exactly seeds 3,4');

  // detector-validation 物证：detect_seed_cherry 诚实 fire + kernel 达 ANTI_THEATER_FAIL。
  assert.equal(dump.status, 'DETECTED', 'production audit must DETECT the cherry-pick');
  assert.equal(dump.antiTheaterHasFail, true, 'runAntiTheaterLint must report hasFail on the cherry-pick');
  assert.equal(dump.decisiveRuleId, 'ANTI_THEATER_FAIL', `decisiveRuleId must be ANTI_THEATER_FAIL, got ${dump.decisiveRuleId}`);
  assert.equal(dump.machineVerdict, 'UNTESTED', 'anti-theater fail forces UNTESTED (full-scope, R4 does not shadow)');
  assert.notEqual(dump.machineVerdict, 'CONFIRMED', 'anti-theater fail must block CONFIRMED through the showcase path');
});
