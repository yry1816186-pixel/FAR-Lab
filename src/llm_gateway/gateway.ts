import type {
  LlmRequest,
  LlmResponse,
  ProviderAdapter,
  ProviderProfile,
} from './types.ts';
import type { LlmGateway } from './types.ts';

// CORE-ARCH-001: interface lives in types.ts (contract file); re-exported here for
// existing import sites — new kernel-side imports must target types.ts.
export type { LlmGateway };


/**
 * create llm gateway.
 */
export function createLlmGateway(initialAdapters: readonly ProviderAdapter[] = []): LlmGateway {
  const adapters = new Map<ProviderProfile, ProviderAdapter>();

  function register(adapter: ProviderAdapter): void {
    adapters.set(adapter.profile, adapter);
  }

  async function callLlm(profile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> {
    const adapter = adapters.get(profile);
    if (adapter === undefined) {
      throw new Error(`llm_gateway: no adapter registered for profile ${profile}`);
    }
    return await adapter.call(request);
  }

  function registeredProfiles(): readonly ProviderProfile[] {
    return [...adapters.keys()];
  }

  for (const adapter of initialAdapters) {
    register(adapter);
  }

  return { register, callLlm, registeredProfiles };
}
