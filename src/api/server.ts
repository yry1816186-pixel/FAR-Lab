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
  // F-5-10-005: 非 loopback host + 无 JWT = 匿名暴露计费 LLM 端点（/hypothesize 触发真实百炼费用）→ fail-closed。
  // 安全默认改为 127.0.0.1；公开部署须显式 --host 0.0.0.0 + --protected/--jwt-secret。
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback && config.jwtSecret === null) {
    throw new Error(
      `startServer fail-closed: host='${host}' 非 loopback 但 jwtSecret=null（匿名暴露 /hypothesize = 真实 LLM 计费/DoS 面）。` +
        ` 设 jwtSecret（--protected/--jwt-secret）或绑 loopback（--host 127.0.0.1）。`,
    );
  }
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
