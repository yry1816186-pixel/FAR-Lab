/**
 * confounding_gate/rationale —— CG-6 纯模板因果诚信说明（无 LLM）。
 *
 * CG-6 红线：本函数 **仅字符串模板拼接**，禁止任何 LLM 调用 / openai / chat.completions / dashscope。
 * CG-1 grep 门禁 + 元测试守卫。模板措辞诚实——FAIL 时直言「因果声称无法确认」。
 *
 * 签名对齐 SSOT：generate_rationale(outcome_val, unblocked_confounders, suspected)。
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言。纯函数。
 */

import type { ConfoundingOutcome } from './types.ts';

/**
 * 生成因果诚信说明（CG-6 纯模板）。
 *
 * @param outcome 三值裁决（PASS/WARN/FAIL）。
 * @param unblockedConfounders 未阻断后门路径上的混淆子 nodeId（排除 exposure/outcome）。
 * @param unmeasuredConfounders 怀疑未测混淆子 nodeId。
 * @returns 模板拼接的中文说明（无 LLM）。
 */
export function generateRationale(
  outcome: ConfoundingOutcome,
  unblockedConfounders: readonly string[],
  unmeasuredConfounders: readonly string[],
): string {
  const unblocked = unblockedConfounders.length > 0 ? unblockedConfounders.join(', ') : '（无）';
  const suspected = unmeasuredConfounders.length > 0 ? unmeasuredConfounders.join(', ') : '（无）';

  switch (outcome) {
    case 'PASS':
      return (
        'ConfoundingGate=F6·outcome=PASS：所有后门路径均被调整集阻断（d-separation 成立）。' +
        `未阻断混淆子=${unblocked}；怀疑未测混淆子=${suspected}。` +
        '因果声称未被观测到的混杂结构削弱（确定性 d-separation·非 LLM 推理）。'
      );
    case 'WARN':
      return (
        'ConfoundingGate=F6·outcome=WARN：存在未被调整集完全阻断的后门路径，' +
        '但无怀疑未测混淆子。' +
        `未阻断混淆子=${unblocked}；怀疑未测混淆子=${suspected}。` +
        '因果解释需附条件（相关≠因果·F6 因果诚信）。'
      );
    case 'FAIL':
      return (
        'ConfoundingGate=F6·outcome=FAIL：存在未被阻断的后门路径，且怀疑存在未测混淆子。' +
        `未阻断混淆子=${unblocked}；怀疑未测混淆子=${suspected}。` +
        '在此证据结构下因果声称无法被确认（确定性 d-separation·非 LLM 推理·F6 因果红线）。'
      );
    default: {
      // 穷尽 switch（ConfoundingOutcome 三值）。defensive: 不应到达。
      const exhaustive: never = outcome;
      throw new Error(`generateRationale: unhandled ConfoundingOutcome '${String(exhaustive)}'`);
    }
  }
}
