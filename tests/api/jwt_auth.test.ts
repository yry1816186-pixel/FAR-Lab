/**
 * jwt_auth.test.ts —— JWT 鉴权中间件 fail-closed 语义测试（24§3.1 双轨鉴权）。
 *
 *            src/api/auth/jwt_middleware.ts（fail-closed 实现）。
 *
 * 覆盖矩阵（对抗式 fail-open 回归守护）：
 *   - offline 模式（jwtSecret=null）：无 Authorization 头 → 匿名放行（不阻断·24§3.1）。
 *   - 受保护模式（jwtSecret≠null）fail-closed（审计 [security] HIGH 修复）：
 *     · 缺 Authorization 头 → 401
 *     · 非 Bearer 前缀（Basic）→ 401
 *     · Bearer 空 token → 401
 *     · 无效签名 token → 401
 *     · 有效签名 token → 挂载 principal（userId/role）
 *
 * 测试用独立 Fastify 实例 + registerAuthMiddleware（不依赖 db/routes），聚焦鉴权语义。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。JSON.parse 返回值用结构断言收窄。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';

import { registerAuthMiddleware } from '../../src/api/auth/jwt_middleware.ts';

const PROTECTED_SECRET = 'test-jwt-secret-do-not-use-in-prod';

/**
 * 构建鉴权测试 app：注册 jwt（仅受保护模式）+ auth middleware + 一个回显 principal 的测试路由。
 */
async function buildAuthApp(jwtSecret: string | null): Promise<FastifyInstance> {
  const app = Fastify();
  if (jwtSecret !== null) {
    await app.register(jwt, { secret: jwtSecret });
  }
  await registerAuthMiddleware(app, { jwtSecret });
  app.get('/echo-principal', async (request) => ({ principal: request.principal }));
  return app;
}

/**
 * 解析 inject 响应体（JSON.parse 收窄为对象·禁裸 any 访问）。
 */
function parseBody(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body);
  assert.ok(parsed !== null && typeof parsed === 'object', '响应体非对象');
  return parsed as Record<string, unknown>;
}

test('offline 模式（jwtSecret=null）无 Authorization 头 → 匿名放行 200', async () => {
  const app = await buildAuthApp(null);
  try {
    const res = await app.inject({ method: 'GET', url: '/echo-principal' });
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    const principal = body.principal as { userId: string; role: string };
    assert.equal(principal.userId, 'anonymous');
    assert.equal(principal.role, 'anonymous');
  } finally {
    await app.close();
  }
});

test('受保护模式缺 Authorization 头 → 401 fail-closed', async () => {
  const app = await buildAuthApp(PROTECTED_SECRET);
  try {
    const res = await app.inject({ method: 'GET', url: '/echo-principal' });
    assert.equal(res.statusCode, 401);
    assert.equal(parseBody(res).error_code, 'UNAUTHORIZED');
  } finally {
    await app.close();
  }
});

test('受保护模式非 Bearer 前缀（Basic）→ 401 fail-closed', async () => {
  const app = await buildAuthApp(PROTECTED_SECRET);
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/echo-principal',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(parseBody(res).error_code, 'UNAUTHORIZED');
  } finally {
    await app.close();
  }
});

test('受保护模式 Bearer 空 token → 401 fail-closed', async () => {
  const app = await buildAuthApp(PROTECTED_SECRET);
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/echo-principal',
      headers: { authorization: 'Bearer ' },
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('受保护模式无效签名 token → 401 fail-closed', async () => {
  const app = await buildAuthApp(PROTECTED_SECRET);
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/echo-principal',
      headers: { authorization: 'Bearer invalid.token.signature' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(parseBody(res).message, 'invalid or expired JWT');
  } finally {
    await app.close();
  }
});

test('受保护模式有效签名 token → 挂载 principal（userId/role）', async () => {
  const app = await buildAuthApp(PROTECTED_SECRET);
  try {
    const token = app.jwt.sign({ sub: 'researcher-001', role: 'researcher' });
    const res = await app.inject({
      method: 'GET',
      url: '/echo-principal',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const principal = parseBody(res).principal as { userId: string; role: string };
    assert.equal(principal.userId, 'researcher-001');
    assert.equal(principal.role, 'researcher');
  } finally {
    await app.close();
  }
});
