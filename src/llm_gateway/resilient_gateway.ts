// src/llm_gateway/resilient_gateway.ts
// P0-4 统一故障转移（2026-08-07）：跨 provider 降级重试。
// 包装任意 LlmGateway，在调用失败且错误属于可重试类别（网络/超时/限流/5xx）时，
// 自动沿 fallbackOrder 切换到下一个已注册 provider。
//
// 设计铁律：
//  - 全部候选失败 → 显式抛最后一个错误（反剧场 F11·绝不静默返回空内容）。
//  - 不可重试错误（编程/契约类）立即抛出·不做无意义重试。
//  - 可叠加：createResilientGateway(createRateLimitedGateway(gateway)) 或反之。

import type { LlmGateway } from './gateway.ts';
import type { LlmRequest, LlmResponse, ProviderProfile } from './types.ts';

/** 弹性网关配置。 */
export interface ResilientGatewayConfig {
  /** 总尝试次数上限（含原始 provider·默认 2 = 原始 + 1 个 fallback）。 */
  readonly maxAttempts?: number;
  /** 降级顺序（缺省：无 fallback·仅原始 provider）。 */
  readonly fallbackOrder?: readonly ProviderProfile[];
  /** 可重试错误 name 白名单（缺省用内置保守集合：网络/超时/限流/5xx）。 */
  readonly retryableErrorNames?: readonly string[];
  /** 降级通知回调（UI/日志展示降级路径·不阻断调用）。 */
  readonly onFallback?: (
    from: ProviderProfile,
    to: ProviderProfile | undefined,
    attempt: number,
    err: unknown,
  ) => void;
}

const DEFAULT_RETRYABLE_ERROR_NAMES: readonly string[] = [
  'TypeError',
  'FetchError',
  'AbortError',
  'TimeoutError',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'RateLimitError',
  'HTTPError',
];

function errName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return String((err as { name: unknown }).name);
  }
  return typeof err;
}

function statusCodeOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const raw = (err as { statusCode?: unknown }).statusCode;
  return typeof raw === 'number' ? raw : undefined;
}

function isRetryableError(err: unknown, config: ResilientGatewayConfig): boolean {
  if (config.retryableErrorNames !== undefined) {
    return config.retryableErrorNames.includes(errName(err));
  }
  const name = errName(err);
  if (DEFAULT_RETRYABLE_ERROR_NAMES.includes(name)) return true;
  // HTTP 5xx（服务端/上游故障）可重试；4xx（客户端错误）不重试。
  const status = statusCodeOf(err);
  if (status !== undefined) {
    return status >= 500 && status <= 599;
  }
  return false;
}

/**
 * 创建带故障转移的网关包装器。
 *
 * 候选顺序：请求 profile 优先，其后为 fallbackOrder 中已注册且不同于原始 profile 者；
 * 截断至 maxAttempts。任一候选成功即返回；候选失败且可重试 → 沿顺序降级；
 * 全部失败或不可重试错误 → 抛错（fail-closed）。
 */
export function createResilientGateway(
  inner: LlmGateway,
  config: ResilientGatewayConfig = {},
): LlmGateway {
  const maxAttempts = Math.max(1, config.maxAttempts ?? 2);
  const fallbackOrder = config.fallbackOrder ?? [];

  return {
    register: inner.register,
    registeredProfiles: inner.registeredProfiles,
    callLlm: async (profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> => {
      const registered = new Set(inner.registeredProfiles());
      const attempts: ProviderProfile[] = [
        profile,
        ...fallbackOrder.filter((f) => f !== profile && registered.has(f)),
      ].slice(0, maxAttempts);

      let lastErr: unknown;
      for (let i = 0; i < attempts.length; i += 1) {
        const candidate = attempts[i];
        // noUncheckedIndexedAccess 索引守卫：attempts 恒非空且 i 在界内，理论不可达·fail-closed
        if (candidate === undefined) {
          throw new Error('resilient gateway: candidate provider is undefined');
        }
        try {
          return await inner.callLlm(candidate, request);
        } catch (err) {
          lastErr = err;
          const hasNext = i < attempts.length - 1;
          if (hasNext && isRetryableError(err, config)) {
            const next = attempts[i + 1];
            if (config.onFallback !== undefined) {
              config.onFallback(profile, next, i + 1, err);
            }
            continue; // 降级到下一个候选
          }
          throw err;
        }
      }
      // 理论不可达（attempts 至少含原始 profile）·显式兜底·绝不静默
      throw lastErr;
    },
  };
}
