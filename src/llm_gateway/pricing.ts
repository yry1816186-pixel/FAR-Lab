/**
 * pricing.ts — LLM 价格 SSOT。
 *
 * 目标：消除"无 per-model 价格表"的成本计算盲区（CU2-01 High）。提供：
 *   - MODEL_PRICES：per-$/M token 定价表（输入/输出拆分，FOCUS 口径）
 *   - estimateUsdCost：token 用量 → 美元估算（输入/输出拆分，可选 qualifier）
 *
 * 诚实边界：
 *   - 价格为 DashScope 公开目录价（基准日期 2026-08-10 标注）；厂商调价后须更新
 *     PRICING_BASELINE_DATE——任何价格都是快照，非实时对账依据。
 *   - qwen3-235b-a22b 为 vLLM 自托管（固定 GPU 成本非 per-token），其 per-token
 *     价格表填 null（成本模型不同，见 CU2-01 §2.3）。
 *   - 估算仅供报告/预算，不替代厂商账单（与 budget.ts 语义一致）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch。
 */

/** 价格基准日期（DashScope 公开目录价快照）。调价时更新并审查模型名。 */
export const PRICING_BASELINE_DATE = '2026-08-10';

/** 单模型价格（每百万 token，美元）。null = 非 per-token 计费（固定成本）。 */
export interface ModelPrice {
  readonly inputUsdPerM: number | null;
  readonly outputUsdPerM: number | null;
}

/** 模型价格表（Qwen 家族 · DashScope 口径）。未知模型返回 undefined（调用方处理）。 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  'qwen3.7-max-2026-05-20': Object.freeze({ inputUsdPerM: 2.5, outputUsdPerM: 10.0 }),
  'qwen-max': Object.freeze({ inputUsdPerM: 2.5, outputUsdPerM: 10.0 }),
  'qwen-plus': Object.freeze({ inputUsdPerM: 0.4, outputUsdPerM: 1.2 }),
  // qwen3-235b-a22b：vLLM 自托管（固定 GPU 成本，非 per-token）——null 表示不可按 token 计价
  'qwen3-235b-a22b': Object.freeze({ inputUsdPerM: null, outputUsdPerM: null }),
});

/** 成本估算结果（FOCUS 口径：输入/输出拆分）。 */
export interface UsdCostEstimate {
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputUsd: number | null;
  readonly outputUsd: number | null;
  readonly totalUsd: number | null;
  readonly priced: boolean;
}

/**
 * 估算单次调用美元成本。价格缺失（未知模型或自托管）→ priced=false + totalUsd=null
 * （fail-conservative：不把不可计价项混入 0——CU4-02 口径混叠修复同源）。
 */
export function estimateUsdCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): UsdCostEstimate {
  const price = MODEL_PRICES[modelId];
  const inputUsd = price?.inputUsdPerM === null ? null
    : price !== undefined ? (inputTokens / 1_000_000) * (price.inputUsdPerM as number) : null;
  const outputUsd = price?.outputUsdPerM === null ? null
    : price !== undefined ? (outputTokens / 1_000_000) * (price.outputUsdPerM as number) : null;
  const priced = price !== undefined && price.inputUsdPerM !== null && price.outputUsdPerM !== null;
  return {
    modelId,
    inputTokens,
    outputTokens,
    inputUsd,
    outputUsd,
    totalUsd: priced && inputUsd !== null && outputUsd !== null ? inputUsd + outputUsd : null,
    priced,
  };
}

/** 已知价格模型数量（供测试/报告引用，避免魔法数）。 */
export function pricedModelCount(): number {
  return Object.values(MODEL_PRICES).filter((p) => p.inputUsdPerM !== null).length;
}
