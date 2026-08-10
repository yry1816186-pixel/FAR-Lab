/**
 * court 路由 —— 跨模型可靠性法庭端点。
 *
 * 端点：
 *   GET  /court/demo → 对固定 demo claim 跑 3 个 offline_replay 模型，返回 ReliabilityCertificate（缓存）。
 *   POST /court      → WS-A.2 live：对用户提交的 claim + models 跑真实跨模型法庭（无缓存·每请求新跑）。
 *
 * 设计：
 *   - GET /court/demo：首次 runCourtSession 后模块级单例缓存（demo 锚·确定性·快）。
 *   - POST /court：每请求新跑（claim/model 任意·透传 gateway/profile）。
 *
 * 诚实边界（红线）：
 *   - gateway 未注入时 runCourtSession 自动降级 offline_replay——所有模型回放同一 fixture，verdict
 *     必然 unanimous。路由层据此返回 datasetSource（real / replay），前端诚实展示。
 *   - 每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, internalError } from '../errors/error_handler.ts';
import { runCourtSession } from '../internal/court_service.ts';
import { createAsyncSingletonCache } from '../internal/singleton_cache.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/** demo claim（与 far demo 的 C-ASTRO-0001 同源·离线可复现）。 */
const DEMO_CLAIM = 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)';

/** demo 模型标签（offline_replay 按 stageId 路由 fixture·modelId 仅作展示标签；用中性 persona 名更诚实——展示框架非真实模型）。 */
const DEMO_MODELS = ['court-persona-alpha', 'court-persona-beta', 'court-persona-gamma'];

const courtCache = createAsyncSingletonCache(() =>
  runCourtSession(DEMO_CLAIM, DEMO_MODELS, resolveGitCommitSha()),
);

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
  app.get('/court/demo', async (_req, reply) => {
    try {
      const certificate = await courtCache.get();
      return reply.send(certificate);
    } catch (err) {
      throw internalError('court demo session failed', err);
    }
  });

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
    try {
      const certificate = await runCourtSession(
        parsed.data.claim,
        parsed.data.models,
        config?.gitCommitSha ?? resolveGitCommitSha(),
        {
          ...(config?.gateway === undefined ? {} : { gateway: config.gateway }),
          ...(config?.profile === undefined ? {} : { providerProfile: config.profile }),
        },
      );
      void reply.send(certificate);
    } catch (err) {
      throw internalError('court live session failed', err);
    }
  });
}
