import { z } from 'zod';
import { McpToolAnnotations, type McpToolInfo } from './mcp.js';
import { assertFetchDestination } from '../shared/destination-guard.js';

/**
 * MCP streamable-HTTP client (TIS): same narrow surface as McpStdioClient —
 * initialize handshake, paginated tools/list, tools/call — over JSON-RPC 2.0
 * POST requests (MCP 2025-06-18 streamable-HTTP transport). Zero dependencies
 * (global fetch + AbortController).
 *
 * Honest limitation: we do NOT open the optional GET SSE stream, so
 * server-initiated notifications (tools/list_changed) are not received on this
 * transport; toolset refresh happens on reconnect/explicit test. Server->client
 * requests are unsupported, mirroring the stdio client's surface.
 */

export interface McpHttpOptions {
  url: string;
  headers?: Record<string, string>;
  clientName?: string;
  protocolVersion?: string;
  /** Per-request timeout (default 30s). */
  timeoutMs?: number;
  /** Injectable fetch for tests/offline fixtures; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const pageSchema = z.object({
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.unknown().optional(),
    annotations: McpToolAnnotations.optional(),
  })),
  nextCursor: z.string().min(1).optional(),
});

const ServerInfoSchema = z.object({
  serverInfo: z.object({ name: z.string().optional(), version: z.string().optional() }).optional(),
});

export class McpHttpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private closed = false;
  private serverIdentity: { name?: string; version?: string } = {};
  constructor(private readonly opts: McpHttpOptions) {}

  private get fetchImpl(): typeof fetch {
    return this.opts.fetchImpl ?? globalThis.fetch;
  }

  async connect(): Promise<void> {
    if (this.closed) throw new Error('mcp-http: client closed');
    // Process-boundary egress guard (FA-SEC-04): reject a server URL pointing
    // at a metadata endpoint / private range / plaintext public host before the
    // initialize handshake carries headers anywhere. Local MCP servers on
    // loopback stay legal in any scheme. Surfaced through the manager's honest
    // per-server failed state, and the wording deliberately matches none of
    // the retryable-transport patterns (an egress rejection is not transient).
    try {
      assertFetchDestination(this.opts.url);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`mcp-http: egress guard rejected ${this.opts.url} — ${reason}`, { cause: e });
    }
    const initResult = await this.request('initialize', {
      protocolVersion: this.opts.protocolVersion ?? '2025-06-18',
      capabilities: {},
      clientInfo: { name: this.opts.clientName ?? 'far-lab-agent', version: '0.1.0' },
    });
    const parsed = ServerInfoSchema.safeParse(initResult);
    if (parsed.success && parsed.data.serverInfo !== undefined) {
      this.serverIdentity = {
        ...(parsed.data.serverInfo.name !== undefined ? { name: parsed.data.serverInfo.name } : {}),
        ...(parsed.data.serverInfo.version !== undefined ? { version: parsed.data.serverInfo.version } : {}),
      };
    }
    // notifications/initialized — 202 Accepted, no body expected; failure is tolerated
    // per transport spec (the handshake already succeeded above).
    await this.notify('notifications/initialized');
  }

  /** Server identity from the initialize handshake (capability provenance; empty when the server declared none). */
  serverInfo(): { name?: string; version?: string } {
    return this.serverIdentity;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; ; page += 1) {
      if (page > 100) throw new Error('mcp-http: tools/list pagination exceeded 100 pages — aborting (server-side pagination bug)');
      const res = await this.request('tools/list', cursor === undefined ? {} : { cursor });
      const parsed = pageSchema.safeParse(res);
      if (!parsed.success) {
        throw new Error(`mcp-http: tools/list page ${page} returned unexpected shape: ${parsed.error.issues[0]?.message}`);
      }
      for (const tool of parsed.data.tools) {
        if (seen.has(tool.name)) continue;
        seen.add(tool.name);
        tools.push(tool);
      }
      cursor = parsed.data.nextCursor;
      if (cursor === undefined) break;
    }
    return tools;
  }

  async callTool(name: string, args: unknown): Promise<{ ok: boolean; content: unknown; isError: boolean }> {
    const res = await this.request('tools/call', { name, arguments: args ?? {} }) as { content?: unknown; isError?: boolean };
    const isError = res?.isError === true;
    return { ok: !isError, content: res?.content ?? null, isError };
  }

  async close(): Promise<void> {
    this.closed = true;
    // Best-effort DELETE to end the server session; transport spec allows 405 on
    // servers that don't support it — any outcome is fine, the client is closed.
    if (this.sessionId !== null) {
      try {
        await this.rawFetch(this.opts.url, { method: 'DELETE' });
      } catch {
        // server gone / unreachable — nothing to end
      }
    }
  }

  /** Interface parity with McpStdioClient; never fires (no GET SSE stream — see class doc). */
  onToolsChanged(_handler: () => void): () => void {
    void _handler;
    return () => {};
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const res = await this.rawFetch(this.opts.url, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0' as const, id, method, params }),
    });
    if (res.status === 404 && this.sessionId !== null) {
      // Spec: 404 means the session was terminated server-side — surface it, never retry silently.
      throw new Error('mcp-http: session terminated by server (HTTP 404) — reconnect required');
    }
    if (!res.ok) {
      throw new Error(`mcp-http: request '${method}' failed: HTTP ${res.status}`);
    }
    const msg = await this.parseBody(res, method);
    if (msg.error !== undefined) {
      throw new Error(`mcp-http: ${msg.error.message} (code ${msg.error.code})`);
    }
    return msg.result;
  }

  private async notify(method: string): Promise<void> {
    const res = await this.rawFetch(this.opts.url, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0' as const, method }),
    });
    // 202 Accepted is the notification success code; other ok statuses are tolerated.
    if (!res.ok && res.status !== 202) {
      throw new Error(`mcp-http: notification '${method}' failed: HTTP ${res.status}`);
    }
    // Drain any body so the connection is not left hanging.
    await res.text().catch(() => '');
  }

  private async rawFetch(url: string, init: { method: string; body?: string }): Promise<Response> {
    const timeoutMs = this.opts.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: init.method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(this.sessionId !== null ? { 'mcp-session-id': this.sessionId } : {}),
          ...(this.opts.headers ?? {}),
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`mcp-http: request timed out after ${timeoutMs}ms`, { cause: e });
      }
      throw e instanceof Error ? new Error(`mcp-http: fetch failed: ${e.message}`, { cause: e }) : e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** One JSON-RPC response body: either application/json or the first SSE `data:` event (streamable-HTTP both-shapes rule). */
  private async parseBody(res: Response, method: string): Promise<JsonRpcResponse> {
    const contentType = res.headers.get('content-type') ?? '';
    let raw: unknown;
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const dataLine = text.split(/\r?\n/).find((l) => l.startsWith('data:'));
      if (dataLine === undefined) throw new Error(`mcp-http: SSE response for '${method}' carried no data event`);
      raw = JSON.parse(dataLine.slice('data:'.length).trim());
    } else {
      raw = await res.json();
    }
    const parsed = z.object({
      jsonrpc: z.literal('2.0'),
      id: z.number(),
      result: z.unknown().optional(),
      error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional(),
    }).safeParse(raw);
    if (!parsed.success) {
      throw new Error(`mcp-http: response for '${method}' is not a JSON-RPC response: ${parsed.error.issues[0]?.message}`);
    }
    // Session id is established by the initialize response (Mcp-Session-Id header).
    if (this.sessionId === null) {
      const sid = res.headers.get('mcp-session-id');
      if (sid !== null && sid.length > 0) this.sessionId = sid;
    }
    return parsed.data;
  }
}
