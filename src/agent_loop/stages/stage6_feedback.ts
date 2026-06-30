/**
 * stage6_feedback —— [6] 反馈/收敛执行器（产出 FeedbackSignal 用于 [6]→[3] 回灌）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §2（stage6）+ §5.2（执行器要点）.
 *
 * 职责：综合 stage1-stage5 全部产物 + 判断是否继续迭代（continueIteration）。
 *      若 continueIteration=true，fsm_runner 把 FeedbackSignal 回灌给 stage3 再迭代。
 *      若 continueIteration=false，fsm_runner 终止循环（terminationReason='feedback_converged'）。
 *
 * buildMessages 消费：全部前序 stage1-stage5 产物 + ctx.iteration / ctx.termination
 * （让 LLM 知道当前轮次 + 上限·避免无限迭代烧配额）。
 *
 * 输出：FeedbackPayload（kind='feedback'·含 feedbackSignal + iterationSummary）。
 *
 * 收敛判定（防 LLM 永远不收敛烧配额）：
 *   - 若 ctx.iteration >= ctx.termination.maxIterations，强制 continueIteration=false
 *     （硬终止·fsm_runner 也会兜底 assertTerminated）。
 *   - LLM 输出 continueIteration=true 但已超 maxIterations 时，stage6 执行器覆写为 false
 *     并在 iterationSummary 标注「forced convergence due to maxIterations」。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../../llm_gateway/types.ts';
import type {
  FeedbackPayload,
  StageArtifact,
  StageContext,
  StructuredPayload,
} from '../types.ts';
import { runStage } from '../run_stage.ts';
import { FeedbackPayloadSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage6 —— [6] 反馈/收敛执行器（含 maxIterations 硬收敛断言）。
 *
 * 流程：
 *   1. 调 runStage 通用骨架拿 FeedbackPayload（LLM 初步判断 continueIteration）
 *   2. maxIterations 硬收敛：若 ctx.iteration >= maxIterations 且 LLM 仍 continueIteration=true
 *      → 覆写为 false + 标注 forcedConvergence
 *   3. 返回 StageArtifact（structured 已被覆写）
 */
export async function runStage6(ctx: StageContext): Promise<StageArtifact> {
  const artifact = await runStage(
    ctx,
    'stage6_feedback',
    'feedback', // payloadKind
    STAGE_TO_PURPOSE_TAG.stage6_feedback, // 'narrative'（API-1 SSOT）
    FeedbackPayloadSchema,
    buildFeedbackMessages,
  );

  // maxIterations 硬收敛（防 LLM 永远不收敛烧配额）
  const feedback = narrowFeedback(artifact);
  if (
    feedback.feedbackSignal.continueIteration &&
    ctx.iteration >= ctx.termination.maxIterations
  ) {
    const correctedPayload: FeedbackPayload = {
      kind: 'feedback',
      feedbackSignal: {
        ...feedback.feedbackSignal,
        continueIteration: false, // 强制终止
      },
      iterationSummary:
        `${feedback.iterationSummary}\n\n` +
        `[FORCED CONVERGENCE] iteration=${ctx.iteration} >= maxIterations=${ctx.termination.maxIterations}, ` +
        `continueIteration overridden to false (anti-quota-burn).`,
    };
    // 用新 payload 构造新 artifact（原 callResult/audit 链保留·仅 structured 覆写）
    return {
      ...artifact,
      structured: correctedPayload,
    };
  }

  return artifact;
}


/**
 * 构造 stage6 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求（含 maxIterations 上下文）。
 * user: 全部前序 stage1-stage5 产物（让 LLM 综合判断是否收敛）。
 */
function buildFeedbackMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research iteration reviewer. Task: review the full pipeline output',
    'and decide whether to continue iterating or converge.',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "feedback" (literal string)',
    '- feedbackSignal: {',
    '    continueIteration: boolean (true = refine hypothesis in stage3; false = converge),',
    '    iterationNumber: number (current iteration number, starts from 1),',
    '    maxIterations: number (upper bound, do NOT exceed),',
    '    refinements: string[] (specific refinement points for stage3 if continuing)',
    '  }',
    '- iterationSummary: string (summary of this iteration\'s outcomes)',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
    'Set continueIteration=false when the hypothesis is sufficiently refined or',
    'when further iteration is unlikely to improve the result.',
  ].join('\n');

  const userParts: string[] = [
    ctx.researchInput,
    '',
    `Current iteration: ${ctx.iteration}`,
    `Max iterations: ${ctx.termination.maxIterations}`,
  ];

  // 消费全部前序产物（stage1-stage5）
  const summaries = ctx.prevArtifacts.map((a) => summarizeArtifact(a));
  if (summaries.length > 0) {
    userParts.push('', 'Pipeline artifacts so far:');
    userParts.push(...summaries);
  }

  const user = userParts.join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}


/**
 * 把单个 StageArtifact 摘要为单行字符串（供 stage6 prompt 拼装）。
 *
 * 用 discriminatedUnion narrow 提取关键字段（禁 as 强转·R10）。
 */
function summarizeArtifact(artifact: StageArtifact): string {
  const s: StructuredPayload = artifact.structured;
  switch (s.kind) {
    case 'understanding':
      return `[stage1] problemStatement: ${s.problemStatement}`;
    case 'integration':
      return `[stage2] gaps: ${s.gaps.length > 0 ? s.gaps.join('; ') : '(none)'}`;
    case 'hypothesis':
      return `[stage3] claim: ${s.claim}`;
    case 'evidence':
      return `[stage4] conflictingEvidenceCount: ${s.conflictingEvidenceCount}`;
    case 'plan':
      return `[stage5] datasetChoices: ${s.datasetChoices.join(', ')}`;
    case 'feedback':
      return `[stage6] continueIteration: ${s.feedbackSignal.continueIteration}`;
    default: {
      // exhaustiveness check（禁 fallback·零容忍 #4）
      const exhaustive: never = s;
      return `[[UNKNOWN_KIND: ${String(exhaustive)}]]`;
    }
  }
}


/**
 * 把 StageArtifact.structured 收窄为 FeedbackPayload（R10 discriminatedUnion narrow）。
 */
function narrowFeedback(artifact: StageArtifact): FeedbackPayload {
  const s = artifact.structured;
  if (s.kind !== 'feedback') {
    throw new Error(
      `stage6_feedback.narrowFeedback: expected kind='feedback' but got kind='${s.kind}' ` +
        `(stageId=${artifact.stageId}·runStage 返回的 structured 类型与预期不符)`,
    );
  }
  return s;
}
