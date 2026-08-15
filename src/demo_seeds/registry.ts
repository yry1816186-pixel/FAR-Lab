/**
 * demo seed registry —— benchmark 聚合器的 seed 元数据 + run 函数清单。
 *
 *
 * 职责：把各 demo seed 的 run 函数与展示元数据（problemId / title / domain / tag）绑定，
 * 供 src/benchmark/aggregator.ts 的 runBenchmark 串行消费。
 *
 * 分层：本文件在 tests/，可 import src/benchmark（tests 依赖 src·方向正确）。
 * DemoSeedResult 结构兼容聚合器的 BenchmarkSeedInput 契约（结构超集·TS 结构类型允许）。
 *
 * 覆盖广度（30 seed · 28 领域 · 全部 5 种 verdict）：
 *   - A4  天文学    · 行星轨道衰减          → INCONCLUSIVE
 *   - A8  理论物理  · 黑洞信息悖论          → CONFIRMED
 *   - A16 天文学    · 脉冲星制动指数        → CONFIRMED
 *   - B3  基因组学  · CRISPR 脱靶效应       → INCONCLUSIVE
 *   - B7  生物      · 蛋白质折叠            → REFUTED
 *   - C3  化学      · 催化剂活性            → DEGRADED_SCOPE
 *   - C8  能源化学  · 人造光合作用          → DEGRADED_SCOPE
 *   - D9  宇宙学    · 暗物质直接探测        → INCONCLUSIVE
 *   - E2  生态气候  · 碳通量                → CONFIRMED
 *   - E5  气候科学  · 平衡气候敏感度 ECS    → REFUTED
 *   - G5  地学      · 地震前兆              → UNTESTED
 *   - H1  生命起源  · RNA 世界自复制        → INCONCLUSIVE
 *   - P1  物理      · 室温超导（LK-99）      → REFUTED
 *   - M2  医学      · 心衰住院（SGLT2 CVOT） → CONFIRMED
 *   - M7  神经退行  · 阿尔茨海默 Aβ 假说    → DEGRADED_SCOPE
 *   - N3  神经科学  · 神经退行蛋白聚集      → DEGRADED_SCOPE
 *
 * 诚实定位：领域/问题数是「工程完整性广度」的展示；verdict 由 offline fixture 产出（非真实裁决），
 * 但 verdict 多样性本身即证据——非「全 CONFIRMED」的剧场，而是 supports / refutes / inconclusive /
 * degraded-scope / untested 的真实混合。
 */

import { runA2Seed } from './a2_dark_energy.ts';
import { runA4Seed } from './a4_planetary_orbit_decay.ts';
import { runA8Seed } from './a8_black_hole_information.ts';
import { runA11Seed } from './a11_smbh_merger.ts';
import { runA16Seed } from './a16_pulsar_p0.ts';
import { runB2Seed } from './b2_ipsc_reprogramming.ts';
import { runB3Seed } from './b3_crispr_offtarget.ts';
import { runB5Seed } from './b5_microbiome_depression.ts';
import { runB7Seed } from './b7_protein_folding.ts';
import { runC2Seed } from './c2_co2_reduction.ts';
import { runC3Seed } from './c3_catalyst_activity.ts';
import { runC8Seed } from './c8_artificial_photosynthesis.ts';
import { runC10Seed } from './c10_nisq_quantum_advantage.ts';
import { runD9Seed } from './d9_dark_matter_detection.ts';
import { runE2Seed } from './e2_carbon_flux.ts';
import { runE3Seed } from './e3_global_carbon_sink.ts';
import { runE5Seed } from './e5_climate_sensitivity.ts';
import { runE8Seed } from './e8_ocean_acidification_coral.ts';
import { runG2Seed } from './g2_universal_flu_vaccine.ts';
import { runG5Seed } from './g5_seismic_precursor.ts';
import { runH1Seed } from './h1_rna_world.ts';
import { runH3Seed } from './h3_homochirality.ts';
import { runM2Seed } from './m2_sglt2_heart_failure.ts';
import { runM3Seed } from './m3_telomere_aging.ts';
import { runM7Seed } from './m7_alzheimer_amyloid.ts';
import { runN3Seed } from './n3_neurodegeneration_aggregation.ts';
import { runP1Seed } from './p1_room_temp_superconductor.ts';
import { runP3Seed } from './p3_arrow_of_time.ts';
import { runP6Seed } from './p6_quantum_biology.ts';
import { runT1Seed } from './t1_consciousness_ncc.ts';
import type { SeedRunner } from '../../src/benchmark/index.ts';

/**
 * benchmark seed 清单（按 problemId 升序·与聚合器 sort 一致）。
 *
 * 新增 seed 时在此追加（保持 problemId 升序·确定性叶序）。
 */
export const BENCHMARK_SEEDS: readonly SeedRunner[] = [
  {
    problemId: 'A2',
    problemTitle: '宇宙加速膨胀的本质（暗能量状态方程 w）',
    domain: '宇宙学',
    science125Tag: 'dark-energy-equation-of-state',
    run: runA2Seed,
  },
  {
    problemId: 'A4',
    problemTitle: '行星轨道衰减（热木星 dP/dt）',
    domain: '天文学',
    science125Tag: 'hot-jupiter-orbital-decay',
    run: runA4Seed,
  },
  {
    problemId: 'A8',
    problemTitle: '黑洞信息悖论（island formula / Page curve）',
    domain: '理论物理',
    science125Tag: 'black-hole-information-paradox',
    run: runA8Seed,
  },
  {
    problemId: 'A11',
    problemTitle: '超大质量黑洞并合与星系演化（SMBH merger）',
    domain: '天体物理',
    science125Tag: 'supermassive-black-hole-merger',
    run: runA11Seed,
  },
  {
    problemId: 'A16',
    problemTitle: '脉冲星制动指数（P0/P1）',
    domain: '天文学',
    science125Tag: 'pulsar-braking-index',
    run: runA16Seed,
  },
  {
    problemId: 'B2',
    problemTitle: '诱导多能干细胞重编程（Yamanaka 4 因子）',
    domain: '干细胞生物学',
    science125Tag: 'ipsc-yamanaka-reprogramming',
    run: runB2Seed,
  },
  {
    problemId: 'B3',
    problemTitle: 'CRISPR 脱靶效应（基因组编辑精准性）',
    domain: '基因组学',
    science125Tag: 'crispr-offtarget-effects',
    run: runB3Seed,
  },
  {
    problemId: 'B5',
    problemTitle: '肠道微生物-脑轴与抑郁症（FMT 疗法）',
    domain: '微生物组学',
    science125Tag: 'microbiome-gut-brain-depression',
    run: runB5Seed,
  },
  {
    problemId: 'B7',
    problemTitle: '蛋白质折叠（CASP15 FM 靶标）',
    domain: '生物',
    science125Tag: 'protein-folding-hard-targets',
    run: runB7Seed,
  },
  {
    problemId: 'C2',
    problemTitle: 'CO2 电催化还原为高附加值化学品（Cu 催化）',
    domain: '电化学材料',
    science125Tag: 'co2-electrochemical-reduction',
    run: runC2Seed,
  },
  {
    problemId: 'C3',
    problemTitle: '催化剂活性（DFT+ML TON 预测）',
    domain: '化学',
    science125Tag: 'catalyst-ton-prediction',
    run: runC3Seed,
  },
  {
    problemId: 'C8',
    problemTitle: '人造光合作用效率（PEC 水分解）',
    domain: '能源化学',
    science125Tag: 'artificial-photosynthesis-efficiency',
    run: runC8Seed,
  },
  {
    problemId: 'C10',
    problemTitle: 'NISQ 量子优势（Sycamore 经典算法追上）',
    domain: '量子信息',
    science125Tag: 'nisq-quantum-advantage',
    run: runC10Seed,
  },
  {
    problemId: 'D9',
    problemTitle: '暗物质直接探测（WIMP-核子散射）',
    domain: '宇宙学',
    science125Tag: 'dark-matter-direct-detection',
    run: runD9Seed,
  },
  {
    problemId: 'E2',
    problemTitle: '生态系统碳通量（FLUXNET）',
    domain: '生态气候',
    science125Tag: 'ecosystem-carbon-flux',
    run: runE2Seed,
  },
  {
    problemId: 'E3',
    problemTitle: '全球碳汇分布（陆地 vs 海洋，剩余碳预算）',
    domain: '生物地球化学',
    science125Tag: 'global-carbon-sink-budget',
    run: runE3Seed,
  },
  {
    problemId: 'E5',
    problemTitle: '平衡气候敏感度（ECS 低敏感证伪）',
    domain: '气候科学',
    science125Tag: 'climate-sensitivity-ecs',
    run: runE5Seed,
  },
  {
    problemId: 'E8',
    problemTitle: '海洋酸化与珊瑚钙化（pH 下降影响）',
    domain: '海洋化学',
    science125Tag: 'ocean-acidification-coral',
    run: runE8Seed,
  },
  {
    problemId: 'G2',
    problemTitle: '通用流感疫苗（广谱保护评估）',
    domain: '免疫学',
    science125Tag: 'universal-flu-vaccine',
    run: runG2Seed,
  },
  {
    problemId: 'G5',
    problemTitle: '地震前兆（ULF/VLF 电磁异常）',
    domain: '地学',
    science125Tag: 'seismic-em-precursor',
    run: runG5Seed,
  },
  {
    problemId: 'H1',
    problemTitle: 'RNA 世界假说（ribozyme 自复制）',
    domain: '生命起源',
    science125Tag: 'rna-world-self-replication',
    run: runH1Seed,
  },
  {
    problemId: 'H3',
    problemTitle: '生命同手性起源（左旋氨基酸 / 右旋糖）',
    domain: '生命起源化学',
    science125Tag: 'homochirality-origin-of-life',
    run: runH3Seed,
  },
  {
    problemId: 'M2',
    problemTitle: '心衰住院（SGLT2 抑制剂 CVOT）',
    domain: '医学',
    science125Tag: 'sglt2-heart-failure-benefit',
    run: runM2Seed,
  },
  {
    problemId: 'M3',
    problemTitle: '端粒与衰老（Hayflick limit + 端粒酶）',
    domain: '老化医学',
    science125Tag: 'telomere-aging-hayflick',
    run: runM3Seed,
  },
  {
    problemId: 'M7',
    problemTitle: '阿尔茨海默病 Aβ 假说（lecanemab）',
    domain: '神经退行',
    science125Tag: 'alzheimer-amyloid-hypothesis',
    run: runM7Seed,
  },
  {
    problemId: 'N3',
    problemTitle: '神经退行性疾病蛋白聚集（α-synuclein / PD）',
    domain: '神经科学',
    science125Tag: 'neurodegeneration-protein-aggregation',
    run: runN3Seed,
  },
  {
    problemId: 'P1',
    problemTitle: '室温超导（LK-99 复现）',
    domain: '物理',
    science125Tag: 'room-temp-superconductor-lk99',
    run: runP1Seed,
  },
  {
    problemId: 'P3',
    problemTitle: '时间之箭与热力学第二定律（熵增方向）',
    domain: '热力学',
    science125Tag: 'arrow-of-time-entropy',
    run: runP3Seed,
  },
  {
    problemId: 'P6',
    problemTitle: '室温量子相干与生物学功能（量子生物学）',
    domain: '量子生物学',
    science125Tag: 'quantum-biology-coherence',
    run: runP6Seed,
  },
  {
    problemId: 'T1',
    problemTitle: '意识的神经相关物（NCC: IIT vs GNWT）',
    domain: '意识认知神经科学',
    science125Tag: 'consciousness-neural-correlates',
    run: runT1Seed,
  },
];
