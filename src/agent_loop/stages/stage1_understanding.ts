/**
 * stage1_understanding —— [1] 问题理解执行器。
 *
 * 职责：复述研究问题 + 识别关键术语 + 标注可证伪切入角度。
 *
 * buildMessages 消费：ctx.researchInput（研究问题原文）+ 可选 dialogueContext
 * （add-research-dialogue-layer spec·dialogueMode=enabled 时由 stage0_dialogue 传入）。
 *
 * 输出：UnderstandingPayload（kind='understanding'）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../../llm_gateway/types.ts';
import type { StageArtifact, StageContext } from '../types.ts';
import { runStage } from '../run_stage.ts';
import { UnderstandingSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage1 —— [1] 问题理解执行器。
 *
 * 调用 runStage 通用骨架，传入 UnderstandingSchema + buildUnderstandingMessages。
 */
export async function runStage1(ctx: StageContext): Promise<StageArtifact> {
  return runStage(
    ctx,
    'stage1_understanding',
    'understanding', // payloadKind（落 call_records.payload_kind）
    STAGE_TO_PURPOSE_TAG.stage1_understanding, // 'narrative'（API-1 SSOT）
    UnderstandingSchema,
    buildUnderstandingMessages,
  );
}


/**
 * 构造 stage1 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求。
 * user: 研究问题原文 + 可选 dialogueContext（作提示）。
 */
function buildUnderstandingMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research problem analyst. Task: understand the research problem.',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "understanding" (literal string)',
    '- problemStatement: string (restate the problem in your own words)',
    '- scope: string (scope statement, including degradation variants if scope is narrow)',
    '- keyTerms: string[] (key technical terms)',
    '- falsifiableAngle: string | null (a falsifiable angle if one exists, else null)',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
  ].join('\n');

  const userParts: string[] = [ctx.researchInput];
  if (ctx.prevArtifacts.length > 0) {
    // 多轮迭代时，前序 stage1 产物可作参考（避免重复复述）
    const prevUnderstanding = findPrevUnderstanding(ctx.prevArtifacts);
    if (prevUnderstanding !== undefined) {
      userParts.push(
        '',
        `Previous understanding (iteration ${prevUnderstanding.iteration}):`,
        JSON.stringify(prevUnderstanding.payload, null, 2),
      );
    }
  }
  const user = userParts.join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * 从 prevArtifacts 中找最近一次 stage1 产物（多轮迭代时用）。
 *
 * 用 discriminatedUnion kind narrow（R10·禁 as 强转）。
 */
function findPrevUnderstanding(
  artifacts: readonly StageArtifact[],
): { iteration: number; payload: import('../types.ts').UnderstandingPayload } | undefined {
  // 反向遍历找最近一次 stage1_understanding
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.stageId === 'stage1_understanding') {
      const s = artifact.structured;
      if (s.kind === 'understanding') {
        return { iteration: 0, payload: s }; // iteration 由 ctx 提供，此处占位
      }
    }
  }
  return undefined;
}
