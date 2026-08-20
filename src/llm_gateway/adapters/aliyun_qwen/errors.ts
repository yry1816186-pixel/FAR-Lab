/** Class representing non qwen model error. */
export class NonQwenModelError extends Error {
  constructor(modelId: string) {
    super(`competition_aliyun_qwen: non-Qwen model is not allowed: ${modelId}`);
    this.name = 'NonQwenModelError';
  }
}

/** Class representing thinking json schema conflict error. */
export class ThinkingJsonSchemaConflictError extends Error {
  constructor() {
    super(
      'enable_thinking:true conflicts with response_format:json_schema. ' +
        'Use enable_thinking:false with STRUCTURED_SAFE_MODEL for structured stages.',
    );
    this.name = 'ThinkingJsonSchemaConflictError';
  }
}

/** Class representing request id missing error. */
export class RequestIdMissingError extends Error {
  constructor() {
    super('competition_aliyun_qwen: response is missing a DashScope request id');
    this.name = 'RequestIdMissingError';
  }
}

/**
 * 图像内容与 response_format:json_schema 冲突（fail-closed 守卫）。
 *
 * 百炼官方文档（2026-08-21 亲读，help.aliyun.com/zh/model-studio/qwen-structured-output）：
 * JSON Schema 模式支持列表不含任何 VL 模型。若不拦截，buildCreateParams 会把带
 * response_format 的请求静默重路由到 STRUCTURED_SAFE_MODEL（文本模型）——图像内容
 * 被静默丢弃，产生"看起来成功实则失明"的响应。宁可红，不可瞎。
 */
export class ImageJsonSchemaConflictError extends Error {
  constructor() {
    super(
      'image_url content conflicts with response_format:json_schema. ' +
        'Bailian VL models do not support JSON Schema structured output (verified 2026-08-21). ' +
        'Use plain-JSON prompting with client-side zod validation for multimodal stages.',
    );
    this.name = 'ImageJsonSchemaConflictError';
  }
}
