/**
 * stage5_plan —— [5] 实验规划执行器。
 *
 * 职责：基于 stage3 假设 + stage4 证据，规划可执行的实验方案
 *      （datasetChoices + methodChoices + executableChecks）。
 *
 * buildMessages 消费：stage3 产物（claim + falsificationMethod）+ stage4 产物
 * （evidenceRecords + conflictingEvidenceCount）。
 *
 * 输出：PlanPayload（kind='plan'·含 datasetChoices + methodChoices + scheduleOrFeedback
 * + executableChecks）。
 *
 * executableChecks 的 ref 字段须是真实可访问的 URL 或标识（HTTP HEAD/crossmatch 命中）——
 * 反 theater 设计：若 LLM 编造不存在的 dataset/method，executableChecks.exists=false
 * 会被 stage5 之后的 verdict 阶段（fsm_runner 内·后续 task）降级。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../../llm_gateway/types.ts';
import type {
  EvidencePayload,
  HypothesisPayload,
  StageArtifact,
  StageContext,
} from '../types.ts';
import { runStage } from '../run_stage.ts';
import { PlanSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage5 —— [5] 实验规划执行器。
 */
export async function runStage5(ctx: StageContext): Promise<StageArtifact> {
  return runStage(
    ctx,
    'stage5_plan',
    'plan', // payloadKind
    STAGE_TO_PURPOSE_TAG.stage5_plan, // 'narrative'（API-1 SSOT）
    PlanSchema,
    buildPlanMessages,
  );
}


/**
 * 构造 stage5 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求。
 * user: stage3 + stage4 产物。
 */
function buildPlanMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research experiment planner. Task: design an executable experiment plan',
    'to falsify the hypothesis based on collected evidence.',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "plan" (literal string)',
    '- datasetChoices: string[] (dataset names or URLs to be used)',
    '- methodChoices: string[] (method names or pipeline descriptions)',
    '- scheduleOrFeedback: string (schedule description or feedback on plan feasibility)',
    '- executableChecks: array of {',
    '    ref: string (dataset/method URL or identifier),',
    '    exists: boolean (whether the resource is accessible),',
    '    checkedAt: string (ISO8601 timestamp)',
    '  }',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
    'executableChecks.exists MUST reflect actual accessibility (HTTP HEAD/crossmatch).',
    'Do NOT mark exists=true for fabricated resources (anti-theater).',
  ].join('\n');

  const userParts: string[] = [ctx.researchInput];

  // 消费 stage3_hypothesis 产物
  const stage3 = findPrevHypothesis(ctx.prevArtifacts);
  if (stage3 !== undefined) {
    userParts.push(
      '',
      'Hypothesis:',
      JSON.stringify(stage3, null, 2),
    );
  }

  // 消费 stage4_evidence 产物
  const stage4 = findPrevEvidence(ctx.prevArtifacts);
  if (stage4 !== undefined) {
    userParts.push(
      '',
      'Collected evidence:',
      JSON.stringify(stage4, null, 2),
    );
  }

  const user = userParts.join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}


/**
 * 从 prevArtifacts 中找最近一次 stage3_hypothesis 产物（用 discriminatedUnion narrow）。
 */
function findPrevHypothesis(
  artifacts: readonly StageArtifact[],
): HypothesisPayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.stageId === 'stage3_hypothesis') {
      const s = artifact.structured;
      if (s.kind === 'hypothesis') {
        return s;
      }
    }
  }
  return undefined;
}


/**
 * 从 prevArtifacts 中找最近一次 stage4_evidence 产物（用 discriminatedUnion narrow）。
 */
function findPrevEvidence(
  artifacts: readonly StageArtifact[],
): EvidencePayload | undefined {
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact && artifact.stageId === 'stage4_evidence') {
      const s = artifact.structured;
      if (s.kind === 'evidence') {
        return s;
      }
    }
  }
  return undefined;
}
