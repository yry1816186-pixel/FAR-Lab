/**
 * Fastify API server assembly and lifecycle.
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
import {
  resolveRuntimeGateway,
  RUNTIME_MODEL_SNAPSHOT,
  RUNTIME_PROVIDER_PROFILE,
} from '../llm_gateway/runtime_gateway.ts';
import type { AppendRecordOptions } from '../evidence_log/types.ts';
import type { ProviderProfile } from '../llm_gateway/types.ts';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { AgentEventBus } from '../agent_loop/events.ts';
import type { CourtModelTarget } from './internal/court_service.ts';

/** Explicit API server configuration. */
export interface ApiServerConfig {
  readonly db: Database;
  readonly gitCommitSha: string;
  readonly jwtSecret: string | null;
  readonly corsOrigins?: readonly string[];
  readonly rateLimitMax?: number;
  /** Optional injected gateway. Without one, the built-in runtime resolver checks the environment. */
  readonly gateway?: LlmGateway;
  readonly profile?: ProviderProfile;
  /** Required for live arena execution when an injected gateway is used. */
  readonly modelSnapshot?: string;
  /** Independent target catalog for the cross-model court. No implicit catalog is fabricated. */
  readonly courtModelTargets?: readonly CourtModelTarget[];
  readonly appendOptions?: AppendRecordOptions;
  readonly eventBus?: AgentEventBus;
  readonly logger?: boolean;
  /**
   * Static web hosting root (the built `frontend/dist`). Default: auto-detected
   * `<repo>/frontend/dist`; mounted only when index.html truly exists there —
   * otherwise the server keeps its API-only 404 behavior (never a fake web shell).
   * Pass `false` to explicitly disable hosting even when a dist exists.
   */
  readonly webRoot?: string | false;
}

function resolveCorsOrigin(corsOrigins: readonly string[] | undefined): string[] | boolean {
  return corsOrigins === undefined ? true : [...corsOrigins];
}

const LLM_STATUS_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'data'],
  properties: {
    ok: { type: 'boolean', enum: [true] },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['profile', 'keyConfigured'],
      properties: {
        profile: { type: 'string', nullable: true },
        keyConfigured: { type: 'boolean' },
      },
    },
  },
} as const;

function isV1SuccessEnvelope(payload: object): boolean {
  return 'ok' in payload && payload.ok === true && 'data' in payload;
}

/** Build a Fastify instance without starting a listener. */
/** frontend/index.html 预渲染主题脚本（唯一内联脚本）的 sha256——CSP script-src 白名单。
 *  哈希口径：HTML 解析器将脚本文本 CRLF→LF 规范化——本值必须按 LF 规范化后计算
 *  （浏览器轴 E2E 实证：按原始 CRLF 计算会被 CSP 阻断，scripts/browser_smoke.mjs 可复验）。
 *  与 tests/security/csp_theme_script.test.ts 漂移锁联动：脚本任何改动必须同步更新本值。 */
const THEME_INLINE_SCRIPT_SHA256 = 'S6iXa2DU3NQROxhxq7llLxEtkqu4zIVz0jlpkvr7/9A=';

export async function buildServer(config: ApiServerConfig): Promise<FastifyInstance> {
  const resolvedFromEnvironment = config.gateway === undefined
    ? resolveRuntimeGateway(process.env)
    : null;
  const resolvedGateway = config.gateway ?? resolvedFromEnvironment;
  const llmProfile: ProviderProfile | undefined = resolvedGateway === null
    ? undefined
    : (config.profile ?? RUNTIME_PROVIDER_PROFILE);
  const llm = resolvedGateway === null ? undefined : resolvedGateway;
  const llmModelSnapshot = llm === undefined
    ? undefined
    : (config.modelSnapshot ?? (resolvedFromEnvironment === null ? undefined : RUNTIME_MODEL_SNAPSHOT));
  const keyConfigured = llm !== undefined;

  console.warn(
    `[far-lab] LLM profile: ${keyConfigured
      ? String(llmProfile)
      : 'not configured (LLM-dependent endpoints fail closed — deterministic endpoints remain available)'}`,
  );

  const app = Fastify({
    logger: config.logger ?? true,
    bodyLimit: 10 * 1024 * 1024,
    requestTimeout: 900_000,
    connectionTimeout: 60_000,
  });

  // CSP 硬化（v3.0 指令 Phase 5.3「禁止 unsafe-inline」）：
  //   script-src 无 unsafe-inline——唯一的内联脚本（index.html 预渲染主题脚本，
  //   防明暗闪烁）经 sha256 白名单；哈希漂移有 tests/security 契约测试锁定。
  //   style-src 保留 unsafe-inline（React style 属性的工程现实，非脚本面）。
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", `'sha256-${THEME_INLINE_SCRIPT_SHA256}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(cors, {
    origin: resolveCorsOrigin(config.corsOrigins),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax ?? 100,
    timeWindow: '1 minute',
  });
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
  app.get('/documentation/json', { schema: { hide: true } }, () => app.swagger());
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());

  await registerAuthMiddleware(app, { jwtSecret: config.jwtSecret });
  app.setErrorHandler(errorHandler);

  await registerHealthRoutes(app, { db: config.db });
  await registerMetricsRoutes(app, { db: config.db });

  // Monitor（v3.0 指令 Phase 3.3 · 架构 §3.3）：常驻采样器随 API 实例生命周期——
  // 5s 节律环形缓冲（内存 <1MB），挂既有 Fastify 不立新服务器；onClose 优雅停止。
  const { Sampler } = await import('../monitor/sampler.ts');
  const monitorSampler = new Sampler();
  monitorSampler.start();
  // JSONL 落盘（架构 §2「定期落盘」）：默认开，FAR_MONITOR_PERSIST=off 显式关闭。
  let monitorPersister: { detach(): void } | null = null;
  if (process.env.FAR_MONITOR_PERSIST !== 'off') {
    const { JsonlPersister } = await import('../monitor/persist.ts');
    const persister = new JsonlPersister();
    persister.attach(monitorSampler);
    monitorPersister = persister;
  }
  app.addHook('onClose', async () => {
    monitorPersister?.detach();
    monitorSampler.stop();
  });

  await app.register(async (v1) => {
    v1.addHook('preSerialization', async (_request, reply, payload) => {
      if (reply.statusCode >= 400) return payload;
      if (typeof payload !== 'object' || payload === null || isV1SuccessEnvelope(payload)) {
        return payload;
      }
      return { ok: true, data: payload };
    });

    await registerHypothesizeRoute(v1, {
      db: config.db,
      gitCommitSha: config.gitCommitSha,
      ...(llm === undefined ? {} : { gateway: llm }),
      ...(llmProfile === undefined ? {} : { profile: llmProfile }),
      ...(llmModelSnapshot === undefined ? {} : { modelSnapshot: llmModelSnapshot }),
      ...(config.appendOptions === undefined ? {} : { appendOptions: config.appendOptions }),
      ...(config.eventBus === undefined ? {} : { eventBus: config.eventBus }),
    });
    await registerEvidenceRoutes(v1, { db: config.db });
    await registerVerdictRoutes(v1, { db: config.db });
    await registerReportRoute(v1, { db: config.db });
    await registerIntegrityRoutes(v1, { db: config.db });

    const { registerMonitorRoutes } = await import('./routes/monitor.ts');
    await registerMonitorRoutes(v1, { sampler: monitorSampler });

    const { registerResearchRoutes } = await import('./routes/research.ts');
    await registerResearchRoutes(v1, { db: config.db });
    const { registerLifecycleRoutes } = await import('./routes/lifecycle.ts');
    await registerLifecycleRoutes(v1, { db: config.db });
    await registerBenchmarkRoute(v1);

    await registerCourtRoute(v1, {
      gitCommitSha: config.gitCommitSha,
      ...(config.courtModelTargets === undefined
        ? {}
        : { targets: config.courtModelTargets }),
    });
    await registerArenaRoute(v1, {
      gitCommitSha: config.gitCommitSha,
      ...(llm === undefined ? {} : { gateway: llm }),
      ...(llmProfile === undefined ? {} : { profile: llmProfile }),
      ...(llmModelSnapshot === undefined ? {} : { modelSnapshot: llmModelSnapshot }),
    });

    v1.get(
      '/llm-status',
      { schema: { response: { 200: LLM_STATUS_RESPONSE_SCHEMA } } },
      () => ({
        profile: keyConfigured ? String(llmProfile) : null,
        keyConfigured,
      }),
    );

    const { registerPlanningRoutes } = await import('./routes/planning.ts');
    await registerPlanningRoutes(v1);
    if (config.eventBus !== undefined) {
      const { registerEventsStreamRoute } = await import('./routes/events.ts');
      registerEventsStreamRoute(v1, { bus: config.eventBus });
    }
  }, { prefix: '/api/v1' });

  await app.register(async (v2) => {
    const { registerV2ReceiptRoutes } = await import('./routes/v2_receipts.ts');
    await registerV2ReceiptRoutes(v2);
    const { registerV2ReceiptPersistRoutes } = await import('./routes/v2_receipts_persist.ts');
    await registerV2ReceiptPersistRoutes(v2, config.db);
  }, { prefix: '/api/v2' });

  // Static web hosting (single-process product mode): mounted last, strictly as
  // the not-found fallback — every registered route above keeps precedence.
  if (config.webRoot !== false) {
    const { registerStaticWeb, defaultWebDistRoot } = await import('./static_web.ts');
    const mount = registerStaticWeb(app, config.webRoot ?? defaultWebDistRoot());
    console.warn(`[far-lab] web: ${mount.mounted ? `${mount.reason} — ${mount.distRoot}` : `API-only (${mount.reason})`}`);
  }

  return app;
}

/** Start the API server and install graceful shutdown handlers. */
export async function startServer(
  config: ApiServerConfig,
  port = 3000,
  host = '127.0.0.1',
): Promise<FastifyInstance> {
  const app = await buildServer(config);
  await app.listen({ port, host });

  const shutdown = async (): Promise<void> => {
    await app.close();
    config.db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  return app;
}
