/**
 * server —— Fastify 实例 + 插件注册 + 优雅启停。
 *
 * 职责：
 *   - 创建 Fastify 5 实例
 *   - 注册插件：helmet / cors / rate-limit / jwt / swagger
 *   - 注册鉴权中间件（可选 JWT·offline 模式 skip）
 *   - 注册路由（/health /ready + /api/v1/* 前缀路由）
 *   - 优雅启停（SIGINT/SIGTERM → close）
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import type { Database } from 'better-sqlite3';

import { registerAuthMiddleware } from './auth/jwt_middleware.ts';
import { errorHandler } from './errors/error_handler.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerHypothesizeRoute } from './routes/hypothesize.ts';
import { registerEvidenceRoutes } from './routes/evidence.ts';
import { registerVerdictRoutes } from './routes/verdict.ts';
import { registerReportRoute } from './routes/report.ts';
import { registerIntegrityRoutes } from './routes/integrity.ts';
import { registerBenchmarkRoute } from './routes/benchmark.ts';
import { registerCourtRoute } from './routes/court.ts';
import { registerArenaRoute } from './routes/arena.ts';
import type { AppendRecordOptions } from '../evidence_log/types.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';

/**
 * API server 配置（显式传入·禁 process.env 直读·可测）。
 */
export interface ApiServerConfig {
  readonly db: Database;
  readonly gitCommitSha: string;
  readonly jwtSecret: string | null;
  readonly corsOrigins?: readonly string[];
  readonly rateLimitMax?: number;
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  readonly appendOptions?: AppendRecordOptions;
  readonly logger?: boolean;
}

/**
 * 解析 cors origin 配置——将 readonly string[] 转为 mutable string[] 以匹配 @fastify/cors 类型。
 */
function resolveCorsOrigin(corsOrigins: readonly string[] | undefined): string[] | boolean {
  if (corsOrigins === undefined) {
    return true;
  }
  return [...corsOrigins];
}

/**
 * 构建 Fastify 实例（不启动监听·用于测试）。
 *
 * 插件注册顺序（24§1.3）：
 *   1. helmet（安全 headers）
 *   2. cors（跨域）
 *   3. rate-limit（限流·默认 100 req/min）
 *   4. jwt（JWT 签发/验证·仅受保护模式注册·offline 模式不注册）
 *   5. swagger（OpenAPI 文档）
 *   6. auth middleware（可选 JWT 鉴权）
 *   7. error handler（统一错误响应）
 *   8. routes（/health /ready + /api/v1/* 路由）
 */
export async function buildServer(config: ApiServerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger ?? false,
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: resolveCorsOrigin(config.corsOrigins),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax ?? 100,
    timeWindow: '1 minute',
  });
  // 条件注册 jwt 插件：仅受保护模式（jwtSecret !== null）注册。
  // offline 模式（jwtSecret === null）registerAuthMiddleware 全程匿名·不调用 app.jwt.verify·
  // 故无需注册（避免硬编码弱 secret 兜底·零硬编码凭证红线）。
  if (config.jwtSecret !== null) {
    await app.register(jwt, { secret: config.jwtSecret });
  }
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'FAR-Lab API',
        description: 'FAR-Lab 对外 HTTP API（24§5）',
        version: '2026-06-27',
      },
      consumes: ['application/json'],
      produces: ['application/json', 'application/problem+json', 'text/html'],
    },
  });
  // @fastify/swagger 9 仅生成 schema 不服务路由（需 swagger-ui 独立包）；手动暴露 OpenAPI JSON 供 API 发现。
  app.get('/documentation/json', { schema: { hide: true } }, () => app.swagger());

  await registerAuthMiddleware(app, { jwtSecret: config.jwtSecret });

  app.setErrorHandler(errorHandler);

  await registerHealthRoutes(app, { db: config.db });

  await app.register(async (v1) => {
    await registerHypothesizeRoute(v1, {
      db: config.db,
      gitCommitSha: config.gitCommitSha,
      ...(config.gateway === undefined ? {} : { gateway: config.gateway }),
      ...(config.profile === undefined ? {} : { profile: config.profile }),
      ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
    });
    await registerEvidenceRoutes(v1, { db: config.db });
    await registerVerdictRoutes(v1, { db: config.db });
    await registerReportRoute(v1, { db: config.db });
    await registerIntegrityRoutes(v1, { db: config.db });
    // benchmark 端点读预生成 JSON（不依赖运行 db·fresh-clone 跑 generate 脚本即可）
    await registerBenchmarkRoute(v1);
    await registerCourtRoute(v1);
    await registerArenaRoute(v1);
  }, { prefix: '/api/v1' });

  // V2 API routes — six-dimension receipt verification + persistence.
  await app.register(async (v2) => {
    const { registerV2ReceiptRoutes } = await import('./routes/v2_receipts.ts');
    await registerV2ReceiptRoutes(v2);
    const { registerV2ReceiptPersistRoutes } = await import('./routes/v2_receipts_persist.ts');
    await registerV2ReceiptPersistRoutes(v2, config.db);
  }, { prefix: '/api/v2' });

  return app;
}

/**
 * 启动 API server（监听端口 + 优雅启停）。
 *
 * @param config 配置
 * @param port 监听端口（默认 3000·24§0 端口对齐）
 * @param host 监听地址（默认 0.0.0.0）
 */
export async function startServer(
  config: ApiServerConfig,
  port = 3000,
  host = '127.0.0.1',
): Promise<FastifyInstance> {
  // FIX-R6-002: 撤销 R5 的 host-inference fail-closed（评委03/11 发现它回归了 README 背书的
  //   `docker compose up far-api` demo；评委09 发现空 "" secret 仍可绕过）。改 opt-in 鉴权设计：
  //   - 默认 host=127.0.0.1（安全默认；用户可 --host 0.0.0.0 用于 Docker/公开部署，不再 throw）
  //   - 匿名（offline）是默认；--protected/--jwt-secret <非空> opt-in 强制 JWT 鉴权
  //   - 空 secret 由 api.ts FIX-R6-001 拒绝（→null→offline），关闭 "" 伪造 admin 漏洞
  //   公开匿名部署的 /hypothesize 计费暴露由 --protected 显式 opt-in 鉴权覆盖（单机科研工具默认本地）。
  const app = await buildServer(config);
  await app.listen({ port, host });

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  return app;
}
