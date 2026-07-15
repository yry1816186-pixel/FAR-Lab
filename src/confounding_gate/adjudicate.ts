/**
 * confounding_gate/adjudicate —— 三值混杂裁决 + outcome→verdict 共享映射（§7.5.1 (3) + §7.5:955-961）。
 *
 * 职责：
 *   1. adjudicateConfounding(causalModel, exposure, outcome) → ConfoundingGateResult（确定性·无 LLM）。
 *      buildDag → blockBackdoorPaths → outcome 三值（PASS/WARN/FAIL）+ 8 字段结果。
 *   2. confoundingOutcomeVerdictEffect(outcome, evidenceBasis, baseWouldConfirm) → { verdictEffect, reasonCodes }。
 *      封装 §7.5:955-961 outcome→verdict 表，**kernel R-causal 门** 与 **science_harness decideVerdictWithConfounding**
 *      共用（决策 D·消除两处重复实现同一 SSOT 表）。
 *
 * F6 红线：全程确定性（d-separation + 后门路径）·非 LLM 推理混杂（CG-1 grep 守卫）。
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯函数（不 mutate 输入 CausalModel）。
 */

import { buildDag } from './dag.ts';
import { blockBackdoorPaths } from './backdoor.ts';
import { generateRationale } from './rationale.ts';
import type {
  BackdoorPath,
  ConfoundingGateResult,
  ConfoundingOutcome,
  CausalModel,
  EvidenceBasis,
} from './types.ts';

// ---------------------------------------------------------------------------
// adjudicateConfounding —— §7.5.1 (3) 三值 outcome
// ---------------------------------------------------------------------------

/**
 * 确定性混杂裁决（PASS/WARN/FAIL）。全程无 LLM。
 *
 * outcome 口径（§7.5:949-953）：
 *   - PASS = 无未阻断后门路径（所有后门路径被 controlledConfounders 阻断·d-separation 成立）。
 *   - WARN = 存在未阻断后门路径但 unmeasuredConfoundersSuspected 为空（路径未阻断但变量全测）。
 *   - FAIL = 存在未阻断后门路径且 unmeasuredConfoundersSuspected 非空（存在未测量的未阻断混杂）。
 *
 * @param causalModel 因果模型（nodes/edges/controlledConfounders/unmeasuredConfoundersSuspected）。
 * @param exposure 暴露/intervention nodeId。
 * @param outcome 结局 nodeId。
 */
export function adjudicateConfounding(
  causalModel: CausalModel,
  exposure: string,
  outcome: string,
): ConfoundingGateResult {
  const dag = buildDag(causalModel); // CG-2 acyclic fail-closed（含环 throw）
  // 单次枚举 + 分桶（backdoorPaths = blocked ∪ unblocked·partition union = 全部后门路径·无重复）。
  const { blocked, unblocked } = blockBackdoorPaths(dag, exposure, outcome, causalModel);
  const backdoorPaths: readonly BackdoorPath[] = [...blocked, ...unblocked];
  const suspected = [...causalModel.unmeasuredConfoundersSuspected].sort();

  // outcome 三值（§7.5.1:1111-1116）。
  const outcomeVal: ConfoundingOutcome =
    unblocked.length === 0 ? 'PASS' : suspected.length === 0 ? 'WARN' : 'FAIL';

  // 混淆子归属（排除 exposure/outcome·sorted·去重）。
  const stripEndpoints = (paths: readonly (readonly string[])[]): readonly string[] =>
    [...new Set(paths.flat())].filter((n) => n !== exposure && n !== outcome).sort();

  return {
    outcome: outcomeVal,
    unblockedConfounders: stripEndpoints(unblocked),
    blockedConfounders: stripEndpoints(blocked),
    unmeasuredConfounders: suspected,
    backdoorPaths,
    blockedPaths: blocked,
    unblockedPaths: unblocked,
    rationale: generateRationale(outcomeVal, stripEndpoints(unblocked), suspected),
  };
}

// ---------------------------------------------------------------------------
// confoundingOutcomeVerdictEffect —— §7.5:955-961 outcome→verdict 共享映射（决策 D）
// ---------------------------------------------------------------------------

/** outcome→verdict 效应判别联合（kernel 与 science_harness 共用·决策 D）。 */
export type ConfoundingVerdictEffect =
  | 'none' // PASS·或 WARN 但本就不会 CONFIRMED → 不改 verdict
  | 'degrade_to_degraded_scope' // FAIL → 降 DEGRADED_SCOPE（F2 优先级最高）
  | 'downgrade_to_inconclusive'; // WARN + 本会 CONFIRMED → 降 INCONCLUSIVE

/** confoundingOutcomeVerdictEffect 返回（verdictEffect + reasonCodes）。 */
export interface ConfoundingVerdictEffectResult {
  readonly verdictEffect: ConfoundingVerdictEffect;
  readonly reasonCodes: readonly string[];
}

/**
 * 封装 §7.5:955-961 outcome→verdict 效应表（kernel R-causal 门 + science_harness 共用·决策 D）。
 *
 * @param outcome ConfoundingGate 三值裁决。
 * @param evidenceBasis 证据基础（F6 红线）。'observational_only' + FAIL → 追加 F6_CAUSAL_HONESTY reasonCode。
 * @param baseWouldConfirm 不含 ConfoundingGate 时该 claim 本会 CONFIRMED 吗（kernel 传 r7Pass·harness 传 base.verdict==='CONFIRMED'）。
 * @returns { verdictEffect, reasonCodes }。
 */
export function confoundingOutcomeVerdictEffect(
  outcome: ConfoundingOutcome,
  evidenceBasis: EvidenceBasis | undefined,
  baseWouldConfirm: boolean,
): ConfoundingVerdictEffectResult {
  switch (outcome) {
    case 'PASS':
      // §7.5:955 PASS → 不影响 verdict（无未阻断混杂）。
      return { verdictEffect: 'none', reasonCodes: [] };
    case 'WARN':
      // §7.5:957 WARN + 本会 CONFIRMED → 降 INCONCLUSIVE；否则 no-op（本就不会 CONFIRMED）。
      if (baseWouldConfirm) {
        return { verdictEffect: 'downgrade_to_inconclusive', reasonCodes: ['R_CAUSAL_CONFOUNDING_WARN'] };
      }
      return { verdictEffect: 'none', reasonCodes: [] };
    case 'FAIL':
      // §7.5:959 FAIL → 降 DEGRADED_SCOPE（无论 baseWouldConfirm·F2 优先级 DEGRADED_SCOPE > CONFIRMED）。
      // observational_only + FAIL → 追加 F6_CAUSAL_HONESTY（相关 ≠ 因果·F6 因果红线）。
      return {
        verdictEffect: 'degrade_to_degraded_scope',
        reasonCodes:
          evidenceBasis === 'observational_only'
            ? ['R_CAUSAL_CONFOUNDING_FAIL', 'F6_CAUSAL_HONESTY']
            : ['R_CAUSAL_CONFOUNDING_FAIL'],
      };
    default: {
      // 穷尽 switch（ConfoundingOutcome 三值）。defensive: 不应到达。
      const exhaustive: never = outcome;
      throw new Error(`confoundingOutcomeVerdictEffect: unhandled ConfoundingOutcome '${String(exhaustive)}'`);
    }
  }
}
