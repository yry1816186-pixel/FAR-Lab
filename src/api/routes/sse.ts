/**
 * api/routes/sse — shared SSE response headers.
 *
 * `reply.hijack()` + `raw.writeHead` bypass the Fastify hooks — including
 * @fastify/cors — so an SSE endpoint written this way carries NO CORS headers
 * and EventSource from a cross-origin dev origin (e.g. vite :5173 → api :3000)
 * is blocked (2026-08-14 live finding: every workbench run logged a CORS
 * error and silently degraded to polling). This helper puts the CORS headers
 * back on the hijacked response. SSE streams here are read-only and send no
 * credentials, so echoing the request Origin is the correct policy.
 */

import type { FastifyRequest } from 'fastify';

/** SSE + CORS headers for a hijacked raw response. */
export function sseHeaders(request: FastifyRequest): Record<string, string> {
  const origin = request.headers.origin;
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origin !== undefined
      ? {
          'Access-Control-Allow-Origin': String(origin),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          Vary: 'Origin',
        }
      : {}),
  };
}
