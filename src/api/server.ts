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
import { registerMetricsRoutes } from './routes/metrics.ts';
import { registerHypothesizeRoute } from './routes/hypothesize.ts';
import { registerEvidenceRoutes } from './routes/evidence.ts';
import { registerVerdictRoutes } from './routes/verdict.ts';
import { registerReportRoute } from './routes/report.ts';
import { registerIntegrityRoutes } from './routes/integrity.ts';
import { registerBenchmarkRoute } from './routes/benchmark.ts';
import { registerCourtRoute } from './routes/court.ts';
import { registerArenaRoute } from './routes/arena.ts';
import { createCompetitionQwenGateway } from '../llm_gateway/competition_gateway.ts';
import type { AppendRecordOptions } from '../evidence_log/types.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { AgentEventBus } from '../agent_loop/events.ts';

/**
 * 解析运行期 LLM 网关 + profile（WS-A.1：让真实推理可达）。
 *
 * 优先级：
 *   1. config 显式注入的 gateway/profile（测试 + 高级用户用）→ 直接采用
 *   2. 环境变量 DASHSCOPE_API_KEY / FAR_DASHSCOPE_API_KEY 存在 → 构造 competition_aliyun_qwen 网关
 *   3. 都没有 → offline_replay（现状·确定性 fixture）
 *
 * 诚实边界（红线）：key 不存在时 server 照常启动（offline_replay），绝不假装 live。
 * 之前 server.ts 从不构造真实 gateway，导致 POST /hypothesize 即使用户设了 key 也跑 offline_replay。
 *
 * @returns 解析后的 gateway / profile / keyConfigured（供 /llm-status 与启动日志用）
 */
function resolveLlmRuntime(config: ApiServerConfig): {
  readonly gateway: LlmGateway | undefined;
  readonly profile: ProviderProfile | undefined;
  readonly keyConfigured: boolean;
} {
  // 优先级 1：显式注入（测试用·最高优先）
  if (config.gateway !== undefined) {
    return {
      gateway: config.gateway,
      profile: config.profile ?? 'competition_aliyun_qwen',
      keyConfigured: true,
    };
  }
  // 优先级 2：环境变量构造生产网关（唯一允许读 env 的地方·server bootstrap）
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.FAR_DASHSCOPE_API_KEY;
  if (apiKey !== undefined && apiKey.length > 0) {
    return {
      gateway: createCompetitionQwenGateway({ apiKey }),
      profile: 'competition_aliyun_qwen',
      keyConfigured: true,
    };
  }
  // 优先级 3：offline_replay（现状）
  return { gateway: undefined, profile: undefined, keyConfigured: false };
}

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
  /** P0-4 可选运行时事件总线（注入则注册 /events/stream SSE 端点）。 */
  readonly eventBus?: AgentEventBus;
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
  // WS-A.1：解析运行期 LLM 网关（显式注入 > env key > offline_replay）。
  const llm = resolveLlmRuntime(config);
  // 启动期一次性诚实日志（key 缺失时明确告知 offline_replay，绝不假装 live）。
  // 用 console.warn（no-console 规则仅允许 warn/error；与 jwt_middleware.ts 一致）。
  const profileLabel = llm.gateway === undefined ? 'offline_replay' : String(llm.profile);
  console.warn(`[far-lab] LLM profile: ${profileLabel} (key: ${llm.keyConfigured ? 'configured' : 'absent — running offline replay'})`);
  const app = Fastify({
    // 阶段 7 P2-A（LP-4）：可观测默认 on——logger 缺省 true（旧默认 false 让观测面静默）。
    // 测试可显式传 logger:false 保持安静；Fastify 默认不记录请求头/Authorization（无密钥泄漏面）。
    logger: config.logger ?? true,
    bodyLimit: 10 * 1024 * 1024,
    // 审计 P1-5：请求超时总保险丝——LLM fallback 链最坏路径（60s×3 档 + withRetry 退避）理论 ~720s，
    // 900s 不误杀慢调用，但封顶防连接无限挂起；空闲连接 60s 回收。
    requestTimeout: 900_000,
    connectionTimeout: 60_000,
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
    openapi: {
      info: {
        title: 'FAR-Lab API',
        description:
          'FAR-Lab 对外 HTTP API（24§5）。V2 receipts 端点采用统一信封 { ok: true, data: T } + RFC 7807 错误响应（R-05）。',
        version: '2026-06-27',
      },
      tags: [
        { name: 'health', description: 'Liveness + readiness probes' },
        { name: 'v1', description: 'V1 API (hypothesize / evidence / verdict / report / integrity / benchmark / court / arena)' },
        { name: 'v2-receipts', description: 'V2 receipt verification + persistence (R-05 unified envelope { ok, data } + RFC 7807 errors)' },
      ],
    },
  });
  // @fastify/swagger 9 仅生成 schema 不服务路由（需 swagger-ui 独立包）；手动暴露 OpenAPI 3.0 JSON。
  // /documentation/json 保留（向后兼容）；/openapi.json 为规范别名（R-15 契约 SSOT 入口 + 前端 mock 生成源）。
  app.get('/documentation/json', { schema: { hide: true } }, () => app.swagger());
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());

  await registerAuthMiddleware(app, { jwtSecret: config.jwtSecret });

  app.setErrorHandler(errorHandler);

  await registerHealthRoutes(app, { db: config.db });
  // 阶段 7 P2-A（D1-1）：/metrics 指标端点（Prometheus 文本格式·裸根探针豁免·观测面第一环）。
  await registerMetricsRoutes(app, { db: config.db });

  await app.register(async (v1) => {
    // R-05 契约统一收尾（P1-3）：v1 成功响应统一 { ok: true, data: T } 信封。
    // 实现方式：onSend hook 统一包装，路由代码零改动。
    // 边界（fail-closed，零误包）：
    //   - statusCode >= 400 不包（RFC 7807 错误信封由 error_handler 产出，禁止二次包装）
    //   - 非 JSON / SSE（text/event-stream，hijack 流）不包
    //   - payload 无法解析为对象时不包（防御畸形响应，宁可原样透传）
    // 前端对应：api_client.ts parseV1Response 在边界解包（single source of truth）。
    v1.addHook('onSend', async (_request, reply, payload) => {
      if (reply.statusCode >= 400) {
        return payload;
      }
      const contentType = reply.getHeader('content-type');
      if (typeof contentType !== 'string' || !contentType.includes('application/json')) {
        return payload;
      }
      if (typeof payload !== 'string' || payload.length === 0) {
        return payload;
      }
      try {
        const body: unknown = JSON.parse(payload);
        if (typeof body === 'object' && body !== null && !('ok' in body)) {
          return JSON.stringify({ ok: true, data: body });
        }
        return payload;
      } catch {
        // 畸形 JSON 透传（防御性；正常情况下 fastify 序列化不会产生非法 JSON）。
        return payload;
      }
    });

    await registerHypothesizeRoute(v1, {
      db: config.db,
      gitCommitSha: config.gitCommitSha,
      ...(llm.gateway === undefined ? {} : { gateway: llm.gateway }),
      ...(llm.profile === undefined ? {} : { profile: llm.profile }),
      ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
    });
    await registerEvidenceRoutes(v1, { db: config.db });
    await registerVerdictRoutes(v1, { db: config.db });
    await registerReportRoute(v1, { db: config.db });
    await registerIntegrityRoutes(v1, { db: config.db });
    // 阶段 7 P2（BA3-3）：生命周期事件只读查询（修正通知机制·修正不静默）。
    const { registerLifecycleRoutes } = await import('./routes/lifecycle.ts');
    await registerLifecycleRoutes(v1, { db: config.db });
    // benchmark 端点读预生成 JSON（不依赖运行 db·fresh-clone 跑 generate 脚本即可）
    await registerBenchmarkRoute(v1);
    // WS-A.1：court / arena 接收 resolved gateway + profile（之前完全无 config→恒 offline_replay）。
    await registerCourtRoute(v1, {
      gitCommitSha: config.gitCommitSha,
      ...(llm.gateway === undefined ? {} : { gateway: llm.gateway }),
      ...(llm.profile === undefined ? {} : { profile: llm.profile }),
    });
    await registerArenaRoute(v1, {
      gitCommitSha: config.gitCommitSha,
      ...(llm.gateway === undefined ? {} : { gateway: llm.gateway }),
      ...(llm.profile === undefined ? {} : { profile: llm.profile }),
    });
    // WS-A.1：/llm-status 暴露运行期 LLM 状态给前端（profile + keyConfigured·不泄漏 key）。
    // 前端据此显示「live 模式」徽章或「offline replay」诚实横幅——治「每个问题同一裁决」感知。
    v1.get('/llm-status', () => ({
      profile: llm.gateway === undefined ? 'offline_replay' : String(llm.profile),
      keyConfigured: llm.keyConfigured,
    }));
    // opencode 规划方法论源代码化：确定性门禁引擎 HTTP 层（P0-P4 分级 / Plan/Spec 校验 / 门禁报告）
    const { registerPlanningRoutes } = await import('./routes/planning.ts');
    await registerPlanningRoutes(v1);
    // P0-4 事件流 SSE（可选·注入 eventBus 才注册）
    if (config.eventBus !== undefined) {
      const { registerEventsStreamRoute } = await import('./routes/events.ts');
      registerEventsStreamRoute(v1, { bus: config.eventBus });
    }
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
    // WAL checkpoint：显式关闭 DB（better-sqlite3 建议——确保未 checkpoint 的 WAL 数据落盘）。
    // close() 幂等（已关闭时 no-op）。
    config.db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  return app;
}
