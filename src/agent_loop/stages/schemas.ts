/**
 * stages/schemas.ts —— 六阶段 zod schema 共享定义。
 *
 * 设计要点：
 *   - 共享 sub-schema（CitationAnchor / FalsificationMethod / AgentEvidenceRecord /
 *     ExecutableCheck / FeedbackSignal）集中定义，避免 6 个 stage 文件重复。
 *   - 各 stage 的顶层 payload schema（UnderstandingSchema 等）含 `kind: z.literal(...)`
 *     判别标签（R10：判别联合运行时收窄·禁 as 强转）。
 *   - zod schema 仅用于 runStage 内部 `schema.parse(JSON.parse(response.content))`
 *     运行时收窄；不传给 LLM（LlmRequest.responseFormat 是字符串标志·非 schema 对象）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import { z } from 'zod';


// ---------- §3.4 共享 sub-schema ----------

export const CitationAnchorSchema = z.object({
  evidenceId: z.string(),
  source: z.enum(['arxiv', 'ads', 's2', 'tns', 'gcvs', 'aavso', 'gaia', 'other']),
  doi: z.string().nullable(),
  title: z.string(),
});

export const FalsificationMethodSchema = z.object({
  prediction: z.string(),
  metric: z.string(),
  comparator: z.enum(['gt', 'lt', 'range']),
  value: z.number().optional(),
  lower: z.number().optional(),
  upper: z.number().optional(),
});

export const AgentEvidenceRecordSchema = z.object({
  evidenceId: z.string(),
  supportsOrRefutes: z.enum(['supports', 'refutes', 'neutral']),
  entailmentScore: z.number(),
  source: CitationAnchorSchema,
});

export const ExecutableCheckSchema = z.object({
  ref: z.string(),
  exists: z.boolean(),
  checkedAt: z.string(),
});

export const FeedbackSignalSchema = z.object({
  continueIteration: z.boolean(),
  iterationNumber: z.number(),
  maxIterations: z.number(),
  refinements: z.array(z.string()),
});

export const DialogueContextSchema = z.object({
  frameworkId: z.string(),
  primaryIntent: z.string(),
  openIssues: z.array(z.string()),
});


// ---------- §3.3 各阶段顶层 payload schema（判别联合 variant） ----------

export const UnderstandingSchema = z.object({
  kind: z.literal('understanding'),
  problemStatement: z.string(),
  scope: z.string(),
  keyTerms: z.array(z.string()),
  falsifiableAngle: z.string().nullable(),
  dialogueContext: DialogueContextSchema.optional(),
});

export const IntegrationSchema = z.object({
  kind: z.literal('integration'),
  citations: z.array(CitationAnchorSchema),
  knowledgeGraphSummary: z.string(),
  gaps: z.array(z.string()),
});

export const HypothesisSchema = z.object({
  kind: z.literal('hypothesis'),
  claim: z.string(),
  falsificationMethod: FalsificationMethodSchema,
  supportingCitations: z.array(z.string()),
  scopeSlipText: z.string(),
});

export const EvidenceSchema = z.object({
  kind: z.literal('evidence'),
  evidenceRecords: z.array(AgentEvidenceRecordSchema),
  conflictingEvidenceCount: z.number(),
});

export const PlanSchema = z.object({
  kind: z.literal('plan'),
  datasetChoices: z.array(z.string()),
  methodChoices: z.array(z.string()),
  scheduleOrFeedback: z.string(),
  executableChecks: z.array(ExecutableCheckSchema),
});

export const FeedbackPayloadSchema = z.object({
  kind: z.literal('feedback'),
  feedbackSignal: FeedbackSignalSchema,
  iterationSummary: z.string(),
});
