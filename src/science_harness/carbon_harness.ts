/**
 * Carbon-Flux DomainPack Harness — E2 陆地碳通量估算可证伪检验（spec 11 §3 verdict_mapping）。
 *
 * 域：生态气候 · 涡度相关（Eddy Covariance）碳通量（NEE/GPP/Re）。
 * claim：改进的 MOD17 LUE 算法使 MOD17-GPP 与 EC-GPP 的 RMSE 下降 ≥ 30%，且干旱区高估修正。
 * 预登记检验（F8 preregistration lock）：
 *   M1 GPP RMSE 下降比例 ≥ 0.30（声称阈值）
 *   M2 干旱区 GPP 偏差修正幅度（原高估 15-40% → 修正后 |bias| ≤ 10%）
 *   M3 空间覆盖：验证塔数 ≥ 50（跨生物群落外推性）
 * 诚实设计：M1-M3 全 PASS → mapChecksToVerdict all_pass → kernel CONFIRMED（bounded support）。
 * demo seed E2 期望 CONFIRMED。
 *
 * 域无关原语从 tess_harness 复用。模型中立。零容忍合规。
 */

import { evaluateOutcome, mapChecksToVerdict } from './tess_harness.ts';
import type { ScienceCheck, ScienceThreshold } from './types.ts';

/** E2 碳通量 claim 文本。 */
export const E2_CARBON_CLAIM =
  'Improved MOD17 LUE algorithm reduces MOD17-GPP vs EC-GPP RMSE by ≥ 30% and corrects dryland GPP overestimation (15-40% → |bias| ≤ 10%)';

/** E2 检验项 id（M1-M3 · F8 预登记）。 */
export const E2_CARBON_CHECK_IDS = [
  'M1_rmse_reduction',
  'M2_dryland_bias_correction',
  'M3_tower_coverage',
] as const;

/** M1-M3 默认阈值（F8 预登记）。 */
export const E2_CARBON_DEFAULT_THRESHOLDS: Record<
  (typeof E2_CARBON_CHECK_IDS)[number],
  ScienceThreshold
> = {
  // M1：RMSE 下降比例 · claim 声称 ≥ 0.30（F8 预登记）。
  M1_rmse_reduction: { op: '>=', value: 0.3, unit: 'fraction' },
  // M2：干旱区 |bias| · 修正后 ≤ 0.10（原 15-40% 高估）。
  M2_dryland_bias_correction: { op: '<=', value: 0.1, unit: 'abs-bias' },
  // M3：验证塔数 · 跨生物群落外推性 ≥ 50 塔。
  M3_tower_coverage: { op: '>=', value: 50, unit: 'towers' },
};

/** M1-M3 实测值（sandbox 执行产出·demo seed 注入）。 */
export interface CarbonMeasuredValues {
  /** M1 RMSE 下降比例（vs 原始 MOD17）。 */
  readonly rmseReduction: number;
  /** M2 修正后干旱区 GPP |bias|。 */
  readonly drylandAbsBias: number;
  /** M3 验证塔数。 */
  readonly towerCount: number;
}

/** 构造 E2 碳通量的 M1-M3 检验项。 */
export function buildCarbonChecks(
  measured: CarbonMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof E2_CARBON_CHECK_IDS)[number], ScienceThreshold>>;
    readonly forceOutcomes?: Partial<Record<(typeof E2_CARBON_CHECK_IDS)[number], 'PASS' | 'WARN' | 'FAIL'>>;
  },
): ScienceCheck[] {
  const thresholds = { ...E2_CARBON_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };
  const force = options?.forceOutcomes ?? {};

  const m1 = {
    id: 'M1_rmse_reduction',
    label: 'MOD17-GPP RMSE reduction vs baseline',
    primaryMetric: 'rmse_reduction_fraction',
    outcome: force.M1_rmse_reduction ?? evaluateOutcome(measured.rmseReduction, thresholds.M1_rmse_reduction),
    metricValue: measured.rmseReduction,
    threshold: thresholds.M1_rmse_reduction,
    detail: `RMSE reduction ${measured.rmseReduction} ${thresholds.M1_rmse_reduction.op} ${thresholds.M1_rmse_reduction.value} (F8 prereg)`,
  } as const;

  const m2 = {
    id: 'M2_dryland_bias_correction',
    label: 'dryland GPP overestimation correction',
    primaryMetric: 'dryland_abs_bias',
    outcome: force.M2_dryland_bias_correction ?? evaluateOutcome(measured.drylandAbsBias, thresholds.M2_dryland_bias_correction),
    metricValue: measured.drylandAbsBias,
    threshold: thresholds.M2_dryland_bias_correction,
    detail: `dryland |bias| ${measured.drylandAbsBias} ${thresholds.M2_dryland_bias_correction.op} ${thresholds.M2_dryland_bias_correction.value}`,
  } as const;

  const m3 = {
    id: 'M3_tower_coverage',
    label: 'validation tower count across biomes',
    primaryMetric: 'tower_count',
    outcome: force.M3_tower_coverage ?? evaluateOutcome(measured.towerCount, thresholds.M3_tower_coverage),
    metricValue: measured.towerCount,
    threshold: thresholds.M3_tower_coverage,
    detail: `tower count ${measured.towerCount} ${thresholds.M3_tower_coverage.op} ${thresholds.M3_tower_coverage.value}`,
  } as const;

  return [m1, m2, m3];
}

/** E2 碳通量 verdict_mapping（复用域无关 mapChecksToVerdict）。 */
export function mapCarbonChecksToVerdict(
  checks: readonly ScienceCheck[],
  integrityFlags: readonly string[] = [],
) {
  return mapChecksToVerdict(checks, integrityFlags);
}
