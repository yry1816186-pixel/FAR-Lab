export { createLlmGateway } from './gateway.ts';
export type { LlmGateway } from './gateway.ts';
export {
  KNOWN_PROVIDER_PROFILES,
  LLM_CAPABILITIES,
} from './types.ts';
export {
  createOpenAICompatibleAdapter,
} from './adapters/openai_compatible/index.ts';
export type {
  ChatClient,
  OpenAICompatibleConfig,
} from './adapters/openai_compatible/index.ts';
export {
  createOpenAICompatiblePresetAdapters,
  OPENAI_COMPATIBLE_PRESETS,
} from './adapters/openai_compatible/presets.ts';
export type {
  OpenAICompatiblePreset,
} from './adapters/openai_compatible/presets.ts';
// rate_limiter is retained (currently no internal consumer) because the upcoming
// retrieval layer (arXiv/OpenAlex/Crossref) needs exactly this generic
// semaphore + min-interval throttle (arXiv ≤3 req/s, Crossref polite pool).
export {
  createRateLimitedGateway,
} from './rate_limiter.ts';
export type {
  LlmRateLimitConfig,
} from './rate_limiter.ts';
export type {
  CostSnapshot,
  KnownProviderProfile,
  LlmCallCredential,
  LlmCapability,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  ProviderAdapter,
  ProviderProfile,
  TokenUsage,
} from './types.ts';
