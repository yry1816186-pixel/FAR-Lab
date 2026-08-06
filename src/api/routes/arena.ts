/**
 * arena 路由 —— 对抗科学竞技场公开端点。
 *
 * 端点：
 *   GET /arena/demo → 对固定 demo hypothesis 跑 proponent + 3 refuter，返回 ArenaResult。
 *
 * 设计（首次运行时计算 + 模块级缓存）：
 *   - 首次请求跑 runArenaSession（proponent + 3 refuter·offline_replay）→ 缓存结果。
 *   - 后续请求返回缓存（快·确定性）。
 *
 * 诚实边界（红线）：
 *   - offline_replay 下 refuter 回放同一套 fixture，verdict 必然与原始相同 → robust（展示「竞技场框架 +
 *     deterministic arbiter + 记分板」，真实对抗须接真实 provider·far arena --refuters）。
 *   - arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量（refuter 标签中性）。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';

import { internalError } from '../errors/error_handler.ts';
import { runArenaSession } from '../internal/arena_service.ts';
import { createAsyncSingletonCache } from '../internal/singleton_cache.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';

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
 * 注册 arena 路由。
 */
export async function registerArenaRoute(app: FastifyInstance): Promise<void> {
  app.get('/arena/demo', async (_req, reply) => {
    try {
      const result = await arenaCache.get();
      return reply.send(result);
    } catch (err) {
      throw internalError('arena demo session failed', err);
    }
  });
}
