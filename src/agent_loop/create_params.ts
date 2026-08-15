/**
 * buildCreateParams —— 构造 LlmRequest 形态的调用参数 + R1 互斥守卫 + N3 反幻觉铁律。
 *
 * 适配说明（与 spec §4.2 的差异·按项目实际 LlmRequest 形态优先·AGENTS §1 Authority Order）：
 *   1. spec §4.2 的 BuiltCreateParams 是百炼 Node SDK create() 参数形态（含 response_format 对象 +
 *      enable_thinking + stream）。项目 LlmRequest（llm_gateway/types.ts）是 adapter-agnostic 形态：
 *      responseFormat 是字符串标志（'json_schema' | 'text'）·无 enable_thinking/stream/response_format 对象。
 *      故本文件 BuiltCreateParams 对齐 LlmRequest 形态（可直接传 gateway.callLlm），额外加 enableThinking
 *      顶层字段（审计 + 测试断言·LlmRequest 不直接消费·adapter 由 profile 决定 thinking 行为·此处仅做
 *      互斥守卫的语义记录）+ modelId 字段（R1 路由审计 + repro_hash 输入·LlmRequest 无此字段）。
 *   2. spec §4.2 re-export callBailianStructured/callBailianThinking——项目未实现这两个函数（见 run_stage.ts
 *      适配说明·改用 gateway.callLlm）。本文件不 re-export 这两个函数。
 *   3. spec §4.2 从 aliyun_qwen adapter import 模型常量——按 §12.1「Core 不 import Qwen 常量」+
 *      模型中立红线，本文件**零模型 ID 常量**：R1 模型守卫（modelId 与
 *      enableThinking 路由匹配）下沉至 adapter（src/llm_gateway/adapters/aliyun_qwen/create_params.ts
 *      assertQwenModel + 路由）·adapter 持模型身份·core 仅保留 R1 互斥守卫（不依赖模型身份）。
 *      modelId 经 CreateParamsInput 透传 + 进 repro_hash（06§2.2）·core 不校验其值。
 *
 * N3 反幻觉铁律：绝不输出百炼 Node SDK 三大幻觉源字段（详见 n3_anti_hallucination 测试）。
 *   enableThinking 是 BuiltCreateParams 顶层字段（非 HTTP header·非 Python SDK extra 参数）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { LlmMessage } from '../llm_gateway/types.ts';
import type { PayloadKind, PurposeTag } from '../schema/enums.ts';
import type { StageId } from './types.ts';


// ---------- CreateParamsInput ----------

/**
 * buildCreateParams 的输入。
 *
 * stageId/payloadKind/purposeTag 用于错误上下文 + 审计（不进 LlmRequest·落 call_records）。
 * modelId 用于 R1 路由守卫 + repro_hash 输入（06§2.2 modelId 进 repro_hash·真相源唯一）。
 * responseFormat 可选：未提供时由 enableThinking 派生（false→'json_schema'/true→'text'）；
 *   显式提供时与 enableThinking 做 R1 互斥校验。
 * researchInput 是本轮研究输入原文（stage1 消费·此处仅透传上下文·不进 LlmRequest）。
 */
export interface CreateParamsInput {
  readonly stageId: StageId;
  readonly payloadKind: PayloadKind;
  readonly purposeTag: PurposeTag;
  readonly modelId: string;
  readonly messages: readonly LlmMessage[];
  readonly enableThinking: boolean;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly responseFormat?: 'text' | 'json_schema';
  readonly researchInput?: string;
}


// ---------- BuiltCreateParams ----------

/**
 * 构造后的调用参数（符合 LlmRequest 形态·可直接传 gateway.callLlm）。
 *
 * N3 修复核心：enableThinking 是顶层字段（非 HTTP header·非 Python SDK extra 参数）。
 * 即便 LlmRequest 不直接消费 enableThinking（adapter 由 profile 决定 thinking 行为），
 * 此处保留用于 R1 互斥守卫的语义记录 + 审计 + 测试断言。
 *
 * modelId 不在 LlmRequest 内（adapter 由 profile 决定实际 model）·此处保留用于
 * R1 路由审计 + repro_hash 输入（06§2.2 modelId 进 repro_hash）。
 *
 * responseFormat 总是被设置（structured→'json_schema'/thinking→'text'）·便于测试断言 + 审计。
 */
export interface BuiltCreateParams {
  readonly modelId: string;
  readonly messages: readonly LlmMessage[];
  readonly responseFormat: 'text' | 'json_schema';
  readonly enableThinking: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly purposeTag?: PurposeTag;
}


// ---------- buildCreateParams ----------

/**
 * 构造 LlmRequest 形态的调用参数 + R1 互斥守卫 + R1 模型守卫。
 *
 * 流程：
 *   1. 派生 effective responseFormat（input 显式 > enableThinking 派生）。
 *   2. R1 互斥守卫：enableThinking=true 与 responseFormat='json_schema' 互斥 → throw R1_MUTEX。
 *   3. 返回 BuiltCreateParams（顶层 enableThinking·非 header/extra）。
 *
 * 模型守卫下沉：R1 模型守卫（modelId 与 enableThinking 路由匹配）由 adapter 负责（adapter 持模型身份·
 *   core 模型中立）。core buildCreateParams 不做模型身份校验，仅透传 modelId（进 repro_hash·06§2.2）。
 *
 * @throws {code: 'R1_MUTEX'} enableThinking=true 且 responseFormat='json_schema'（思考模式不支持结构化输出）
 *
 * R1 互斥依据：06§2.2 R1 互斥铁律 + help.aliyun.com/zh/model-studio/qwen-structured-output
 *   「思考模式模型暂不支持结构化输出」·2026-06-25 实证。
 */
export function buildCreateParams(input: CreateParamsInput): BuiltCreateParams {
  // 1. 派生 effective responseFormat（input 显式优先·否则由 enableThinking 派生）
  const effectiveResponseFormat: 'text' | 'json_schema' =
    input.responseFormat ?? (input.enableThinking ? 'text' : 'json_schema');

  // 2. R1 互斥守卫：思考模式 + 结构化输出互斥（06§2.2 R1 互斥铁律）
  if (input.enableThinking && effectiveResponseFormat === 'json_schema') {
    throw Object.assign(
      new Error(
        `buildCreateParams[${input.stageId}]: R1_MUTEX `
          + "(enableThinking=true 与 responseFormat='json_schema' 互斥·"
          + '思考模式不支持结构化输出·见 06§2.2 R1 互斥铁律)',
      ),
      { code: 'R1_MUTEX', stageId: input.stageId },
    );
  }

  // 3. 返回 BuiltCreateParams（enableThinking 是顶层字段·N3 反幻觉）
  //    R1 模型守卫已下沉至 adapter（adapter 持模型身份·core 模型中立·不持模型 ID 常量）。
  //    temperature/maxTokens 用条件展开避免 exactOptionalPropertyTypes 下的 undefined 赋值
  //    （LlmRequest 的 optional 字段是 `?: number`·不可赋 undefined·须 absent 或 number）。
  return {
    modelId: input.modelId,
    messages: input.messages,
    responseFormat: effectiveResponseFormat,
    enableThinking: input.enableThinking,
    purposeTag: input.purposeTag,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  };
}
