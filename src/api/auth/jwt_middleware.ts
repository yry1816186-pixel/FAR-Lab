/**
 * jwt_middleware —— 可选 JWT 鉴权中间件。
 *
 * 设计原则：
 *   - offline 模式 skip：无 JWT_SECRET 环境变量时返回 anonymous 主体（不阻断·24§3.1 双轨鉴权）。
 *   - 有 JWT_SECRET 时：验证 Bearer Token，解码后挂载到 request.principal。
 *   - 三探针（GET /health /ready /metrics）由此中间件精确豁免并挂载 anonymous（24§0.3）。
 *   - 不引入 LLM-as-judge / 外部 agent runtime（24§0.7 红线）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthPrincipal } from '../types.ts';

/**
 * 鉴权配置——由 server.ts 注入（禁 process.env 直读·显式传入可测·06 types.ts 注释第 5 条）。
 */
export interface AuthConfig {
  /** JWT 密钥（null = offline 模式·skip 鉴权·返回 anonymous） */
  readonly jwtSecret: string | null;
}

/**
 * Fastify request decorator 扩展——挂载 AuthPrincipal。
 *
 * 通过 module augmentation 声明，使 request.principal 类型安全。
 */
declare module 'fastify' {
  interface FastifyRequest {
    principal: AuthPrincipal;
  }
}

const ANONYMOUS_PRINCIPAL: AuthPrincipal = {
  userId: 'anonymous',
  role: 'anonymous',
};

/**
 * 注册鉴权中间件（fail-closed 语义）。
 *
 * 行为：
 *   - jwtSecret === null：所有请求挂载 anonymous 主体（offline 模式·24§3.1·不阻断）。
 *   - jwtSecret !== null 且 GET 精确命中 /health /ready /metrics：挂载 anonymous 主体并豁免 JWT。
 *   - jwtSecret !== null（受保护模式）：缺 Authorization 头 / 非 Bearer 前缀 / 空 token / 无效签名
 *     一律返回 401（fail-closed·禁挂 anonymous 静默放行）。仅签名有效时挂载 principal。
 *     豁免比较原始 path 的精确值（忽略 query）且限 GET；近似/嵌套路径仍 fail-closed。
 *
 * @param app Fastify 实例
 * @param config 鉴权配置
 */
export async function registerAuthMiddleware(
  app: FastifyInstance,
  config: AuthConfig,
): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // jwtSecret === null（offline 模式·24§3.1）：所有请求挂载 anonymous 主体·不阻断
    if (config.jwtSecret === null) {
      request.principal = ANONYMOUS_PRINCIPAL;
      return;
    }

    if (isAnonymousProbeRequest(request)) {
      request.principal = ANONYMOUS_PRINCIPAL;
      return;
    }

    // fail-closed（24§3.1）：配置 jwtSecret 时，缺/畸形 Authorization 头 / 空 token 一律 401
    // （禁挂 anonymous 放行——否则未授权请求在受保护模式下静默获得 anonymous 身份）
    const authHeader = request.headers.authorization;
    const token =
      authHeader !== undefined && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
    if (token.length === 0) {
      return reply.code(401).type('application/problem+json').send({
        error_code: 'UNAUTHORIZED',
        message: 'missing or malformed Authorization Bearer header',
        source_anchor: {
          fileId: null,
          stageId: null,
          callRecordId: null,
        },
      });
    }

    try {
      const decoded = app.jwt.verify(token) as JwtPayloadShape;
      request.principal = {
        userId: decoded.sub,
        role: decoded.role,
      };
    } catch (err) {
      // 审计 P2-9：服务端记录 JWT 验证失败详情（诊断用）——客户端响应保持统一 401
      // （不泄露 token 内部信息·fail-closed 安全设计不变）。
      console.warn(`[auth] jwt verify failed: ${err instanceof Error ? err.message : String(err)}`);
      return reply.code(401).type('application/problem+json').send({
        error_code: 'UNAUTHORIZED',
        message: 'invalid or expired JWT',
        source_anchor: {
          fileId: null,
          stageId: null,
          callRecordId: null,
        },
      });
    }
  });
}

const ANONYMOUS_PROBE_PATHS: ReadonlySet<string> = new Set(['/health', '/ready', '/metrics']);

/**
 * 只豁免三个实际 GET probe。request.url 保留 query string，故比较前先截去 `?`
 * 之后的部分。不做前缀、尾斜杠或 URL decode 宽松化，避免业务/相似路径误命中。
 */
function isAnonymousProbeRequest(request: FastifyRequest): boolean {
  if (request.method !== 'GET') {
    return false;
  }
  const queryIndex = request.url.indexOf('?');
  const path = queryIndex === -1 ? request.url : request.url.slice(0, queryIndex);
  return ANONYMOUS_PROBE_PATHS.has(path);
}

interface JwtPayloadShape {
  readonly sub: string;
  readonly role: 'viewer' | 'researcher' | 'admin';
}
