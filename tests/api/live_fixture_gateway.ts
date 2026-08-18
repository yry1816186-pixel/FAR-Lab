import { DEFAULT_DEMO_FIXTURES } from '../../src/agent_loop/demo_fixtures.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmRequest,
  LlmResponse,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';

/** Explicit test-only snapshot; never used as production provider evidence. */
export const TEST_MODEL_SNAPSHOT = 'test-live-fixture-snapshot-v1';

/**
 * Hermetic gateway for API contract tests.
 *
 * The fixture is injected explicitly from tests and the credential is rewritten
 * to exercise live-profile wiring. It is not an external-validation substitute.
 */
export function createLiveFixtureGateway(
  modelId: string,
  profile: ProviderProfile = 'competition_aliyun_qwen',
): LlmGateway {
  const adapter = createOfflineReplayAdapter({
    modelId,
    fixtures: DEFAULT_DEMO_FIXTURES,
    disableDefaultDemo: true,
    providerRequestId: `test-${modelId}`,
  });
  return {
    register: () => {},
    callLlm: async (_requestedProfile: ProviderProfile, request: LlmRequest): Promise<LlmResponse> => {
      const response = await adapter.call(request);
      return {
        ...response,
        credential: {
          ...response.credential,
          providerProfile: profile,
          providerRequestId: `test-${modelId}`,
          modelId,
          modelVersion: TEST_MODEL_SNAPSHOT,
          tokenUsage: {
            ...response.credential.tokenUsage,
            measured: false,
          },
        },
      };
    },
    registeredProfiles: () => [profile],
  };
}
