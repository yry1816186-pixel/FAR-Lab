/**
 * anti_theater detector —— AT-STOPPING-RULE（停止规则违规 / 未登记的提前停止）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_stopping_rule 伪代码）+
 *            APPENDIX_A_TYPES.md §7（AntiTheaterFinding 存储型）。
 *
 * 检查内容（伪代码三段子路径，list 型，全部 outcome='FAIL'）：
 *   1. stoppingRule 类型近似为 'fixed_n' 且 interim_looks > 1
 *      → STOPPING_RULE_VIOLATION（findingIdSuffix='-INTERIM_FIXED_N'，
 *        affected=['executionTrace.runs (interim looks)']）。
 *      fixed_n 设计为单次终态分析，多次 interim look = peeking（p-hacking 入口）。
 *   2. stoppingRule 类型近似为 'none_declared' 且 interim_looks > 1
 *      → STOPPING_RULE_VIOLATION（findingIdSuffix='-INTERIM_NONE_DECLARED'，
 *        affected=['fec.statisticalPlan.stoppingRule']）。
 *      未声明停止规则却发生多次 interim look = 可选停止（optional stopping）风险。
 *   3. declaredEarlyStops 中未登记的实际 early-stop run
 *      → UNREGISTERED_EARLY_STOP（findingIdSuffix='-UNREGISTERED_<runId>'，
 *        affected=['executionTrace.runs[<runId>]']）。
 *      实际提前停止未在预注册声明 = post-hoc 改变停止决策。
 *
 * D12 适配裁决（PARTIAL / W4 ROADMAP）：
 *   - FEC statisticalPlan.stoppingRule 是**裸 string**（无结构化 type/declaredEarlyStops 字段）。
 *     本 detector 对 string 做关键词近似归类（非结构化字段比对）：
 *       · toLowerCase().includes('group_sequential') → 'group_sequential'
 *       · toLowerCase().includes('alpha_spending')   → 'alpha_spending'
 *       · toLowerCase().includes('fixed')            → 'fixed_n'
 *       · 否则                                          → 'none_declared'
 *     注：'group_sequential' / 'alpha_spending' 类规则声明了正当 spending，
 *         本 detector 仅对 'fixed_n' / 'none_declared' 触发违规；这两种合法类型不产 finding。
 *   - declaredEarlyStops 无法从 string 推断 → 退化为空集（PARTIAL）。
 *     因此 UNREGISTERED_EARLY_STOP 子路径：任何实际 early-stopped 的 interim run 均视为未登记。
 *     W4 升级方向：FEC schema 增加 declaredEarlyStops 结构化字段后，本 detector 恢复 set 差集逻辑。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。computedBy='deterministic_compiler'。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 * 安全关键（承诺误报率=0）：仅在确证的违规模式（fixed_n/none_declared + 多次 interim look；
 *   或实际 early-stop run）下产 FAIL，无字段时不臆造。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** APPENDIX_E §2 attackId（makeFinding 经 ATTACK_ID_TO_KIND 自动映射到 'stopping-rule-violation'）。 */
const ATTACK_ID = 'AT-STOPPING-RULE';

/** stoppingRule 关键词近似归类后的内部分类值（对齐 D12·非 FEC schema 字段）。 */
type StoppingRuleKind = 'group_sequential' | 'alpha_spending' | 'fixed_n' | 'none_declared';

/**
 * 把 FEC statisticalPlan.stoppingRule（裸 string）按 D12 关键词近似归类。
 *
 * 关键词优先级（先于 'fixed' 判定·避免 'group_sequential' 被 'fixed' 截胡的边界）：
 *   group_sequential > alpha_spending > fixed_n > none_declared
 * 注意：'fixed' 子串可能在自由文本中出现，归类仅作启发式（PARTIAL）。
 */
function classifyStoppingRule(srStr: string): StoppingRuleKind {
  const lower = srStr.toLowerCase();
  if (lower.includes('group_sequential')) {
    return 'group_sequential';
  }
  if (lower.includes('alpha_spending')) {
    return 'alpha_spending';
  }
  if (lower.includes('fixed')) {
    return 'fixed_n';
  }
  return 'none_declared';
}

/**
 * detect_stopping_rule —— 停止规则违规检测（list 型·多 finding）。
 *
 * @param input AntiTheaterLintInput（消费 input.fec.statisticalPlan.stoppingRule + input.executionTrace.runs）。
 * @returns DetectorFinding[]（无发现时返回 []）。
 */
export function detect_stopping_rule(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  const srStr: string = input.fec.statisticalPlan.stoppingRule;
  const kind = classifyStoppingRule(srStr);

  const interimLooks = input.executionTrace.runs.filter((r) => r.isInterim);

  // 子路径 1：fixed_n + 多次 interim look（peeking 风险）。
  if (kind === 'fixed_n' && interimLooks.length > 1) {
    findings.push(
      makeFinding({
        attackId: ATTACK_ID,
        outcome: 'FAIL',
        reasonCode: 'STOPPING_RULE_VIOLATION',
        evidenceRef: 'executionTrace.runs',
        message:
          `FEC declares a fixed_n stopping rule but executionTrace contains ${interimLooks.length} interim looks; ` +
          `fixed_n permits only a single terminal analysis (multiple interim looks = peeking).`,
        affectedProofHashInputs: ['executionTrace.runs (interim looks)'],
        findingIdSuffix: 'INTERIM_FIXED_N',
      }),
    );
  }

  // 子路径 2：none_declared + 多次 interim look（optional stopping 风险）。
  if (kind === 'none_declared' && interimLooks.length > 1) {
    findings.push(
      makeFinding({
        attackId: ATTACK_ID,
        outcome: 'FAIL',
        reasonCode: 'STOPPING_RULE_VIOLATION',
        evidenceRef: 'fec.statisticalPlan.stoppingRule',
        message:
          `FEC declares no stopping rule but executionTrace contains ${interimLooks.length} interim looks; ` +
          `multiple interim looks without a declared spending rule is optional stopping (p-hacking risk).`,
        affectedProofHashInputs: ['fec.statisticalPlan.stoppingRule'],
        findingIdSuffix: 'INTERIM_NONE_DECLARED',
      }),
    );
  }

  // 子路径 3：未登记的实际 early-stop run（D12 PARTIAL：declaredEarlyStops 无法从 string 推断，
  // declared_stops 退化为空集 → 任何实际 early-stopped interim run 均视为未登记）。
  const declaredStops: ReadonlySet<string> = new Set<string>(); // D12 PARTIAL：空集（无法从 string 推断）
  for (const run of interimLooks) {
    if (run.earlyStopped && !declaredStops.has(run.runId)) {
      findings.push(
        makeFinding({
          attackId: ATTACK_ID,
          outcome: 'FAIL',
          reasonCode: 'UNREGISTERED_EARLY_STOP',
          evidenceRef: `executionTrace.runs[${run.runId}]`,
          message:
            `Interim run '${run.runId}' earlyStopped=true but is not registered in FEC declaredEarlyStops ` +
            `(D12 PARTIAL: declaredEarlyStops cannot be inferred from the string stoppingRule; ` +
            `W4 will restore the set-difference check once FEC adds a structured field).`,
          affectedProofHashInputs: [`executionTrace.runs[${run.runId}]`],
          findingIdSuffix: `UNREGISTERED_${run.runId}`,
        }),
      );
    }
  }

  return findings;
}
