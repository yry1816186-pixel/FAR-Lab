/**
 * report_schema.ts — Science-125 benchmark 报告协议 v2(IC-10 · ADR-019 · DI-09)。
 *
 * 披露字段集强制(缺任一=机检红):
 *   taskId / oracleType / oracleReviewStatus / traceHash / costTokens /
 *   kernelVersion+modelVersion / seed / bestOfK(须为 false)/ executedAt /
 *   latencyMs(D2 观测指标·不进 hash)。
 *
 * schemaVersion 2:v1 报告可经 upgradeReportV1toV2 补字段
 * (oracleReviewStatus='unreviewed' 诚实标注;costTokens=null 诚实标注 v1 未记录;
 *  latencyMs=null / latencyStats=null 诚实标注 v1 未采集性能基线)。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { CURRENT_RULESET_URI } from '../proof_envelope/ruleset_version.ts';
import type { BenchmarkEntry, BenchmarkReport, LatencyStats } from './types.ts';

/** Constant: BENCHMARK_REPORT_SCHEMA_VERSION. */
export const BENCHMARK_REPORT_SCHEMA_VERSION = 2 as const;

/** Type alias: oracle review status. */
export type OracleReviewStatus = 'unreviewed' | 'human_reviewed';

/** v2 条目披露字段(v1 字段全保留+10 披露字段,含 D2 latencyMs) */
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
  /** D2 性能基线:单 seed 裁决路径 wall-clock ms(观测指标·不进任何 hash)·v1 upgrade 为 null。 */
  readonly latencyMs: number | null;
  /** DEF-16 对账:human_reviewed 须锚定真实复核记录(64-hex 引用);unreviewed 须为 null/缺省。防伪造复核状态零成本过机检。 */
  readonly reviewRecordRef?: string | null;
}

/** Interface defining benchmark report v2. */
export interface BenchmarkReportV2 extends Omit<BenchmarkReport, 'schemaVersion' | 'entries'> {
  readonly schemaVersion: typeof BENCHMARK_REPORT_SCHEMA_VERSION;
  readonly entries: readonly BenchmarkEntryV2[];
  readonly kernelRulesetUri: string;
  readonly bestOfK: boolean;
  readonly executedAt: string;
  /** D2 规模事实:科学域数量(= Object.keys(domainDistribution).length)。 */
  readonly domainCount: number;
  /** D2 性能基线:latency 聚合 p50/p95/max(ms·观测指标·不进 hash)·v1 upgrade 为 null。 */
  readonly latencyStats: LatencyStats | null;
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
  'domainCount',
  'latencyStats',
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
  'latencyMs',
] as const;

/** Result/output structure for report check result. */
export interface ReportCheckResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v2 协议机检:缺任一披露字段=红;bestOfK 须为 false;schemaVersion 须为 2。
 * V-08-F3 修复:补内容校验(对抗"字段存在但内容空洞"合规绕过):
 *   关键字符串非空;traceHash/suiteIntegrityRoot 须为 64-hex;problemCount 与 entries.length 一致。
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
  // V-08-F3:顶层关键字段内容校验
  const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  for (const field of ['generatedAt', 'kernelRulesetUri', 'executedAt', 'suiteIntegrityRoot'] as const) {
    if (field in report && !nonempty(report[field])) {
      errors.push(`top-level field ${field} 内容为空(空洞合规阻断)`);
    }
  }
  if (nonempty(report.suiteIntegrityRoot) && !/^[0-9a-f]{64}$/.test(report.suiteIntegrityRoot)) {
    errors.push(`suiteIntegrityRoot 非 64-hex: ${report.suiteIntegrityRoot.slice(0, 16)}…`);
  }
  // D2 规模事实对账:domainCount 须与 domainDistribution 键数一致(防空洞合规)。
  if (isRecord(report.domainDistribution) && typeof report.domainCount === 'number') {
    if (report.domainCount !== Object.keys(report.domainDistribution).length) {
      errors.push(`domainCount=${report.domainCount} 与 domainDistribution 键数=${Object.keys(report.domainDistribution).length} 不一致`);
    }
  }
  // D2 性能基线对账:latencyStats 若非 null,须含合法 p50/p95/max(ms·观测指标不进 hash)。
  if (report.latencyStats !== null && report.latencyStats !== undefined) {
    if (!isRecord(report.latencyStats)) {
      errors.push('latencyStats 须为对象或 null(诚实标注未采集)');
    } else {
      const ls = report.latencyStats;
      for (const field of ['p50', 'p95', 'max'] as const) {
        if (typeof ls[field] !== 'number' || !Number.isFinite(ls[field]) || (ls[field] as number) < 0) {
          errors.push(`latencyStats.${field} 非法(须为有限非负数字): ${String(ls[field])}`);
        }
      }
      if (ls.unit !== 'ms') {
        errors.push(`latencyStats.unit 非法(须为 'ms'): ${String(ls.unit)}`);
      }
    }
  }
  const entries = report.entries;
  if (!Array.isArray(entries)) {
    errors.push('entries is not an array');
  } else {
    if (typeof report.problemCount === 'number' && report.problemCount !== entries.length) {
      errors.push(`problemCount=${report.problemCount} 与 entries.length=${entries.length} 不一致`);
    }
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
      // DEF-16 对账:human_reviewed 须锚定真实复核记录(64-hex reviewRecordRef);unreviewed 不得携带(防伪造/不一致)
      if (entry.oracleReviewStatus === 'human_reviewed') {
        const ref = entry.reviewRecordRef;
        if (typeof ref !== 'string' || !/^[0-9a-f]{64}$/.test(ref)) {
          errors.push(`entries[${index}].oracleReviewStatus='human_reviewed' 须有 reviewRecordRef(64-hex 复核记录引用·DEF-16 对账),got ${ref === undefined ? '(missing)' : String(ref).slice(0, 16)}`);
        }
      } else if (entry.oracleReviewStatus === 'unreviewed') {
        const ref = entry.reviewRecordRef;
        if (ref !== undefined && ref !== null) {
          errors.push(`entries[${index}].oracleReviewStatus='unreviewed' 不得携带 reviewRecordRef(一致性·DEF-16)`);
        }
      }
      // V-08-F3:条目关键字段内容校验
      for (const field of ['taskId', 'oracleType', 'kernelVersion', 'modelVersion', 'executedAt'] as const) {
        if (field in entry && !nonempty(entry[field])) {
          errors.push(`entries[${index}].${field} 内容为空(空洞合规阻断)`);
        }
      }
      if ('traceHash' in entry && !(typeof entry.traceHash === 'string' && /^[0-9a-f]{64}$/.test(entry.traceHash))) {
        errors.push(`entries[${index}].traceHash 非 64-hex`);
      }
      // D2 性能基线:latencyMs 若非 null,须为有限非负数字(观测指标·不进 hash)。
      if ('latencyMs' in entry && entry.latencyMs !== null && entry.latencyMs !== undefined) {
        if (typeof entry.latencyMs !== 'number' || !Number.isFinite(entry.latencyMs) || entry.latencyMs < 0) {
          errors.push(`entries[${index}].latencyMs 非法(须为有限非负数字或 null): ${String(entry.latencyMs)}`);
        }
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
    reviewRecordRef: null,
    traceHash: entry.integrityRoot,
    costTokens: null,
    kernelVersion: CURRENT_RULESET_URI,
    modelVersion: 'offline_replay(fixture)',
    seed: 'deterministic-fixture',
    bestOfK: false,
    executedAt: report.generatedAt,
    latencyMs: null,
  }));
  const domainCount = Object.keys(report.domainDistribution ?? {}).length;
  return {
    ...report,
    entries,
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    kernelRulesetUri: CURRENT_RULESET_URI,
    bestOfK: false,
    executedAt: report.generatedAt,
    domainCount,
    latencyStats: null,
  };
}
