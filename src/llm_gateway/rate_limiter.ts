// src/llm_gateway/rate_limiter.ts
// P0-4 并发控制/速率限制治理（2026-08-07）。
// 包装任意 LlmGateway：并发上限（信号量·FIFO 等待）+ 调用最小间隔（节流）。
// 用于多 provider / 多任务并发调度时保护上游配额与本地算力。
//
// 设计铁律：
//  - 并发超限 → 先进先出排队等待（不丢弃·不静默）。
//  - 间隔节流在并发闸内生效（整体速率 = 并发 × 1/间隔）。
//  - 可叠加：与 createResilientGateway 任意组合。

import type { LlmGateway } from './gateway.ts';
import type { LlmRequest, LlmResponse, ProviderProfile } from './types.ts';

/** 速率限制配置。 */
export interface LlmRateLimitConfig {
  /** 并发上限（默认 1 = 串行·保守安全值）。 */
  readonly maxConcurrent?: number;
  /** 相邻调用最小间隔 ms（默认 0 = 不限）。 */
  readonly minIntervalMs?: number;
}

/**
 * 创建带并发控制 + 最小间隔节流的网关包装器。
 */
export function createRateLimitedGateway(
  inner: LlmGateway,
  config: LlmRateLimitConfig = {},
): LlmGateway {
  const maxConcurrent = Math.max(1, config.maxConcurrent ?? 1);
  const minIntervalMs = Math.max(0, config.minIntervalMs ?? 0);

  let active = 0;
  let lastCallAt = 0;
  const waiters: Array<() => void> = [];

  async function acquireConcurrent(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
    active += 1;
  }

  function releaseConcurrent(): void {
    active -= 1;
    const next = waiters.shift();
    if (next !== undefined) {
      next(); // FIFO：唤醒最早等待者
    }
  }

  async function enforceInterval(): Promise<void> {
    if (minIntervalMs <= 0) return;
    const now = Date.now();
    const waitMs = lastCallAt + minIntervalMs - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastCallAt = Date.now();
  }

  return {
    register: inner.register,
    registeredProfiles: inner.registeredProfiles,
    callLlm: async (profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> => {
      await acquireConcurrent();
      try {
        await enforceInterval();
        return await inner.callLlm(profile, request);
      } finally {
        releaseConcurrent();
      }
    },
  };
}
