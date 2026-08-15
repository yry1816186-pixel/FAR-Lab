/**
 * rerun_consistency.test.ts — 可复现面 P2：R0-R9 重跑 10 次全一致。
 *
 * 依据 12 面「可复现」100 分定义：同 commit 重跑 verdict 全一致 + suiteIntegrityRoot
 * 一致。既有 5/5 重跑测试（W18 SA18）升级为 10 次——固定 now + gitCommitSha 下，
 * runBenchmark 10 次产出的 suiteIntegrityRoot 与全部 verdict 必须逐字节一致。
 *
 * 诚实边界：offline_replay adapter（无 LLM live）；确定性由固定 now + 固定 seeds
 * + 确定性内核保证。10 次跑验证无非确定性源（随机值/时间戳/路径注入）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBenchmark } from '../../src/benchmark/index.ts';
import { BENCHMARK_SEEDS } from '../../src/demo_seeds/registry.ts';

const FIXED_NOW = '2026-08-10T00:00:00.000Z';

test('可复现 P2: runBenchmark 10 次 suiteIntegrityRoot + 全部 verdict 逐字节一致', async () => {
  assert.ok(BENCHMARK_SEEDS.length >= 3, '至少 3 个 benchmark seeds');
  const roots = new Set<string>();
  const verdictFingerprints = new Set<string>();
  for (let i = 0; i < 10; i += 1) {
    const report = await runBenchmark(BENCHMARK_SEEDS, {
      now: () => FIXED_NOW,
      gitCommitSha: '0000000000000000000000000000000000000000',
    });
    roots.add(report.suiteIntegrityRoot);
    // verdict 指纹：全部 entry 的 verdict + integrityRoot + leafCount 序列化
    const fingerprint = JSON.stringify(
      report.entries.map((e: { verdict: string; integrityRoot: string; leafCount: number }) => ({
        verdict: e.verdict,
        integrityRoot: e.integrityRoot,
        leafCount: e.leafCount,
      })),
    );
    verdictFingerprints.add(fingerprint);
  }
  assert.equal(roots.size, 1, `10 次 suiteIntegrityRoot 必须全一致，实际 ${roots.size} 个不同`);
  assert.equal(verdictFingerprints.size, 1, '10 次 verdict 指纹必须全一致（无随机性）');
});
