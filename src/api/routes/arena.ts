/**
 * arena 路由 —— 对抗科学竞技场端点。
 *
 * 端点：
 *   GET  /arena/demo → 对固定 demo hypothesis 跑 proponent + 3 refuter，返回 ArenaResult（缓存）。
 *   POST /arena      → WS-A.3 live：对用户提交的 hypothesis + refuters 跑真实对抗竞技场（无缓存·每请求新跑）。
 *
 * 设计：
 *   - GET /arena/demo：首次 runArenaSession 后模块级单例缓存（demo 锚·确定性·快）。
 *   - POST /arena：每请求新跑（hypothesis/refuter 任意·透传 gateway/profile）。
 *
 * 诚实边界（红线）：
 *   - gateway 未注入时 runArenaSession 自动降级 offline_replay——refuter 回放同一 fixture，verdict
 *     必然与原始相同（robust）。路由层据此返回 datasetSource（real / replay），前端诚实展示。
 *   - arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量（refuter 标签中性）。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { internalError } from '../errors/error_handler.ts';
import { runArenaSession } from '../internal/arena_service.ts';
import { createAsyncSingletonCache } from '../internal/singleton_cache.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';

/** demo hypothesis（与 far demo 的 C-ASTRO-0001 同源·离线可复现）。 */
const DEMO_HYPOTHESIS = 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)';

/** demo refuter 标签（中性·对应三类反剧场攻击维度）。 */
const DEMO_REFUTERS = ['scope-launderer', 'post-hoc-threshold', 'dataset-drift'];

/**
 * 模块级单例缓存：首次 runArenaSession 后固定（demo 锚·确定性）。
 * promise 单例（非 check-then-act）——并发首击共享同一 in-flight 计算，失败不缓存。
 */
const arenaCache = createAsyncSingletonCache(() =>
  runArenaSession(DEMO_HYPOTHESIS, DEMO_REFUTERS, resolveGitCommitSha()),
);

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
  // GET /arena/demo —— 固定 demo hypothesis + 缓存（现状·诚实标注的参考 fixture）。
  app.get('/arena/demo', async (_req, reply) => {
    try {
      const result = await arenaCache.get();
      return reply.send(result);
    } catch (err) {
      throw internalError('arena demo session failed', err);
    }
  });

  // POST /arena —— WS-A.3 live：用户提交 hypothesis + refuters，透传 gateway 跑真实对抗。
  // 无缓存（每请求 hypothesis/refuter 不同）；gateway 缺失时 arena_service 自动降级 offline_replay（诚实）。
  app.post('/arena', async (request, reply) => {
    // API1 BOLA 修复（阶段 7 1128）：受保护模式下 researcher+ 才能触发 arena live（消耗 LLM 额度）。
    // offline 模式（principal 未挂载或 anonymous）全放行（设计·24§3.1 双轨）。
    const role = request.principal?.role ?? 'anonymous';
    if (role !== 'anonymous' && role !== 'researcher' && role !== 'admin') {
      return reply.status(403).send({
        error_code: 'FORBIDDEN',
        message: 'viewer role is read-only (arena: researcher/admin required)',
      });
    }
    const parsed = ArenaLiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error_code: 'VALIDATION_FAILED',
        message: 'arena live request body invalid',
        detail: parsed.error.issues,
      });
    }
    try {
      const result = await runArenaSession(
        parsed.data.hypothesis,
        parsed.data.refuters,
        config?.gitCommitSha ?? resolveGitCommitSha(),
        {
          ...(config?.gateway === undefined ? {} : { gateway: config.gateway }),
          ...(config?.profile === undefined ? {} : { providerProfile: config.profile }),
        },
      );
      return reply.send(result);
    } catch (err) {
      throw internalError('arena live session failed', err);
    }
  });
}
