/**
 * pricing.ts 测试（阶段 7 1127 · CU2-01 价格 SSOT）。
 *
 * 覆盖：
 *   1. 已知模型：输入/输出拆分估算 + totalUsd
 *   2. 自托管模型（qwen3-235b-a22b）：priced=false + totalUsd=null（不混叠 0——CU4-02）
 *   3. 未知模型：priced=false（fail-conservative）
 *   4. 价格表覆盖生产模型链（qwen3.7-max/qwen-plus/qwen3-235b 均在表中）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_PRICES,
  PRICING_BASELINE_DATE,
  estimateUsdCost,
  pricedModelCount,
} from '../../src/llm_gateway/pricing.ts';

test('pricing: 已知模型按输入/输出拆分估算（qwen3.7-max 1M/500K tokens）', () => {
  const est = estimateUsdCost('qwen3.7-max-2026-05-20', 1_000_000, 500_000);
  assert.equal(est.priced, true);
  assert.equal(est.inputUsd, 2.5); // 2.5/M input
  assert.equal(est.outputUsd, 5.0); // 10/M output × 0.5M
  assert.equal(est.totalUsd, 7.5);
});

test('pricing: 0 token 边界 → 0 美元（不 NaN）', () => {
  const est = estimateUsdCost('qwen-plus', 0, 0);
  assert.equal(est.priced, true);
  assert.equal(est.totalUsd, 0);
});

test('pricing: 自托管模型（qwen3-235b-a22b）→ priced=false + totalUsd=null（不混叠 0）', () => {
  const est = estimateUsdCost('qwen3-235b-a22b', 1_000_000, 1_000_000);
  assert.equal(est.priced, false);
  assert.equal(est.inputUsd, null);
  assert.equal(est.outputUsd, null);
  assert.equal(est.totalUsd, null, '自托管成本不同（固定 GPU），禁止按 0 计价混入总量');
});

test('pricing: 未知模型 → priced=false（fail-conservative）', () => {
  const est = estimateUsdCost('unknown-model-xyz', 100, 100);
  assert.equal(est.priced, false);
  assert.equal(est.totalUsd, null);
});

test('pricing: 价格表覆盖生产 fallback 链全部 3 模型 + 结构化安全模型', () => {
  const chain = ['qwen3.7-max-2026-05-20', 'qwen3-235b-a22b', 'qwen-plus', 'qwen-max'];
  for (const model of chain) {
    assert.ok(MODEL_PRICES[model] !== undefined, `${model} 必须在价格表中`);
  }
  assert.ok(pricedModelCount() >= 3, '至少 3 个模型有 per-token 价格（qwen3-235b 除外）');
  assert.ok(PRICING_BASELINE_DATE.length === 10, '价格基准日期须为 ISO 日期');
});

test('pricing: 输入输出价格比例合理（max 系列 > plus 系列）', () => {
  const max = MODEL_PRICES['qwen3.7-max-2026-05-20'];
  const plus = MODEL_PRICES['qwen-plus'];
  assert.ok(max !== undefined && plus !== undefined, 'max/plus 必须在价格表中');
  assert.ok((max.inputUsdPerM as number) > (plus.inputUsdPerM as number), 'max 输入价必须高于 plus');
  assert.ok((max.outputUsdPerM as number) > (plus.outputUsdPerM as number), 'max 输出价必须高于 plus');
});
