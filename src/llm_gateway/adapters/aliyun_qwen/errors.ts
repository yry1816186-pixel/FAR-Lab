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
