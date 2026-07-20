#!/usr/bin/env node
/**
 * benchmark_report_check.mjs — Science-125 报告协议机检(IC-10 · DI-09)。
 *
 * 机检规则(协议 v2):
 *   - schemaVersion 须为 2(v1 须先 upgradeReportV1toV2 补字段);
 *   - 顶层披露字段全(REPORT_V2_TOP_REQUIRED);
 *   - 每条 entry 披露字段全(REPORT_V2_ENTRY_REQUIRED);
 *   - bestOfK 须为 false(顶层与每条 entry·防择优披露);
 *   - oracleReviewStatus ∈ {unreviewed,human_reviewed}(伪造复核状态=对账发现)。
 *
 * 用法:node scripts/benchmark_report_check.mjs [reportPath]
 * 退出码:0=机检通过;1=缺字段/协议违反。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkBenchmarkReportV2 } from '../src/benchmark/report_schema.ts';

const reportPath = resolve(process.argv[2] ?? 'benchmark/benchmark_report.json');

if (!existsSync(reportPath)) {
  console.error(`benchmark-report-check: FAIL — report not found: ${reportPath}`);
  process.exit(1);
}

let report: unknown;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`benchmark-report-check: FAIL — JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const result = checkBenchmarkReportV2(report);
if (!result.ok) {
  console.error(`benchmark-report-check: FAIL — ${result.errors.length} 项违规:`);
  for (const e of result.errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}
console.log(`benchmark-report-check: OK — ${reportPath} 披露字段齐(协议 v2)`);
process.exit(0);
