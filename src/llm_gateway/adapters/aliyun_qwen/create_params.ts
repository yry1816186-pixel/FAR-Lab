import { ThinkingJsonSchemaConflictError, ImageJsonSchemaConflictError } from './errors.ts';
import { COMPETITION_MODEL_SNAPSHOT, STRUCTURED_SAFE_MODEL } from './snapshot.ts';
import { assertQwenModel } from './qwen_family.ts';
import type { LlmImagePart } from '../../types.ts';

/** Interface defining aliyun qwen chat message. */
export interface AliyunQwenChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  /** 仅 user 角色：图像附件（adapter 组装为 OpenAI 多模态 content 数组）。 */
  readonly imageParts?: readonly LlmImagePart[];
}

/** True when any message carries image attachments. */
export function hasImageContent(messages: readonly AliyunQwenChatMessage[]): boolean {
  return messages.some((m) => m.imageParts !== undefined && m.imageParts.length > 0);
}

/** Interface defining aliyun qwen json schema response format. */
export interface AliyunQwenJsonSchemaResponseFormat {
  readonly type: 'json_schema';
  readonly json_schema: {
    readonly name: string;
    readonly schema: Record<string, unknown>;
    readonly strict?: boolean;
  };
}

/** Interface defining aliyun qwen create params. */
export interface AliyunQwenCreateParams {
  readonly enable_thinking?: boolean;
  readonly thinking_budget?: number;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly top_p?: number;
  readonly response_format?: AliyunQwenJsonSchemaResponseFormat;
  readonly stream?: boolean;
}

/** Interface defining resolved aliyun qwen create params. */
export interface ResolvedAliyunQwenCreateParams extends AliyunQwenCreateParams {
  readonly model: string;
  readonly messages: readonly AliyunQwenChatMessage[];
  readonly stream: boolean;
}

/**
 * build create params.
 */
export function buildCreateParams(
  model: string,
  messages: readonly AliyunQwenChatMessage[],
  params: AliyunQwenCreateParams = {},
): ResolvedAliyunQwenCreateParams {
  assertQwenModel(model);

  if (params.enable_thinking === true && params.response_format !== undefined) {
    throw new ThinkingJsonSchemaConflictError();
  }
  // VL 模型不支持 json_schema（百炼官方 2026-08-21）；不拦截会被下面的
  // STRUCTURED_SAFE_MODEL 重路由静默换成文本模型并丢弃图像（ImageJsonSchemaConflictError 详注）。
  if (params.response_format !== undefined && hasImageContent(messages)) {
    throw new ImageJsonSchemaConflictError();
  }

  const resolvedModel =
    params.response_format !== undefined
      ? STRUCTURED_SAFE_MODEL
      : params.enable_thinking === true
        ? COMPETITION_MODEL_SNAPSHOT
        : model;

  return {
    ...params,
    model: resolvedModel,
    messages,
    stream: params.enable_thinking === true ? true : params.stream ?? false,
  };
}
