import { ThinkingJsonSchemaConflictError } from './errors.ts';
import { COMPETITION_MODEL_SNAPSHOT, STRUCTURED_SAFE_MODEL } from './snapshot.ts';
import { assertQwenModel } from './qwen_family.ts';

/** Interface defining aliyun qwen chat message. */
export interface AliyunQwenChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
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
