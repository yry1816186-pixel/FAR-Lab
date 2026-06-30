/**
 * health 路由——存活探针 + 就绪探针（24§5.3）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §0.3 / §5.3.
 *
 * 路由（无鉴权·24§0.3 三探针豁免）：
 *   - GET /health：liveness（进程存活·不查依赖）
 *   - GET /ready：readiness（含 DB ping·DB 不可用时返回 503）
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import type { HealthResponse, ReadyResponse } from '../types.ts';

/**
 * 健康路由配置。
 */
export interface HealthRouteConfig {
  readonly db: Database;
}

/**
 * 注册健康检查路由（/health + /ready）。
 *
 * 注意：这两个路由不挂在 /api/v1 前缀下（探针路径裸根·24§0.3）。
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  config: HealthRouteConfig,
): Promise<void> {
  app.get('/health', async () => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'far-chain-api',
      timestamp: new Date().toISOString(),
    };
    return body;
  });

  app.get('/ready', async (_request, reply) => {
    let dbOk: 'ok' | 'fail' = 'ok';
    try {
      config.db.prepare('SELECT 1 AS one').get();
    } catch {
      dbOk = 'fail';
    }

    const body: ReadyResponse = {
      status: dbOk === 'ok' ? 'ready' : 'not_ready',
      service: 'far-chain-api',
      checks: {
        database: dbOk,
      },
      timestamp: new Date().toISOString(),
    };

    if (dbOk === 'fail') {
      void reply.code(503).send(body);
      return;
    }
    return body;
  });
}
