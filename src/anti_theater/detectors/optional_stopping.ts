/**
 * anti_theater detector —— AT-OPTIONAL-STOPPING（optional stopping 无 spending function 声明）。
 *
 * 检查内容（伪代码单段子路径，outcome='FAIL'）：
 *   stoppingRule 类型 ∈ {'group_sequential', 'alpha_spending'} 但未声明 spendingFunction
 *   → OPTIONAL_STOPPING_NO_SPENDING（affected=['fec.statisticalPlan.stoppingRule.spendingFunction']）。
 *
 *   语义：group_sequential / alpha_spending 设计需绑定具体 spending function
 *   （Pocock / O'Brien-Fleming / Flemming 等）以约束逐次 interim look 的 alpha 消耗。
 *   声明了该停止规则族却未给 spending function = 可自由选择终止时机的 optional stopping 入口
 *   （名义保护 alpha，实则未约束），构成 p-hacking 风险面。
 *
 * D12 适配裁决（PARTIAL / W4 ROADMAP）：
 *   - FEC statisticalPlan.stoppingRule 是**裸 string**（无结构化 type/spendingFunction 字段）。
 *     本 detector 对 string 做关键词近似归类（非结构化字段比对），与 AT-STOPPING-RULE 同策略：
 *       · type 近似（先于 'fixed' 判定，避免误截胡）：
 *         toLowerCase().includes('group_sequential') → 'group_sequential'
 *         toLowerCase().includes('alpha_spending')   → 'alpha_spending'
 *         含 'fixed'                                 → 'fixed_n'
 *         否则                                        → 'none_declared'
 *       · spendingFunction 近似：
 *         toLowerCase() 含 'pocock' / 'obrien' / 'fleming' → 非空（truthy）
 *         否则                                              → 空
 *   - 仅当 type ∈ {'group_sequential','alpha_spending'} 且 spendingFunction 为空时触发 FAIL；
 *     'fixed_n' / 'none_declared' 不触发本检测（其风险由 AT-STOPPING-RULE 捕获）。
 *
 * MVP 范围（PARTIAL / W5 ROADMAP·§9）：
 *   - 本 detector 仅做**静态预注册检查**（读 FEC 冻结的 stoppingRule 字符串，判定是否声明了 spending）。
 *   - 完整的 alpha-spending 运行时审计（逐次 interim look 重算累积 alpha 消耗 vs 声明 spending 曲线，
 *     并与 executionTrace.runs 的实际 interim look 序列对账）为 W5 ROADMAP 工作（§9）。
 *   - 当前不读 executionTrace / 不做运行时 alpha 累积重算（与伪代码语义一致：伪代码本身仅静态字段判定）。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。computedBy='deterministic_compiler'。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 * 安全关键（承诺误报率=0）：仅在确证的「声明 group_sequential/alpha_spending 却无 spending 关键词」
 *   模式下产 FAIL；'fixed_n' / 'none_declared' / 含 spending 关键词的合法规则均不触发，无字段时不臆造。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/** APPENDIX_E §2 attackId（makeFinding 经 ATTACK_ID_TO_KIND 自动映射到 'optional-stopping-no-spending'）。 */
const ATTACK_ID = 'AT-OPTIONAL-STOPPING';

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
 * 从 stoppingRule（裸 string）近似推断是否声明了 spending function（D12 PARTIAL）。
 *
 * 关键词近似（与 AT-STOPPING-RULE 同源 D12 裁决）：
 *   toLowerCase() 含 'pocock' / 'obrien' / 'fleming' → 非空（truthy，已声明 spending）
 *   否则                                              → 空（未声明 spending）
 *
 * 误报率=0 保证：仅在「声明了 group_sequential/alpha_spending 规则族」前提下，
 *   缺这三类 canonical spending 关键词才判 FAIL；含任一关键词即视为已声明（保守不罚）。
 */
function inferSpendingFunction(srStr: string): string {
  const lower = srStr.toLowerCase();
  if (lower.includes('pocock')) {
    return 'pocock';
  }
  if (lower.includes('obrien')) {
    return "obrien-fleming";
  }
  if (lower.includes('fleming')) {
    return 'fleming';
  }
  return '';
}

/**
 * detect_optional_stopping —— optional stopping 无 spending function 检测（单 finding 或空）。
 *
 * @param input AntiTheaterLintInput（消费 input.fec.statisticalPlan.stoppingRule）。
 * @returns DetectorFinding[]（命中时单条 FAIL finding；无发现时返回 []）。
 */
export function detect_optional_stopping(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const srStr: string = input.fec.statisticalPlan.stoppingRule;
  const kind = classifyStoppingRule(srStr);
  const spendingFunction = inferSpendingFunction(srStr);

  // 仅 group_sequential / alpha_spending 规则族需要 spending function；缺则 FAIL。
  if (
    (kind === 'group_sequential' || kind === 'alpha_spending') &&
    spendingFunction === ''
  ) {
    const finding: DetectorFinding = makeFinding({
      attackId: ATTACK_ID,
      outcome: 'FAIL',
      reasonCode: 'OPTIONAL_STOPPING_NO_SPENDING',
      evidenceRef: 'fec.statisticalPlan.stoppingRule',
      message:
        `FEC declares a '${kind}' stopping rule but no spending function is named in the stoppingRule string ` +
        "(expected one of: Pocock, O'Brien-Fleming, Flemming; without a bound spending curve the rule does not " +
        'constrain interim-look alpha consumption and degenerates into optional stopping).',
      affectedProofHashInputs: ['fec.statisticalPlan.stoppingRule.spendingFunction'],
      remediation:
        `Name a canonical spending function in fec.statisticalPlan.stoppingRule ` +
        "(e.g. 'group_sequential (O'Brien-Fleming)' or 'alpha_spending (Pocock)') so interim-look alpha " +
        'consumption is bounded by a pre-registered curve.',
    });
    return [finding];
  }

  return [];
}
