/**
 * Competition FallbackChain 链定义（spec 24 §5 canonical · 05 §8.2）。
 *
 * 链路（3 元素 Qwen-only · spec 24 §5 · 2026-06 已删 deepseek 第4档·对齐 02 §C2）：
 *   qwen3.7-max-2026-05-20  (primary · competition profile 锁定)
 *        │ 维护期/不可用
 *        ▼
 *   qwen3-235b-a22b  (backup_1 · vLLM 自托管备)
 *        │ 不可用
 *        ▼
 *   qwen-plus  (backup_2 · 终止档)
 *        │ 三档全不可用
 *        ▼
 *   verdict = UNTESTED + reason = no_qwen_family_available
 *   （绝不切非 Qwen 基座·deepseek 已删·02 §C2 / 31 §4.4·§7.5 D3 红线）
 *
 * 规则（spec 24 §5）：
 *   - 每次降级在 call_records 记 degraded_from + reason + trigger_signal；verdict 落 DEGRADED_SCOPE。
 *   - 三档全失败处置（2026-06 已删 deepseek 第4档）：Qwen 家族三档全不可用 →
 *     caller 消费 executeFallbackChain 返回的 chainExhausted=true →
 *     verdict=UNTESTED + NO_QWEN_FAMILY_AVAILABLE_REASON（绝不切非国产基座）。
 *   - 绝不静默换：换模型必标注（反 theater F11）。
 *
 * evo-01 修复（2026-06-29·审计裁决·live 红线冲突）：原 4 元素链含 deepseek-fallback
 *   last_resort（invalidatesD3=true）。spec 24 §5 已于 2026-06 删 deepseek 第4档
 *   （02 §C2 拍板·fallback 不越 Qwen 家族·31 §10.2 收敛），代码落后于 SSOT——
 *   生产链仍可切 deepseek 即失 D3 红线。本次对齐：删 deepseek → 3 元素 Qwen-only，
 *   exhaust 路径接 verdict=UNTESTED + no_qwen_family_available（F11/C2 诚实报告，
 *   不静默删，不假切）。引擎层 invalidatesD3 通用机制保留（防御性，见 fallback_chain/types.ts）。
 *
 * 注意：digest F-05-17 记录的最小链是 2 元素（qwen3.7-max → qwen3-235b），
 *   spec 24 §5（风险降级 SSOT·更权威）扩展为 3 元素含 qwen-plus 兜底（无 deepseek）。
 *
 * 生产 caller 接线状态（2026-07 更新）：qwen_adapter.ts:133（文本）+ qwen_vl_adapter.ts:342（VL）
 *   均已编排 executeFallbackChain：穿透 429/5xx/timeout/network + chainExhausted→RETRY_EXHAUSTED
 *   (NO_QWEN_FAMILY_AVAILABLE_REASON) + fatalEncountered→BailianHttpError + degradedFrom 进 adapterMeta。
 *   物证：fallback_real_http.test.ts（本地 proof server·credential-free）+ credential_dual_run.mjs（凭据门）。
 * stage 级消费现状：adapter chainExhausted→抛 RETRY_EXHAUSTED(NO_QWEN_FAMILY_AVAILABLE_REASON)；
 *   fsm_runner.runAgentLoop 捕获入 LoopState.error(reason='error'·永不抛·fsm_runner.ts:108)，
 *   尚未将该 reason 翻译为 verdict=UNTESTED（设计层缺口，非 adapter 层·P1-2 proof_caller=adapter 已闭合）。
 *
 * 零容忍合规。本文件含 qwen 字面量——合规（model-neutral 红线 scope = src/api/，
 *   qwen 字面量在 adapters/aliyun_qwen/ 本就允许）。
 */

import type { FallbackModelTarget } from '../../fallback_chain/types.ts';

/** Competition profile primary model（链首位 · 单一来源，禁重复定义字面量）。 */
export const COMPETITION_PRIMARY_MODEL_ID = 'qwen3.7-max-2026-05-20';

/**
 * 三档全失败 reason 字面量（spec 24 §5）。
 * Qwen 家族三档全不可用时，caller 落 verdict=UNTESTED + 此 reason（绝不切非国产基座）。
 * 导出为 SSOT 常量供未来 caller 引用，禁重复定义字面量。
 */
export const NO_QWEN_FAMILY_AVAILABLE_REASON = 'no_qwen_family_available';

/**
 * Competition profile 降级链（3 元素 Qwen-only · spec 24 §5）。
 * 唯一 qwen 链 SSOT——其它处引用须 import 本常量，禁重复定义。
 * 三档全失败 → caller 消费 executeFallbackChain 的 chainExhausted=true
 *   → verdict=UNTESTED + NO_QWEN_FAMILY_AVAILABLE_REASON（24 §5 · 绝不切非国产基座）。
 */
export const COMPETITION_FALLBACK_CHAIN: readonly FallbackModelTarget[] = [
  { modelId: COMPETITION_PRIMARY_MODEL_ID, role: 'primary' },
  { modelId: 'qwen3-235b-a22b', role: 'backup_1' },
  { modelId: 'qwen-plus', role: 'backup_2' },
];
