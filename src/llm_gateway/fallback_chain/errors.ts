/**
 * FallbackChain 错误层级（spec 05 §9.1 / digest F-05-18）。
 *
 * 层级：
 *   ProviderError（基类·provider 侧错误总根）
 *     ├─ BailianHttpError(status, dashscopeRequestId)        HTTP 状态码错误
 *     │    └─ BailianRateLimitError(retryAfterMs)            extends HttpError(429)·配额/限流
 *     ├─ BailianTimeoutError                                  请求超时（SR-4 / openai timeout）
 *     └─ BailianNetworkError                                  网络层错误（DNS/ECONNRESET/socket）
 *
 * 与 adapters/aliyun_qwen/errors.ts（NonQwenModelError / ThinkingJsonSchemaConflictError /
 * RequestIdMissingError）的关系：后者是**配置/逻辑错误**（不触发 fallback），
 * 本文件是**provider 传输层错误**（可能触发 fallback）。两者经 error_classifier 区分。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 *
 * 归属声明（反幻觉）：fallback_chain 是百炼（DashScope）competition 专属降级链——
 * 类名 BailianHttpError 等 + 字段 dashscopeRequestId 反映其百炼传输错误语义。
 * 本文件位于 llm_gateway（历史路径），属 competition 命名空间，非 core
 * model_neutrality 扫描范围（CI DIRS 不含 llm_gateway）。故不声明「模型中立」——
 * 它本就是百炼专属降级；core 类型（如 evidence_log 的 ProviderNeutralCredential）方守中立。
 */

/**
 * Provider 侧错误基类。所有可被 FallbackChain 观测的传输层错误都继承此类。
 * error_classifier 用 `instanceof ProviderError` 快速区分 provider 错误 vs 配置错误。
 */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * 百炼 HTTP 状态码错误。
 * @param status HTTP 状态码（4xx/5xx）。
 * @param dashscopeRequestId DashScope 请求 id（可能为 null——失败响应常无 id）。
 */
export class BailianHttpError extends ProviderError {
  readonly status: number;
  readonly dashscopeRequestId: string | null;
  constructor(status: number, dashscopeRequestId: string | null, message?: string) {
    super(message ?? `bailian HTTP ${status}`);
    this.name = 'BailianHttpError';
    this.status = status;
    this.dashscopeRequestId = dashscopeRequestId;
  }
}

/**
 * 百炼请求超时（SR-4 / openai client timeout=15000ms 触发）。
 * 触发 fallback（spec 05 §9.2 触发矩阵）。
 */
export class BailianTimeoutError extends ProviderError {
  constructor(message?: string) {
    super(message ?? 'bailian request timed out');
    this.name = 'BailianTimeoutError';
  }
}

/**
 * 百炼网络层错误（DNS 解析失败 / ECONNRESET / socket hang up / 连接拒绝）。
 * 触发 fallback（spec 05 §9.2 触发矩阵）。
 */
export class BailianNetworkError extends ProviderError {
  constructor(message?: string) {
    super(message ?? 'bailian network error (DNS/socket/connection)');
    this.name = 'BailianNetworkError';
  }
}

/**
 * 百炼限流/配额耗尽（HTTP 429）。
 * 继承 BailianHttpError(429)；额外携带 Retry-After 提示（毫秒，可能为 null）。
 * 触发 fallback（spec 05 §9.2 触发矩阵：429 属可降级信号）。
 */
export class BailianRateLimitError extends BailianHttpError {
  readonly retryAfterMs: number | null;
  constructor(retryAfterMs: number | null, dashscopeRequestId: string | null) {
    super(429, dashscopeRequestId, 'bailian rate limit / quota exhausted (429)');
    this.name = 'BailianRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}
