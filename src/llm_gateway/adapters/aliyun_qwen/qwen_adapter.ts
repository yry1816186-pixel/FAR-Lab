import OpenAI from 'openai';
import type {
  LlmCallCredential,
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
  });
  return client.chat.completions.create({
    model: request.modelId,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
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

    const chainResult = await executeFallbackChain(
      COMPETITION_FALLBACK_CHAIN,
      async (target) => {
        const targetModelId = qwenTargetModel(target);
        const completion = await createChatCompletion(config, baseURL, {
          modelId: targetModelId,
          messages,
          temperature,
          maxTokens,
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
      capability: 'reasoning' as const,
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
