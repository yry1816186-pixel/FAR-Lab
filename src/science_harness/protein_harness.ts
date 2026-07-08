/**
 * Protein-Folding DomainPack Harness — B7 折叠自由能预测可证伪检验（spec 11 §3 verdict_mapping）。
 *
 * 域：结构生物学 · 蛋白质折叠 ΔG/结构预测。
 * claim：ML ΔG 预测模型在独立测试集上达 Pearson r ≥ 0.85（声称值）。
 * 预登记检验（F8 preregistration lock）：
 *   M1 ΔG Pearson r ≥ 0.85（声称阈值）
 *   M2 TM-score ≥ 0.5（结构正确性·长程折叠）
 *   M3 top-1 ranking accuracy ≥ 0.70（选择正确构象）
 * 诚实设计：所有 evidence 实测 metricValue < 阈值 → mapChecksToVerdict any_refute(fail) 或 mixed(warn)
 * → kernel REFUTED/INCONCLUSIVE。demo seed B7 期望 REFUTED。
 *
 * 域无关原语（evaluateOutcome / mapChecksToVerdict）从 tess_harness 复用（DRY·禁重复实现）。
 * 模型中立。零容忍合规。
 */

import { evaluateOutcome, mapChecksToVerdict } from './tess_harness.ts';
import type { ScienceCheck, ScienceThreshold } from './types.ts';

/** B7 蛋白质折叠 claim 文本。 */
export const B7_PROTEIN_CLAIM =
  'ML protein-folding ΔG prediction model achieves Pearson r ≥ 0.85 on held-out test set (quantitative claim)';

/** B7 检验项 id（M1-M3 · F8 预登记）。 */
export const B7_PROTEIN_CHECK_IDS = [
  'M1_deltaG_pearson',
  'M2_tm_score',
  'M3_top1_ranking',
] as const;

/** M1-M3 默认阈值（F8 预登记·claim 文本声称的阈值）。 */
export const B7_PROTEIN_DEFAULT_THRESHOLDS: Record<
  (typeof B7_PROTEIN_CHECK_IDS)[number],
  ScienceThreshold
> = {
  // M1：ΔG Pearson r · claim 声称 ≥ 0.85（F8 预登记·禁事后移动）。
  M1_deltaG_pearson: { op: '>=', value: 0.85, unit: 'pearson-r' },
  // M2：TM-score · 结构正确性长程折叠阈值 0.5（结构生物学惯例）。
  M2_tm_score: { op: '>=', value: 0.5, unit: 'tm-score' },
  // M3：top-1 ranking accuracy · 选择正确 native 构象 ≥ 0.70。
  M3_top1_ranking: { op: '>=', value: 0.7, unit: 'accuracy' },
};

/** M1-M3 实测值（sandbox 执行产出·demo seed 注入）。 */
export interface ProteinMeasuredValues {
  /** M1 ΔG Pearson r（越高越好）。 */
  readonly deltaGPearson: number;
  /** M2 TM-score（结构相似度·越高越好）。 */
  readonly tmScore: number;
  /** M3 top-1 ranking accuracy（native 构象排第一的比率）。 */
  readonly top1Ranking: number;
}

/**
 * 构造 B7 蛋白质折叠的 M1-M3 检验项（阈值注入·F8 预登记）。
 *
 * @param measured sandbox 执行产出的实测值。
 * @param thresholds 阈值覆盖（默认 B7_PROTEIN_DEFAULT_THRESHOLDS）。
 * @param forceFail 若某检验项须显式 FAIL（refute 证据·非阈值 WARN），由调用方注入 outcome。
 */
export function buildProteinChecks(
  measured: ProteinMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof B7_PROTEIN_CHECK_IDS)[number], ScienceThreshold>>;
    readonly forceOutcomes?: Partial<Record<(typeof B7_PROTEIN_CHECK_IDS)[number], 'PASS' | 'WARN' | 'FAIL'>>;
  },
): ScienceCheck[] {
  const thresholds = { ...B7_PROTEIN_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };
  const force = options?.forceOutcomes ?? {};

  const m1 = {
    id: 'M1_deltaG_pearson',
    label: 'ΔG prediction Pearson correlation',
    primaryMetric: 'deltaG_pearson_r',
    outcome: force.M1_deltaG_pearson ?? evaluateOutcome(measured.deltaGPearson, thresholds.M1_deltaG_pearson),
    metricValue: measured.deltaGPearson,
    threshold: thresholds.M1_deltaG_pearson,
    detail: `ΔG Pearson r ${measured.deltaGPearson} ${thresholds.M1_deltaG_pearson.op} ${thresholds.M1_deltaG_pearson.value} (F8 prereg)`,
  } as const;

  const m2 = {
    id: 'M2_tm_score',
    label: 'predicted structure TM-score',
    primaryMetric: 'tm_score',
    outcome: force.M2_tm_score ?? evaluateOutcome(measured.tmScore, thresholds.M2_tm_score),
    metricValue: measured.tmScore,
    threshold: thresholds.M2_tm_score,
    detail: `TM-score ${measured.tmScore} ${thresholds.M2_tm_score.op} ${thresholds.M2_tm_score.value}`,
  } as const;

  const m3 = {
    id: 'M3_top1_ranking',
    label: 'native conformation top-1 ranking accuracy',
    primaryMetric: 'top1_ranking_accuracy',
    outcome: force.M3_top1_ranking ?? evaluateOutcome(measured.top1Ranking, thresholds.M3_top1_ranking),
    metricValue: measured.top1Ranking,
    threshold: thresholds.M3_top1_ranking,
    detail: `top-1 ranking ${measured.top1Ranking} ${thresholds.M3_top1_ranking.op} ${thresholds.M3_top1_ranking.value}`,
  } as const;

  return [m1, m2, m3];
}

/** B7 蛋白质折叠 verdict_mapping（复用域无关 mapChecksToVerdict）。 */
export function mapProteinChecksToVerdict(
  checks: readonly ScienceCheck[],
  integrityFlags: readonly string[] = [],
) {
  return mapChecksToVerdict(checks, integrityFlags);
}
