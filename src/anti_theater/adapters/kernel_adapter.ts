/**
 * anti_theater adapters —— 存储型 AntiTheaterFinding ↔ verdict kernel 输入投影型 转换。
 *
 * 投影规则（D2 存储轴 → kernel 派生展示轴）：
 *   - kind: attackKind kebab-case 字面量直接透传（存储型与 kernel 共用闭合 enum 字面量·窄→宽赋值合法）。
 *   - severity: outcome FAIL→'fail'（R7→UNTESTED）/ WARN→'warn'（R8 INCONCLUSIVE）/ PASS,SKIP→'pass'（无影响）。
 *   - details: stored.message 透传。
 *
 * 为什么需要 adapter（D1 类型统一）：kernel 消费的是轻量投影型（3 字段），存储型是 6 字段权威型；
 * 分离避免 kernel 依赖存储细节，adapter 单点承载投影逻辑（铁律 #1 类型不分裂）。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。纯函数（不 mutate 输入）。
 */

import type { ProofCheckOutcome } from '../../schema/enums.ts';
import type { AntiTheaterFinding } from '../types.ts';
import type {
  KernelAntiTheaterFinding,
  KernelAntiTheaterFindingSeverity,
} from '../../falsifiability/verdict_kernel_v2.ts';

/**
 * 存储轴 outcome → kernel 派生展示轴 severity（D2 投影）。
 * SKIP（detector 未运行·如 optional prereg 记录缺失）视为 pass（不阻断裁决·与 R0-R9 规则表一致）。
 */
function outcomeToKernelSeverity(outcome: ProofCheckOutcome): KernelAntiTheaterFindingSeverity {
  switch (outcome) {
    case 'FAIL':
      return 'fail';
    case 'WARN':
      return 'warn';
    case 'PASS':
      return 'pass';
    case 'SKIP':
      return 'pass';
  }
}

/**
 * 存储型 AntiTheaterFinding → kernel 输入投影型 KernelAntiTheaterFinding。
 * 单点投影（attackKind 透传 / outcome→severity / message→details）。
 */
export function toKernelFinding(stored: AntiTheaterFinding): KernelAntiTheaterFinding {
  return {
    kind: stored.attackKind,
    severity: outcomeToKernelSeverity(stored.outcome),
    details: stored.message,
  };
}

/**
 * 批量投影（lint 聚合后 AntiTheaterReport.findings → VerdictKernelInput.antiTheaterFindings）。
 * 顺序保持（kernel 不依赖顺序，但确定性产出·golden vector 对拍要求稳定顺序）。
 */
export function toKernelFindings(
  storeds: readonly AntiTheaterFinding[],
): readonly KernelAntiTheaterFinding[] {
  return storeds.map(toKernelFinding);
}
