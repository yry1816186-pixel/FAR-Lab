/**
 * court 路由 —— 跨模型可靠性法庭端点。
 *
 * 端点：
 *   POST /court → WS-A.2 live：对用户提交的 claim + models 跑真实跨模型法庭（无缓存·每请求新跑）。
 *
 * 设计：
 *   - POST /court：每请求新跑（claim/model 任意·透传 gateway/profile）。
 *   - 无 LLM 网关（未配置 key）→ 503 fail-closed——绝不静默回放离线 fixture 冒充跨模型证书
 *     （真实跨模型一致性须注入真实 gateway·同 research 路由的 no-key 纪律）。
 *   - 每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, internalError } from '../errors/error_handler.ts';
import { runCourtSession } from '../internal/court_service.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/** court 路由配置。WS-A.2：新增 gateway / profile（live 路径透传真实推理网关）。 */
export interface CourtRouteConfig {
  readonly gitCommitSha?: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
}

/** POST /court 请求 schema（WS-A.2）。 */
const CourtLiveRequestSchema = z.object({
  claim: z.string().min(1).max(2000),
  models: z.array(z.string().min(1).max(64)).min(1).max(6),
});

export async function registerCourtRoute(
  app: FastifyInstance,
  config?: CourtRouteConfig,
): Promise<void> {
  // POST /court —— WS-A.2 live：用户提交 claim + models，透传 gateway 跑真实跨模型法庭。
  app.post('/court', async (request, reply) => {
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      throw new ApiError({ statusCode: 403, errorCode: 'FORBIDDEN', message: 'viewer role is read-only (court: researcher/admin required)' });
    }
    const parsed = CourtLiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({ statusCode: 400, errorCode: 'VALIDATION_FAILED', message: 'court live request body invalid', detail: parsed.error.issues });
    }
    if (config?.gateway === undefined) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'court_live_profile_unavailable',
        message: 'live cross-model sessions need an API key in the environment (see far doctor)',
        detail: {
          guidance:
            'set the live-provider API key in the environment (see far doctor) for real cross-model runs; ' +
            'replay fixtures exist only for explicit test wiring, never as a served result',
        },
      });
    }
    try {
      const certificate = await runCourtSession(
        parsed.data.claim,
        parsed.data.models,
        config?.gitCommitSha ?? resolveGitCommitSha(),
        {
          gateway: config.gateway,
          ...(config?.profile === undefined ? {} : { providerProfile: config.profile }),
        },
      );
      void reply.send(certificate);
    } catch (err) {
      throw internalError('court live session failed', err);
    }
  });
}
