/**
 * runStage —— 单阶段执行器通用骨架。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §5.1.
 *
 * 适配说明（与 spec §5.1 的差异·按项目实际 API 优先）：
 *   1. spec §5.1 调用 `callBailianStructured`（项目未实现）——本文件改用项目实际 API：
 *      `gateway.callLlm(profile, request)` → LlmResponse，再 `appendLlmResponseRecord` 落库。
 *      理由：evidence_log.callAndRecordLlm 要求 metadata.finishReason 在调用前传入，
 *      但 finishReason 要等 response 回来才能提取（先有鸡还是先有蛋）。
 *      故拆为两步：先 callLlm 拿 response，再 extract finishReason + 落库。
 *   2. spec §5.1 用 `zodToJsonSchema(schema)` 作为 response_format 传百炼——
 *      项目 LlmRequest.responseFormat 是字符串标志（'json_schema' | 'text'），
 *      不传 schema 对象。zod schema 仅用于 parse response.content（运行时收窄）。
 *      aliyun_qwen adapter 实现 ProviderAdapter 时若需传 schema 给百炼，
 *      由 adapter 内部处理（adapter 维护 schema 注册表或 LlmRequest 扩展·属 adapter 实现细节）。
 *   3. spec §5.1 用 `parsePayload: (raw) => P`——本文件去掉此参数，zod schema.parse 已做收窄。
 *   4. spec §5.1 直接读 `callResult.data.choices[0].finish_reason`——
 *      项目 LlmResponse.raw 是 unknown（adapter-agnostic），finishReason 由
 *      StageContext.finishReasonExtractor 注入提取（策略模式·开闭原则）。
 *   5. spec §5.1 用 `process.env.GIT_COMMIT_SHA ?? 'unknown'`——
 *      本文件用 `ctx.gitCommitSha`（显式传入·可测·禁 process.env 直读）。
 *
 * 文件位置说明：spec §5.1 把 runStage 放在 fsm_runner.ts，本文件单独抽出 run_stage.ts，
 * 理由：fsm_runner.ts 的 runAgentLoop 依赖 stages/* 的 runStage1~6，
 * stages/* 依赖 runStage——若 runStage 在 fsm_runner.ts 会形成循环依赖
 * （fsm_runner → stages → fsm_runner）。抽出 run_stage.ts 打破循环。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { z } from 'zod';

import type {
  LlmMessage,
  LlmRequest,
  LlmResponse,
} from '../llm_gateway/types.ts';
import type {
  PayloadKind,
  PurposeTag,
} from '../schema/enums.ts';
import {
  FINISH_REASONS,
} from '../schema/enums.ts';
import type {
  StageArtifact,
  StageContext,
  StageId,
  StructuredPayload,
} from './types.ts';
import {
  appendLlmResponseRecord,
} from '../evidence_log/llm_record.ts';
import type {
  LlmRecordMetadata,
} from '../evidence_log/llm_record.ts';
import {
  withRetry,
} from './retry_policy.ts';
import {
  MAX_TOKENS_TABLE,
  DEFAULT_RETRY_OPTIONS,
} from './retry_policy.ts';


// ---------- runStage（通用骨架） ----------

/**
 * 单阶段执行器通用骨架。
 *
 * 流程（六阶段共用）：
 *   1. 算力预算闸：tokensConsumed >= maxTokensPerRun → throw MAX_TOKENS_EXCEEDED
 *   2. 构造 LlmRequest（messages + responseFormat + temperature + maxTokens + purposeTag）
 *   3. withRetry(() => gateway.callLlm(profile, request)) → LlmResponse
 *   4. ctx.finishReasonExtractor(response) → FinishReason
 *   5. ctx.reproHashProvider({ stageId, payloadKind, response }) → reproHash
 *   6. 构造 LlmRecordMetadata + appendLlmResponseRecord 落 evidence_log
 *   7. zod schema.parse(JSON.parse(response.content)) → P（StructuredPayload 子类型）
 *   8. 构造 StageArtifact 返回
 *
 * @param ctx 阶段执行上下文（含 gateway + extractors + appendOptions）
 * @param stageId 阶段标识（落 call_records.stage_id）
 * @param payloadKind 对应 PayloadKind（落 call_records.payload_kind）
 * @param purposeTag 调用目的通道（落 call_records.purpose_tag·API-1 SSOT）
 * @param schema 该阶段结构化产物的 zod schema（运行时收窄 response.content）
 * @param buildMessages 构造 system/user prompt（消费 prevArtifacts / feedbackSignal）
 * @returns StageArtifact（含 structured payload + callResult + audit 链）
 *
 * @throws {code: 'MAX_TOKENS_EXCEEDED'} 算力预算耗尽
 * @throws {code: 'STAGE_SCHEMA_INVALID'} response.content 非 JSON 或 zod parse 失败
 * @throws 原 LLM 调用错误（经 withRetry 重试耗尽后抛出）
 */
export async function runStage<P extends StructuredPayload>(
  ctx: StageContext,
  stageId: StageId,
  payloadKind: PayloadKind,
  purposeTag: PurposeTag,
  schema: z.ZodType<P>,
  buildMessages: (ctx: StageContext) => readonly LlmMessage[],
): Promise<StageArtifact> {
  // 1. 算力预算闸（宪法 §5.2）：超 maxTokensPerRun 抛 MAX_TOKENS_EXCEEDED
  if (ctx.tokensConsumed >= ctx.termination.maxTokensPerRun) {
    throw Object.assign(
      new Error(
        `runStage[${stageId}]: MAX_TOKENS_EXCEEDED (tokensConsumed=${ctx.tokensConsumed} >= maxTokensPerRun=${ctx.termination.maxTokensPerRun})`,
      ),
      { code: 'MAX_TOKENS_EXCEEDED', stageId },
    );
  }

  // 2. 构造 LlmRequest
  const messages = buildMessages(ctx);
  const maxTokens = MAX_TOKENS_TABLE[stageId];
  const request: LlmRequest = {
    messages,
    temperature: 0.2, // spec §10.3 structured 阶段默认低温度（科研可复现）
    maxTokens,
    responseFormat: 'json_schema', // 六阶段默认 structured（spec §2.2）
    purposeTag,
    stageId, // offline_replay fixture registry 按 stageId 命中（生产 adapter 忽略）
  };

  // 3. withRetry 调 LLM（仅 429/503 退避·其余立即 fatal）
  const response: LlmResponse = await withRetry(
    () => ctx.gateway.callLlm(ctx.profile, request),
    DEFAULT_RETRY_OPTIONS,
  );

  // 4. 提取 finishReason（adapter-specific·由 ctx 注入策略）
  const finishReason = ctx.finishReasonExtractor(response);

  // 5. 产出 reproHash（接 03 calc_bridge·由 ctx 注入策略）
  const reproHash = ctx.reproHashProvider({ stageId, payloadKind, response });

  // 6. 构造 metadata + 落 evidence_log（信任根·链式 hash）
  const metadata: LlmRecordMetadata = {
    stageId,
    payloadKind,
    purposeTag,
    reproHash,
    gitCommitSha: ctx.gitCommitSha,
    finishReason,
  };
  appendLlmResponseRecord(ctx.evidenceLogDb, {
    request,
    response,
    metadata,
    appendOptions: ctx.appendOptions,
  });

  // 7. zod schema.parse 收窄 response.content → P
  //    JSON.parse 失败或 zod parse 失败 → STAGE_SCHEMA_INVALID（禁 fallback 掩盖·零容忍 #4）
  const parsed: P = parseStructuredContent(response.content, schema, stageId);

  // 8. 构造 StageArtifact 返回
  const artifact: StageArtifact = {
    stageId,
    payloadKind,
    structured: parsed,
    callResult: response,
    degraded: false,
    degradationReason: null,
  };
  return artifact;
}


// ---------- parseStructuredContent（zod 收窄·失败转 STAGE_SCHEMA_INVALID） ----------

/**
 * 解析 LLM 响应内容为 zod schema 收窄的结构化 payload。
 *
 * 流程：
 *   1. JSON.parse(response.content) → unknown
 *   2. schema.parse(unknown) → P（zod 运行时收窄·R10 替代 as 强转）
 *
 * 失败处理（禁 fallback·零容忍 #4）：
 *   - JSON.parse 失败（SyntaxError）→ throw STAGE_SCHEMA_INVALID
 *   - schema.parse 失败（ZodError）→ throw STAGE_SCHEMA_INVALID
 *
 * @throws {code: 'STAGE_SCHEMA_INVALID'} response.content 非 JSON 或 zod parse 失败
 */
function parseStructuredContent<P extends StructuredPayload>(
  content: string,
  schema: z.ZodType<P>,
  stageId: StageId,
): P {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw Object.assign(
      new Error(
        `runStage[${stageId}]: STAGE_SCHEMA_INVALID (response.content is not valid JSON: ${(err as Error).message})`,
      ),
      { code: 'STAGE_SCHEMA_INVALID', stageId, cause: err },
    );
  }

  try {
    return schema.parse(raw);
  } catch (err) {
    throw Object.assign(
      new Error(
        `runStage[${stageId}]: STAGE_SCHEMA_INVALID (zod parse failed: ${(err as Error).message})`,
      ),
      { code: 'STAGE_SCHEMA_INVALID', stageId, cause: err },
    );
  }
}


// ---------- extractFinishReasonFromOpenAIChatCompletion（aliyun_qwen 用） ----------

/**
 * 从 OpenAI ChatCompletion 形态的 LlmResponse.raw 提取 FinishReason。
 *
 * 适用于 aliyun_qwen adapter（raw 是 ChatCompletion）。
 * offline_replay 不用此函数（raw 是 {replayed, messageCount}·finishReason 由 fixture 决定）。
 *
 * Type guard 从 unknown 安全收窄（禁 as 强转结构）。
 *
 * @throws Error 若 raw 不是 ChatCompletion 形态或 finish_reason 不在 FINISH_REASONS 枚举内
 */
export function extractFinishReasonFromOpenAIChatCompletion(
  response: LlmResponse,
): import('../schema/enums.ts').FinishReason {
  const raw = response.raw;
  if (!isChatCompletionLike(raw)) {
    throw new Error(
      `extractFinishReasonFromOpenAIChatCompletion: response.raw is not ChatCompletion-like ` +
        `(got ${typeof raw})`,
    );
  }
  const choices = raw.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(
      'extractFinishReasonFromOpenAIChatCompletion: response.raw.choices is empty or non-array',
    );
  }
  const firstChoice = choices[0];
  if (firstChoice === undefined || typeof firstChoice !== 'object') {
    throw new Error(
      'extractFinishReasonFromOpenAIChatCompletion: response.raw.choices[0] is invalid',
    );
  }
  const finishReason = (firstChoice as { finish_reason?: unknown }).finish_reason;
  if (typeof finishReason !== 'string') {
    throw new Error(
      `extractFinishReasonFromOpenAIChatCompletion: finish_reason is not a string (got ${typeof finishReason})`,
    );
  }
  if (!(FINISH_REASONS as readonly string[]).includes(finishReason)) {
    throw new Error(
      `extractFinishReasonFromOpenAIChatCompletion: finish_reason "${finishReason}" not in FINISH_REASONS enum`,
    );
  }
  return finishReason as import('../schema/enums.ts').FinishReason;
}

/**
 * Type guard：判定 raw 是否为 ChatCompletion 形态（含 choices 数组）。
 */
function isChatCompletionLike(raw: unknown): raw is { choices: unknown[] } {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  return 'choices' in raw;
}


// ---------- extractFinishReasonForOfflineReplay（offline_replay 用） ----------

/**
 * offline_replay adapter 的 finishReason 提取器：总是返回 'stop'。
 *
 * 理由：offline_replay 是 fixture 路径，无真实 LLM 调用，finish_reason 语义上是
 * 「fixture 成功完成」→ 'stop'。若 fixture 模拟失败场景，应由 fixture 显式注入
 * （future：给 offline_replay adapter 加 finishReason 选项）。
 */
export function extractFinishReasonForOfflineReplay(
  _response: LlmResponse,
): import('../schema/enums.ts').FinishReason {
  return 'stop';
}
