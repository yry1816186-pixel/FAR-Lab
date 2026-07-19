import OpenAI from 'openai';
import type {
  LlmCallCredential,
  LlmCapability,
  TokenUsage,
} from '../../types.ts';
import type {
  MultimodalContentInput,
  MultimodalVlmResult,
  QwenVlModelId,
} from './types.ts';
import { QWEN_VL_DEFAULT_MODEL, isQwenVlModel } from './types.ts';
import { COMPETITION_BASE_URL } from '../aliyun_qwen/snapshot.ts';

// ===== Type aliases for OpenAI SDK types =====

type OpenAiChatCompletion = OpenAI.ChatCompletion;
type OpenAiContentPart = OpenAI.ChatCompletionContentPart;

// ===== Error types =====

export class QwenVlImageMissingError extends Error {
  constructor() {
    super('qwen_vl_client: imageRef or imageBase64 is required for vision calls');
    this.name = 'QwenVlImageMissingError';
  }
}

export class QwenVlResponseMalformedError extends Error {
  constructor(reason: string) {
    super(`qwen_vl_client: VLM response is malformed: ${reason}`);
    this.name = 'QwenVlResponseMalformedError';
  }
}

export class QwenVlNotAvailableError extends Error {
  constructor() {
    super('qwen_vl_client: Qwen-VL is not available (DASHSCOPE_API_KEY missing or offline profile)');
    this.name = 'QwenVlNotAvailableError';
  }
}

// ===== Client type =====

export interface QwenVlClientConfig {
  readonly modelId?: QwenVlModelId;
  readonly baseURL?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

export interface QwenVlClient {
  /** 检查是否配置了有效的 API key */
  isConfigured(): boolean;
  /** 发送多模态请求到 Qwen-VL */
  sendMultimodalRequest(
    input: MultimodalContentInput,
    callRecordSeq: number,
  ): Promise<MultimodalVlmResult>;
}

// ===== Internal helpers =====

/**
 * 构建包含图像和文本的多模态消息内容。
 * 生产用 imageRef（URL/路径），测试用 imageBase64。
 */
function buildVisionContent(input: MultimodalContentInput): OpenAiContentPart[] {
  const parts: OpenAiContentPart[] = [];

  parts.push({
    type: 'text',
    text: input.prompt,
  });

  const imageUrl = resolveImageUrl(input);
  if (imageUrl !== null) {
    parts.push({
      type: 'image_url',
      image_url: {
        url: imageUrl,
        detail: 'auto',
      },
    });
  }

  return parts;
}

/**
 * 从 MultimodalContentInput 解析出 image URL。
 * imageRef 优先级 > imageBase64（生产路径优先）。
 * imageBase64 会加上 data URI 前缀。
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
 * 从 OpenAI ChatCompletion 提取 finish_reason。
 */
function extractFinishReason(completion: OpenAiChatCompletion): string {
  const choices = completion.choices;
  if (choices.length === 0) {
    return 'stop';
  }
  return choices[0]?.finish_reason ?? 'stop';
}

/**
 * 从 unknown 值安全提取非空字符串。
 */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 提取 DashScope request_id（header / SDK _request_id 优先，body 兜底）。
 * 生产 profile 下缺失时抛错。
 * [已实证·N4 locked] header 名 x-request-id 已由设计锁定。
 */
function extractDashscopeRequestId(
  data: unknown,
  responseHeaders: Headers | undefined,
  providerProfile: string,
): string | null {
  if (providerProfile !== 'competition_aliyun_qwen') {
    return null;
  }
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
 * 提取 structured claim：尝试从 VLM 响应中解析 JSON。
 * 无法解析时返回原始文本。
 */
function extractStructuredClaim(content: string): unknown {
  const trimmed = content.trim();
  // 尝试提取 ```json ... ``` 块
  const jsonBlock = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(trimmed);
  if (jsonBlock !== null && jsonBlock[1] !== undefined) {
    try {
      return JSON.parse(jsonBlock[1].trim());
    } catch {
      // 不是合法 JSON，fall through
    }
  }
  // 尝试直接解析整个响应
  try {
    return JSON.parse(trimmed);
  } catch {
    // 返回原始文本
    return { rawClaim: trimmed };
  }
}

/**
 * 判断给定 capability 是否匹配输入。
 * 只有 capability='vision' 时才真正发起 VLM 调用。
 */
function resolveCapability(hasImage: boolean): LlmCapability {
  return hasImage ? 'vision' : 'reasoning';
}

// ===== Factory =====

/**
 * 创建 Qwen-VL 客户端。
 *
 * C10 纪律：Qwen-VL 型号仅在 adapter 目录内出现。
 * 生产调用需要 DASHSCOPE_API_KEY 环境变量。
 * 无 key 时 isConfigured() 返回 false（降级 UNTESTED，禁文本 LLM 编造 fallback）。
 */
export function createQwenVlClient(config: QwenVlClientConfig = {}): QwenVlClient {
  const modelId = config.modelId ?? QWEN_VL_DEFAULT_MODEL;
  if (!isQwenVlModel(modelId)) {
    throw new Error(`qwen_vl_client: unsupported model ${modelId}`);
  }

  const baseURL = config.baseURL ?? COMPETITION_BASE_URL;
  const resolvedApiKey = config.apiKey ?? process.env.DASHSCOPE_API_KEY;
  const timeoutMs = config.timeoutMs ?? 60_000;

  function isConfigured(): boolean {
    return resolvedApiKey !== undefined && resolvedApiKey.length > 0;
  }

  async function sendMultimodalRequest(
    input: MultimodalContentInput,
    callRecordSeq: number,
  ): Promise<MultimodalVlmResult> {
    if (!isConfigured()) {
      throw new QwenVlNotAvailableError();
    }

    const imageUrl = resolveImageUrl(input);
    if (imageUrl === null) {
      throw new QwenVlImageMissingError();
    }

    const content = buildVisionContent(input);
    const hasImage = imageUrl !== null;

    const client = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL,
      timeout: timeoutMs,
      // maxRetries:0 — fallback_chain 是唯一重试/降级机制（F11）；SDK 默认 maxRetries:2 会在链外静默重试，污染 attempts[] 审计。
      maxRetries: 0,
    });

    const completion: OpenAiChatCompletion = await client.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      temperature: input.prompt.includes('结构化') ? 0.1 : 0.3,
      max_tokens: 2048,
    });

    const choices = completion.choices;
    if (choices.length === 0) {
      throw new QwenVlResponseMalformedError('no choices in response');
    }

    const firstChoice = choices[0];
    if (firstChoice === undefined) {
      throw new QwenVlResponseMalformedError('no first choice');
    }

    const message = firstChoice.message;
    if (message === undefined) {
      throw new QwenVlResponseMalformedError('no message in first choice');
    }

    const responseContent = typeof message.content === 'string' ? message.content : '';
    const finishReason = extractFinishReason(completion);
    const providerRequestId = extractDashscopeRequestId(
      completion,
      undefined,
      'competition_aliyun_qwen',
    );

    const usage = completion.usage;
    const tokenUsage: TokenUsage = {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };

    const credential: LlmCallCredential = {
      providerProfile: 'competition_aliyun_qwen',
      providerRequestId,
      modelId,
      modelVersion: null,
      capability: resolveCapability(hasImage),
      isoTimestamp: new Date().toISOString(),
      tokenUsage,
      adapterMeta: {
        qwenVlModel: modelId,
        imageMimeType: input.mimeType,
      },
    };

    return {
      callRecordSeq,
      credential,
      interpretation: responseContent,
      structuredClaim: extractStructuredClaim(responseContent),
      finishReason,
    };
  }

  return { isConfigured, sendMultimodalRequest };
}
