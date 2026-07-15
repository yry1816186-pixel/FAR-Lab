/**
 * Seismic-Precursor DomainPack Harness — G5 震前电磁异常预测可证伪检验（spec 11 §3 verdict_mapping）。
 *
 * 域：地球物理 · 震前 ULF/VLF 电磁异常预测。
 * claim：ULF/VLF 磁异常可在 7 天窗口内预测 M≥5 地震，precision ≥ 0.80 / recall ≥ 0.50。
 * 预登记检验（F8 preregistration lock）：
 *   M1 前瞻盲测 precision ≥ 0.80（声称阈值·禁回顾拟合）
 *   M2 前瞻盲测 recall ≥ 0.50
 *   M3 独立复现（≥ 2 个独立团队前瞻协议复现 precision ≥ 0.80）
 * 诚实设计：地震前兆领域长期无可靠前瞻复现证据 → checks 为空 / data_missing
 * → mapChecksToVerdict 优先级 6 data_missing → kernel UNTESTED。
 * 诚实展示：FEC 对「无可复现证据」的声称诚实标 UNTESTED，而非伪造 CONFIRMED（反剧场红线）。
 * demo seed G5 期望 UNTESTED。
 *
 * 域无关原语从 tess_harness 复用。模型中立。零容忍合规。
 */

import { mapChecksToVerdict } from './tess_harness.ts';
import type { ScienceCheck, ScienceThreshold } from './types.ts';

/** G5 地震前兆 claim 文本。 */
export const G5_SEISMIC_CLAIM =
  'Pre-seismic ULF/VLF magnetic anomalies predict M≥5 earthquakes within 7-day window at precision ≥ 0.80 and recall ≥ 0.50 (causal prediction claim)';

/** G5 检验项 id（M1-M3 · F8 预登记·前瞻盲测协议）。 */
export const G5_SEISMIC_CHECK_IDS = [
  'M1_prospective_precision',
  'M2_prospective_recall',
  'M3_independent_replication',
] as const;

/** M1-M3 默认阈值（F8 预登记·前瞻盲测·禁回顾拟合）。 */
export const G5_SEISMIC_DEFAULT_THRESHOLDS: Record<
  (typeof G5_SEISMIC_CHECK_IDS)[number],
  ScienceThreshold
> = {
  // M1：前瞻 precision · claim 声称 ≥ 0.80（F8 预登记·须前瞻非回顾）。
  M1_prospective_precision: { op: '>=', value: 0.8, unit: 'precision' },
  // M2：前瞻 recall · claim 声称 ≥ 0.50。
  M2_prospective_recall: { op: '>=', value: 0.5, unit: 'recall' },
  // M3：独立复现团队数 · ≥ 2（可复现性·反 single-lab artifact）。
  M3_independent_replication: { op: '>=', value: 2, unit: 'teams' },
};

/** G5 实测值（前瞻盲测产出·demo seed 注入；真实态该领域缺前瞻复现证据 → null）。 */
export interface SeismicMeasuredValues {
  /** M1 前瞻 precision（null = 无前瞻盲测证据）。 */
  readonly prospectivePrecision: number | null;
  /** M2 前瞻 recall（null = 无前瞻盲测证据）。 */
  readonly prospectiveRecall: number | null;
  /** M3 独立复现团队数（0 = 无复现）。 */
  readonly independentReplicationTeams: number;
}

/**
 * 构造 G5 地震前兆的检验项。
 *
 * 诚实核心：地震前兆领域长期缺前瞻复现证据 → measured 各值为 null/0
 * → 无法构造有效 PASS/FAIL 检验 → 返回空数组 → mapChecksToVerdict data_missing → UNTESTED。
 * 这是反剧场关键：对「无可复现证据」的声称，禁伪造 precision 数字，诚实标 UNTESTED。
 *
 * 仅当 measured 提供非 null 前瞻值时才构造有效检验（生产 caller 注入真实前瞻数据用）。
 */
export function buildSeismicChecks(
  measured: SeismicMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof G5_SEISMIC_CHECK_IDS)[number], ScienceThreshold>>;
  },
): ScienceCheck[] {
  // 无前瞻盲测证据 → 不构造任何检验（禁伪造 precision 数字）。
  if (measured.prospectivePrecision === null || measured.prospectiveRecall === null) {
    return [];
  }
  const thresholds = { ...G5_SEISMIC_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };
  // 局部 evaluateOutcome（避免为 null 分支 import 域无关原语的开销——此处 measured 已非 null）。
  const evalOutcome = (v: number, t: ScienceThreshold): 'PASS' | 'WARN' => {
    let passes = false;
    switch (t.op) {
      case '<': passes = v < t.value; break;
      case '<=': passes = v <= t.value; break;
      case '>': passes = v > t.value; break;
      case '>=': passes = v >= t.value; break;
      case '==': passes = v === t.value; break;
    }
    return passes ? 'PASS' : 'WARN';
  };

  const m1 = {
    id: 'M1_prospective_precision',
    label: 'prospective blind-test precision',
    primaryMetric: 'prospective_precision',
    outcome: evalOutcome(measured.prospectivePrecision, thresholds.M1_prospective_precision),
    metricValue: measured.prospectivePrecision,
    threshold: thresholds.M1_prospective_precision,
    detail: `prospective precision ${measured.prospectivePrecision} ${thresholds.M1_prospective_precision.op} ${thresholds.M1_prospective_precision.value} (F8 prereg·prospective-only)`,
  } as const;

  const m2 = {
    id: 'M2_prospective_recall',
    label: 'prospective blind-test recall',
    primaryMetric: 'prospective_recall',
    outcome: evalOutcome(measured.prospectiveRecall, thresholds.M2_prospective_recall),
    metricValue: measured.prospectiveRecall,
    threshold: thresholds.M2_prospective_recall,
    detail: `prospective recall ${measured.prospectiveRecall} ${thresholds.M2_prospective_recall.op} ${thresholds.M2_prospective_recall.value}`,
  } as const;

  const m3 = {
    id: 'M3_independent_replication',
    label: 'independent team replications',
    primaryMetric: 'independent_replication_teams',
    outcome: evalOutcome(measured.independentReplicationTeams, thresholds.M3_independent_replication),
    metricValue: measured.independentReplicationTeams,
    threshold: thresholds.M3_independent_replication,
    detail: `independent replication teams ${measured.independentReplicationTeams} ${thresholds.M3_independent_replication.op} ${thresholds.M3_independent_replication.value}`,
  } as const;

  return [m1, m2, m3];
}

/** G5 地震前兆 verdict_mapping（复用域无关 mapChecksToVerdict；空 checks → data_missing → UNTESTED）。 */
export function mapSeismicChecksToVerdict(
  checks: readonly ScienceCheck[],
  integrityFlags: readonly string[] = [],
) {
  return mapChecksToVerdict(checks, integrityFlags);
}
