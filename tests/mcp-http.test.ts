import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpHttpClient } from '../src/agent/mcp-http.js';

/**
 * Real HTTP round-trip: a local node:http fixture server speaks the MCP
 * streamable-HTTP transport (JSON-RPC over POST; one variant answers SSE) — no
 * in-process fakes, so fetch framing, session headers, timeouts and error
 * statuses are exercised for real on 127.0.0.1.
 */

type Variant = 'json' | 'sse' | 'slow' | 'kill-session' | 'paged';

const startFixture = (): Promise<{ server: http.Server; url: string }> =>
  new Promise((resolve) => {
    const sessionId = 'sess-fixture-1';
    let pagedOnce = false;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
      req.on('end', () => {
        let msg: { id?: number; method: string };
        try { msg = JSON.parse(body) as { id?: number; method: string }; } catch { res.writeHead(400); res.end(); return; }
        if (msg.id === undefined || msg.id === null) { res.writeHead(202); res.end(); return; } // notification
        const send = (result: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) => {
          res.writeHead(200, headers);
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
        };
        const variantHeader = req.headers['x-fixture-variant'] as string | undefined;
        const variant = (variantHeader ?? 'json') as Variant;
        if (msg.method === 'initialize') {
          res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': sessionId });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake-http', version: '0.0.1' } } }));
        } else if (msg.method === 'tools/list') {
          if (variant === 'kill-session') { res.writeHead(404); res.end(); return; }
          if (variant === 'slow') { setTimeout(() => send({ tools: [] }), 2000); return; }
          if (variant === 'paged' && !pagedOnce) {
            pagedOnce = true;
            send({ tools: [{ name: 'echo', description: 'echo' }], nextCursor: 'p2' });
            return;
          }
          const payload = { tools: [{ name: 'echo', description: 'echo args back' }, { name: 'fetch_page', description: 'fetch' }] };
          if (variant === 'sse') {
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: payload })}\n\n`);
            res.end();
            return;
          }
          send(payload);
        } else if (msg.method === 'tools/call') {
          send({ content: [{ type: 'text', text: 'called' }], isError: false });
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } }));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });

const fixture = await startFixture();
afterAll(() => { fixture.server.close(); });

const mk = (opts: Partial<ConstructorParameters<typeof McpHttpClient>[0]> = {}): McpHttpClient =>
  new McpHttpClient({ url: fixture.url, timeoutMs: 5000, ...opts });

describe('MCP streamable-HTTP client (real local server)', () => {
  it('handshakes, lists tools (JSON body), calls tools, closes', async () => {
    const client = mk();
    await client.connect();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['echo', 'fetch_page']);
    const res = await client.callTool('echo', { x: 1 });
    expect(res.ok).toBe(true);
    expect(res.isError).toBe(false);
    await client.close();
  });

  it('parses SSE-framed responses (text/event-stream variant)', async () => {
    const client = mk({ headers: { 'x-fixture-variant': 'sse' } });
    await client.connect();
    const tools = await client.listTools();
    expect(tools).toHaveLength(2);
    await client.close();
  });

  it('follows cursor pagination to exhaustion', async () => {
    const client = mk({ headers: { 'x-fixture-variant': 'paged' } });
    await client.connect();
    const tools = await client.listTools();
    // page 1: ['echo'] + nextCursor; page 2 (url carries session, variant header same): full list
    expect(tools.map((t) => t.name)).toEqual(['echo', 'fetch_page']);
    await client.close();
  });

  it('surfaces per-request timeouts as honest errors', async () => {
    const client = mk({ headers: { 'x-fixture-variant': 'slow' }, timeoutMs: 300 });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/timed out after 300ms/);
    await client.close();
  });

  it('treats 404 after session establishment as terminated (no silent retry)', async () => {
    const client = mk({ headers: { 'x-fixture-variant': 'kill-session' } });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/session terminated by server/);
    await client.close();
  });
});
