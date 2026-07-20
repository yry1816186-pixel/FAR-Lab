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

const REPORT_PATH = join(process.cwd(), 'benchmark', 'benchmark_report.json');

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
  const v1 = { ...v2, schemaVersion: 1 } as unknown as BenchmarkReport;
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
});
