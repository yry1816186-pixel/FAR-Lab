import OpenAI from 'openai';
import type {
  LlmCallCredential,
  LlmRequest,
  LlmResponse,
  ProviderAdapter,
  ProviderProfile,
} from '../../types.ts';
import type {
  MultimodalContentInput,
  MultimodalProvider,
  MultimodalVlmResult,
  QwenVlModelId,
} from './types.ts';
import { QWEN_VL_DEFAULT_MODEL, QWEN_VL_MODELS, isQwenVlModel } from './types.ts';
import { COMPETITION_BASE_URL } from '../aliyun_qwen/snapshot.ts';
import {
  executeFallbackChain,
  BailianHttpError,
  type FallbackModelTarget,
  type FallbackAttempt,
} from '../../fallback_chain/index.ts';
import { NO_QWEN_FAMILY_AVAILABLE_REASON } from '../aliyun_qwen/fallback_config.ts';

// ===== Types =====

export interface QwenVlAdapterConfig {
  readonly modelId?: QwenVlModelId;
  readonly baseURL?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly createChatCompletion?: QwenVlChatCompletionCaller;
}

type OpenAiChatCompletion = OpenAI.ChatCompletion;
type OpenAiContentPart = OpenAI.ChatCompletionContentPart;
type OpenAiMessageParam = OpenAI.ChatCompletionMessageParam;

export interface QwenVlChatCompletionRequest {
  readonly modelId: QwenVlModelId;
  readonly messages: OpenAiMessageParam[];
  readonly temperature: number;
  readonly maxTokens: number;
}

export type QwenVlChatCompletionCaller = (
  request: QwenVlChatCompletionRequest,
) => Promise<OpenAiChatCompletion>;

// ===== Internal helpers =====

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function resolveApiKey(config: QwenVlAdapterConfig): string | undefined {
  return config.apiKey ?? process.env.DASHSCOPE_API_KEY;
}

function isVisionConfigured(config: QwenVlAdapterConfig): boolean {
  const key = resolveApiKey(config);
  return key !== undefined && key.length > 0;
}

function buildVisionFallbackChain(primary: QwenVlModelId): readonly FallbackModelTarget[] {
  const ordered = [
    primary,
    ...QWEN_VL_MODELS.filter((candidate) => candidate !== primary),
  ];
  return ordered.map((targetModelId, index): FallbackModelTarget => ({
    modelId: targetModelId,
    role: index === 0 ? 'primary' : `backup_${index}`,
  }));
}

function qwenVlTargetModel(target: FallbackModelTarget): QwenVlModelId {
  if (!isQwenVlModel(target.modelId)) {
    throw new Error(`qwen_vl_adapter: fallback target is not a Qwen-VL model: ${target.modelId}`);
  }
  return target.modelId;
}

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

async function createChatCompletion(
  config: QwenVlAdapterConfig,
  baseURL: string,
  request: QwenVlChatCompletionRequest,
): Promise<OpenAiChatCompletion> {
  if (config.createChatCompletion !== undefined) {
    return config.createChatCompletion(request);
  }
  const apiKey = resolveApiKey(config);
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('qwen_vl_adapter: DASHSCOPE_API_KEY is required for model calls');
  }
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: config.timeoutMs ?? 60_000,
    // maxRetries:0 — fallback_chain 是唯一重试/降级机制（F11）；与 qwen_adapter.ts:68 + qwen_vl_client.ts:231 同口径。
    maxRetries: 0,
  });
  return client.chat.completions.create({
    model: request.modelId,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
  });
}

/**
 * 检查 MultimodalContentInput 是否包含图像。
 */
function hasImage(input: MultimodalContentInput): boolean {
  const hasRef = input.imageRef !== undefined && input.imageRef.length > 0;
  const hasB64 = input.imageBase64 !== undefined && input.imageBase64.length > 0;
  return hasRef || hasB64;
}

/**
 * 将图像解析为 OpenAI Vision API content part 的 image_url。
 */
function resolveImageUrl(input: MultimodalContentInput): string | null {
  if (input.imageRef !== undefined && input.imageRef.length > 0) {
    return input.imageRef;
  }
  if (input.imageBase64 !== undefined && input.imageBase64.length > 0) {
    const mime = input.mimeType.length > 0 ? input.mimeType : 'image/png';
    return `data:${mime};base64,${input.imageBase64}`;
  }
  return null;
}

/**
 * 从 OpenAI ChatCompletion 对象中提取 request_id。
 * 优先 header（x-request-id / SDK 注入的 _request_id），兜底 body（request_id → id）。
 * DashScope 在响应体中附加 request_id 字段（非 OpenAI 标准字段）。
 */
function pullRequestId(
  data: unknown,
  responseHeaders: Headers | undefined,
): string | null {
  const headerId = responseHeaders?.get('x-request-id')?.trim();
  if (headerId !== undefined && headerId.length > 0) {
    return headerId;
  }
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  return (
    nonEmptyString(record._request_id) ??
    nonEmptyString(record.request_id) ??
    nonEmptyString(record.id)
  );
}

/**
 * 提取 structured claim：从 VLM 响应文本中尝试解析 JSON。
 */
function extractStructuredClaim(content: string): unknown {
  const trimmed = content.trim();
  const jsonBlock = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(trimmed);
  if (jsonBlock !== null && jsonBlock[1] !== undefined) {
    try {
      return JSON.parse(jsonBlock[1].trim());
    } catch {
      // not valid JSON
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { rawClaim: trimmed };
  }
}

function vlmResultFromCompletion(
  completion: OpenAiChatCompletion,
  targetModelId: QwenVlModelId,
  input: MultimodalContentInput,
): MultimodalVlmResult {
  const choices = completion.choices;
  if (choices.length === 0) {
    throw new Error('qwen_vl_adapter: vision call returned no choices');
  }

  const firstChoice = choices[0];
  if (firstChoice === undefined) {
    throw new Error('qwen_vl_adapter: vision call returned no first choice');
  }

  const message = firstChoice.message;
  if (message === undefined) {
    throw new Error('qwen_vl_adapter: vision call returned no message');
  }

  const interpretation = typeof message.content === 'string' ? message.content : '';
  const finishReason = firstChoice.finish_reason ?? 'stop';
  const usage = completion.usage;
  const requestId = pullRequestId(completion, undefined);

  const credential: LlmCallCredential = {
    providerProfile: 'competition_aliyun_qwen',
    providerRequestId: requestId ?? null,
    modelId: targetModelId,
    modelVersion: null,
    capability: 'vision',
    isoTimestamp: new Date().toISOString(),
    tokenUsage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
    adapterMeta: {
      qwenVlModel: targetModelId,
      imageMimeType: input.mimeType,
    },
  };

  return {
    callRecordSeq: 0,
    credential,
    interpretation,
    structuredClaim: extractStructuredClaim(interpretation),
    finishReason,
  };
}

// ===== Factory =====

/**
 * 创建 Qwen-VL adapter。
 *
 * 同时实现 ProviderAdapter（可注册到 LlmGateway）和 MultimodalProvider（vision 调用）。
 * C10 纪律：Qwen 型号 strings 仅在本文件与 types.ts 出现，不泄露到 core。
 *
 * 生产需要 DASHSCOPE_API_KEY；无 key 时 declaresVisionCapability() 返回 false。
 */
export function createQwenVlAdapter(config: QwenVlAdapterConfig = {}): ProviderAdapter & MultimodalProvider {
  const modelId: QwenVlModelId = config.modelId ?? QWEN_VL_DEFAULT_MODEL;
  if (!isQwenVlModel(modelId)) {
    throw new Error(`qwen_vl_adapter: unsupported VL model ${modelId}`);
  }

  const baseURL = config.baseURL ?? COMPETITION_BASE_URL;
  const profile: ProviderProfile = 'competition_aliyun_qwen';

  // ===== ProviderAdapter implementation（text-only path，一般不走这里） =====

  async function call(request: LlmRequest): Promise<LlmResponse> {
    const apiKey = resolveApiKey(config);
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error('qwen_vl_adapter: cannot call text path without DASHSCOPE_API_KEY');
    }

    const openaiMessages: OpenAiMessageParam[] = [];
    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        continue; // tool messages not supported in this text path
      }
      if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
        openaiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const completion: OpenAiChatCompletion = await createChatCompletion(config, baseURL, {
      modelId,
      messages: openaiMessages,
      temperature: request.temperature ?? 0.3,
      maxTokens: request.maxTokens ?? 2048,
    });

    const firstChoice = completion.choices[0];
    const message = firstChoice?.message;
    const responseContent = typeof message?.content === 'string' ? message.content : '';
    const usage = completion.usage;
    const requestId = pullRequestId(completion, undefined);

    return {
      credential: {
        providerProfile: profile,
        providerRequestId: requestId ?? null,
        modelId,
        modelVersion: null,
        capability: 'reasoning' as const,
        isoTimestamp: new Date().toISOString(),
        tokenUsage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
        },
      },
      content: responseContent,
      raw: completion,
    };
  }

  // ===== MultimodalProvider implementation =====

  function declaresVisionCapability(): boolean {
    return isVisionConfigured(config);
  }

  async function interpret(input: MultimodalContentInput): Promise<MultimodalVlmResult> {
    if (!declaresVisionCapability()) {
      throw new Error(
        'qwen_vl_adapter: vision capability not available ' +
        '(DASHSCOPE_API_KEY missing or offline profile)',
      );
    }

    if (!hasImage(input)) {
      throw new Error('qwen_vl_adapter: interpret() requires imageRef or imageBase64');
    }

    const apiKey = resolveApiKey(config);
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error('qwen_vl_adapter: DASHSCOPE_API_KEY is required for vision calls');
    }

    const imageUrl = resolveImageUrl(input);
    if (imageUrl === null) {
      throw new Error('qwen_vl_adapter: could not resolve image URL');
    }

    // Build multimodal message with image content using OpenAI's native content part types.
    const contentParts: OpenAiContentPart[] = [
      { type: 'text', text: input.prompt },
      {
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'auto' },
      },
    ];
    const messages: OpenAiMessageParam[] = [
      {
        role: 'user',
        content: contentParts,
      },
    ];
    const chain = buildVisionFallbackChain(modelId);
    const chainResult = await executeFallbackChain(chain, async (target) => {
      const targetModelId = qwenVlTargetModel(target);
      const completion = await createChatCompletion(config, baseURL, {
        modelId: targetModelId,
        messages,
        temperature: input.prompt.includes('结构化') ? 0.1 : 0.3,
        maxTokens: 2048,
      });
      const result = vlmResultFromCompletion(completion, targetModelId, input);
      return {
        data: result,
        dashscopeRequestId: result.credential.providerRequestId,
      };
    });

    if (chainResult.data === null) {
      const reason = chainResult.degradationSummary ?? 'no Qwen-VL fallback target succeeded';
      if (chainResult.fatalEncountered) {
        const status = extractFatalStatus(chainResult.attempts) ?? 500;
        throw new BailianHttpError(
          status,
          null,
          `qwen_vl_adapter: fatal error during fallback chain: ${reason}`,
        );
      }
      if (chainResult.chainExhausted) {
        // 24 §5：Qwen-VL 家族全不可用 → caller 落 verdict=UNTESTED（绝不切非国产基座·D3 红线）。
        throw Object.assign(
          new Error(`qwen_vl_adapter: ${NO_QWEN_FAMILY_AVAILABLE_REASON}: ${reason}`),
          {
            code: 'RETRY_EXHAUSTED' as const,
            reason: NO_QWEN_FAMILY_AVAILABLE_REASON,
            degradedFrom: chainResult.degradedFrom,
            attempts: chainResult.attempts,
          },
        );
      }
      throw new Error(`qwen_vl_adapter: chain returned null data unexpectedly: ${reason}`);
    }

    const result = chainResult.data;
    // 降级留痕进 adapterMeta（degradedFrom=null 表示无降级，属性整体省略——exactOptionalPropertyTypes）
    if (chainResult.degradedFrom !== null) {
      return {
        ...result,
        credential: {
          ...result.credential,
          adapterMeta: {
            ...result.credential.adapterMeta,
            degradedFrom: chainResult.degradedFrom,
            degradationCount: chainResult.degradationCount,
            degradationSummary: chainResult.degradationSummary,
          },
        },
      };
    }
    return result;
  }

  return {
    profile,
    call,
    declaresVisionCapability,
    interpret,
  };
}
