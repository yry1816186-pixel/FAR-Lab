/**
 * fec_mandate —— FEC V2 强制门禁（fail-closed mandate gate）。
 *
 * Authority: PROJECT_PLAN/03 §2.3（编译失败的诚实降级）+ 10_DEV_ENTRYPOINT W2-A（FEC V2 强制路径）。
 *
 * 职责：当 claim 缺少有效 FEC 或 FEC 编译失败时，强制 fail-closed（禁 CONFIRMED/REFUTED）。
 *   - 编译通过 → allowed=true（verdict 交 kernel 运行时定）。
 *   - HARD_FAIL_UNTESTED → allowed=false, verdict=UNTESTED, ciBlocked=false（F1 反 theater）。
 *   - HARD_FAIL_CI_BLOCK（LLM_FROZEN）→ allowed=false, ciBlocked=true（§2.3 CI 直接阻断·禁静默吞 LLM-as-judge）。
 *
 * 这是 W2-A 强制路径的 deterministic 执行点：caller（orchestrator/CI）必须调用本 gate，
 * 否则 claim 可绕过 FEC 直接落 verdict（违反 F1）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */

import type { Verdict } from '../schema/enums.ts';
import type { CompileFecResult, VerdictKind } from './fec_contract.ts';

/** 门禁决策（caller 据此决定继续 / 降级 / CI 阻断）。 */
export interface FecGateDecision {
  /** true=编译通过，可继续走 kernel；false=编译失败或被阻断。 */
  readonly allowed: boolean;
  /** fail-closed verdict（allowed=false 时为 UNTESTED；allowed=true 时为 fallbackVerdict 占位）。 */
  readonly verdict: VerdictKind;
  /** true=CI 阻断（LLM_FROZEN），caller 须 throw/exit（§2.3 禁走 verdict 降级）。 */
  readonly ciBlocked: boolean;
  /** 触发原因（allowed=false 时非空，含 reasonCode 清单）。 */
  readonly reason: string;
}

/**
 * enforceFecMandatoryGate —— FEC V2 强制门禁（03 §2.3）。
 *
 * @param compileResult compileFec 的返回（ok=true/false）
 * @param fallbackVerdict allowed=true 时的占位 verdict（默认 UNTESTED·交 kernel 覆盖）
 * @returns FecGateDecision
 */
export function enforceFecMandatoryGate(
  compileResult: CompileFecResult,
  fallbackVerdict: Verdict = 'UNTESTED',
): FecGateDecision {
  if (compileResult.ok) {
    return {
      allowed: true,
      verdict: fallbackVerdict,
      ciBlocked: false,
      reason: 'FEC 编译通过，verdict 交 kernel 运行时定',
    };
  }

  // ok=false：检查是否有 CI 阻断级 error（LLM_FROZEN）。
  const ciBlockError = compileResult.errors.find((e) => e.severity === 'HARD_FAIL_CI_BLOCK');
  if (ciBlockError !== undefined) {
    // §2.3：LLM_FROZEN → CI 直接阻断，不走 verdict 降级（否则 LLM-as-judge 被静默吞）。
    return {
      allowed: false,
      verdict: 'UNTESTED', // fail-closed 占位（实际 CI 阻断不产 verdict）
      ciBlocked: true,
      reason: `CI 阻断: ${ciBlockError.code} — ${ciBlockError.message}`,
    };
  }

  // HARD_FAIL_UNTESTED：fail-closed UNTESTED（F1 反 theater·禁回退 INCONCLUSIVE）。
  const codes = compileResult.errors.map((e) => e.code).join(', ');
  return {
    allowed: false,
    verdict: 'UNTESTED',
    ciBlocked: false,
    reason: `FEC 编译失败 fail-closed UNTESTED: ${codes}`,
  };
}

/**
 * assertFecGate —— CI 入口断言：ciBlocked 时 throw（§2.3 CI 直接阻断）。
 * 用于 CI/seal 路径，编译失败含 LLM_FROZEN 时直接 throw 阻断流程。
 */
export function assertFecGate(decision: FecGateDecision): void {
  if (decision.ciBlocked) {
    throw new Error(`fec_mandate.assertFecGate: ${decision.reason}`);
  }
}
