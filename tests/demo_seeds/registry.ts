/**
 * demo seed registry —— benchmark 聚合器的 seed 元数据 + run 函数清单。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1（Science125 种子）+ 17 §7.
 *
 * 职责：把各 demo seed 的 run 函数与展示元数据（problemId / title / domain / tag）绑定，
 * 供 src/benchmark/aggregator.ts 的 runBenchmark 串行消费。
 *
 * 分层：本文件在 tests/，可 import src/benchmark（tests 依赖 src·方向正确）。
 * DemoSeedResult 结构兼容聚合器的 BenchmarkSeedInput 契约（结构超集·TS 结构类型允许）。
 *
 * 覆盖广度（6 seed · 5 领域 · 全部 5 种 verdict）：
 *   - A4  天文学  · 行星轨道衰减          → INCONCLUSIVE
 *   - A16 天文学  · 脉冲星制动指数        → CONFIRMED
 *   - B7  生物    · 蛋白质折叠            → REFUTED
 *   - C3  化学    · 催化剂活性            → DEGRADED_SCOPE
 *   - E2  生态气候· 碳通量                → CONFIRMED
 *   - G5  地学    · 地震前兆              → UNTESTED
 *
 * 诚实定位：领域/问题数是「工程完整性广度」的展示；verdict 由 offline fixture 产出（非真实裁决），
 * 但 verdict 多样性本身即证据——非「全 CONFIRMED」的剧场，而是 supports / refutes / inconclusive /
 * degraded-scope / untested 的真实混合。
 */

import { runA4Seed } from './a4_planetary_orbit_decay.ts';
import { runA16Seed } from './a16_pulsar_p0.ts';
import { runB7Seed } from './b7_protein_folding.ts';
import { runC3Seed } from './c3_catalyst_activity.ts';
import { runE2Seed } from './e2_carbon_flux.ts';
import { runG5Seed } from './g5_seismic_precursor.ts';
import type { SeedRunner } from '../../src/benchmark/index.ts';

/**
 * benchmark seed 清单（按 problemId 升序·与聚合器 sort 一致）。
 *
 * 新增 seed 时在此追加（保持 problemId 升序·确定性叶序）。
 */
export const BENCHMARK_SEEDS: readonly SeedRunner[] = [
  {
    problemId: 'A4',
    problemTitle: '行星轨道衰减（热木星 dP/dt）',
    domain: '天文学',
    science125Tag: 'hot-jupiter-orbital-decay',
    run: runA4Seed,
  },
  {
    problemId: 'A16',
    problemTitle: '脉冲星制动指数（P0/P1）',
    domain: '天文学',
    science125Tag: 'pulsar-braking-index',
    run: runA16Seed,
  },
  {
    problemId: 'B7',
    problemTitle: '蛋白质折叠（CASP15 FM 靶标）',
    domain: '生物',
    science125Tag: 'protein-folding-hard-targets',
    run: runB7Seed,
  },
  {
    problemId: 'C3',
    problemTitle: '催化剂活性（DFT+ML TON 预测）',
    domain: '化学',
    science125Tag: 'catalyst-ton-prediction',
    run: runC3Seed,
  },
  {
    problemId: 'E2',
    problemTitle: '生态系统碳通量（FLUXNET）',
    domain: '生态气候',
    science125Tag: 'ecosystem-carbon-flux',
    run: runE2Seed,
  },
  {
    problemId: 'G5',
    problemTitle: '地震前兆（ULF/VLF 电磁异常）',
    domain: '地学',
    science125Tag: 'seismic-em-precursor',
    run: runG5Seed,
  },
];
