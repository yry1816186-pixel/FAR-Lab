/**
 * FallbackChain 触发矩阵分类器（spec 05 §9.2 / digest F-05-17）。
 *
 * 触发矩阵：
 *   触发 fallback（继续下一个 target）：
 *     - BailianTimeoutError         (timeout)
 *     - BailianNetworkError         (network)
 *     - HTTP 429 / 5xx              (http_429 / http_5xx · 服务端可恢复)
 *   不触发 fallback（致命·立即终止整链 F11）：
 *     - HTTP 4xx (400/401/403/404/422/...)  (client error · 我们的错·换模型无用)
 *     - 任何非传输错误（NonQwen/R1互斥/RequestIdMissing/未知）  (config/logic 错·换模型无用)
 *
 * 设计：引擎只认 errors.ts 定义的传输错误 + duck-type 数值 status。
 *   - qwen 配置错误（NonQwenModelError 等）**不是** ProviderError 子类 → 归入"未知"→ fatal。
 *   - 这样实现 spec 意图（配置错误不触发 fallback）**且无需 import qwen 类**，引擎保持模型中立。
 *
 * 诚实原则（F11）：未知错误 → fatal（绝不静默换）。保守换法只在明确可恢复信号下触发。
 * 零容忍合规：无 any / @ts-ignore / 双重断言。
 */

import {
  BailianHttpError,
  BailianNetworkError,
  BailianTimeoutError,
} from './errors.ts';
import type { ShouldFallbackResult } from './types.ts';

/**
 * 安全读取任意错误对象上的数值 status 属性（duck-type·对齐 retry_policy.ts hasStatus 模式）。
 * 用于兼容 openai SDK 原生错误（非 BailianHttpError 实例但带 .status）。
 * 经 typeof + 'status' in 守卫收窄，无需 as 断言。
 */
function readNumericStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!('status' in error)) return null;
  const status = error.status;
  return typeof status === 'number' ? status : null;
}

function readStringField(error: unknown, field: string): string | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!(field in error)) return null;
  const record = error as Record<string, unknown>;
  const value = record[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function constructorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const ctor = error.constructor;
  return typeof ctor === 'function' && typeof ctor.name === 'string' && ctor.name.length > 0
    ? ctor.name
    : null;
}

function readCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return null;
  return 'cause' in error ? error.cause : null;
}

/** 提取错误的人类可读 message（兜底 name/message）。 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 按 HTTP 状态码分类（429 + 5xx → fallback；4xx → fatal；其它 → fatal 保守）。
 * spec 05 §9.2：429/500/502/503 触发；400/401/403/404/422 不触发。
 * 5xx 全段（500-599）按服务端可恢复处理（含 504 gateway-timeout ≈ timeout）。
 */
function classifyStatus(status: number, requestId: string | null): ShouldFallbackResult {
  if (status === 429) {
    return {
      fallback: true,
      triggerSignal: 'http_429',
      reason: `rate limit / quota exhausted (429)${requestId ? ` · req ${requestId.slice(0, 16)}…` : ''}`,
    };
  }
  if (status >= 500 && status < 600) {
    return {
      fallback: true,
      triggerSignal: `http_${status}`,
      reason: `server error (${status}) · provider-side transient${requestId ? ` · req ${requestId.slice(0, 16)}…` : ''}`,
    };
  }
  return {
    fallback: false,
    triggerSignal: `http_${status}`,
    reason: `client error (${status}) non-retryable · switching model would not help`,
  };
}

function classifySdkTransportError(error: unknown): ShouldFallbackResult | null {
  const cause = readCause(error);
  const names = [
    readStringField(error, 'name'),
    constructorName(error),
    readStringField(cause, 'name'),
    constructorName(cause),
  ].filter((value): value is string => value !== null).join(' ');
  const code = readStringField(error, 'code') ?? readStringField(cause, 'code');
  const text = `${names} ${code ?? ''} ${errorMessage(error)} ${cause !== null ? errorMessage(cause) : ''}`;

  const isOpenAiTransport =
    /\bAPIConnection(?:Timeout)?Error\b/.test(names) ||
    /\bFetchError\b/.test(names) ||
    /\bAbortError\b/.test(names);
  const hasNetworkCode =
    code !== null && /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/i.test(code);

  if (!isOpenAiTransport && !hasNetworkCode) {
    return null;
  }
  if (/APIConnectionTimeoutError|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|timed?\s*out|timeout/i.test(text)) {
    return {
      fallback: true,
      triggerSignal: 'timeout',
      reason: `SDK transport timeout: ${errorMessage(error)}`,
    };
  }
  if (
    /APIConnectionError|FetchError|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket disconnected|TLS connection|network/i
      .test(text)
  ) {
    return {
      fallback: true,
      triggerSignal: 'network',
      reason: `SDK transport network error: ${errorMessage(error)}`,
    };
  }
  return null;
}

/**
 * 触发矩阵主入口。判定一个错误是否应触发 fallback。
 *
 * @param error caller 抛出的错误（应为 ProviderError 子类或带 status 的原生错误）。
 * @returns {fallback, triggerSignal, reason} —— fallback=true 继续下一 target；false 终止整链。
 */
export function shouldFallback(error: unknown): ShouldFallbackResult {
  // 1. 超时 → fallback（timeout）
  if (error instanceof BailianTimeoutError) {
    return { fallback: true, triggerSignal: 'timeout', reason: errorMessage(error) };
  }
  // 2. 网络层 → fallback（network）
  if (error instanceof BailianNetworkError) {
    return { fallback: true, triggerSignal: 'network', reason: errorMessage(error) };
  }
  // 3. 百炼 HTTP 错误 → 状态码矩阵（用实例上的 status）
  if (error instanceof BailianHttpError) {
    return classifyStatus(error.status, error.dashscopeRequestId);
  }
  // 4. duck-type：非 BailianHttpError 实例但带数值 status（openai SDK 原生错误兼容）
  const status = readNumericStatus(error);
  if (status !== null) {
    return classifyStatus(status, null);
  }
  // STUB red-wave-p1-2-vl: classifySdkTransportError call removed → transport errors (socket destroy / status=undefined) fall to fatal (RED). Controlled-mutation base for keystone RED→GREEN evidence; head=3bf1011 restores this call.
  // 6. 未知 / 配置 / 逻辑错误 → fatal（F11：绝不静默换）
  //    NonQwenModelError / ThinkingJsonSchemaConflictError / RequestIdMissingError 都归此分支
  //    （它们不是 ProviderError 子类，换模型无法修复配置/逻辑错误）。
  return {
    fallback: false,
    triggerSignal: 'unknown_or_config',
    reason: `non-transport error (do not silently switch model · F11): ${errorMessage(error)}`,
  };
}
