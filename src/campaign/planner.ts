/**
 * campaign/planner — 战役问题规划（night-r7 S1）。
 *
 * 两条规划路径，优先级固定：
 *   1. explicit（默认路径，确定性、离线安全）：调用方直接给出问题清单 →
 *      原样采用，注入的 decomposer 永不被调用；
 *   2. llm：无显式清单时通过注入的 decompose(topic) 分解（依赖注入——CLI 侧
 *      接 LLM 分解器；无 key 时被注入函数抛出 `*_live_profile_unavailable`
 *      家族错误，本模块原样传播，R9 fail-closed）。
 *
 * 零伪造纪律（NO fallback fabrication）：分解器缺失或失败时绝不编造兜底问题、
 * 绝不静默降级——宁可战役在规划期失败，也不带假问题进入执行。
 *
 * Cannot-prove（不可隐藏）：planner 只证明「哪些问题、来自哪个来源」；
 * 它不证明 LLM 分解出的问题质量/覆盖度/无冗余——那是战役结果要度量的对象，
 * 不是规划器能担保的。
 */

export interface PlanCampaignQuestionsInput {
  readonly topic: string;
  readonly questions?: readonly string[];
  readonly decompose?: (topic: string) => Promise<readonly string[]>;
}

export interface PlannedQuestions {
  readonly questions: readonly string[];
  readonly source: 'explicit' | 'llm';
}

function assertPlannedQuestions(questions: readonly string[], origin: 'explicit' | 'llm'): void {
  if (questions.length === 0) {
    throw new Error(
      `planCampaignQuestions: empty question list after planning (${origin}) — a campaign needs ≥1 question, refusing to fabricate`,
    );
  }
  for (const [i, q] of questions.entries()) {
    if (typeof q !== 'string' || q.trim() === '') {
      throw new Error(`planCampaignQuestions: question ${i} is empty/blank (${origin}) — blank questions are defects, not plans`);
    }
  }
}

/**
 * 规划战役问题（纯编排，无 IO、无时钟）。显式清单胜出（含确定性/离线安全）；
 * 否则走注入的 decompose；两者皆无 → 抛错（fail-closed，无兜底）。
 * 空 topic、规划后空清单、含空白问题 → 抛错。
 */
export async function planCampaignQuestions(input: PlanCampaignQuestionsInput): Promise<PlannedQuestions> {
  if (typeof input.topic !== 'string' || input.topic.trim() === '') {
    throw new Error('planCampaignQuestions: topic must be a non-empty string');
  }

  // 路径 1：显式清单（undefined 或空数组都视为「无可采用的显式清单」）。
  if (input.questions !== undefined && input.questions.length > 0) {
    const questions = [...input.questions];
    assertPlannedQuestions(questions, 'explicit');
    return { questions, source: 'explicit' };
  }

  // 路径 2：注入分解器（失败原样传播——上面的模块文档「零伪造纪律」）。
  if (input.decompose === undefined) {
    throw new Error(
      'planCampaignQuestions: no explicit questions and no decomposer injected — nothing to plan with, refusing to fabricate',
    );
  }
  const decomposed = await input.decompose(input.topic);
  const questions = [...decomposed];
  assertPlannedQuestions(questions, 'llm');
  return { questions, source: 'llm' };
}
