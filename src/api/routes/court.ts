/**
 * Cross-model court route.
 *
 * A served certificate requires an explicit catalog of independently configured
 * model targets. A single runtime gateway cannot be relabelled as multiple
 * models; when no independent catalog is installed the endpoint returns
 * NOT_SUPPORTED instead of a fabricated unanimous certificate.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, internalError } from '../errors/error_handler.ts';
import {
  CourtConfigurationError,
  runCourtSession,
  type CourtModelTarget,
} from '../internal/court_service.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';

/** Court route configuration. */
export interface CourtRouteConfig {
  readonly gitCommitSha?: string;
  readonly targets?: readonly CourtModelTarget[];
}

const CourtLiveRequestSchema = z.object({
  claim: z.string().min(1).max(2000),
  models: z.array(z.string().min(1).max(128)).min(2).max(6),
});

export async function registerCourtRoute(
  app: FastifyInstance,
  config?: CourtRouteConfig,
): Promise<void> {
  app.post('/court', async (request, reply) => {
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      throw new ApiError({
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: 'viewer role is read-only (court: researcher/admin required)',
      });
    }

    const parsed = CourtLiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'court request body invalid',
        detail: parsed.error.issues,
      });
    }

    if (config?.targets === undefined || config.targets.length < 2) {
      throw new ApiError({
        statusCode: 501,
        errorCode: 'NOT_SUPPORTED',
        message: 'cross-model court requires at least two independently configured model targets',
        detail: {
          status: 'NOT_SUPPORTED',
          requirement:
            'courtModelTargets with distinct independenceKey values, exact model snapshots, provider profiles, and allowed observed model ids',
          guidance:
            'configure independent targets through the embedding API; one gateway called repeatedly is not cross-model validation',
        },
      });
    }

    try {
      const certificate = await runCourtSession(
        parsed.data.claim,
        parsed.data.models,
        config.gitCommitSha ?? resolveGitCommitSha(),
        { targets: config.targets },
      );
      void reply.send(certificate);
    } catch (error: unknown) {
      if (error instanceof CourtConfigurationError) {
        throw new ApiError({
          statusCode: error.code === 'COURT_TARGET_NOT_FOUND' ? 400 : 501,
          errorCode: error.code === 'COURT_TARGET_NOT_FOUND' ? 'VALIDATION_FAILED' : 'NOT_SUPPORTED',
          message: error.message,
          detail: { status: 'NOT_SUPPORTED', code: error.code, ...error.detail },
        });
      }
      throw internalError('court session failed', error);
    }
  });
}
