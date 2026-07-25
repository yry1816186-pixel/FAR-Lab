import OpenAI from 'openai';
import type {
  LlmCallCredential,
  LlmJsonSchema,
  LlmRequest,
  LlmResponse,
  ProviderAdapter,
  ProviderProfile,
} from '../../types.ts';
import { COMPETITION_BASE_URL } from './snapshot.ts';
import {
  COMPETITION_FALLBACK_CHAIN,
  NO_QWEN_FAMILY_AVAILABLE_REASON,
} from './fallback_config.ts';
import { assertQwenModel } from './qwen_family.ts';
import { getDataRequestId } from './extract_request_id.ts';
import {
  executeFallbackChain,
  BailianHttpError,
  type FallbackModelTarget,
  type FallbackAttempt,
} from '../../fallback_chain/index.ts';

// ===== Types =====

export interface QwenAdapterConfig {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly timeoutMs?: number;
  /**
   * Caller 注入点：测试 mock 此函数即可控制每个 target 的成败（CLAUDE.md §3）。
   * 生产路径走 openai SDK 真调 DashScope HTTP。
   */
  readonly createChatCompletion?: QwenChatCompletionCaller;
}

type OpenAiChatCompletion = OpenAI.ChatCompletion;
type OpenAiMessageParam = OpenAI.ChatCompletionMessageParam;

export interface QwenChatCompletionRequest {
  readonly modelId: string;
  readonly messages: OpenAiMessageParam[];
  readonly temperature: number;
  readonly maxTokens: number;
  /**
   * Structured Output schema（T-013 接线）。非 undefined 时透传为 OpenAI SDK
   * response_format: { type: 'json_schema', json_schema: {...} }。
   * DashScope 兼容此形态（compatible-mode/v1）。
   */
  readonly jsonSchema?: LlmJsonSchema;
}

export type QwenChatCompletionCaller = (
  request: QwenChatCompletionRequest,
) => Promise<OpenAiChatCompletion>;

// ===== Internal helpers =====

function resolveApiKey(config: QwenAdapterConfig): string | undefined {
  return config.apiKey ?? process.env.DASHSCOPE_API_KEY;
}

async function createChatCompletion(
  config: QwenAdapterConfig,
  baseURL: string,
  request: QwenChatCompletionRequest,
): Promise<OpenAiChatCompletion> {
  if (config.createChatCompletion !== undefined) {
    return config.createChatCompletion(request);
  }
  const apiKey = resolveApiKey(config);
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('qwen_adapter: DASHSCOPE_API_KEY is required for model calls');
  }
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: config.timeoutMs ?? 60_000,
    // maxRetries:0 — fallback_chain 是唯一重试/降级机制（F11：每次降级在 attempts[] 留痕）。
    // SDK 默认 maxRetries:2 会在链外静默重试同一模型，污染 attempts[] 审计轨迹（不可见的双重重试）。
    maxRetries: 0,
  });
  // T-013（评委04 F-4-004 · CP-17）：jsonSchema 非空时透传为 response_format。
  // 形态与 OpenAI SDK ResponseFormatJSONSchema 一致（DashScope compatible-mode 兼容）。
  // response_format 仅在 jsonSchema 存在时注入（exactOptionalPropertyTypes：undefined 不赋）。
  const responseFormatParam: OpenAI.ChatCompletionCreateParams['response_format'] | undefined =
    request.jsonSchema !== undefined
      ? {
          type: 'json_schema',
          json_schema: {
            name: request.jsonSchema.name,
            ...(request.jsonSchema.strict !== undefined
              ? { strict: request.jsonSchema.strict }
              : {}),
            schema: request.jsonSchema.schema,
          },
        }
      : undefined;
  return client.chat.completions.create({
    model: request.modelId,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    ...(responseFormatParam !== undefined ? { response_format: responseFormatParam } : {}),
  });
}

// fail-closed: chain target 必须是 Qwen 家族成员（COMPETITION_FALLBACK_CHAIN 不变量）
function qwenTargetModel(target: FallbackModelTarget): string {
  assertQwenModel(target.modelId);
  return target.modelId;
}

function toOpenAiMessages(request: LlmRequest): OpenAiMessageParam[] {
  const out: OpenAiMessageParam[] = [];
  for (const msg of request.messages) {
    if (msg.role === 'tool') continue;
    if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
      out.push({ role: msg.role, content: msg.content });
    }
  }
  return out;
}

// 从 fatal attempt 的 triggerSignal 提取 HTTP 状态码（'http_400' → 400）。
// 非 HTTP fatal（unknown_or_config / non_qwen_model）→ null，由 caller 决定兜底。
function extractFatalStatus(attempts: readonly FallbackAttempt[]): number | null {
  for (const a of attempts) {
    if (a.outcome !== 'fatal' || a.triggerSignal === null) continue;
    const m = /^http_(\d+)$/.exec(a.triggerSignal);
    if (m !== null && m[1] !== undefined) {
      return parseInt(m[1], 10);
    }
  }
  return null;
}

// ===== Factory =====

/**
 * 创建 competition_aliyun_qwen 文本-only adapter。
 *
 * call() 真编排 executeFallbackChain（spec 24 §5 / 05 §8.2）——穿透 DashScope HTTP：
 *   - 429/5xx/timeout/network → 自动 fallback 至下一 Qwen target（COMPETITION_FALLBACK_CHAIN）
 *   - 4xx/config → fatal 终止整链，call() 抛 BailianHttpError（绝静默换 F11）
 *   - 链路耗尽（三档全不可用）→ call() 抛 RETRY_EXHAUSTED + NO_QWEN_FAMILY_AVAILABLE_REASON
 *
 * C10 纪律：Qwen/DashScope 字面量仅在 adapter 层（本目录允许）；
 * core（src/api/）禁出现（model_neutrality 扫描红线）。
 */
export function createQwenAdapter(config: QwenAdapterConfig = {}): ProviderAdapter {
  const baseURL = config.baseURL ?? COMPETITION_BASE_URL;
  const profile: ProviderProfile = 'competition_aliyun_qwen';

  async function call(request: LlmRequest): Promise<LlmResponse> {
    const messages = toOpenAiMessages(request);
    const temperature = request.temperature ?? 0.3;
    const maxTokens = request.maxTokens ?? 2048;

    // T-013（评委04 F-4-004 · 2026-07-25 第 3 轮 CP-17）·Structured Output 完整接线状态：
    //   ✅ 接线完成：LlmRequest.jsonSchema（schema 对象）→ createChatCompletion →
    //      OpenAI SDK response_format:{type:'json_schema', json_schema:{name,schema,strict}}。
    //      caller（run_stage.ts）用 zodToJsonSchema(stageSchema) 注入 LlmRequest.jsonSchema。
    //   ✅ R1 互斥已守卫：enable_thinking=true 与 response_format 互斥（agent_loop/create_params.ts
    //      R1_MUTEX + adapter create_params.ts ThinkingJsonSchemaConflictError 双层）。
    //   ✅ STRUCTURED_SAFE_MODEL 路由：response_format 存在时 buildCreateParams 切 qwen-max
    //      （qwen3-thinking 不支持 json_schema · 2026-07-07 凭据实测 404）。
    //   ⚠ 端到端验证：需真实 Qwen 凭证（DASHSCOPE_API_KEY）触网验证 DashScope 真按 schema 返回。
    //      本地用 mock caller（断言 response_format 被构造）+ offline_replay（fixture 已结构化）验证透传正确性。
    //      端到端触网验证是 BLOCKED_EXTERNAL（B-006 相关）。
    //   Function Calling / tools 接入是 V2（需 DashScope tools API + 真实凭证·DEFERRED）。
    const capability: 'reasoning' | 'structured' =
      request.responseFormat === 'json_schema' ? 'structured' : 'reasoning';

    const chainResult = await executeFallbackChain(
      COMPETITION_FALLBACK_CHAIN,
      async (target) => {
        const targetModelId = qwenTargetModel(target);
        const completion = await createChatCompletion(config, baseURL, {
          modelId: targetModelId,
          messages,
          temperature,
          maxTokens,
          // T-013：jsonSchema 透传（仅在 responseFormat='json_schema' 时有意义）
          ...(request.responseFormat === 'json_schema' && request.jsonSchema !== undefined
            ? { jsonSchema: request.jsonSchema }
            : {}),
        });
        const requestId = getDataRequestId(completion);
        return {
          data: completion,
          dashscopeRequestId: requestId,
        };
      },
    );

    // F11 / spec 24 §5：链路失败绝不静默返回 null——必须 surface 为 throw。
    if (chainResult.data === null) {
      const summary = chainResult.degradationSummary ?? 'unknown chain failure';
      if (chainResult.fatalEncountered) {
        const status = extractFatalStatus(chainResult.attempts) ?? 500;
        throw new BailianHttpError(
          status,
          null,
          `qwen_adapter: fatal error during fallback chain: ${summary}`,
        );
      }
      if (chainResult.chainExhausted) {
        // spec 24 §5：三档 Qwen 全不可用 → caller 落 verdict=UNTESTED + NO_QWEN_FAMILY_AVAILABLE_REASON
        // 绝不切非国产基座（D3 红线）。adapter 层抛 RETRY_EXHAUSTED 供上层 verdict stage 消费。
        throw Object.assign(
          new Error(
            `qwen_adapter: ${NO_QWEN_FAMILY_AVAILABLE_REASON}: ${summary}`,
          ),
          {
            code: 'RETRY_EXHAUSTED' as const,
            reason: NO_QWEN_FAMILY_AVAILABLE_REASON,
            degradedFrom: chainResult.degradedFrom,
            attempts: chainResult.attempts,
          },
        );
      }
      // 防御性：chainResult.data=null 但既非 fatal 也非 exhausted（违反 chain 契约）
      throw new Error(`qwen_adapter: chain returned null data unexpectedly: ${summary}`);
    }

    const completion = chainResult.data;
    const firstChoice = completion.choices[0];
    const message = firstChoice?.message;
    const responseContent = typeof message?.content === 'string' ? message.content : '';
    const usage = completion.usage;
    const requestId = getDataRequestId(completion);
    const succeededModelId =
      chainResult.succeededModelId ?? qwenTargetModel(COMPETITION_FALLBACK_CHAIN[0]!);

    // 降级留痕进 adapterMeta（degradedFrom=null 表示无降级，属性整体省略——exactOptionalPropertyTypes）
    const adapterMeta =
      chainResult.degradedFrom !== null
        ? {
            degradedFrom: chainResult.degradedFrom,
            degradationCount: chainResult.degradationCount,
            degradationSummary: chainResult.degradationSummary,
          }
        : null;

    const credential: LlmCallCredential = {
      providerProfile: profile,
      providerRequestId: requestId,
      modelId: succeededModelId,
      modelVersion: null,
      capability,
      isoTimestamp: new Date().toISOString(),
      tokenUsage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      ...(adapterMeta !== null ? { adapterMeta } : {}),
    };

    return {
      credential,
      content: responseContent,
      raw: completion,
    };
  }

  return { profile, call };
}
