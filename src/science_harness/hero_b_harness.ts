/**
 * Hero-B Harness — hero-B-002 causal claim（22 T-W2-06/07 · 任务 #12 决策 G）。
 *
 * hero-B-002（CoT prompting 降低幻觉率·因果声称）：
 *   claim：Chain-of-Thought prompting 降低 LLM 幻觉率（LLM 域 · hypothesis nodeKind · claimType=causal）。
 *   M1 observed-association / M2 sample-size / M3 measurement-validity（**全设计 PASS**——
 *   观测数据看似支持 → mapChecksToVerdict route 'all_pass' → 本会 CONFIRMED）。
 *
 * F6 英雄叙事（决策 G·§7.5:945 R7 判定前的因果门）：
 *   数据看似支持（M-checks 全 PASS → 本会 CONFIRMED），但 CoT↔幻觉率 存在未测量混杂（prior_knowledge），
 *   经 confounding_integration.decideVerdictWithConfounding 叠加 ConfoundingGate FAIL → **降级 DEGRADED_SCOPE**。
 *   即「相关 ≠ 因果」：观测相关性达标不足以因果 CONFIRMED（F6 因果红线·observational_only 禁 CONFIRMED）。
 *
 *   ⚠ harness 本身**不**调 decideVerdictWithConfounding（分离纯函数·可单测）：
 *   harness 只产 (a) M-checks（buildHeroBChecks）+ (b) CausalModel fixture（HERO_B_CAUSAL_MODEL）
 *   (c) exposure/outcome/evidenceBasis 常量；调用方/测试串 mapChecksToVerdict → decideVerdictWithConfounding。
 *
 * HERO_B_CAUSAL_MODEL fixture DAG（§7.5.1:1131 预定义因果 DAG 模版·决策 G）：
 *   nodes：cot_prompting(intervention) / hallucination_rate(outcome) /
 *          task_difficulty(observed) / prior_knowledge(latent)
 *   edges：cot_prompting→hallucination_rate / task_difficulty→cot_prompting /
 *          task_difficulty→hallucination_rate / prior_knowledge→cot_prompting /
 *          prior_knowledge→hallucination_rate
 *   controlledConfounders=['task_difficulty']（调整集 Z·阻断 task_difficulty 后门路径）
 *   unmeasuredConfoundersSuspected=['prior_knowledge']（latent·未测·未阻断 → FAIL）
 *   后门路径 cot_prompting←prior_knowledge→hallucination_rate 未阻断 + suspected 非空 → FAIL。
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
import type { CausalModel, EvidenceBasis } from '../confounding_gate/types.ts';
import { evaluateOutcome } from './tess_harness.ts';

/** hero-B-002 claim 文本（22 T-W2-06 causal · CoT 幻觉率）。 */
export const HERO_B_002_CLAIM =
  'Chain-of-Thought prompting reduces LLM hallucination rate (causal claim · hypothesis node)';

/** hero-B-002 检验项 id（M1-M3 · observed-association / sample-size / measurement-validity）。 */
export const HERO_B_CHECK_IDS = ['M1_observed_association', 'M2_sample_size', 'M3_measurement_validity'] as const;

/**
 * M1-M3 默认阈值（F8 预登记·V1 注入参数）。
 * hero-B 设计：默认 measured 产全 PASS（观测数据看似支持 → 本会 'all_pass' CONFIRMED·供 F6 降级演示）。
 */
export const HERO_B_DEFAULT_THRESHOLDS: Record<(typeof HERO_B_CHECK_IDS)[number], ScienceThreshold> = {
  // M1：observed association · CoT 组幻觉率低于 baseline（差值越大越支持·>= ·V1 注入）。
  M1_observed_association: { op: '>=', value: 0.05, unit: 'rate_reduction' },
  // M2：sample size · n >= 阈值（统计功效·V1 注入）。
  M2_sample_size: { op: '>=', value: 200, unit: 'count' },
  // M3：measurement validity · 幻觉率标注一致性（>= 阈值·V1 注入）。
  M3_measurement_validity: { op: '>=', value: 0.8, unit: 'agreement' },
};

/** M1-M3 实测值（由 sandbox 执行产出·V1 注入）。 */
export interface HeroBMeasuredValues {
  /** M1 CoT vs baseline 幻觉率降幅（0-1）。 */
  readonly observedRateReduction: number;
  /** M2 样本量。 */
  readonly sampleSize: number;
  /** M3 标注一致性（0-1）。 */
  readonly measurementValidity: number;
}

/** hero-B 因果 DAG exposure（intervention）nodeId。 */
export const HERO_B_EXPOSURE = 'cot_prompting';

/** hero-B 因果 DAG outcome nodeId。 */
export const HERO_B_OUTCOME = 'hallucination_rate';

/** hero-B 证据基础（F6 红线·03 §7.5:961）：观测数据 → observational_only + FAIL → 禁 CONFIRMED。 */
export const HERO_B_EVIDENCE_BASIS: EvidenceBasis = 'observational_only';

/**
 * hero-B 预定义因果 DAG 模版（§7.5.1:1131·决策 G）。
 * adjudicateConfounding(HERO_B_CAUSAL_MODEL, HERO_B_EXPOSURE, HERO_B_OUTCOME) → FAIL
 * （prior_knowledge 后门路径未阻断 + suspected 非空）。
 */
export const HERO_B_CAUSAL_MODEL: CausalModel = {
  nodes: [
    { nodeId: 'cot_prompting', variableName: 'cot', nodeKind: 'intervention', description: 'Chain-of-Thought prompting（是/否）' },
    { nodeId: 'hallucination_rate', variableName: 'hallucination', nodeKind: 'outcome', description: 'LLM 幻觉率' },
    { nodeId: 'task_difficulty', variableName: 'difficulty', nodeKind: 'observed', description: '任务难度（已测量·调整集 Z）' },
    { nodeId: 'prior_knowledge', variableName: 'prior', nodeKind: 'latent', description: '先验知识（latent·未测量·未阻断混杂）' },
  ],
  edges: [
    { fromNodeId: 'cot_prompting', toNodeId: 'hallucination_rate', edgeKind: 'direct_cause', mechanismRationale: 'CoT 引导逐步推理·降低幻觉' },
    { fromNodeId: 'task_difficulty', toNodeId: 'cot_prompting', edgeKind: 'direct_cause', mechanismRationale: '难任务更可能触发 CoT' },
    { fromNodeId: 'task_difficulty', toNodeId: 'hallucination_rate', edgeKind: 'direct_cause', mechanismRationale: '难任务幻觉率更高' },
    { fromNodeId: 'prior_knowledge', toNodeId: 'cot_prompting', edgeKind: 'probable_cause', mechanismRationale: '先验知识影响 CoT 使用倾向' },
    { fromNodeId: 'prior_knowledge', toNodeId: 'hallucination_rate', edgeKind: 'probable_cause', mechanismRationale: '先验知识影响幻觉率（未测混杂）' },
  ],
  controlledConfounders: ['task_difficulty'],
  unmeasuredConfoundersSuspected: ['prior_knowledge'],
};

/**
 * 构造 hero-B-002 的 M1-M3 检验项（阈值注入·设计全 PASS·供 F6 降级演示）。
 *
 * @param measured sandbox 执行产出的实测值。
 * @param thresholds 阈值覆盖（默认 HERO_B_DEFAULT_THRESHOLDS）。
 */
export function buildHeroBChecks(
  measured: HeroBMeasuredValues,
  options?: {
    readonly thresholds?: Partial<Record<(typeof HERO_B_CHECK_IDS)[number], ScienceThreshold>>;
  },
): ScienceCheck[] {
  const thresholds = { ...HERO_B_DEFAULT_THRESHOLDS, ...(options?.thresholds ?? {}) };

  const m1 = {
    id: 'M1_observed_association',
    label: 'observed CoT hallucination-rate reduction',
    primaryMetric: 'observed_rate_reduction',
    outcome: evaluateOutcome(measured.observedRateReduction, thresholds.M1_observed_association),
    metricValue: measured.observedRateReduction,
    threshold: thresholds.M1_observed_association,
    detail: `rate reduction ${measured.observedRateReduction} ${thresholds.M1_observed_association.op} ${thresholds.M1_observed_association.value} (observational association · 相关 ≠ 因果 · F6 will gate)`,
  } as const;

  const m2 = {
    id: 'M2_sample_size',
    label: 'sample size adequacy',
    primaryMetric: 'sample_size',
    outcome: evaluateOutcome(measured.sampleSize, thresholds.M2_sample_size),
    metricValue: measured.sampleSize,
    threshold: thresholds.M2_sample_size,
    detail: `n=${measured.sampleSize} ${thresholds.M2_sample_size.op} ${thresholds.M2_sample_size.value} (statistical power)`,
  } as const;

  const m3 = {
    id: 'M3_measurement_validity',
    label: 'hallucination annotation agreement',
    primaryMetric: 'measurement_validity',
    outcome: evaluateOutcome(measured.measurementValidity, thresholds.M3_measurement_validity),
    metricValue: measured.measurementValidity,
    threshold: thresholds.M3_measurement_validity,
    detail: `agreement ${measured.measurementValidity} ${thresholds.M3_measurement_validity.op} ${thresholds.M3_measurement_validity.value} (annotation consistency)`,
  } as const;

  return [m1, m2, m3];
}
