// src/llm_gateway/competition_gateway.ts
// 生产入口：构造 competition_aliyun_qwen 文本 adapter 网关（DIGEST G1 闭合）。
//
// 背景（DIGEST.md §8 G1）：executeFallbackChain 已接进 qwen_adapter（P1-2 函数级 WIRED_GREEN），
// 但 createQwenAdapter 在 src/ 零生产 importer——loop_runner 默认只构造 createOfflineReplayAdapter()，
// 真实 adapter 从未被生产代码构造（「Entire system dead in production」）。本工厂是生产可达的构造点。
//
// 模型中立红线（24§0.1）：loop_runner.ts 禁 Qwen/DashScope 字面量。本文件位于 llm_gateway/
// （C10 纪律：模型字面量允许在 adapter/gateway 层），是 loop_runner 之上的模型特定工厂——
// 生产调用方（far ask --profile competition_aliyun_qwen）在此构造 gateway 后经 args.gateway 注入。

import { createLlmGateway } from './gateway.ts';
import type { LlmGateway } from './gateway.ts';
import { createQwenAdapter } from './adapters/aliyun_qwen/qwen_adapter.ts';
import type { QwenChatCompletionCaller } from './adapters/aliyun_qwen/qwen_adapter.ts';

/** Configuration/specification for competition gateway config. */
export interface CompetitionGatewayConfig {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly baseURL?: string;
  /**
   * Caller 注入点：转发 createQwenAdapter.createChatCompletion。
   * 生产省略 → 真 OpenAI SDK 调 DashScope；测试注入 → 控制 per-target 成败驱动真实 executeFallbackChain（无付费 HTTP）。
   */
  readonly createChatCompletion?: QwenChatCompletionCaller;
}

/**
 * 构造 competition_aliyun_qwen 文本 adapter 网关。
 *
 * callLlm('competition_aliyun_qwen', request) → createQwenAdapter.call → executeFallbackChain
 * （429/5xx/timeout/network → fallback 至下一 Qwen target·落 degraded_from；4xx/config → fatal·绝不静默换 F11）。
 */
export function createCompetitionQwenGateway(config: CompetitionGatewayConfig): LlmGateway {
  return createLlmGateway([
    createQwenAdapter({
      apiKey: config.apiKey,
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
      ...(config.createChatCompletion !== undefined
        ? { createChatCompletion: config.createChatCompletion }
        : {}),
    }),
  ]);
}
