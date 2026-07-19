/**
 * anti_theater detector —— AT-JUDGE-OVERRIDE（LLM/评审者作为最终裁决者）。
 *
 * 攻击语义：当 verdict kernel 的 integrityFlags 出现 'llm' / 'judge' 标记时，
 *   意味着 LLM 或人工评审者的输出进入了 verdict-critical 路径（可能升 CONFIRMED/REFUTED），
 *   违反 F3（全程无 LLM）+ R7（integrityFlags 必须为空才能 CONFIRMED）。本检测器确定性识别并 BLOCK。
 *
 * 关键裁决（D4·必须遵循）：
 *   - VKO 无 verdictNodes / proofChecks 字段。改读 verdict.integrityFlags（kernel 输出·§7.2）。
 *   - integrityFlags 任一含 'llm' / 'judge'（case-insensitive 子串）→ BLOCK。
 *
 * 防线定位（诚实边界）：
 *   - 主防线 = CI 静态扫描 `no_llm_final_judge_scan`（在 verdict kernel 代码库 grep LLM 调用·commit-time 拦截）。
 *   - 辅防线（本检测器）= 运行时基于 integrityFlags 的确定性检查。MVP 仅实现辅防线。
 *   - 两者互补：CI 拦截源码层 LLM 调用，runtime 拦截被注入 integrityFlags 的运行时标记。
 *
 * 模型中立（F3/C1）：本文件无 qwen / dashscope / openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数（不 mutate input / 不读 FS / 不联网）。
 * 确定性：相同输入恒定产出（W3 DOD 攻击可重复 / 误报率=0）。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** APPENDIX_E §2 attackId（makeFinding 自动映射为 attackKind 'llm-reviewer-override'）。 */
const ATTACK_ID = 'AT-JUDGE-OVERRIDE';

/** 触发关键词（lowercase 子串匹配）。 */
const LLM_JUDGE_MARKERS: readonly string[] = ['llm', 'judge'];

/**
 * 检测 verdict.integrityFlags 是否含 LLM/评审者标记。
 *
 * @param input AntiTheaterLintInput（消费 input.verdict.integrityFlags）。
 * @returns 单条 BLOCK finding（outcome=FAIL / blockSeal=true）或空数组。
 *   空数组 = 无发现（integrityFlags 不含 llm/judge 标记，或为空）。
 */
export function detect_judge_override(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const flags: readonly string[] = input.verdict.integrityFlags;

  for (const flag of flags) {
    const lower = flag.toLowerCase();
    if (LLM_JUDGE_MARKERS.some((marker) => lower.includes(marker))) {
      const finding: DetectorFinding = makeFinding({
        attackId: ATTACK_ID,
        outcome: 'FAIL',
        blockSeal: true,
        reasonCode: 'LLM_AS_FINAL_JUDGE',
        evidenceRef: `verdict.integrityFlags:${flag}`,
        message: `verdict integrity flag '${flag}' indicates LLM/judge output entered the verdict-critical path (F3/R7 violation)`,
        affectedProofHashInputs: ['verdictTrace.integrityFlags'],
        remediation:
          'Remove the LLM/judge-produced flag from verdict.integrityFlags; verdict must be produced by deterministic rule trace only. CI guard no_llm_final_judge_scan is the primary defense.',
      });
      return [finding];
    }
  }

  return [];
}
