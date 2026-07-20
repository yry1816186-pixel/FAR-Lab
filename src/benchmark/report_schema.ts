/**
 * report_schema.ts — Science-125 benchmark 报告协议 v2(IC-10 · ADR-019 · DI-09)。
 *
 * 披露字段集强制(缺任一=机检红):
 *   taskId / oracleType / oracleReviewStatus / traceHash / costTokens /
 *   kernelVersion+modelVersion / seed / bestOfK(须为 false)/ executedAt。
 *
 * schemaVersion 2:v1 报告可经 upgradeReportV1toV2 补字段
 * (oracleReviewStatus='unreviewed' 诚实标注;costTokens=null 诚实标注 v1 未记录)。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { CURRENT_RULESET_URI } from '../proof_envelope/ruleset_version.ts';
import type { BenchmarkEntry, BenchmarkReport } from './types.ts';

export const BENCHMARK_REPORT_SCHEMA_VERSION = 2 as const;

export type OracleReviewStatus = 'unreviewed' | 'human_reviewed';

/** v2 条目披露字段(v1 字段全保留+9 披露字段) */
export interface BenchmarkEntryV2 extends BenchmarkEntry {
  readonly taskId: string;
  readonly oracleType: string;
  readonly oracleReviewStatus: OracleReviewStatus;
  readonly traceHash: string;
  readonly costTokens: number | null;
  readonly kernelVersion: string;
  readonly modelVersion: string;
  readonly seed: string | number | null;
  readonly bestOfK: boolean;
  readonly executedAt: string;
}

export interface BenchmarkReportV2 extends Omit<BenchmarkReport, 'schemaVersion' | 'entries'> {
  readonly schemaVersion: typeof BENCHMARK_REPORT_SCHEMA_VERSION;
  readonly entries: readonly BenchmarkEntryV2[];
  readonly kernelRulesetUri: string;
  readonly bestOfK: boolean;
  readonly executedAt: string;
}

/** 机检必需顶层字段 */
export const REPORT_V2_TOP_REQUIRED = [
  'schemaVersion',
  'generatedAt',
  'problemCount',
  'entries',
  'suiteIntegrityRoot',
  'totalLeaves',
  'verdictDistribution',
  'domainDistribution',
  'gitCommitSha',
  'honestyNotes',
  'kernelRulesetUri',
  'bestOfK',
  'executedAt',
] as const;

/** 机检必需条目披露字段 */
export const REPORT_V2_ENTRY_REQUIRED = [
  'taskId',
  'oracleType',
  'oracleReviewStatus',
  'traceHash',
  'costTokens',
  'kernelVersion',
  'modelVersion',
  'seed',
  'bestOfK',
  'executedAt',
] as const;

export interface ReportCheckResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v2 协议机检:缺任一披露字段=红;bestOfK 须为 false;schemaVersion 须为 2。
 */
export function checkBenchmarkReportV2(report: unknown): ReportCheckResult {
  const errors: string[] = [];
  if (!isRecord(report)) {
    return { ok: false, errors: ['report is not an object'] };
  }
  if (report.schemaVersion !== BENCHMARK_REPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion=${String(report.schemaVersion)}(期望 ${BENCHMARK_REPORT_SCHEMA_VERSION};v1 须先 upgrade)`);
  }
  for (const field of REPORT_V2_TOP_REQUIRED) {
    if (!(field in report)) {
      errors.push(`missing top-level field: ${field}`);
    }
  }
  if (report.bestOfK !== false) {
    errors.push(`bestOfK must be false(防择优披露),got ${String(report.bestOfK)}`);
  }
  const entries = report.entries;
  if (!Array.isArray(entries)) {
    errors.push('entries is not an array');
  } else {
    entries.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`entries[${index}] is not an object`);
        return;
      }
      for (const field of REPORT_V2_ENTRY_REQUIRED) {
        if (!(field in entry)) {
          errors.push(`entries[${index}] missing disclosure field: ${field}`);
        }
      }
      if (entry.bestOfK !== false) {
        errors.push(`entries[${index}].bestOfK must be false,got ${String(entry.bestOfK)}`);
      }
      if (entry.oracleReviewStatus !== 'unreviewed' && entry.oracleReviewStatus !== 'human_reviewed') {
        errors.push(`entries[${index}].oracleReviewStatus 非法: ${String(entry.oracleReviewStatus)}`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * v1 → v2 升级(诚实补字段):
 *   oracleReviewStatus='unreviewed'(无复核记录);costTokens=null(v1 未记录,如实);
 *   seed='deterministic-fixture';modelVersion='offline_replay(fixture)';executedAt=generatedAt。
 */
export function upgradeReportV1toV2(report: BenchmarkReport): BenchmarkReportV2 {
  const entries: BenchmarkEntryV2[] = report.entries.map((entry) => ({
    ...entry,
    taskId: entry.problemId,
    oracleType: 'deterministic_kernel(R0-R9)',
    oracleReviewStatus: 'unreviewed',
    traceHash: entry.integrityRoot,
    costTokens: null,
    kernelVersion: CURRENT_RULESET_URI,
    modelVersion: 'offline_replay(fixture)',
    seed: 'deterministic-fixture',
    bestOfK: false,
    executedAt: report.generatedAt,
  }));
  return {
    ...report,
    entries,
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    kernelRulesetUri: CURRENT_RULESET_URI,
    bestOfK: false,
    executedAt: report.generatedAt,
  };
}
