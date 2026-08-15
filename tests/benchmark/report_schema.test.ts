/**
 * report_schema.test.ts — IC-10 报告协议机检验收。
 *
 * 验收 Oracle(合同 contract-010):
 *   ① 现有 8/125 报告补全字段后过机检(v2 实跑);
 *   ② 缺字段版本 → 机检红;
 *   ③ bestOfK 字段存在且为 false(bestOfK=true → 红);
 *   反事实:v1 报告升级补字段(oracleReviewStatus='unreviewed' 诚实标注)。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkBenchmarkReportV2,
  upgradeReportV1toV2,
  REPORT_V2_ENTRY_REQUIRED,
} from '../../src/benchmark/report_schema.ts';
import type { BenchmarkReport } from '../../src/benchmark/types.ts';
import { ensureBenchmarkReport, REPORT_PATH } from '../_helpers/benchmark_report.ts';

// 仓库内容政策：报告为确定性生成物、不 git 跟踪——先确保生成（已存在则零开销）。
ensureBenchmarkReport();
void join;

test('① 现有报告(v2)过机检', () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as unknown;
  const result = checkBenchmarkReportV2(report);
  assert.equal(result.ok, true, `errors: ${result.errors.join('; ')}`);
  const entries = (report as { entries: Array<Record<string, unknown>> }).entries;
  assert.ok(entries.length >= 1);
  for (const entry of entries) {
    for (const field of REPORT_V2_ENTRY_REQUIRED) {
      assert.ok(field in entry, `entry 缺 ${field}`);
    }
  }
});

test('② 缺字段版本 → 机检红', () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as { entries: Array<Record<string, unknown>> };
  const broken = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  delete broken.entries[0]?.traceHash;
  const result = checkBenchmarkReportV2(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('traceHash')), `errors: ${result.errors.join('; ')}`);
});

test('③ bestOfK=true → 机检红(防择优);schemaVersion=1 → 红(须升级)', () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Record<string, unknown> & { entries: Array<Record<string, unknown>> };
  const bad = { ...report, bestOfK: true };
  assert.equal(checkBenchmarkReportV2(bad).ok, false);
  const v1 = { ...report, schemaVersion: 1 };
  const v1Result = checkBenchmarkReportV2(v1);
  assert.equal(v1Result.ok, false);
  assert.ok(v1Result.errors.some((e) => e.includes('schemaVersion')));
});

test('v1 → v2 升级:补字段且 oracleReviewStatus=unreviewed 诚实标注', () => {
  const v2 = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Record<string, unknown>;
  const v1 = JSON.parse(JSON.stringify({ ...v2, schemaVersion: 1 })) as BenchmarkReport;
  const upgraded = upgradeReportV1toV2(v1);
  assert.equal(upgraded.schemaVersion, 2);
  for (const entry of upgraded.entries) {
    assert.equal(entry.oracleReviewStatus, 'unreviewed');
    assert.equal(entry.bestOfK, false);
    assert.equal(entry.taskId, entry.problemId);
    assert.equal(entry.traceHash, entry.integrityRoot);
  }
  const result = checkBenchmarkReportV2(upgraded);
  assert.equal(result.ok, true, `errors: ${result.errors.join('; ')}`);
  // D2 诚实标注:v1 未采集性能基线 → latencyMs/latencyStats 均为 null
  for (const entry of upgraded.entries) {
    assert.equal(entry.latencyMs, null, 'v1 upgrade 的 latencyMs 须为 null(诚实标注未采集)');
  }
  assert.equal(upgraded.latencyStats, null, 'v1 upgrade 的 latencyStats 须为 null(诚实标注未采集)');
  assert.equal(upgraded.domainCount, Object.keys(upgraded.domainDistribution).length, 'v1 upgrade 的 domainCount 须由 domainDistribution 计算');
});

test('D2 机检:缺 latencyMs / latencyStats / domainCount → 红;非法 latency → 红', () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Record<string, unknown> & { entries: Array<Record<string, unknown>> };
  // 1. 删 entry.latencyMs → 红
  const noEntryLatency = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  delete noEntryLatency.entries[0]!.latencyMs;
  assert.equal(checkBenchmarkReportV2(noEntryLatency).ok, false, '缺 entry.latencyMs 须红');
  // 2. 删顶层 latencyStats → 红
  const noStats = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  delete noStats.latencyStats;
  assert.equal(checkBenchmarkReportV2(noStats).ok, false, '缺顶层 latencyStats 须红');
  // 3. 删顶层 domainCount → 红
  const noDomainCount = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  delete noDomainCount.domainCount;
  assert.equal(checkBenchmarkReportV2(noDomainCount).ok, false, '缺顶层 domainCount 须红');
  // 4. domainCount 与 domainDistribution 键数不一致 → 红
  const badCount = JSON.parse(JSON.stringify(report)) as Record<string, unknown> & { domainCount: number };
  badCount.domainCount = (badCount.domainCount ?? 0) + 1;
  assert.equal(checkBenchmarkReportV2(badCount).ok, false, 'domainCount 不一致须红');
  // 5. latencyStats.unit 非法 → 红
  const badUnit = JSON.parse(JSON.stringify(report)) as Record<string, unknown> & { latencyStats: Record<string, unknown> };
  badUnit.latencyStats = { ...badUnit.latencyStats, unit: 's' };
  assert.equal(checkBenchmarkReportV2(badUnit).ok, false, 'latencyStats.unit != ms 须红');
  // 6. entry.latencyMs 为负数 → 红
  const negative = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  negative.entries[0]!.latencyMs = -1;
  assert.equal(checkBenchmarkReportV2(negative).ok, false, 'latencyMs 为负须红');
  // 7. 正例:现有报告(含全部新字段)过机检
  assert.equal(checkBenchmarkReportV2(report).ok, true, '现有报告含新字段须过机检');
});

test('DEF-16 对账:伪造 human_reviewed 无 reviewRecordRef → 机检红(防零成本伪造复核状态)', () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Record<string, unknown> & { entries: Array<Record<string, unknown>> };
  // 1. human_reviewed 但无 reviewRecordRef → 须红(伪造阻断)
  const forged = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  forged.entries[0]!.oracleReviewStatus = 'human_reviewed';
  delete forged.entries[0]!.reviewRecordRef;
  const forgedResult = checkBenchmarkReportV2(forged);
  assert.equal(forgedResult.ok, false, 'human_reviewed 无 reviewRecordRef 须被对账拦截');
  assert.ok(forgedResult.errors.some((e) => e.includes('DEF-16') && e.includes('reviewRecordRef')), `errors: ${forgedResult.errors.join('; ')}`);

  // 2. human_reviewed + 无效(非 64-hex)reviewRecordRef → 须红
  const invalidRef = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  invalidRef.entries[0]!.oracleReviewStatus = 'human_reviewed';
  invalidRef.entries[0]!.reviewRecordRef = 'not-a-hash';
  assert.equal(checkBenchmarkReportV2(invalidRef).ok, false, '非 64-hex reviewRecordRef 须被拦');

  // 3. human_reviewed + 合法 64-hex reviewRecordRef → 须过(真实复核主张放行)
  const valid = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  valid.entries[0]!.oracleReviewStatus = 'human_reviewed';
  valid.entries[0]!.reviewRecordRef = 'a'.repeat(64);
  const validResult = checkBenchmarkReportV2(valid);
  assert.equal(validResult.ok, true, `合法 human_reviewed+reviewRecordRef 须过: ${validResult.errors.join('; ')}`);

  // 4. unreviewed + 携带 reviewRecordRef → 须红(不一致)
  const inconsistent = JSON.parse(JSON.stringify(report)) as { entries: Array<Record<string, unknown>> };
  inconsistent.entries[0]!.oracleReviewStatus = 'unreviewed';
  inconsistent.entries[0]!.reviewRecordRef = 'b'.repeat(64);
  assert.equal(checkBenchmarkReportV2(inconsistent).ok, false, 'unreviewed 携带 reviewRecordRef 须被拦(一致性)');
});
