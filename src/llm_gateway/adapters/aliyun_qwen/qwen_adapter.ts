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

// ===== Inner-retry helpers (429/5xx backoff BEFORE chain degradation) =====
// fallback_chain.ts 的契约：retry = 同模型内瞬时错误退避重试；fallback = 跨模型
// 切换。caller 必须先内层 retry，耗尽后才让链分类降级。2026-08-14 live 实测：
// 无内层 retry 时一次 429 即降级到 qwen-plus（不遵循 strict json_schema），
// 上游 fail-closed。本节按协议 §10（上限/指数退避/抖动/Retry-After）实现。

/** 同模型内层重试上限（3 次尝试 = 2 次退避重试）。 */
const INNER_RETRY_MAX = 3;

/** 安全读取任意错误对象上的数值 status（duck-type，对齐 error_classifier）。 */
function readNumericStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!('status' in error)) return null;
  const status = error.status;
  return typeof status === 'number' ? status : null;
}

/** 从错误上提取 Retry-After 秒数（header 或字段，缺失→null）。 */
function retryAfterSeconds(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as Record<string, unknown>;
  const headerValue =
    typeof record.headers === 'object' && record.headers !== null
      ? (record.headers as Record<string, unknown>)['retry-after'] ??
        (record.headers as Record<string, unknown>)['Retry-After']
      : null;
  const fieldValue = record['retryAfter'] ?? record['retry_after'];
  const candidate = headerValue ?? fieldValue;
  if (typeof candidate === 'string') {
    const n = Number(candidate);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

/** 指数退避 + 抖动 + Retry-After 优先（协议 §10）。 */
async function sleepBackoff(attempt: number, retryAfter: number | null): Promise<void> {
  const baseMs = retryAfter !== null ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
  const jitterMs = retryAfter !== null ? 0 : Math.floor(Math.random() * 400);
  await new Promise((resolve) => setTimeout(resolve, baseMs + jitterMs));
}

// ===== Types =====

/** Configuration/specification for qwen adapter config. */
export interface QwenAdapterConfig {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly timeoutMs?: number;
  /**
   * Caller 注入点：测试 mock 此函数即可控制每个 target 的成败。
   * 生产路径走 openai SDK 真调 DashScope HTTP。
   */
  readonly createChatCompletion?: QwenChatCompletionCaller;
  /**
   * 同模型内层重试上限（429/5xx 退避重试；默认 3 次尝试）。测试可注入 1 或
   * 保持默认以验证契约。
   */
  readonly innerRetryMax?: number;
  /**
   * 退避注入点（默认 sleepBackoff：指数退避 + 抖动 + Retry-After 优先）。
   * 测试注入 instant no-op 以避免真实等待。
   */
  readonly backoff?: (attempt: number, retryAfter: number | null) => Promise<void>;
}

type OpenAiChatCompletion = OpenAI.ChatCompletion;
type OpenAiMessageParam = OpenAI.ChatCompletionMessageParam;

/** Interface defining qwen chat completion request. */
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

/** Type alias: qwen chat completion caller. */
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
    // 180s 默认超时（2026-08-14 live 实测：60s 对 8k-token 结构化生成不够——
    // qwen3.7-max 大 JSON 生成 >60s 被 SDK 掐断，链误判 timeout 降级到不支持
    // strict json_schema 的 backup 模型 → 上游 fail-closed。长生成是慢不是坏。）
    timeout: config.timeoutMs ?? 180_000,
    // maxRetries:0 — fallback_chain 是唯一重试/降级机制（F11：每次降级在 attempts[] 留痕）。
    // SDK 默认 maxRetries:2 会在链外静默重试同一模型，污染 attempts[] 审计轨迹（不可见的双重重试）。
    maxRetries: 0,
  });
  // T-013（F-4-004 · CP-17）：jsonSchema 非空时透传为 response_format。
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
      const hasImages = msg.imageParts !== undefined && msg.imageParts.length > 0;
      if (hasImages && msg.role !== 'user') {
        // 图像仅 user 角色合法（types.ts LlmMessage 契约）——fail-closed，不静默丢图。
        throw new Error(
          `qwen_adapter: imageParts are only allowed on 'user' messages, got '${msg.role}'`,
        );
      }
      // 多模态：content 文本 + imageParts → OpenAI content 数组（协议组装归适配器层）。
      // 数组分支只可能发生在 user（上方 role 守卫），用字面量 'user' 消解 SDK 联合类型。
      if (hasImages && msg.role === 'user') {
        out.push({
          role: 'user',
          content: [
            { type: 'text' as const, text: msg.content },
            ...msg.imageParts!.map((p) => ({ type: 'image_url' as const, image_url: p })),
          ],
        });
      } else {
        out.push({ role: msg.role, content: msg.content });
      }
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
 * call() 真编排 executeFallbackChain（§5 / 05 §8.2）——穿透 DashScope HTTP：
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
    let providerRetries = 0;
    const innerRetryMax = config.innerRetryMax ?? INNER_RETRY_MAX;
    const backoff = config.backoff ?? sleepBackoff;

    // T-013（F-4-004 · CP-17）·Structured Output 完整接线状态：
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
        // 内层重试（fallback_chain.ts:11 规定的 caller 组合职责·2026-08-14 live 实测接线）：
        // 429/5xx 是同一模型的瞬时可恢复错误——先在同一模型内退避重试（上限 3 次，
        // 指数退避 + 抖动 + Retry-After 优先），耗尽后才把错误交还链分类降级。
        // 依据：2026-08-14 live 实测一次 429 即链降级到 qwen-plus（不遵循 strict
        // json_schema → 输出形状错误 → 上层 fail-closed）。内层重试避免把瞬时限流
        // 错判为模型不可用。4xx 立即抛（换模型无用，链按 fatal 处理）。
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= innerRetryMax; attempt += 1) {
          try {
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
          } catch (err) {
            lastError = err;
            const status = readNumericStatus(err);
            if (
              attempt < innerRetryMax &&
              status !== null &&
              (status === 429 || (status >= 500 && status < 600))
            ) {
              // 跨目标累计内层重试次数（进 adapterMeta.providerRetries → 收据）
              providerRetries += 1;
              await backoff(attempt, retryAfterSeconds(err));
              continue;
            }
            throw err;
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      },
    );

    // F11 / §5：链路失败绝不静默返回 null——必须 surface 为 throw。
    if (chainResult.data === null) {
      const summary = chainResult.degradationSummary ?? 'unknown chain failure';
      if (chainResult.fatalEncountered) {
        const status = extractFatalStatus(chainResult.attempts) ?? 500;
        // 可行动指引（README / `far research start` 承诺 "fails closed with actionable
        // guidance"）：认证/账户类 4xx 是环境问题而非模型问题——给出修复路径。
        const guidance =
          status === 401 || status === 403
            ? '；DASHSCOPE_API_KEY 无效或未授权：检查 .env 中的 key（Bailian 控制台 API-KEY 页重新生成），确认账户未冻结'
            : status === 400
              ? '；请求被拒（HTTP 400）：确认模型名可调用、账户余额/资源包充足（Bailian 控制台-模型广场与费用页）；欠费/冻结账户会以 400 形态出现'
              : '';
        throw new BailianHttpError(
          status,
          null,
          `qwen_adapter: fatal error during fallback chain: ${summary}${guidance}。修复后可重试 far research start/resume`,
        );
      }
      if (chainResult.chainExhausted) {
        // §5：三档 Qwen 全不可用 → caller 落 verdict=UNTESTED + NO_QWEN_FAMILY_AVAILABLE_REASON
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

    // 降级/内层重试留痕进 adapterMeta（无降级无重试时属性整体省略——exactOptionalPropertyTypes）
    const adapterMeta =
      chainResult.degradedFrom !== null || providerRetries > 0
        ? {
            ...(chainResult.degradedFrom !== null
              ? {
                  degradedFrom: chainResult.degradedFrom,
                  degradationCount: chainResult.degradationCount,
                  degradationSummary: chainResult.degradationSummary,
                }
              : {}),
            ...(providerRetries > 0 ? { providerRetries } : {}),
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
      ...(firstChoice?.finish_reason !== undefined && firstChoice.finish_reason !== null
        ? { finishReason: firstChoice.finish_reason }
        : { finishReason: null }),
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


