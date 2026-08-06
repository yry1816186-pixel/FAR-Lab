/**
 * verdict_hints —— 裁决 kind → 抽象修正方向提示映射（共享单一真相源）。
 *
 * 消费方：
 *   - stage6_feedback（IC-15 T1'·跨 run 先验裁决软建议）
 *   - stage3_hypothesis（V2 裁决驱动反馈边·循环内中间裁决软建议）
 *
 * 最小信息原则（security-auditor C2 缓解）：仅传 5 值枚举本身 + 一句抽象修正方向；
 * 禁传 reasonCode / metricValue / threshold（防 LLM 反推裁决逻辑构造"刚好过"假设·
 * adversarial hypothesis generation）。
 *
 * 软建议语义：注入时 prompt 明示"仅供参考"，LLM 仍独立判断。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { Verdict } from '../schema/enums.ts';

/** 裁决 kind → 抽象修正方向提示（只读·禁在业务代码中改写）。 */
export const VERDICT_KIND_TO_HINT: Readonly<Record<Verdict, string>> = {
  CONFIRMED: 'prior iteration produced CONFIRMED; consider whether the hypothesis is sufficiently refined and whether to converge.',
  REFUTED: 'prior iteration produced REFUTED; the deterministic kernel found evidence against the claim. Consider whether a substantively different claim direction is warranted.',
  INCONCLUSIVE: 'prior iteration produced INCONCLUSIVE; evidence is mixed or insufficient. Consider tightening or narrowing the claim scope, or gathering different evidence.',
  DEGRADED_SCOPE: 'prior iteration produced DEGRADED_SCOPE; evidence is narrower than the claim. Consider narrowing the claim scope or broadening the evidence base.',
  UNTESTED: 'prior iteration produced UNTESTED; no decision path was reached. Consider refining the falsification contract or the evidence coverage.',
} as const;
