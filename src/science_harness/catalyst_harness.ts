/**
 * Catalyst DomainPack Harness — C3 催化剂活性预测可证伪检验（spec 11 §3 verdict_mapping）。
 *
 * 域：计算化学 · 催化剂筛选（DFT + GNN 预测 TON）。
 * claim：DFT+GNN pipeline 预测催化剂转化数（TON）相对误差 MAPE ≤ 0.15，覆盖全部过渡金属催化剂。
 * 预登记检验（F8 preregistration lock）：
 *   M1 MAPE（全过渡金属集·含 bulk/alloy/SAC）≤ 0.15
 *   M2 MAPE（仅 SAC 子集）≤ 0.15
 *   M3 覆盖广度：bulk surface + alloy 是否可外推
 * 诚实设计：M1 在全集上 MAPE > 0.15（FAIL/WARN）但 M2 在 SAC 子集 MAPE ≤ 0.15（PASS）
 * → integrityFlags=['scope_narrow'] → mapChecksToVerdict 优先级 1 DEGRADED_SCOPE。
 * demo seed C3 期望 DEGRADED_SCOPE（声称仅在窄子集成立·scope laundering 反 theater）。
 *
 * 域无关原语从 tess_harness 复用。模型中立。零容忍合规。
 */

import { evaluateOutcome, mapChecksToVerdict } from './tess_harness.ts';
import type { ScienceCheck, ScienceThreshold } from './types.ts';

/** C3 催化剂 claim 文本。 */
export const C3_CATALYST_CLAIM =
  'DFT+GNN catalyst pipeline predicts turnover number (TON) within MAPE ≤ 0.15 across ALL transition-metal catalysts (bulk, alloy, single-atom)';

/** C3 检验项 id（M1-M3 · F8 预登记）。 */
export const C3_CATALYST_CHECK_IDS = [
  'M1_mape_full_set',
  'M2_mape_sac_subset',
  'M3_extrapolation_breadth',
] as const;

/** M1-M3 默认阈值（F8 预登记·claim 声称 MAPE ≤ 0.15）。 */
export const C3_CATALYST_DEFAULT_THRESHOLDS: Record<
  (typeof C3_CATALYST_CHECK_IDS)[number],
  ScienceThreshold
> = {
  // M1：全集 MAPE · claim 声称 ≤ 0.15（F8 预登记·含 bulk/alloy/SAC）。
  M1_mape_full_set: { op: '<=', value: 0.15, unit: 'mape' },
  // M2：仅 SAC 子集 MAPE · 同阈值（揭示子集 vs 全集差距）。
  M2_mape_sac_subset: { op: '<=', value: 0.15, unit: 'mape' },
  // M3：外推广度 · bulk+alloy 可达 MAPE ≤ 0.15 的占比 ≥ 0.80（覆盖完整性）。
  M3_extrapolation_breadth: { op: '>=', value: 0.8, unit: 'fraction' },
};

/** M1-M3 实测值（sandbox 执行产出·demo seed 注入）。 */
export interface CatalystMeasuredValues {
  /** M1 全过渡金属集 MAPE（越低越好）。 */
  readonly mapeFullSet: number;
  /** M2 仅 SAC 子集 MAPE。 */
  readonly mapeSacSubset: number;
  /** M3 bulk+alloy 外推可达子集占比。 */
  readonly extrapolationFraction: number;
}

/** 构造 C3 催化剂的 M1-M3 检验项。 */
export function buildCatalystChecks(
  measured: CatalystMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof C3_CATALYST_CHECK_IDS)[number], ScienceThreshold>>;
    readonly forceOutcomes?: Partial<Record<(typeof C3_CATALYST_CHECK_IDS)[number], 'PASS' | 'WARN' | 'FAIL'>>;
  },
): ScienceCheck[] {
  const thresholds = { ...C3_CATALYST_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };
  const force = options?.forceOutcomes ?? {};

  const m1 = {
    id: 'M1_mape_full_set',
    label: 'MAPE on full transition-metal set (bulk+alloy+SAC)',
    primaryMetric: 'mape_full_set',
    outcome: force.M1_mape_full_set ?? evaluateOutcome(measured.mapeFullSet, thresholds.M1_mape_full_set),
    metricValue: measured.mapeFullSet,
    threshold: thresholds.M1_mape_full_set,
    detail: `full-set MAPE ${measured.mapeFullSet} ${thresholds.M1_mape_full_set.op} ${thresholds.M1_mape_full_set.value} (F8 prereg)`,
  } as const;

  const m2 = {
    id: 'M2_mape_sac_subset',
    label: 'MAPE on single-atom catalyst (SAC) subset only',
    primaryMetric: 'mape_sac_subset',
    outcome: force.M2_mape_sac_subset ?? evaluateOutcome(measured.mapeSacSubset, thresholds.M2_mape_sac_subset),
    metricValue: measured.mapeSacSubset,
    threshold: thresholds.M2_mape_sac_subset,
    detail: `SAC-subset MAPE ${measured.mapeSacSubset} ${thresholds.M2_mape_sac_subset.op} ${thresholds.M2_mape_sac_subset.value}`,
  } as const;

  const m3 = {
    id: 'M3_extrapolation_breadth',
    label: 'extrapolation breadth to bulk+alloy',
    primaryMetric: 'extrapolation_fraction',
    outcome: force.M3_extrapolation_breadth ?? evaluateOutcome(measured.extrapolationFraction, thresholds.M3_extrapolation_breadth),
    metricValue: measured.extrapolationFraction,
    threshold: thresholds.M3_extrapolation_breadth,
    detail: `bulk+alloy achievable fraction ${measured.extrapolationFraction} ${thresholds.M3_extrapolation_breadth.op} ${thresholds.M3_extrapolation_breadth.value}`,
  } as const;

  return [m1, m2, m3];
}

/** C3 催化剂 verdict_mapping（复用域无关 mapChecksToVerdict）。 */
export function mapCatalystChecksToVerdict(
  checks: readonly ScienceCheck[],
  integrityFlags: readonly string[] = [],
) {
  return mapChecksToVerdict(checks, integrityFlags);
}
