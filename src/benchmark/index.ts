/**
 * benchmark 模块 barrel —— Science-125 完整性广度套件聚合。
 *
 * 导出：
 *   - 类型：BenchmarkEntry / BenchmarkReport / VerdictDistribution / DomainDistribution
 *   - 聚合器：runBenchmark(seeds, opts) + SeedRunner / BenchmarkSeedInput 契约
 *
 * 诚实定位：展示工程完整性广度，非科学结论排名（见 types.ts 顶部声明）。
 */

export type {
  BenchmarkEntry,
  BenchmarkReport,
  VerdictDistribution,
  DomainDistribution,
  LatencyStats,
} from './types.ts';

export {
  runBenchmark,
  type SeedRunner,
  type BenchmarkSeedInput,
} from './aggregator.ts';

export {
  BENCHMARK_REPORT_SCHEMA_VERSION,
  REPORT_V2_TOP_REQUIRED,
  REPORT_V2_ENTRY_REQUIRED,
  checkBenchmarkReportV2,
  upgradeReportV1toV2,
  type BenchmarkEntryV2,
  type BenchmarkReportV2,
  type OracleReviewStatus,
  type ReportCheckResult,
} from './report_schema.ts';
