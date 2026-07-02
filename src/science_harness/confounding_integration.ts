/**
 * science_harness/confounding_integration —— F6 因果门与 verdict_mapping 的集成（决策 E·§7.5 伪代码）。
 *
 * decideVerdictWithConfounding(base, confounding, evidenceBasis)：
 *   在 mapChecksToVerdict 产出的 base verdict 之上，叠加 ConfoundingGate 裁决，产出最终 verdict。
 *   - PASS → 原样返回 base（无未阻断混杂·不影响 verdict）。
 *   - WARN + base.verdict==='CONFIRMED' → 降 INCONCLUSIVE（route 'mixed'·本会 CONFIRMED 被混杂降级）。
 *   - WARN + base.verdict!=='CONFIRMED' → 原样返回 base（本就不会 CONFIRMED·no-op）。
 *   - FAIL → DEGRADED_SCOPE（route 'scope_narrow'·integrityFlags 追加 'causal_confounding'·
 *     observational_only 时 confoundingOutcomeVerdictEffect 已追加 F6_CAUSAL_HONESTY reasonCode）。
 *
 * 共享映射：调 confounding_gate.confoundingOutcomeVerdictEffect（决策 D·kernel R-causal 门与本函数共用），
 *   消除两处重复实现 §7.5:955-961 outcome→verdict 表。
 *
 * Authority: PROJECT_PLAN/03 §7.5（ConfoundingGate 与 verdict 集成）+ 任务 #12 决策 D/E。
 * 模型中立。零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。纯函数（不 mutate base）。
 */

import type { VerdictMappingResult } from './types.ts';
import type { ConfoundingGateResult, EvidenceBasis } from '../confounding_gate/types.ts';
import { confoundingOutcomeVerdictEffect } from '../confounding_gate/adjudicate.ts';

/**
 * 在 base verdict 之上叠加 ConfoundingGate F6 裁决，产出最终 verdict（§7.5·决策 E）。
 *
 * @param base mapChecksToVerdict 产出的 verdict（不含因果门）。
 * @param confounding adjudicateConfounding 产出的 ConfoundingGateResult。
 * @param evidenceBasis 证据基础（F6 红线· observational_only + FAIL → 追加 F6_CAUSAL_HONESTY）。
 * @returns 应用 F6 映射后的最终 VerdictMappingResult。
 */
export function decideVerdictWithConfounding(
  base: VerdictMappingResult,
  confounding: ConfoundingGateResult,
  evidenceBasis: EvidenceBasis,
): VerdictMappingResult {
  const baseWouldConfirm = base.verdict === 'CONFIRMED';
  const effect = confoundingOutcomeVerdictEffect(confounding.outcome, evidenceBasis, baseWouldConfirm);

  switch (effect.verdictEffect) {
    case 'none':
      // PASS·或 WARN 但本就不会 CONFIRMED → 不改 verdict（保 base.integrityFlags）。
      return base;
    case 'downgrade_to_inconclusive':
      // WARN + 本会 CONFIRMED → 降 INCONCLUSIVE（route 'mixed'·混杂使声称无法确认）。
      // 注：此 INCONCLUSIVE 源自 F6 WARN（非 check 级 mixed）；route 'mixed' 是 INCONCLUSIVE 的既有 bucket。
      return {
        verdict: 'INCONCLUSIVE',
        route: 'mixed',
        integrityFlags: base.integrityFlags,
      };
    case 'degrade_to_degraded_scope': {
      // FAIL → DEGRADED_SCOPE（scope 因果降级·route 'scope_narrow'·追加 'causal_confounding' 标志）。
      // 去重：base 已含 'causal_confounding' 时不重复追加。
      const integrityFlags = base.integrityFlags.includes('causal_confounding')
        ? base.integrityFlags
        : [...base.integrityFlags, 'causal_confounding'];
      return {
        verdict: 'DEGRADED_SCOPE',
        route: 'scope_narrow',
        integrityFlags,
      };
    }
    default: {
      // 穷尽 switch（ConfoundingVerdictEffect 三值）。defensive: 不应到达。
      const exhaustive: never = effect.verdictEffect;
      throw new Error(`decideVerdictWithConfounding: unhandled verdictEffect '${String(exhaustive)}'`);
    }
  }
}
