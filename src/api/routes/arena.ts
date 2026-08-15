/**
 * arena 路由 —— 对抗科学竞技场端点。
 *
 * 端点：
 *   POST /arena → WS-A.3 live：对用户提交的 hypothesis + refuters 跑真实对抗竞技场（无缓存·每请求新跑）。
 *
 * 设计：
 *   - POST /arena：每请求新跑（hypothesis/refuter 任意·透传 gateway/profile）。
 *   - 无 LLM 网关（未配置 key）→ 503 fail-closed——绝不静默回放离线 fixture 冒充对抗结果
 *     （真实对抗须注入真实 gateway·同 research 路由的 no-key 纪律）。
 *   - arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量（refuter 标签中性）。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ApiError, internalError } from '../errors/error_handler.ts';
import { runArenaSession } from '../internal/arena_service.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/**
 * arena 路由配置。
 * WS-A.3：新增 gateway / profile / gitCommitSha（live 路径透传真实推理网关）。
 */
export interface ArenaRouteConfig {
  readonly gitCommitSha?: string;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
}

/**
 * POST /arena 请求 schema（WS-A.3）。
 * hypothesis：1-2000 字（与 HypothesizeRequestSchema 一致）；refuters：1-6 个非空标签。
 */
const ArenaLiveRequestSchema = z.object({
  hypothesis: z.string().min(1).max(2000),
  refuters: z.array(z.string().min(1).max(64)).min(1).max(6),
});

/**
 * 注册 arena 路由。
 */
export async function registerArenaRoute(
  app: FastifyInstance,
  config?: ArenaRouteConfig,
): Promise<void> {
  // POST /arena —— WS-A.3 live：用户提交 hypothesis + refuters，透传 gateway 跑真实对抗。
  // 无缓存（每请求 hypothesis/refuter 不同）。
  app.post('/arena', async (request, reply) => {
    // API1 BOLA 修复：受保护模式下 researcher+ 才能触发 arena live（消耗 LLM 额度）。
    // offline 模式（principal 未挂载或 anonymous）全放行（设计·24§3.1 双轨）。
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      throw new ApiError({ statusCode: 403, errorCode: 'FORBIDDEN', message: 'viewer role is read-only (arena: researcher/admin required)' });
    }
    const parsed = ArenaLiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError({ statusCode: 400, errorCode: 'VALIDATION_FAILED', message: 'arena live request body invalid', detail: parsed.error.issues });
    }
    if (config?.gateway === undefined) {
      throw new ApiError({
        statusCode: 503,
        errorCode: 'arena_live_profile_unavailable',
        message: 'live adversarial sessions need an API key in the environment (see far doctor)',
        detail: {
          guidance:
            'set the live-provider API key in the environment (see far doctor) for real adversarial runs; ' +
            'replay fixtures exist only for explicit test wiring, never as a served result',
        },
      });
    }
    try {
      const result = await runArenaSession(
        parsed.data.hypothesis,
        parsed.data.refuters,
        config?.gitCommitSha ?? resolveGitCommitSha(),
        {
          gateway: config.gateway,
          ...(config?.profile === undefined ? {} : { providerProfile: config.profile }),
        },
      );
      void reply.send(result);
    } catch (err) {
      throw internalError('arena live session failed', err);
    }
  });
}
