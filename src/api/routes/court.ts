/**
 * court 路由 —— 跨模型可靠性法庭公开端点。
 *
 * 端点：
 *   GET /court/demo → 对固定 demo claim 跑 3 个 offline_replay 模型，返回 ReliabilityCertificate。
 *
 * 设计（首次运行时计算 + 模块级缓存）：
 *   - 首次请求跑 runCourtSession（3× executeAskRun·offline_replay）→ 缓存证书。
 *   - 后续请求返回缓存（快·确定性）。
 *   - 证书 certificateId / chainHead 首次运行后固定（demo 锚·非每请求新 ULID）。
 *
 * 诚实边界（红线）：
 *   - offline_replay 下所有模型回放同一套 fixture，verdict 必然 unanimous——展示的是
 *     「多模型法庭框架 + 一致性检测 + 证书结构」，真实模型分歧须接真实 provider（凭据门·far court --models）。
 *   - 每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import type { FastifyInstance } from 'fastify';

import { internalError } from '../errors/error_handler.ts';
import { runCourtSession } from '../internal/court_service.ts';
import { createAsyncSingletonCache } from '../internal/singleton_cache.ts';
import { resolveGitCommitSha } from '../../cli/git_commit_sha.ts';

/** demo claim（与 far demo 的 C-ASTRO-0001 同源·离线可复现）。 */
const DEMO_CLAIM = 'C-ASTRO-0001: TIC lightcurve exhibits a transit-like periodic signal (existence claim)';

/** demo 模型标签（offline_replay 按 stageId 路由 fixture·modelId 仅作展示标签；用中性 persona 名更诚实——展示框架非真实模型）。 */
const DEMO_MODELS = ['court-persona-alpha', 'court-persona-beta', 'court-persona-gamma'];

/**
 * 模块级单例缓存：首次 runCourtSession 后固定（demo 锚·确定性）。
 * promise 单例（非 check-then-act）——并发首击共享同一 in-flight 计算，失败不缓存。
 */
const courtCache = createAsyncSingletonCache(() =>
  runCourtSession(DEMO_CLAIM, DEMO_MODELS, resolveGitCommitSha()),
);

/**
 * court 路由配置。
 */
export interface CourtRouteConfig {
  readonly gitCommitSha?: string;
}

/**
 * 注册 court 路由。
 */
export async function registerCourtRoute(
  app: FastifyInstance,
  _config?: CourtRouteConfig,
): Promise<void> {
  app.get('/court/demo', async (_req, reply) => {
    try {
      const certificate = await courtCache.get();
      return reply.send(certificate);
    } catch (err) {
      throw internalError('court demo session failed', err);
    }
  });
}
