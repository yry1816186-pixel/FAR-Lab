/**
 * science/research_question — SCI-QUESTION-001 研究问题结构化边界。
 *
 * 宪法条款的机器化：每个 ResearchQuestion 必须显式携带 11 个边界字段
 * （question / target phenomenon / population / temporal-spatial scope /
 * constraints / decision relevance / success criteria / exclusions / safety
 * classification / initial unknowns / required evidence standard）——
 * 缺任一字段的问题不允许进入裁决管线。问题过宽、不可证伪、指代不明时，
 * 系统确定性路由到 CLARIFY（请求澄清）/ DECOMPOSE（自动分解）/
 * UNDECIDABLE（显式标记不可判定）；UNDECIDABLE 问题的结论状态被强制
 * 封顶为 NOT_IMPLEMENTED/UNKNOWN，不得直接生成高置信结论。
 *
 * 启发式说明（诚实边界）：classifyQuestionScope 是确定性的词汇-结构
 * 启发式（范围词密度 / 目标堆叠 / 可证伪标记 / 指代与模糊量词），
 * 不是语义理解——精心改写的问题可以绕过它。它保证的是「结构上缺边界的
 * 问题进不了裁决」，不保证「通过者皆良构」。
 *
 * Cannot-prove：本模块证明问题的边界字段完备与结构信号被正确检出，
 * 不证明问题本身科学上有价值、successCriteria 语义上可操作化
 * （一个写了 "measurable" 的坏准则照样通过词法检查）——那是研究性
 * 评估层（researchability gate）与人工评审的职责。
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema：11 字段全必填（宪法逐字）
// ---------------------------------------------------------------------------

export const ResearchQuestionSchema = z.object({
  /** 研究问题原文（单一问句语义；结构堆叠由 classifyQuestionScope 检出）。 */
  question: z.string().min(1),
  /** 目标现象：被测量/被解释的可观测对象。 */
  targetPhenomenon: z.string().min(1),
  /** 人群或系统：结论适用的对象集合。 */
  populationSystem: z.string().min(1),
  /** 时间-空间范围。 */
  temporalSpatialScope: z.string().min(1),
  /** 已知约束（设计必须尊重的边界条件）。 */
  knownConstraints: z.array(z.string().min(1)).min(1),
  /** 决策相关性：答案改变什么决策。 */
  decisionRelevance: z.string().min(1),
  /** 成功判据（可测量的判定标准——无可证伪标记将触发 unfalsifiable）。 */
  successCriteria: z.array(z.string().min(1)).min(1),
  /** 排除项（显式不研究什么——排除即边界）。 */
  exclusions: z.array(z.string().min(1)).min(1),
  /** 安全分级。 */
  safetyClassification: z.string().min(1),
  /** 初始未知清单（进入时诚实登记不知道什么）。 */
  initialUnknowns: z.array(z.string().min(1)).min(1),
  /** 所需证据标准（何种证据才够裁决）。 */
  requiredEvidenceStandard: z.string().min(1),
});

export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;

// ---------------------------------------------------------------------------
// 确定性结构信号（全部词法-结构启发式；同输入恒等输出）
// ---------------------------------------------------------------------------

/** 范围词（宽度信号）。 */
const BREADTH_WORDS = /\b(all|every|any|universally|in general|across all)\b|所有|全部|普遍|总体上/gi;

/** 目标分割连接（结构信号：and/分号/逗号连接的并列目标段）。 */
const GOAL_SPLIT_RE = /\b(?:and)\b|；|;|，|以及|并且|同时/;

/** 可证伪/可测量标记（出现在 successCriteria 任一条即算有证伪面）。 */
const FALSIFIABLE_MARKERS =
  /\b(measur\w*|quantif\w*|compar\w*|test\w*|observ\w*|predict\w*|count\w*|rate|score|ratio|hazard|p\s*[<=]|ci\b|threshold)/i;

/** 不可操作化目标现象（无公共可观测语义的对象词）。 */
const NON_OPERATIONALIZABLE =
  /\b(purpose|meaning|destiny|soul|harmonious|spiritual essence|beautiful|perfection)\b|目的|意义|灵魂|宿命|和谐/gi;

/** 模糊量词（无比较锚的程度词）。 */
const VAGUE_QUALIFIERS = /\b(better|worse|significantly|sometimes|maybe|somewhat|improved)\b|更好|更差|显著|有时|某种程度/gi;

/** 比较锚（vague 词有锚即不再算 ambiguous：better *than X*）。 */
const COMPARISON_ANCHORS = /\b(than|compared to|relative to|versus|vs\.?)\b|相比|相对于|对比/i;

/** 句首指代代词（无先行词悬空指代）。 */
const LEADING_PRONOUN_RE = /^(it|this|that|they|these|those)\b/i;

/** 结构信号报告（分类必须可解释——黑箱分类即不可审计）。 */
export interface QuestionScopeSignals {
  readonly scope: 'well_formed' | 'too_broad' | 'unfalsifiable' | 'ambiguous';
  readonly signals: readonly string[];
}

/** 把问句切成并列目标段（每段 ≥2 个词才算独立目标，过滤虚段）。 */
function splitGoals(question: string): string[] {
  return question
    .split(GOAL_SPLIT_RE)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && seg.split(/\s+/).length >= 2);
}

/**
 * 确定性范围分类（SCI-QUESTION-001 核心）。优先级（最根本者先判）：
 *   unfalsifiable（无法设计判定实验）> ambiguous（对象定位失败）>
 *   too_broad（可判但单次不可判全）> well_formed。
 * 所有触发的信号都进报告；scope 取最高优先级命中。
 */
export function classifyQuestionScope(q: ResearchQuestion): QuestionScopeSignals {
  const signals: string[] = [];

  // 信号一：无可证伪标记（successCriteria 全部不含测量/比较/检验词）
  const hasFalsifiableCriterion = q.successCriteria.some((c) => FALSIFIABLE_MARKERS.test(c));
  const nonOperational = NON_OPERATIONALIZABLE.test(q.targetPhenomenon);
  if (!hasFalsifiableCriterion) signals.push('no-measurable-criterion');
  if (nonOperational) signals.push('non-operationalizable-target');
  if (!hasFalsifiableCriterion || nonOperational) {
    return { scope: 'unfalsifiable', signals };
  }

  // 信号二：指代不明 / 模糊量词无比较锚
  const hasVague = VAGUE_QUALIFIERS.test(q.question);
  const hasAnchor = COMPARISON_ANCHORS.test(q.question);
  const leadingPronoun = LEADING_PRONOUN_RE.test(q.question.trim());
  if (leadingPronoun) signals.push('leading-pronoun-unresolved');
  if (hasVague && !hasAnchor) signals.push('vague-qualifier-without-anchor');
  if (leadingPronoun || (hasVague && !hasAnchor)) {
    return { scope: 'ambiguous', signals };
  }

  // 信号三：过宽（范围词密度 / 多目标堆叠）
  const breadth = q.question.match(BREADTH_WORDS)?.length ?? 0;
  const goals = splitGoals(q.question);
  if (breadth >= 2) signals.push(`breadth-word-density=${breadth}`);
  if (goals.length >= 3) signals.push(`goal-stacking=${goals.length}`);
  if (breadth >= 1 && goals.length >= 2) signals.push(`breadth+goals=${breadth}+${goals.length}`);
  const wordCount = q.question.split(/\s+/).length;
  if (wordCount > 40 && breadth >= 1) signals.push(`runaway-length=${wordCount}`);
  const tooBroad = breadth >= 2 || goals.length >= 3 || (breadth >= 1 && goals.length >= 2) || (wordCount > 40 && breadth >= 1);
  if (tooBroad) return { scope: 'too_broad', signals };

  return { scope: 'well_formed', signals };
}

// ---------------------------------------------------------------------------
// 路由：CLARIFY / DECOMPOSE / UNDECIDABLE（well_formed → PROCEED）
// ---------------------------------------------------------------------------

export type QuestionRouteAction = 'PROCEED' | 'CLARIFY' | 'DECOMPOSE' | 'UNDECIDABLE';

/** 分解产物：单一目标的子问题（继承 population 与证据标准）。 */
export interface SubQuestion {
  readonly id: string;
  readonly question: string;
  readonly rationale: string;
}

export interface QuestionRoute {
  readonly action: QuestionRouteAction;
  readonly reason: string;
  readonly signals: readonly string[];
  /** 仅 DECOMPOSE 携带：确定性子问题分解。 */
  readonly subQuestions?: readonly SubQuestion[];
}

/**
 * 确定性子问题分解（按目标切分；无并列分隔时退化为按 successCriteria
 * 逐条切分——每条判据即一个可判定单元）。同输入恒等输出（顺序稳定、
 * id 由序号派生，无随机性、无时间戳）。
 */
export function decomposeQuestion(q: ResearchQuestion): SubQuestion[] {
  const goals = splitGoals(q.question);
  const units = goals.length >= 2 ? goals : q.successCriteria;
  const focus = q.targetPhenomenon;
  return units.map((unit, i) => ({
    id: `sub-${i + 1}`,
    question: `For ${q.populationSystem}: does the question hold for the single target "${unit.trim()}" (phenomenon: ${focus})?`,
    rationale:
      goals.length >= 2
        ? `goal split ${i + 1}/${units.length}: stacked goal isolated from the multi-goal parent`
        : `criterion split ${i + 1}/${units.length}: one success criterion as the adjudicable unit`,
  }));
}

/**
 * 路由问题（SCI-QUESTION-001）：
 *   well_formed  → PROCEED（直接进入裁决管线）
 *   too_broad    → DECOMPOSE（自动分解为单目标子问题）
 *   ambiguous    → CLARIFY（请求澄清——对象定位失败不可分解）
 *   unfalsifiable→ UNDECIDABLE（显式不可判定，结论封顶 NOT_IMPLEMENTED）
 */
export function routeQuestion(q: ResearchQuestion): QuestionRoute {
  const { scope, signals } = classifyQuestionScope(q);
  switch (scope) {
    case 'well_formed':
      return { action: 'PROCEED', reason: 'all 11 boundary fields present and no structural warning fired', signals };
    case 'too_broad':
      return {
        action: 'DECOMPOSE',
        reason: 'question spans multiple stacked goals or breadth-word density — split into single-goal subquestions before adjudication',
        signals,
        subQuestions: decomposeQuestion(q),
      };
    case 'ambiguous':
      return { action: 'CLARIFY', reason: 'unresolved reference or vague qualifier without a comparison anchor — the object of inquiry is not identifiable', signals };
    case 'unfalsifiable':
      return { action: 'UNDECIDABLE', reason: 'no measurable criterion or non-operationalizable target — no adjudicable experiment exists', signals };
  }
}

// ---------------------------------------------------------------------------
// 结论封顶：UNDECIDABLE（及未修复的 CLARIFY/DECOMPOSE）不得高置信
// ---------------------------------------------------------------------------

export type ScopedConclusionVerdict =
  | 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE' | 'DEGRADED_SCOPE' | 'UNTESTED'
  | 'NOT_IMPLEMENTED' | 'UNKNOWN';

/** 各路由下允许的结论状态（PROCEED 全开；其余不含 CONFIRMED/REFUTED）。 */
export function allowedConclusionStatuses(action: QuestionRouteAction): ScopedConclusionVerdict[] {
  if (action === 'PROCEED') {
    return ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED', 'NOT_IMPLEMENTED', 'UNKNOWN'];
  }
  // 问题未修复（待澄清/待分解/不可判定）→ 诚实状态只有「未实施/未知/不定」
  return ['INCONCLUSIVE', 'NOT_IMPLEMENTED', 'UNKNOWN'];
}

/**
 * UNDECIDABLE 结论封顶（fail-closed）：不可判定问题的结论若试图携带
 * CONFIRMED/REFUTED 等高置信裁决 → 抛错（宪法 Failure 路径：保持
 * NOT_IMPLEMENTED 或 UNKNOWN，不得直接生成高置信结论）。诚实结论原样放行。
 */
export function capConclusionForUndecidableRoute(
  route: Pick<QuestionRoute, 'action'>,
  proposed: { verdict: ScopedConclusionVerdict; confidence: number },
): { verdict: ScopedConclusionVerdict; confidence: number } {
  if (route.action === 'UNDECIDABLE' && !allowedConclusionStatuses('UNDECIDABLE').includes(proposed.verdict)) {
    throw new Error(
      `capConclusionForUndecidableRoute: UNDECIDABLE question cannot carry verdict '${proposed.verdict}' `
        + `(confidence ${proposed.confidence}) — the honest ceiling is NOT_IMPLEMENTED or UNKNOWN`,
    );
  }
  return { ...proposed };
}
