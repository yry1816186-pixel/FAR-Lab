/**
 * Hero-A Harness — hero-A-001 quantitative claim（22 T-W2-06 · 任务 #12 决策 G）。
 *
 * hero-A-001（MMLU-physics 准确率定量声称）：
 *   claim：模型在 MMLU-physics 达 ≥0.72 准确率（ML 域 · measurement nodeKind · claimType=quantitative）。
 *   M1 accuracy / M2 run-variance / M3 contamination。
 *
 * 设计 verdict（spec 10 §4.4:284-288）：M1 PASS + M2/M3 WARN → mapChecksToVerdict route 'mixed' → INCONCLUSIVE。
 *
 * RULE-FS-001 不可证伪 rationale（诚实边界）：
 *   定量基准声称（「准确率 ≥ X」）因 (a) 运行间方差 (b) 训练数据污染 难以干净证伪——
 *   达标（M1 PASS）不代表声称可证伪地成立（M2 高方差 / M3 污染嫌疑 → 不可重复/不可归因 → INCONCLUSIVE）。
 *   这与 C-ASTRO-0001「TESS 数据本身不可证伪」同构：机器裁决给 INCONCLUSIVE（route mixed），
 *   不升 CONFIRMED（反过度声称）。rationale 在 claim 文本与本头注释阐明，非降级 verdict 来「修」不可证伪。
 *
 * V1 阈值数字为注入参数（F8 预登记·禁 hardcode 最终数值·镜像 C-ASTRO）。
 * 复用 tess_harness.evaluateOutcome + mapChecksToVerdict（域无关·DRY·决策 G）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type {
  ScienceCheck,
  ScienceThreshold,
} from './types.ts';
import { evaluateOutcome } from './tess_harness.ts';

/** hero-A-001 claim 文本（22 T-W2-06 quantitative · MMLU-physics）。 */
export const HERO_A_001_CLAIM =
  'Model achieves ≥0.72 accuracy on MMLU-physics (quantitative claim · measurement node)';

/** hero-A-001 检验项 id（M1-M3 · accuracy / run-variance / contamination）。 */
export const HERO_A_CHECK_IDS = ['M1_accuracy', 'M2_run_variance', 'M3_contamination'] as const;

/**
 * M1-M3 默认阈值（F8 预登记·V1 注入参数·数字标"待实测"的用占位 + 待回填注释）。
 * 阈值方向：M1 accuracy 越高越好（>=）；M2 方差越低越好（<）；M3 污染越低越好（<）。
 */
export const HERO_A_DEFAULT_THRESHOLDS: Record<(typeof HERO_A_CHECK_IDS)[number], ScienceThreshold> = {
  // M1：accuracy · spec 10 §4.4 称声称阈值 0.72（F8 预登记）。
  M1_accuracy: { op: '>=', value: 0.72, unit: 'accuracy' },
  // M2：run-variance · 跨运行 stddev（V1 注入·禁 hardcode 最终值·待实测）。
  M2_run_variance: { op: '<', value: 0.02, unit: 'stddev' },
  // M3：contamination score · 训练/评测重叠嫌疑（V1 注入·禁 hardcode 最终值·待实测）。
  M3_contamination: { op: '<', value: 0.05, unit: 'contamination_score' },
};

/** M1-M3 实测值（由 sandbox 执行产出·V1 注入）。 */
export interface HeroAMeasuredValues {
  /** M1 MMLU-physics 准确率（0-1）。 */
  readonly accuracy: number;
  /** M2 跨运行准确率 stddev。 */
  readonly runVariance: number;
  /** M3 污染嫌疑分（0-1）。 */
  readonly contaminationScore: number;
}

/**
 * 构造 hero-A-001 的 M1-M3 检验项（阈值注入·禁 hardcode 最终数值）。
 *
 * @param measured sandbox 执行产出的实测值。
 * @param thresholds 阈值覆盖（默认 HERO_A_DEFAULT_THRESHOLDS）。
 */
export function buildHeroAChecks(
  measured: HeroAMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof HERO_A_CHECK_IDS)[number], ScienceThreshold>>;
  },
): ScienceCheck[] {
  const thresholds = { ...HERO_A_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };

  const m1 = {
    id: 'M1_accuracy',
    label: 'MMLU-physics accuracy',
    primaryMetric: 'accuracy',
    outcome: evaluateOutcome(measured.accuracy, thresholds.M1_accuracy),
    metricValue: measured.accuracy,
    threshold: thresholds.M1_accuracy,
    detail: `accuracy ${measured.accuracy} ${thresholds.M1_accuracy.op} ${thresholds.M1_accuracy.value} (F8 prereg claimed threshold)`,
  } as const;

  const m2 = {
    id: 'M2_run_variance',
    label: 'cross-run accuracy variance',
    primaryMetric: 'run_variance',
    outcome: evaluateOutcome(measured.runVariance, thresholds.M2_run_variance),
    metricValue: measured.runVariance,
    threshold: thresholds.M2_run_variance,
    detail: `run variance ${measured.runVariance}σ ${thresholds.M2_run_variance.op} ${thresholds.M2_run_variance.value}σ (reproducibility · high variance → INCONCLUSIVE)`,
  } as const;

  const m3 = {
    id: 'M3_contamination',
    label: 'train/eval contamination check',
    primaryMetric: 'contamination_score',
    outcome: evaluateOutcome(measured.contaminationScore, thresholds.M3_contamination),
    metricValue: measured.contaminationScore,
    threshold: thresholds.M3_contamination,
    detail: `contamination ${measured.contaminationScore} ${thresholds.M3_contamination.op} ${thresholds.M3_contamination.value} (contamination suspicion → cannot cleanly attribute · RULE-FS-001)`,
  } as const;

  return [m1, m2, m3];
}
