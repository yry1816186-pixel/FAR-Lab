/**
 * api/static_web —— 单进程产品形态：`far api` 直接托管 `frontend/dist` 静态产物。
 *
 * 动机（Open-World R1 实测缺口）：此前 `far api` 对一切非 API GET 一律 404 ——
 * 用户必须同时跑 vite dev（或自建反向代理）才能得到完整产品；headless/远程
 * 浏览器路径断。本模块在**不新增任何运行时依赖**的前提下闭合该缺口
 * （@fastify/static 是成熟先验，但引入新依赖会触动 supply-chain 门与锁文件，
 * 而本需求面足够小且边界清晰——MIME 白名单 + 路径收容 + SPA 回退，全部本文件自有）。
 *
 * 设计不变量：
 *   - 仅在 dist 真实存在（index.html 在盘）时挂载；否则行为与挂载前完全一致（404 JSON）。
 *   - 只接管「没有任何已注册路由命中」的 GET/HEAD：Fastify 路由优先原则保证
 *     /api/* · /health · /ready · /metrics · /documentation/* 永远不被静态面遮蔽。
 *   - API 前缀下的未命中仍返回 Fastify 默认 404 JSON 形状（message/error/statusCode），
 *     绝不回退成 HTML（否则前端 fetch 错误路径会静默吃到 index.html 而解析崩溃）。
 *   - 路径收容：decodeURIComponent 失败 / NUL 字节 / resolve 逃逸 dist 根 → 一律 404。
 *   - SPA 回退只对「无扩展名」路径生效；带扩展名的资源缺失是真实 404（不伪装成功）。
 *   - MIME 白名单：未知扩展名 404（宁可缺，不可错发 content-type）。
 *
 * 缓存策略（与 vite 内容哈希产物对齐）：
 *   - /assets/*      → public, max-age=31536000, immutable（文件名含内容哈希）
 *   - *.html         → no-cache（入口永远重新协商）
 *   - 其余           → public, max-age=3600
 *
 * 已知边界（如实声明）：dist 内不跟随符号链接（vite 产物无符号链接；若未来引入，
 * realpath 校验需扩展）；range/etag 请求不支持（本地/单进程形态下可接受，
 * 生产级缓存层属于反向代理职责，见 frontend/vite.config.ts 注释）。
 */

import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Mount decision + diagnostics for the startup banner. */
export interface StaticWebMount {
  readonly mounted: boolean;
  readonly distRoot: string;
  readonly reason: string;
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

/** Path prefixes that must keep the API's JSON 404 contract — never HTML-fallback. */
const API_PREFIXES: readonly string[] = ['/api/', '/api', '/health', '/ready', '/metrics', '/documentation', '/openapi.json'];

/** Reproduce Fastify's default 404 body shape so API clients see no contract drift. */
function sendJson404(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const path = (request.raw.url ?? '/').split('?')[0] ?? '/';
  return reply.code(404).header('content-type', 'application/json; charset=utf-8').send({
    message: `Route ${request.method}:${path} not found`,
    error: 'Not Found',
    statusCode: 404,
  });
}

function cacheControlFor(relPath: string, ext: string): string {
  if (ext === '.html') return 'no-cache';
  if (relPath.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

/**
 * Mount static web hosting as the not-found fallback. Returns the mount decision;
 * when the dist root has no index.html, nothing is mounted and the server keeps
 * its previous 404-everything behavior (honest API-only mode).
 */
export function registerStaticWeb(app: FastifyInstance, distRoot: string): StaticWebMount {
  const root = resolve(distRoot);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) {
    return { mounted: false, distRoot: root, reason: 'index.html not found (run `pnpm build` to produce frontend/dist)' };
  }

  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const rawPath = (request.raw.url ?? '/').split('?')[0] ?? '/';

    // 1. API/probe prefixes keep the JSON 404 contract — never HTML.
    if (API_PREFIXES.some((p) => rawPath === p || rawPath.startsWith(p.endsWith('/') ? p : `${p}/`))) {
      return sendJson404(request, reply);
    }

    // 2. Only GET/HEAD may serve web assets.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return sendJson404(request, reply);
    }

    // 3. Decode + containment.
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return sendJson404(request, reply);
    }
    if (decoded.includes('\0')) {
      return sendJson404(request, reply);
    }

    const ext = extname(decoded).toLowerCase();
    // SPA fallback: extension-less paths serve the app shell.
    const relRequested = ext === '' ? '/index.html' : decoded;
    const filePath = resolve(root, `.${relRequested}`);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      return sendJson404(request, reply);
    }

    const finalExt = extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[finalExt];
    if (contentType === undefined) {
      return sendJson404(request, reply);
    }

    let info;
    try {
      info = await stat(filePath);
    } catch {
      return sendJson404(request, reply);
    }
    if (!info.isFile()) {
      return sendJson404(request, reply);
    }

    reply
      .code(200)
      .header('content-type', contentType)
      .header('content-length', String(info.size))
      .header('cache-control', cacheControlFor(relRequested, finalExt));

    if (request.method === 'HEAD') {
      return reply.send();
    }
    return reply.send(createReadStream(filePath));
  });

  return { mounted: true, distRoot: root, reason: 'serving frontend/dist (single-process product mode)' };
}

/** Default dist root: <repo>/frontend/dist, derived from this file's location. */
export function defaultWebDistRoot(): string {
  return fileURLToPath(new URL('../../frontend/dist', import.meta.url));
}
