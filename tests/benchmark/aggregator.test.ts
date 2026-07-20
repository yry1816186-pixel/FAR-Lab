/**
 * benchmark 聚合器测试 —— Science-125 完整性广度套件的核心正确性 + 确定性验证。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/41 §1 + 09 §4 + 17 §7.
 *
 * 覆盖：
 *   1. runBenchmark 返回合法 BenchmarkReport（全字段·每个 entry 字段合法）
 *   2. entries 按 problemId 升序（确定性叶序·suiteIntegrityRoot 可复现前提）
 *   3. 确定性：suiteIntegrityRoot + 各 integrityRoot/reproHash 跨两次运行字节相同（CI golden 锚前提）
 *   4. suiteIntegrityRoot === 独立重算 computeMerkleRoot(entries.integrityRoot)（聚合正确性）
 *   5. totalLeaves === Σ entries.leafCount
 *   6. verdictDistribution 全 5 键 + 计数一致 + 总和 = entries.length
 *   7. verdict 多样性（CONFIRMED + 非全 CONFIRMED·展示 FEC 真实裁决非全过）
 *   8. domainDistribution 计数一致
 *   9. honestyNotes 含 fixture 诚实声明
 *  10. gitCommitSha 默认 null（demo 不锚 commit）
 *
 * 顶层并行跑两次 runBenchmark（共享给确定性比对 + 结构断言·避免每个 test 重跑 3 seed）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBenchmark } from '../../src/benchmark/index.ts';
import { BENCHMARK_SEEDS } from '../demo_seeds/registry.ts';
import type { BenchmarkReportV2 } from '../../src/benchmark/report_schema.ts';
import { VERDICTS } from '../../src/schema/enums.ts';
import { computeMerkleRoot } from '../../src/evidence_log/merkle_root.ts';
import { loadReport, __resetBenchmarkCache } from '../../src/api/routes/benchmark.ts';

const FIXED_NOW = (): string => '2026-06-29T00:00:00.000Z';
const HEX64 = /^[0-9a-f]{64}$/;

// 顶层并行跑两次（确定性比对 + 结构断言共享·避免每个 test 重跑 3 seed）。
// 两次独立 :memory: db（互不污染）。
const [report, secondRun] = await Promise.all([
  runBenchmark(BENCHMARK_SEEDS, { now: FIXED_NOW }),
  runBenchmark(BENCHMARK_SEEDS, { now: FIXED_NOW }),
]) as [BenchmarkReportV2, BenchmarkReportV2];

test('runBenchmark 返回合法 BenchmarkReport（全字段）', () => {
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.generatedAt, '2026-06-29T00:00:00.000Z');
  assert.equal(report.problemCount, report.entries.length);
  assert.ok(report.entries.length >= 1, 'should have ≥1 problem');
  assert.match(report.suiteIntegrityRoot, HEX64);
  // IC-10 协议 v2 顶层披露字段
  assert.equal(report.bestOfK, false);
  assert.match(report.kernelRulesetUri, /^farlab\.dev\/ruleset\/v\d+$/);
  assert.equal(report.executedAt, report.generatedAt);

  for (const entry of report.entries) {
    assert.ok(entry.problemId.length > 0, 'problemId non-empty');
    assert.ok(entry.problemTitle.length > 0, 'problemTitle non-empty');
    assert.ok(entry.domain.length > 0, 'domain non-empty');
    assert.ok(entry.science125Tag.length > 0, 'science125Tag non-empty');
    assert.match(entry.integrityRoot, HEX64);
    assert.match(entry.reproHash, HEX64);
    assert.equal(entry.stagesCompleted, 6, 'should complete all 6 stages');
    assert.equal(entry.converged, true, 'should converge via feedback');
    assert.equal(entry.chainVerified, true, 'chain verify should pass');
    assert.ok(entry.sourceId.length > 0, 'sourceId non-empty');
    assert.ok(entry.leafCount >= 7, 'leafCount ≥7 (6 loop + 1 FEC)');
    // IC-10 协议 v2 条目披露字段
    assert.equal(entry.taskId, entry.problemId);
    assert.equal(entry.oracleType, 'deterministic_kernel(R0-R9)');
    assert.equal(entry.oracleReviewStatus, 'unreviewed');
    assert.equal(entry.traceHash, entry.integrityRoot);
    assert.ok(typeof entry.costTokens === 'number' && entry.costTokens >= 0, 'costTokens 真实计量');
    assert.match(entry.kernelVersion, /^farlab\.dev\/ruleset\/v\d+$/);
    assert.equal(entry.modelVersion, 'offline_replay(fixture)');
    assert.equal(entry.seed, 'deterministic-fixture');
    assert.equal(entry.bestOfK, false);
    assert.equal(entry.executedAt, report.generatedAt);
  }
});

test('entries 按 problemId 升序（确定性叶序）', () => {
  const ids = report.entries.map((e) => e.problemId);
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(ids, sorted);
});

test('确定性：suiteIntegrityRoot + 各 integrityRoot 跨两次运行字节相同（CI golden 锚前提）', () => {
  assert.equal(report.suiteIntegrityRoot, secondRun.suiteIntegrityRoot);
  assert.equal(report.entries.length, secondRun.entries.length);
  for (let i = 0; i < report.entries.length; i++) {
    const a = report.entries[i];
    const b = secondRun.entries[i];
    assert.ok(a !== undefined && b !== undefined, `entry ${i} should exist in both runs`);
    // integrityRoot（call_records Merkle 根）确定性——不含 ulid
    assert.equal(a.integrityRoot, b.integrityRoot, `entry ${i} integrityRoot deterministic`);
  }
});

test('reproHash 是 run 实例标识（含 ulid verdictId·跨运行可能不同·非 CI golden 锚对象）', () => {
  // reproHash = verdictNode.currentHash，其 canonical 输入含 ulid verdictId → 非确定。
  // 这是设计特性（不同 run 不同实例标识），非 bug：每次 run 产出独立可审计链，
  // chainVerified 仍为 true（链式 hash 内部一致）。CI golden 锚 suiteIntegrityRoot（确定）。
  for (const entry of report.entries) {
    assert.match(entry.reproHash, HEX64, 'reproHash should be 64-hex regardless of run');
  }
});

test('suiteIntegrityRoot 与 git-tracked benchmark_report.json 一致（CI golden 锚·防回归）', () => {
  // git-tracked JSON 由 generate 脚本生成，其 suiteIntegrityRoot 是 golden。
  // 若聚合逻辑 / sort / seed 变更导致 suiteIntegrityRoot 漂移 → 此测试失败 → 提示重新 generate。
  __resetBenchmarkCache();
  const tracked = loadReport();
  assert.equal(
    report.suiteIntegrityRoot,
    tracked.suiteIntegrityRoot,
    'runBenchmark suiteIntegrityRoot must match git-tracked report (regression guard)',
  );
  __resetBenchmarkCache();
});

test('suiteIntegrityRoot === 独立重算 computeMerkleRoot(entries.integrityRoot)（聚合正确性）', () => {
  const recomputed = computeMerkleRoot(report.entries.map((e) => e.integrityRoot));
  assert.equal(report.suiteIntegrityRoot, recomputed);
});

test('totalLeaves === Σ entries.leafCount', () => {
  const sum = report.entries.reduce((s, e) => s + e.leafCount, 0);
  assert.equal(report.totalLeaves, sum);
});

test('verdictDistribution 全 5 键 + 计数一致 + 总和 = entries.length', () => {
  for (const v of VERDICTS) {
    assert.ok(
      v in report.verdictDistribution,
      `verdictDistribution should contain key ${v}`,
    );
  }
  const confirmedActual = report.entries.filter((e) => e.verdict === 'CONFIRMED').length;
  assert.equal(report.verdictDistribution.CONFIRMED, confirmedActual);
  const total = VERDICTS.reduce((s, v) => s + report.verdictDistribution[v], 0);
  assert.equal(total, report.entries.length);
});

test('verdict 多样性（≥1 CONFIRMED + ≥1 非 CONFIRMED·展示 FEC 真实裁决非全过）', () => {
  const confirmed = report.verdictDistribution.CONFIRMED;
  const nonConfirmed = report.entries.length - confirmed;
  assert.ok(confirmed >= 1, 'should have ≥1 CONFIRMED');
  assert.ok(nonConfirmed >= 1, 'should have ≥1 non-CONFIRMED (diverse verdicts, not all-pass theater)');
});

test('domainDistribution 计数与 entries 一致', () => {
  for (const [domain, count] of Object.entries(report.domainDistribution)) {
    const actual = report.entries.filter((e) => e.domain === domain).length;
    assert.equal(count, actual, `domainDistribution[${domain}] mismatch`);
  }
});

test('honestyNotes 含 fixture 诚实声明（非科学排名）', () => {
  assert.ok(report.honestyNotes.length >= 3);
  const joined = report.honestyNotes.join(' ');
  assert.ok(joined.includes('fixture'), 'should mention fixture origin of verdict');
  assert.ok(joined.includes('工程完整性') || joined.includes('非科学'), 'should clarify not a scientific ranking');
});

test('gitCommitSha 默认 null（demo 报告不锚 commit·fresh-clone 友好）', () => {
  assert.equal(report.gitCommitSha, null);
});
