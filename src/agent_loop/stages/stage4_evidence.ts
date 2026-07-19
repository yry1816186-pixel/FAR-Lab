/**
 * stage4_evidence —— [4] 证据收集执行器。
 *
 * 职责：基于 stage3 假设的 falsificationMethod 收集证据 + 标注支持/反驳/中立。
 *
 * buildMessages 消费：stage3 产物（claim + falsificationMethod + supportingCitations）。
 *
 * 输出：EvidencePayload（kind='evidence'·含 evidenceRecords + conflictingEvidenceCount）。
 *
 * 与 falsifiability 模块的协作（§5.3）：
 *   stage4 产出的 EvidenceRecord（agent_loop 侧·含 entailmentScore + CitationAnchor）
 *   与 falsifiability/types.EvidenceRecord（gate 侧·含 supportsClaim/refutesClaim +
 *   scopeNarrowerThanClaim + SourceAnchor）字段不同。stage 执行器只负责 LLM 提取，
 *   verdict 阶段（在 fsm_runner 内·后续 task）负责转换给 falsifiability_gate。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../../llm_gateway/types.ts';
import type {
  HypothesisPayload,
  StageArtifact,
  StageContext,
} from '../types.ts';
import { runStage } from '../run_stage.ts';
import { EvidenceSchema } from './schemas.ts';
import { STAGE_TO_PURPOSE_TAG } from '../stage_purpose.ts';


/**
 * runStage4 —— [4] 证据收集执行器。
 */
export async function runStage4(ctx: StageContext): Promise<StageArtifact> {
  return runStage(
    ctx,
    'stage4_evidence',
    // payloadKind 落 call_records.payload_kind·必须命中 PAYLOAD_KINDS 9 值之一
    // spec 06 §2 表：stage4_evidence → 'experiment' 或 'citation'
    // 选 'experiment'：EvidenceRecord 含 entailmentScore（实验度量·非纯文献引用）
    'experiment',
    STAGE_TO_PURPOSE_TAG.stage4_evidence, // 'narrative'（API-1 SSOT）
    EvidenceSchema,
    buildEvidenceMessages,
  );
}


/**
 * 构造 stage4 的 system/user messages。
 *
 * system: 角色 + 任务 + JSON 输出格式要求。
 * user: stage3 产物（claim + falsificationMethod + supportingCitations）。
 */
function buildEvidenceMessages(ctx: StageContext): readonly LlmMessage[] {
  const system = [
    'You are a research evidence collector. Task: collect evidence for or against the',
    'hypothesis based on its falsificationMethod.',
    '',
    'Output a JSON object with EXACTLY these fields:',
    '- kind: "evidence" (literal string)',
    '- evidenceRecords: array of {',
    '    evidenceId: string,',
    '    supportsOrRefutes: "supports" | "refutes" | "neutral",',
    '    entailmentScore: number (0..1, semantic entailment score),',
    '    source: { evidenceId, source, doi, title }',
    '  }',
    '- conflictingEvidenceCount: number (count of evidence records that conflict with the hypothesis)',
    '',
    'Do NOT include any other fields. Do NOT wrap JSON in markdown fences.',
    'Do NOT fabricate evidenceIds: only use evidenceIds that exist in the input citations.',
  ].join('\n');

  const userParts: string[] = [ctx.researchInput];

  // 消费 stage3_hypothesis 产物
  const stage3 = findPrevHypothesis(ctx.prevArtifacts);
  if (stage3 !== undefined) {
    userParts.push(
      '',
      'Hypothesis to evaluate:',
      JSON.stringify(stage3, null, 2),
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
