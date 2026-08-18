/**
 * Live adversarial arena route.
 *
 * POST /arena requires a complete live execution context and never substitutes
 * replay fixtures.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, internalError } from '../errors/error_handler.ts';
import { runArenaSession } from '../internal/arena_service.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

export interface ArenaRouteConfig {
  readonly gitCommitSha?: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  readonly modelSnapshot?: string;
}

const ArenaLiveRequestSchema = z.object({
  hypothesis: z.string().min(1).max(2000),
  refuters: z.array(z.string().min(1).max(64)).min(1).max(6),
});

export async function registerArenaRoute(
  app: FastifyInstance,
  config?: ArenaRouteConfig,
): Promise<void> {
  app.post('/arena', async (request, reply) => {
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      throw new ApiError({
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'viewer role is read-only (arena: researcher/admin required)',
      });
    }

    const parsed = ArenaLiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'arena live request body invalid',
        detail: parsed.error.issues,
      });
    }

    const gateway = config?.gateway;
    const providerProfile = config?.profile;
    const modelSnapshot = config?.modelSnapshot;
    const profile = providerProfile === undefined ? null : String(providerProfile);
    const missingConfiguration = [
      gateway === undefined ? 'gateway' : null,
      profile === null || profile.trim().length === 0 ? 'profile' : null,
      profile === 'offline_replay' ? 'liveProfile' : null,
      modelSnapshot === undefined || modelSnapshot.trim().length === 0
        ? 'modelSnapshot'
        : null,
    ].filter((item): item is string => item !== null);
    if (
      missingConfiguration.length > 0 ||
      gateway === undefined ||
      providerProfile === undefined ||
      modelSnapshot === undefined
    ) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'arena_live_profile_unavailable',
        message: 'live adversarial sessions require a complete non-replay model execution context',
        detail: {
          status: 'REQUIRES_CONFIGURATION',
          missingConfiguration,
          guidance:
            'configure a live provider gateway, exact provider profile, and immutable model snapshot; offline_replay is test-only and is never served as an arena result',
        },
      });
    }

    try {
      const result = await runArenaSession(
        parsed.data.hypothesis,
        parsed.data.refuters,
        config?.gitCommitSha ?? resolveGitCommitSha(),
        {
          gateway,
          providerProfile,
          modelSnapshot,
          providerLabel: String(providerProfile),
        },
      );
      void reply.send(result);
    } catch (error: unknown) {
      throw internalError('arena live session failed', error);
    }
  });
}
