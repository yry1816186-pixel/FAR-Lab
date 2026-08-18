// tests/campaign/soak.test.ts
//
// CAMPAIGN-SOAK-001 验收测试：真实有界 soak——分钟级战役循环（真实
// runCampaignLoop + 真实台账 IO + 哈希链）、确定性故障注入、3 次
// crash-resume（running 残留 → 重启恢复）、内存趋势真实采样、审计链全量
// 重验。dev profile 分钟级（非跨日）——报告的 Cannot-prove 面由实现模块
// 头声明钉住。
// 时长预算：soak 本体 ~60s（profile: 13 问 × 3.5s + 3 crash 重试），测试
// timeout 150s < 全局 --test-timeout=180000。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEV_SOAK_PROFILE, runSoakDrill, type SoakProfile } from '../../src/campaign/soak.ts';
import { readCampaignEvents, verifyCampaignEventChain } from '../../src/campaign/event_log.ts';
import { CRASH_RECOVERY_DETAIL } from '../../src/campaign/scheduler.ts';

test('real minute-level soak drill: campaign loop + injected failures + 3 crash-resumes + audit chain intact', { timeout: 150_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-soak-test-'));
  try {
    const report = await runSoakDrill({ dir });
    const p = DEV_SOAK_PROFILE;

    // 真实时长下界：分钟级 soak（dev profile 声明的 engineering budget）。
    assert.ok(report.wallClockMs >= p.minDurationMs, `wall clock ${report.wallClockMs}ms must reach dev-profile minimum ${p.minDurationMs}ms`);
    assert.ok(report.wallClockMs <= p.hardCeilingMs, `wall clock ${report.wallClockMs}ms must stay under hard ceiling ${p.hardCeilingMs}ms`);

    // 故障注入真实发生（确定性种子 → ≥1 次暂态失败落账，失败不隐藏）。
    assert.ok(report.transientFailures >= 1, `seeded failure injection must actually fail some executions (got ${report.transientFailures}/${report.executorAttempts})`);
    assert.ok(report.failureRate > 0 && report.failureRate < 1);

    // crash-resume：3 次崩溃恢复事件在账（crash-recovered 补记）。
    assert.equal(report.crashResumes, p.plannedCrashes);
    const events = readCampaignEvents(dir);
    assert.equal(events.filter((e) => e.payload.type === 'question_failed' && e.payload.detail === CRASH_RECOVERY_DETAIL).length, p.plannedCrashes);

    // 审计链完整：全量重验通过 + 独立验证器一致。
    assert.equal(report.chainValid, true);
    assert.deepEqual(verifyCampaignEventChain(events), { valid: true, firstBrokenIndex: null, reason: null });

    // 终局：全部问题终态（OK/failed），completed+failedTerminal = questionCount。
    assert.equal(report.completed + report.failedTerminal, p.questionCount);
    assert.ok(report.completed >= 1);

    // 内存趋势：真实采样非空、量纲合理（heap 字节 > 0）。
    assert.ok(report.memory.samples.length >= 10, `memory sampler must collect real samples (got ${report.memory.samples.length})`);
    assert.ok(report.memory.minHeapBytes > 0);
    assert.ok(report.memory.maxHeapBytes >= report.memory.minHeapBytes);

    // 人工干预登记：正常 soak 应为零（有干预必须显式登记——宪法红线）。
    assert.deepEqual(report.manualInterventions, []);

    // acceptance 聚合。
    assert.equal(report.allPassed, true, JSON.stringify(report.acceptance));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('determinism: same profile seed drives identical failure schedule across runs (fast mini-profile)', { timeout: 30_000 }, async () => {
  const mini: SoakProfile = {
    ...DEV_SOAK_PROFILE,
    minDurationMs: 0,
    hardCeilingMs: 60_000,
    questionCount: 4,
    executorDelayMs: 60,
    plannedCrashes: 1,
    memorySamplingIntervalMs: 50,
  };
  const a = await runSoakDrill({ profile: mini });
  const b = await runSoakDrill({ profile: mini });
  assert.equal(a.transientFailures, b.transientFailures, 'seeded failure injection is deterministic');
  assert.equal(a.executorAttempts, b.executorAttempts);
  assert.equal(a.crashResumes, b.crashResumes);
  assert.equal(a.completed + a.failedTerminal, mini.questionCount);
  assert.equal(a.chainValid, true);
});

test('unmet duration target must fail acceptance (allPassed honest, not rubber-stamp)', { timeout: 30_000 }, async () => {
  const impossible: SoakProfile = {
    ...DEV_SOAK_PROFILE,
    minDurationMs: 600_000, // 10 分钟目标 vs 毫秒级执行——时长必不达标
    hardCeilingMs: 60_000,
    questionCount: 2,
    executorDelayMs: 30,
    plannedCrashes: 0,
    memorySamplingIntervalMs: 100,
  };
  const r = await runSoakDrill({ profile: impossible });
  assert.equal(r.acceptance.durationMet, false);
  assert.equal(r.allPassed, false, 'acceptance must reflect reality, never rubber-stamp');
});

test('soak report exposes the engineering-budget profile it ran (honesty face)', { timeout: 30_000 }, async () => {
  const mini: SoakProfile = {
    ...DEV_SOAK_PROFILE,
    minDurationMs: 0,
    hardCeilingMs: 60_000,
    questionCount: 2,
    executorDelayMs: 50,
    plannedCrashes: 0,
  };
  const r = await runSoakDrill({ profile: mini });
  assert.equal(r.profile.profileName, mini.profileName);
  assert.deepEqual(r.manualInterventions, []);
  // dev profile 的分钟级声明与跨日目标的边界在模块头 Cannot-prove 钉住；
  // 这里断言 profile 字段完整（时长/负载/故障注入参数显式登记）。
  for (const key of ['minDurationMs', 'hardCeilingMs', 'questionCount', 'executorDelayMs', 'plannedCrashes', 'executorFailureRate', 'seed'] as const) {
    assert.ok(r.profile[key] !== undefined, `profile.${key} must be explicitly registered`);
  }
});
