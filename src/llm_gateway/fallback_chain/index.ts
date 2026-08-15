/**
 * FallbackChain 公共出口（§8.2 / §5）。
 *
 * 三职责：
 *   - errors：传输错误层级（ProviderError → BailianHttpError/Timeout/Network；RateLimit extends 429）
 *   - error_classifier：触发矩阵（5xx+429+timeout+network → fallback；4xx+config → fatal）
 *   - fallback_chain：执行引擎（caller 注入·模型无关·离线可全测·绝不静默换 F11）
 *
 * 链定义（含 qwen 字面量）见 adapters/aliyun_qwen/fallback_config.ts（model-neutral 红线：qwen 不进 core/src/api）。
 */

// errors
export {
  ProviderError,
  BailianHttpError,
  BailianTimeoutError,
  BailianNetworkError,
  BailianRateLimitError,
} from './errors.ts';

// error_classifier
export { shouldFallback } from './error_classifier.ts';

// fallback_chain
export { executeFallbackChain } from './fallback_chain.ts';

// types
export type {
  FallbackModelTarget,
  FallbackAttemptOutcome,
  FallbackAttempt,
  ShouldFallbackResult,
  FallbackCallerResult,
  FallbackCaller,
  FallbackChainResult,
} from './types.ts';
