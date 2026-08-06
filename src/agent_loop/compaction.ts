/**
 * agent_loop compaction —— 证据上下文压缩（批次 2-E·借鉴 opencode session compact）。
 *
 * 动机：runAgentLoop 每轮迭代把全部 prevArtifacts（JSON.stringify 全量）注入下一 stage
 * prompt（stage2_integration.ts:71 `JSON.stringify(stage1, null, 2)`）。iteration ≥ 2 时
 * 上下文随轮次线性膨胀，逼近 MAX_TOKENS_TABLE 上限 → 旧证据被截断/裁决依据不完整。
 *
 * 设计纪律：
 *   - 确定性纯函数：只读输入、无 LLM、无副作用。
 *   - **裁决关键产物完整保留**：stage3_hypothesis（claim/falsificationMethod/scopeSlipText）
 *     与 stage4_evidence（evidenceRecords/conflictingEvidenceCount）是 R0-R9 裁决输入，
 *     永不压缩——压缩的是 stage1/2/5/6 的叙述性长文本字段。
 *   - 截断时附 hash 锚 `[compact:<sha256 前 12>]`：被压缩原文可据此溯源（审计可追溯）。
 *   - 保留 StageArtifact 结构（stageId/payloadKind/callResult/structured.kind 不变）——
 *     stage 执行器的 findPrev* 判别收窄（discriminatedUnion）不受影响。
 *   - 集成开关 RunAgentLoopArgs.compactArtifacts（默认 false → 字节零回归）。
 */

import { createHash } from 'node:crypto';
import type {
  FeedbackPayload,
  IntegrationPayload,
  PlanPayload,
  StageArtifact,
  UnderstandingPayload,
} from './types.ts';

/** 压缩选项。 */
export interface CompactOptions {
  /** 长文本字段保留上限（字符·默认 800）。 */
  readonly maxChars?: number;
  /** 超过该长度才压缩（字符·默认 400·短文本不扰动）。 */
  readonly compactThresholdChars?: number;
}

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_THRESHOLD = 400;

function shortHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/** 截断长文本：超阈值则保留前 maxChars + hash 锚（确定性·可溯源）。 */
function clip(text: string, maxChars: number, threshold: number): string {
  if (text.length <= threshold) {
    return text;
  }
  const head = text.slice(0, maxChars);
  return `${head}\n…[compact:${shortHash(text)}]`;
}

/** 压缩 stage1_understanding（叙述字段截断·keyTerms 短串保留）。 */
function compactUnderstanding(
  p: UnderstandingPayload,
  maxChars: number,
  threshold: number,
): UnderstandingPayload {
  return {
    ...p,
    problemStatement: clip(p.problemStatement, maxChars, threshold),
    scope: clip(p.scope, maxChars, threshold),
    ...(p.falsifiableAngle === null ? {} : { falsifiableAngle: clip(p.falsifiableAngle, maxChars, threshold) }),
  };
}

/** 压缩 stage2_integration（knowledgeGraphSummary/citation title 截断）。 */
function compactIntegration(
  p: IntegrationPayload,
  maxChars: number,
  threshold: number,
): IntegrationPayload {
  return {
    ...p,
    citations: p.citations.map((c) => ({
      ...c,
      title: clip(c.title, maxChars, threshold),
    })),
    knowledgeGraphSummary: clip(p.knowledgeGraphSummary, maxChars, threshold),
  };
}

/** 压缩 stage5_plan（scheduleOrFeedback 截断·choices/checks 保留）。 */
function compactPlan(p: PlanPayload, maxChars: number, threshold: number): PlanPayload {
  return {
    ...p,
    scheduleOrFeedback: clip(p.scheduleOrFeedback, maxChars, threshold),
  };
}

/** 压缩 stage6_feedback（iterationSummary 截断·feedbackSignal 保留——[6]→[3] 回灌依赖）。 */
function compactFeedback(p: FeedbackPayload, maxChars: number, threshold: number): FeedbackPayload {
  return {
    ...p,
    iterationSummary: clip(p.iterationSummary, maxChars, threshold),
  };
}

/**
 * 生成 prevArtifacts 压缩视图（纯函数·不 mutate 原数组）。
 * stage3/stage4 原样返回（裁决关键产物）；其余 stage 长文本字段截断 + hash 锚。
 */
export function compactArtifacts(
  artifacts: readonly StageArtifact[],
  options: CompactOptions = {},
): readonly StageArtifact[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const threshold = options.compactThresholdChars ?? DEFAULT_THRESHOLD;

  return artifacts.map((artifact) => {
    const structured = artifact.structured;
    switch (structured.kind) {
      case 'understanding':
        return { ...artifact, structured: compactUnderstanding(structured, maxChars, threshold) };
      case 'integration':
        return { ...artifact, structured: compactIntegration(structured, maxChars, threshold) };
      case 'hypothesis':
      case 'evidence':
        // 裁决关键产物：完整保留
        return artifact;
      case 'plan':
        return { ...artifact, structured: compactPlan(structured, maxChars, threshold) };
      case 'feedback':
        return { ...artifact, structured: compactFeedback(structured, maxChars, threshold) };
    }
  });
}

/** 估算 artifacts 序列化体积（字节·上下文膨胀诊断用）。 */
export function estimateArtifactsBytes(artifacts: readonly StageArtifact[]): number {
  let total = 0;
  for (const a of artifacts) {
    total += JSON.stringify(a.structured).length;
  }
  return total;
}
