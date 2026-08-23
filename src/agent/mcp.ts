import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from './tool.js';

/**
 * Minimal MCP stdio client (H4): JSON-RPC 2.0 over newline-delimited stdio — initialize
 * handshake, tools/list, tools/call. Zero dependencies, surface deliberately narrow:
 * this adapts EXTERNAL tool servers into the kernel's AgentTool contract; it is an
 * integration boundary, so remote tools validate nothing locally (the server is the
 * authority) and every failure is surfaced, never swallowed.
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}
type JsonRpcMessage =
  | JsonRpcRequest
  | { jsonrpc: '2.0'; method: string; params?: unknown } // notification
  | { jsonrpc: '2.0'; id: number; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpStdioOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  clientName?: string;
  protocolVersion?: string;
  /** Per-request timeout (default 30s) — remote servers must not hang the agent loop. */
  timeoutMs?: number;
}

export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = '';
  private closed = false;
  constructor(private readonly opts: McpStdioOptions) {}

  async connect(): Promise<void> {
    if (this.child !== null) throw new Error('mcp: already connected');
    const child = spawn(this.opts.command, this.opts.args ?? [], {
      env: { ...process.env, ...this.opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.on('error', (e) => this.failAll(new Error(`mcp: spawn failed: ${e.message}`)));
    child.on('close', () => this.failAll(new Error('mcp: server exited')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child = child;
    try {
      await this.request('initialize', {
        protocolVersion: this.opts.protocolVersion ?? '2025-06-18',
        capabilities: {},
        clientInfo: { name: this.opts.clientName ?? 'far-lab-agent', version: '0.1.0' },
      });
    } catch (e) {
      await this.close();
      throw e;
    }
    this.notify('notifications/initialized');
  }

  async listTools(): Promise<McpToolInfo[]> {
    // MCP tools/list is CURSOR-PAGINATED (nextCursor per spec) — a single request silently
    // truncates paginated servers. Loop pages, dedupe repeated names across pages.
    const pageSchema = z.object({
      tools: z.array(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        inputSchema: z.unknown().optional(),
      })),
      nextCursor: z.string().min(1).optional(),
    });
    const tools: McpToolInfo[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; ; page += 1) {
      if (page > 100) throw new Error('mcp: tools/list pagination exceeded 100 pages — aborting (server-side pagination bug)');
      const res = await this.request('tools/list', cursor === undefined ? {} : { cursor });
      const parsed = pageSchema.safeParse(res);
      if (!parsed.success) {
        throw new Error(`mcp: tools/list page ${page} returned unexpected shape: ${parsed.error.issues[0]?.message}`);
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
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error('mcp: client closed'));
    const child = this.child;
    this.child = null;
    if (child === null) return;
    child.stdin.end();
    const killed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2000);
      child.on('exit', () => { clearTimeout(timer); resolve(true); });
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
    });
    if (!killed) child.kill('SIGKILL');
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (child === null || this.closed) return Promise.reject(new Error('mcp: not connected'));
    const id = this.nextId++;
    const timeoutMs = this.opts.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp: request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0' as const, id, method, params })}\n`);
    });
  }

  private notify(method: string): void {
    if (this.child === null || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0' as const, method })}\n`);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const nl = this.buffer.indexOf('\n');
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length === 0) continue;
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(line) as JsonRpcMessage;
      } catch {
        continue; // non-protocol stderr-style noise on stdout is ignored (server contract)
      }
      if (!('id' in msg)) {
        this.handleNotification(msg);
        continue;
      }
      if (this.isRequest(msg)) continue; // server->client requests unsupported (narrow surface)
      const waiter = this.pending.get(msg.id);
      if (waiter === undefined) continue;
      clearTimeout(waiter.timer);
      this.pending.delete(msg.id);
      if (msg.error !== undefined) waiter.reject(new Error(`mcp: ${msg.error.message} (code ${msg.error.code})`));
      else waiter.resolve(msg.result);
    }
  }

  private isRequest(m: JsonRpcMessage): m is JsonRpcRequest {
    return 'method' in m && 'id' in m;
  }

  private readonly toolsChangedHandlers = new Set<() => void>();

  /** Subscribe to `notifications/tools/list_changed` (MCP spec); returns an unsubscribe fn.
   * Registrars use this to re-run listTools when a server's toolset changes. */
  onToolsChanged(handler: () => void): () => void {
    this.toolsChangedHandlers.add(handler);
    return () => {
      this.toolsChangedHandlers.delete(handler);
    };
  }

  /** Notifications (messages WITHOUT id) were previously dropped wholesale — the
   * tools/list_changed signal never reached anyone, so server-side tool updates went
   * unnoticed for the whole session. Route them; unknown notifications stay ignored
   * (forward-compatible per spec). */
  private handleNotification(msg: { jsonrpc: '2.0'; method: string; params?: unknown }): void {
    if (msg.method === 'notifications/tools/list_changed') {
      for (const handler of this.toolsChangedHandlers) handler();
    }
  }

  private failAll(error: Error): void {
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }
}

const MCP_ARGS_SCHEMA = z.record(z.string(), z.unknown());

/** Minimal caller surface an adapted tool needs — satisfied by both stdio and HTTP clients. */
export interface McpToolCaller {
  callTool(name: string, args: unknown): Promise<{ ok: boolean; content: unknown; isError: boolean }>;
}

/**
 * Adapt one remote MCP tool into the kernel AgentTool contract. Args are passed through
 * (the remote server validates); results carry the raw content payload back to the model.
 */
export const mcpToolAdapter = (client: McpToolCaller, info: McpToolInfo, serverLabel: string): AgentTool => ({
  name: info.name,
  description: info.description ?? `remote MCP tool '${info.name}' from ${serverLabel}`,
  inputSchema: MCP_ARGS_SCHEMA,
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const checked = MCP_ARGS_SCHEMA.safeParse(args ?? {});
    if (!checked.success) {
      return { ok: false, error: { kind: 'validation', message: `MCP tool args must be an object: ${checked.error.issues[0]?.message}` } };
    }
    try {
      const res = await client.callTool(info.name, checked.data);
      return {
        ok: res.ok,
        ...(res.ok ? { data: res.content } : { error: { kind: 'execution', message: `remote tool reported error: ${JSON.stringify(res.content).slice(0, 500)}` } }),
        summary: `mcp:${serverLabel}:${info.name}`,
      };
    } catch (e) {
      return { ok: false, error: { kind: 'execution', message: e instanceof Error ? e.message : String(e) } };
    }
  },
});
