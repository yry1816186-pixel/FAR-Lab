/**
 * stage2_integration —— [2] 知识整合执行器。
 *
 * 职责：把 stage1 的问题理解整合到现有知识图谱 + 标注 gaps（待补的空白）。
 *
 * buildMessages 消费：stage1 产物（problemStatement + keyTerms + falsifiableAngle）。
 *
 * 输出：IntegrationPayload（kind='integration'·含 citations + knowledgeGraphSummary + gaps）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../../llm_gateway/types.ts';
import type {
  StageArtifact,
  StageContext,
  UnderstandingPayload,
} from '../types.ts';
import { runStage } from '../run_stage.ts';
import { IntegrationSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage2 —— [2] 知识整合执行器。
 *
 * 调用 runStage 通用骨架，传入 IntegrationSchema + buildIntegrationMessages。
 */
export async function runStage2(ctx: StageContext): Promise<StageArtifact> {
  return runStage(
    ctx,
    'stage2_integration',
    'integration', // payloadKind
    STAGE_TO_PURPOSE_TAG.stage2_integration, // 'narrative'（API-1 SSOT）
    IntegrationSchema,
    buildIntegrationMessages,
  );
}


/**
 * 构造 stage2 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求。
 * user: stage1 产物（problemStatement + keyTerms + falsifiableAngle）。
 */
function buildIntegrationMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research knowledge integrator. Task: integrate the research problem',
    'into the existing knowledge graph and identify gaps.',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "integration" (literal string)',
    '- citations: array of { evidenceId, source, doi, title }',
    '    (source ∈ ["arxiv","ads","s2","tns","gcvs","aavso","gaia","doi","other"]; doi is string|null)',
    '- knowledgeGraphSummary: string (summary of how the problem maps onto existing knowledge)',
    '- gaps: string[] (identified gaps that the hypothesis must address)',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
    'Do NOT fabricate citations: only cite evidenceIds that actually exist in the input.',
  ].join('\n');

  const userParts: string[] = [ctx.researchInput];

  // 消费 stage1_understanding 产物
  const stage1 = findPrevUnderstanding(ctx.prevArtifacts);
  if (stage1 !== undefined) {
    userParts.push(
      '',
      'Previous understanding:',
      JSON.stringify(stage1, null, 2),
    );
  }

  const user = userParts.join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}


/**
 * 从 prevArtifacts 中找最近一次 stage1_understanding 产物（用 discriminatedUnion narrow）。
 *
 * 用 kind 标签运行时收窄，禁 as 强转（R10）。
 */
function findPrevUnderstanding(
  artifacts: readonly StageArtifact[],
): UnderstandingPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.stageId === 'stage1_understanding') {
      const s = artifact.structured;
      if (s.kind === 'understanding') {
        return s;
      }
    }
  }
  return undefined;
}
