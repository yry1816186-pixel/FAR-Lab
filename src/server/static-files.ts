import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { sha256Hex } from '../shared/crypto.js';
import { decodeSegments, notFound, sendJson } from './http-kit.js';

/**
 * Static frontend serving (BC-002 split; pure extraction from api.ts): serves
 * web/dist when present with SPA fallback ONLY for '/' (the workbench is
 * hash-routed), content-etag revalidation and immutable /assets caching.
 */

const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
};

/**
 * Safe static path resolution. Returns 'unsafe' for traversal/absolute/encoded-separator
 * attempts (must 404, never silently fall back), a resolved absolute path when the target
 * is a file inside the root, or null for a safe path that is not a file (SPA-fallback
 * candidate).
 */
const safeStaticFile = (staticRoot: string, pathname: string): string | 'unsafe' | null => {
  const segments = decodeSegments(pathname);
  if (segments === null) return 'unsafe';
  for (const seg of segments) {
    if (seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0') || /:/.test(seg)) return 'unsafe';
  }
  const abs = path.resolve(staticRoot, ...segments);
  if (abs !== staticRoot && !abs.startsWith(staticRoot + path.sep)) return 'unsafe';
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  return null;
};

const mimeFor = (file: string): string =>
  MIME_TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';

export const serveStatic = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  staticRoot: string,
  method: string,
  pathname: string,
  headOnly: boolean,
): void => {
  if (!fs.existsSync(staticRoot)) {
    if (pathname === '/' && (method === 'GET' || method === 'HEAD')) {
      sendJson(res, 200, {
        service: 'far-lab',
        api: '/api/v1',
        frontend: { built: false, reason: `static root not found (${staticRoot}) — build the web workbench first` },
      });
    } else {
      throw notFound(`no route: ${method} ${pathname}`);
    }
    return;
  }
  const resolved = safeStaticFile(staticRoot, pathname);
  if (resolved === 'unsafe') {
    throw notFound(`no route: ${method} ${pathname}`); // traversal/malformed: 404, never a fallback
  }
  let target: string | null = resolved; // non-null only when it is a file inside the root
  // The workbench is hash-routed (useHashRoute: "hash routes need no server
  // support"), so only '/' needs index.html. Any other extension-less path
  // (e.g. a missing /models/* asset probe) 404s honestly — a 200 HTML body
  // here once made the ASR worker treat a missing model as present.
  if (target === null && pathname === '/') {
    const index = path.join(staticRoot, 'index.html');
    if (fs.existsSync(index)) target = index;
  }
  if (target === null) throw notFound(`no route: ${method} ${pathname}`);
  const body = fs.readFileSync(target);
  const etag = `"sha256-${sha256Hex(body)}"`;
  // Vite owns /assets and content-hashes every emitted filename. Those bytes
  // are immutable across deployments; the HTML and optional /models tree are
  // stable paths whose contents can change and therefore revalidate every
  // reuse. A strong content validator makes both policies deterministic.
  const cacheControl = pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  const representationHeaders = {
    'Content-Type': mimeFor(target),
    'Cache-Control': cacheControl,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  const ifNoneMatch = req.headers['if-none-match'];
  const validators = (Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch ?? '')
    .split(',')
    .map((value: string) => value.trim());
  if (validators.includes('*') || validators.includes(etag)) {
    res.writeHead(304, representationHeaders);
    res.end();
    return;
  }
  const headers = { ...representationHeaders, 'Content-Length': body.length };
  if (headOnly) {
    res.writeHead(200, headers);
    res.end();
  } else {
    res.writeHead(200, headers);
    res.end(body);
  }
};
