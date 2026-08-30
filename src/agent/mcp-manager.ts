import type { McpServerIntegration, ToolTestRecord } from '../domain/tool-integration.js';
import { McpStdioClient, mcpToolAdapter, type McpToolAnnotations, type McpToolInfo } from './mcp.js';
import { McpHttpClient } from './mcp-http.js';
import type { ToolRegistry } from './tool.js';

/**
 * MCP manager (TIS): bridges stored mcp_server integrations into live agent
 * sessions — connect each enabled server, list its tools, sanitize names into
 * the kernel registry namespace, stamp the configured risk class. Per-server
 * status is honest state (connected | failed(reason) | disabled); a failing
 * server never blocks the others.
 *
 * Name discipline: kernel tool names must match ^[a-z][a-z0-9_]{2,31}$ — remote
 * names are sanitized to `mcp_<prefix>_<tool>`; unsalvageable or colliding
 * names skip LOUDLY (recorded in `skipped`), never silently overwritten.
 */

export interface McpServerStatus {
  integrationId: string;
  label: string;
  state: 'connected' | 'failed' | 'disabled';
  toolCount?: number;
  error?: string;
  /** Bounded transport recoveries completed during this manager lifetime. */
  reconnectCount?: number;
  lastReconnectAt?: string;
}

export interface McpRegistration {
  serverLabel: string;
  remoteName: string;
  registeredAs: string;
  /** Server identity from the initialize handshake (absent when the server declared none). */
  serverVersion?: string;
  /** Untrusted server self-declared hints (display-only; never affect riskClass/permissions). */
  serverHints?: McpToolAnnotations;
}

export interface McpSkip {
  serverLabel: string;
  remoteName: string;
  reason: string;
}

interface ManagedClient {
  integration: McpServerIntegration;
  client: McpStdioClient | McpHttpClient;
}

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

/** Kernel-namespace a remote tool name; trailing/leading noise stripped in both length branches. */
export const sanitizeMcpToolName = (prefix: string, remote: string): string | null => {
  const raw = `${prefix}_${remote}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '');
  return raw.length > 32 ? raw.slice(0, 32).replace(/_+$/, '') : raw;
};

const isValidToolName = (name: string): boolean => TOOL_NAME_RE.test(name);

export interface McpManagerDeps {
  /** Enabled+disabled mcp_server integrations as they currently exist. */
  listServers: () => McpServerIntegration[];
  /** Test seam; production uses a real bounded timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam for retry jitter; production uses Math.random. */
  random?: () => number;
  /** First reconnect delay before jitter, default 100ms. */
  reconnectBaseMs?: number;
}

const RETRYABLE_TRANSPORT = /server exited|not connected|session terminated|fetch failed|timed out|econn(?:reset|refused|aborted)|epipe|socket|network|connection (?:closed|reset|lost)|http (?:408|425|429|5\d\d)\b/i;

/** JSON-RPC/application/schema failures are not cured by reconnecting. */
export const isRetryableMcpTransportError = (error: unknown): boolean =>
  RETRYABLE_TRANSPORT.test(error instanceof Error ? error.message : String(error));

export class McpManager {
  private readonly clients = new Map<string, ManagedClient>();
  private readonly statuses = new Map<string, McpServerStatus>();
  private readonly unsubscribers: Array<() => void> = [];
  /** Single-flight fence: concurrent tool failures must not start reconnect storms. */
  private readonly reconnecting = new Map<string, Promise<ManagedClient>>();
  private closed = false;

  constructor(private readonly deps: McpManagerDeps) {}

  statusOf(): McpServerStatus[] {
    return [...this.statuses.values()];
  }

  private makeClient(integration: McpServerIntegration): McpStdioClient | McpHttpClient {
    if (integration.transport === 'stdio') {
      return new McpStdioClient({
        command: integration.command!,
        args: integration.args,
        env: integration.env,
        timeoutMs: integration.timeoutMs,
      });
    }
    return new McpHttpClient({
      url: integration.url!,
      headers: integration.headers,
      timeoutMs: integration.timeoutMs,
    });
  }

  /** Connect every ENABLED server. Failures are recorded per-server and returned — never thrown. */
  async connectAll(): Promise<McpServerStatus[]> {
    for (const integration of this.deps.listServers()) {
      if (!integration.enabled) {
        this.statuses.set(integration.id, { integrationId: integration.id, label: integration.label, state: 'disabled' });
        continue;
      }
      if (this.clients.has(integration.id)) continue; // already connected
      await this.connectOne(integration);
    }
    return this.statusOf();
  }

  private async connectOne(integration: McpServerIntegration): Promise<McpServerStatus> {
    const client = this.makeClient(integration);
    try {
      await client.connect();
      this.clients.set(integration.id, { integration, client });
      // stdio servers push tools/list_changed; http transport can't (no GET stream) — see mcp-http.ts.
      const unsub = client.onToolsChanged(() => { void this.refresh(integration.id); });
      this.unsubscribers.push(unsub);
      const status: McpServerStatus = { integrationId: integration.id, label: integration.label, state: 'connected' };
      this.statuses.set(integration.id, status);
      return status;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.statuses.set(integration.id, { integrationId: integration.id, label: integration.label, state: 'failed', error: message });
      await client.close().catch(() => {});
      return this.statuses.get(integration.id)!;
    }
  }

  /**
   * Replace one failed transport and re-run the initialize handshake. One logical
   * tool call gets at most one reconnect+retry; concurrent callers share this
   * reconnect promise. A changed server identity fails closed because registry
   * provenance was stamped from the original handshake.
   */
  private async reconnectOne(integrationId: string, firstError: unknown): Promise<ManagedClient> {
    const inFlight = this.reconnecting.get(integrationId);
    if (inFlight !== undefined) return inFlight;
    const current = this.clients.get(integrationId);
    if (current === undefined) throw new Error(`mcp: cannot reconnect unknown integration '${integrationId}'`);
    if (this.closed) throw new Error('mcp: manager is closed');

    const task = (async (): Promise<ManagedClient> => {
      const baseMs = Math.max(0, Math.floor(this.deps.reconnectBaseMs ?? 100));
      const random = Math.min(1, Math.max(0, this.deps.random?.() ?? Math.random()));
      // One allowed reconnect means exponent 2^0; full jitter prevents many
      // sessions from reconnecting to the same recovering server in lockstep.
      const delayMs = baseMs + Math.floor(baseMs * random);
      await (this.deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(delayMs);
      if (this.closed) throw new Error('mcp: manager closed during reconnect backoff');
      const beforeIdentity = current.client.serverInfo();
      await current.client.close().catch(() => {});
      const nextClient = this.makeClient(current.integration);
      try {
        await nextClient.connect();
        const afterIdentity = nextClient.serverInfo();
        if (JSON.stringify(afterIdentity) !== JSON.stringify(beforeIdentity)) {
          throw new Error(
            `server identity changed across reconnect (${JSON.stringify(beforeIdentity)} -> ${JSON.stringify(afterIdentity)}); reassemble the agent tool registry`,
          );
        }
        const next = { integration: current.integration, client: nextClient };
        this.clients.set(integrationId, next);
        const unsub = nextClient.onToolsChanged(() => { void this.refresh(integrationId); });
        this.unsubscribers.push(unsub);
        const previous = this.statuses.get(integrationId);
        this.statuses.set(integrationId, {
          integrationId,
          label: current.integration.label,
          state: 'connected',
          ...(previous?.toolCount !== undefined ? { toolCount: previous.toolCount } : {}),
          reconnectCount: (previous?.reconnectCount ?? 0) + 1,
          lastReconnectAt: new Date().toISOString(),
        });
        return next;
      } catch (e) {
        await nextClient.close().catch(() => {});
        const first = firstError instanceof Error ? firstError.message : String(firstError);
        const second = e instanceof Error ? e.message : String(e);
        const previous = this.statuses.get(integrationId);
        const message = `transport failed (${first}); reconnect failed (${second})`;
        this.statuses.set(integrationId, {
          integrationId,
          label: current.integration.label,
          state: 'failed',
          error: message,
          ...(previous?.reconnectCount !== undefined ? { reconnectCount: previous.reconnectCount } : {}),
          ...(previous?.lastReconnectAt !== undefined ? { lastReconnectAt: previous.lastReconnectAt } : {}),
        });
        throw new Error(`mcp:${current.integration.label}: ${message}`, { cause: e });
      }
    })();
    this.reconnecting.set(integrationId, task);
    try {
      return await task;
    } finally {
      this.reconnecting.delete(integrationId);
    }
  }

  private async callToolWithReconnect(
    integrationId: string,
    name: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: unknown; isError: boolean }> {
    const current = this.clients.get(integrationId);
    if (current === undefined) throw new Error(`mcp: integration '${integrationId}' is not connected`);
    try {
      return await current.client.callTool(name, args);
    } catch (firstError) {
      if (!isRetryableMcpTransportError(firstError)) throw firstError;
      const reconnected = await this.reconnectOne(integrationId, firstError);
      try {
        return await reconnected.client.callTool(name, args);
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        const status = this.statuses.get(integrationId);
        this.statuses.set(integrationId, {
          integrationId,
          label: current.integration.label,
          state: 'failed',
          error: `tool retry failed after reconnect: ${message}`,
          ...(status?.reconnectCount !== undefined ? { reconnectCount: status.reconnectCount } : {}),
          ...(status?.lastReconnectAt !== undefined ? { lastReconnectAt: status.lastReconnectAt } : {}),
        });
        throw new Error(`mcp:${current.integration.label}: tool retry failed after reconnect: ${message}`, { cause: retryError });
      }
    }
  }

  private async listToolsWithReconnect(integrationId: string): Promise<McpToolInfo[]> {
    const current = this.clients.get(integrationId);
    if (current === undefined) throw new Error(`mcp: integration '${integrationId}' is not connected`);
    try {
      return await current.client.listTools();
    } catch (firstError) {
      if (!isRetryableMcpTransportError(firstError)) throw firstError;
      const reconnected = await this.reconnectOne(integrationId, firstError);
      try {
        return await reconnected.client.listTools();
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        const status = this.statuses.get(integrationId);
        this.statuses.set(integrationId, {
          integrationId,
          label: current.integration.label,
          state: 'failed',
          error: `tools/list retry failed after reconnect: ${message}`,
          ...(status?.reconnectCount !== undefined ? { reconnectCount: status.reconnectCount } : {}),
          ...(status?.lastReconnectAt !== undefined ? { lastReconnectAt: status.lastReconnectAt } : {}),
        });
        throw new Error(`mcp:${current.integration.label}: tools/list retry failed after reconnect: ${message}`, { cause: retryError });
      }
    }
  }

  /** Register connected servers' tools into a registry (additive; kernel registries have no remove). */
  async registerTools(registry: ToolRegistry): Promise<{ registered: McpRegistration[]; skipped: McpSkip[] }> {
    const registered: McpRegistration[] = [];
    const skipped: McpSkip[] = [];
    for (const [id, { integration, client }] of this.clients) {
      let tools: McpToolInfo[];
      try {
        tools = await this.listToolsWithReconnect(id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.statuses.set(id, { integrationId: id, label: integration.label, state: 'failed', error: `tools/list failed: ${message}` });
        skipped.push({ serverLabel: integration.label, remoteName: '*', reason: `tools/list failed: ${message}` });
        continue;
      }
      const prefix = integration.toolNamePrefix ?? `mcp_${sanitizeLabel(integration.label)}`;
      const previous = this.statuses.get(id);
      this.statuses.set(id, {
        integrationId: id,
        label: integration.label,
        state: 'connected',
        toolCount: tools.length,
        ...(previous?.reconnectCount !== undefined ? { reconnectCount: previous.reconnectCount } : {}),
        ...(previous?.lastReconnectAt !== undefined ? { lastReconnectAt: previous.lastReconnectAt } : {}),
      });
      const serverVersion = this.clients.get(id)?.client.serverInfo().version ?? client.serverInfo().version;
      const usedNames = new Set(registry.names());
      for (const info of tools) {
        const base = sanitizeMcpToolName(prefix, info.name);
        if (base === null || !isValidToolName(base)) {
          skipped.push({ serverLabel: integration.label, remoteName: info.name, reason: `cannot be mapped into a valid kernel tool name (prefix '${prefix}')` });
          continue;
        }
        let name = base;
        let suffix = 2;
        while (usedNames.has(name)) {
          const candidate = `${base.slice(0, 32 - String(suffix).length)}_${suffix}`;
          if (!usedNames.has(candidate) && isValidToolName(candidate)) { name = candidate; break; }
          if (suffix >= 9) break;
          suffix += 1;
        }
        if (usedNames.has(name)) {
          skipped.push({ serverLabel: integration.label, remoteName: info.name, reason: `name collision exhausted dedupe suffixes ('${name}' already registered)` });
          continue;
        }
        usedNames.add(name);
        const adapter = mcpToolAdapter(
          { callTool: (name, args) => this.callToolWithReconnect(id, name, args) },
          info,
          integration.label,
        );
        // RU-3 T1: MCP server output is third-party content — mark trust 'external'
        // so the loop flags every tool_result from it as untrusted data.
        // R2-09 identity: source label + handshake version stamp the adapted
        // tool's provenance; info.annotations already carry (untrusted) server hints.
        registry.register({
          ...adapter,
          name,
          riskClass: integration.riskClass,
          trust: 'external',
          source: integration.label,
          ...(serverVersion !== undefined ? { version: serverVersion } : {}),
        });
        registered.push({
          serverLabel: integration.label,
          remoteName: info.name,
          registeredAs: name,
          ...(serverVersion !== undefined ? { serverVersion } : {}),
          ...(info.annotations !== undefined ? { serverHints: info.annotations } : {}),
        });
      }
    }
    return { registered, skipped };
  }

  /** tools/list_changed follow-up: register tools that appeared after initial registration (additive only). */
  private async refresh(integrationId: string): Promise<void> {
    const managed = this.clients.get(integrationId);
    if (managed === undefined) return;
    // Re-registering an existing name would throw 'already registered' — route through
    // a scratch registry to diff, then copy only genuinely new tools into the live one
    // is impossible here (registry identity is caller-owned). Additive refresh is done
    // by the session assembler on next assembly; here we only refresh status truth.
    try {
      const tools = await this.listToolsWithReconnect(integrationId);
      const previous = this.statuses.get(integrationId);
      this.statuses.set(integrationId, {
        integrationId,
        label: managed.integration.label,
        state: 'connected',
        toolCount: tools.length,
        ...(previous?.reconnectCount !== undefined ? { reconnectCount: previous.reconnectCount } : {}),
        ...(previous?.lastReconnectAt !== undefined ? { lastReconnectAt: previous.lastReconnectAt } : {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.statuses.set(integrationId, { integrationId, label: managed.integration.label, state: 'failed', error: message });
    }
  }

  /** One-shot connectivity test for the API surface: connect, count tools, close. Records nothing. */
  async testIntegration(integration: McpServerIntegration): Promise<ToolTestRecord> {
    const client = this.makeClient(integration);
    const started = Date.now();
    try {
      await client.connect();
      const tools = await client.listTools();
      return {
        at: new Date().toISOString(),
        ok: true,
        summary: `${tools.length} tool${tools.length === 1 ? '' : 's'} listed (${tools.slice(0, 5).map((t) => t.name).join(', ')}${tools.length > 5 ? ', …' : ''}) in ${Date.now() - started}ms`,
      };
    } catch (e) {
      return { at: new Date().toISOString(), ok: false, summary: e instanceof Error ? e.message : String(e) };
    } finally {
      await client.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const unsub of this.unsubscribers.splice(0)) unsub();
    await Promise.allSettled(this.reconnecting.values());
    await Promise.allSettled([...this.clients.values()].map(({ client }) => client.close()));
    this.clients.clear();
  }
}

/** label → registry-safe prefix (default toolNamePrefix derivation). */
export const sanitizeLabel = (label: string): string => {
  const raw = label.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^[^a-z]+/, '').slice(0, 12).replace(/_+$/, '');
  return raw.length > 0 ? raw : 'srv';
};
