/**
 * benchmark 模块 barrel —— Science-125 完整性广度套件聚合。
 *
 * Authority: 41 §1 + 09 §4 + 17 §7.
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
} from './types.ts';

export {
  runBenchmark,
  type SeedRunner,
  type BenchmarkSeedInput,
} from './aggregator.ts';
