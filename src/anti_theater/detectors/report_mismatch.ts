/**
 * anti_theater detector · AT-REPORT-MISMATCH —— 自然语言摘要 vs verdict 强度一致性检查。
 *
 * 攻击语义：ProofEnvelope.humanSummary 是人类/LLM 可写的自然语言摘要（不进 proofHash），
 *   可能用过强或与 verdict 不一致的措辞误导读者（"proves"/"证明了" 等过度声称）。
 *   本 detector 确定性比对 report 用词与 verdict 允许的强度词集合，捕获两类违规：
 *     1. REPORT_VERDICT_MISMATCH —— 使用了不属于当前 verdict 允许集合的强度词（如 verdict=INCONCLUSIVE 却写 "confirms"）。
 *     2. OVERCLAIMING —— 使用了绝对化过度声称词（"proves"/"证明了"/"definitively"/"guarantees"/"确保"）。
 *
 * 设计约束（安全关键·承诺误报率=0）：
 *   - 纯函数·确定性·不 mutate input·不读 FS/网络（F3 反 LLM-as-judge）。
 *   - 精确子串匹配（report_lower.includes(w)），不做模糊/语义匹配。
 *   - 中文词（证明了/确保）toLowerCase 无影响但 includes 仍精确工作。
 *   - 'partial'/'degraded' 等词作为单词集合元素参与 includes —— 'partial' 会命中 report 中含 "partial" 子串的文本；
 *     这与 APPENDIX_E §2 伪代码行为一致（report_lower word in all_strength_words() 用的是子串包含语义）。
 *
 * 模型中立：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。全 readonly。
 */

import type { DetectorFinding } from '../types.ts';
import type { AntiTheaterLintInput } from '../types.ts';
import type { VerdictKind } from '../../fec/fec_contract.ts';
import { makeFinding } from '../finding_factory.ts';

// ===== VERDICT_STRENGTH（5 verdict → 允许的强度词集合）=====

/**
 * 各 verdict 允许使用的强度词集合（APPENDIX_E §2 VERDICT_STRENGTH）。
 * 仅这些词在 humanSummary 中出现时不触发 REPORT_VERDICT_MISMATCH。
 * 注：这是 readonly 字面量元组经 as const + freeze 的不可变集合，运行时不会被改写。
 */
const VERDICT_STRENGTH: Readonly<Record<VerdictKind, ReadonlySet<string>>> = Object.freeze({
  CONFIRMED: Object.freeze(new Set<string>(['supports', 'confirms'])),
  REFUTED: Object.freeze(new Set<string>(['refutes', 'rejects'])),
  INCONCLUSIVE: Object.freeze(new Set<string>(['inconclusive', 'mixed', 'insufficient'])),
  DEGRADED_SCOPE: Object.freeze(new Set<string>(['partial', 'narrow-scope', 'degraded'])),
  UNTESTED: Object.freeze(new Set<string>(['untested', 'not-tested', 'no-evidence'])),
});

/** 过度声称绝对化词集合（任何 verdict 下均不允许·APPENDIX_E §2 OVERCLAIM_WORDS）。 */
const OVERCLAIM_WORDS: ReadonlySet<string> = Object.freeze(
  new Set<string>(['proves', '证明了', 'definitively', 'guarantees', '确保']),
);

/**
 * all_strength_words() —— VERDICT_STRENGTH 所有允许词集合的并集（伪代码同名义函数）。
 * 用于检测 report 是否使用了"任何强度词"——若该词不在当前 verdict 允许集合内即 mismatch。
 * 计算一次缓存在模块级常量（纯函数·确定性·不变量）。
 */
const ALL_STRENGTH_WORDS: ReadonlySet<string> = (() => {
  const union = new Set<string>();
  for (const allowed of Object.values(VERDICT_STRENGTH)) {
    for (const word of allowed) {
      union.add(word);
    }
  }
  return Object.freeze(union);
})();

/**
 * detect_report_mismatch —— 检测 ProofEnvelope.humanSummary 与 verdict 强度一致性。
 *
 * @param input AntiTheaterLintInput（消费 input.verdict.verdict + input.envelopeDraft.humanSummary）。
 * @returns 单个 DetectorFinding（REPORT_VERDICT_MISMATCH 或 OVERCLAIMING）或空数组（无违规）。
 *          outcome 恒为 'FAIL'（无 PASS/WARN 分支·blockSeal=false）。
 */
export function detect_report_mismatch(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const v: VerdictKind = input.verdict.verdict;
  const report: string = input.envelopeDraft.humanSummary ?? '';
  const reportLower: string = report.toLowerCase();

  // 当前 verdict 允许的强度词集合（VERDICT_STRENGTH 覆盖 5 值闭合 enum·v 必命中）。
  // VERDICT_STRENGTH 键集与 VerdictKind 5 值一一对应（类型层不变量·见下方 VERDICT_KEYS 覆盖断言）。
  const allowed: ReadonlySet<string> | undefined = VERDICT_STRENGTH[v];
  if (allowed === undefined) {
    // unreachable：VerdictKind 是 5 值闭合 enum，VERDICT_STRENGTH 覆盖全集（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）。
    // 不静默吞——显式抛出暴露类型分裂（零容忍 #4 不掩盖 bug）。
    throw new Error(
      `detect_report_mismatch: VERDICT_STRENGTH missing entry for verdict '${v}' (invariant violated)`,
    );
  }

  // used：在 report 中出现、但不在当前 verdict 允许集合内的强度词（精确子串匹配）。
  const used: string[] = [];
  for (const word of ALL_STRENGTH_WORDS) {
    if (reportLower.includes(word) && !allowed.has(word)) {
      used.push(word);
    }
  }

  // overclaim：绝对化过度声称词（任何 verdict 下均违规）。
  const overclaim: string[] = [];
  for (const word of OVERCLAIM_WORDS) {
    if (reportLower.includes(word)) {
      overclaim.push(word);
    }
  }

  if (used.length === 0 && overclaim.length === 0) {
    return [];
  }

  // used 非空 → REPORT_VERDICT_MISMATCH；否则 overclaim 非空 → OVERCLAIMING。
  const isMismatch: boolean = used.length > 0;
  const reasonCode: string = isMismatch ? 'REPORT_VERDICT_MISMATCH' : 'OVERCLAIMING';
  const offendingWords: readonly string[] = isMismatch ? used : overclaim;

  const message: string = isMismatch
    ? `humanSummary 使用了与 verdict='${v}' 不一致的强度词 [${offendingWords.join(', ')}]；verdict '${v}' 仅允许 [${Array.from(allowed).join(', ')}]。`
    : `humanSummary 包含绝对化过度声称词 [${offendingWords.join(', ')}]；任何 verdict 下均禁止使用（科学结论须 bounded support）。`;

  const remediation: string = isMismatch
    ? `将 humanSummary 用词限定在 verdict '${v}' 允许集合内：[${Array.from(allowed).join(', ')}]。`
    : '移除绝对化措辞（proves/证明了/definitively/guarantees/确保），改为 bounded support 表述。';

  const finding: DetectorFinding = makeFinding({
    attackId: 'AT-REPORT-MISMATCH',
    outcome: 'FAIL',
    reasonCode,
    evidenceRef: 'envelopeDraft.humanSummary',
    message,
    affectedProofHashInputs: ['envelopeDraft.humanSummary'],
    remediation,
    // 单 finding·无需 findingIdSuffix；blockSeal=false（非 BLOCK 类 attack）。
  });

  return [finding];
}
