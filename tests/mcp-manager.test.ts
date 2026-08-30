import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpManager, isRetryableMcpTransportError, sanitizeMcpToolName, sanitizeLabel } from '../src/agent/mcp-manager.js';
import { ToolRegistry } from '../src/agent/tool.js';
import { McpServerIntegration } from '../src/domain/tool-integration.js';

/**
 * Real stdio round-trip (agent-mcp.test.ts lineage): actual node child processes
 * speaking newline JSON-RPC. The fixture's tool list is driven by an env var so
 * sanitization/collision cases use real server responses, not mocks.
 */
const SERVER = `
const readline = require('node:readline');
const fs = require('node:fs');
const NAMES = (process.env.FAKE_TOOLS || 'echo').split(',');
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
const sendErr = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  if (msg.id === undefined || msg.id === null) return;
  if (msg.method === 'initialize') {
    send(msg.id, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake-mcp', version: '0.0.1' } });
  } else if (msg.method === 'tools/list') {
    send(msg.id, { tools: NAMES.map((n) => ({ name: n, description: 'fake ' + n })) });
  } else if (msg.method === 'tools/call') {
    const marker = process.env.FAIL_FIRST_CALL_MARKER;
    if (marker && !fs.existsSync(marker)) {
      fs.writeFileSync(marker, 'failed-once');
      process.exit(23);
      return;
    }
    send(msg.id, { content: [{ type: 'text', text: 'called ' + msg.params.name }], isError: false });
  } else {
    sendErr(msg.id, -32601, 'method not found: ' + msg.method);
  }
});
`;

const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-mcp-mgr-')), 'fake-server.cjs');
fs.writeFileSync(scriptPath, SERVER);

const seq = (() => { let n = 0; return () => { n += 1; return `tint_mgr${String(n).padStart(20, '0')}`.slice(0, 32); }; })();

const mkServer = (over: Record<string, unknown>): McpServerIntegration =>
  McpServerIntegration.parse({
    id: seq(), label: 'srv', enabled: true, kind: 'mcp_server', transport: 'stdio',
    command: process.execPath, args: [scriptPath], env: { FAKE_TOOLS: 'echo' },
    createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z', createdBy: 'researcher',
    ...over,
  });

const managers: McpManager[] = [];
afterAll(async () => { await Promise.all(managers.map((m) => m.close().catch(() => {}))); });

describe('name sanitization', () => {
  it('maps remote names into the kernel namespace', () => {
    expect(sanitizeMcpToolName('mcp_arxiv', 'Search-Papers.v2')).toBe('mcp_arxiv_search_papers_v2');
    expect(sanitizeLabel('My Fancy Server!')).toBe('my_fancy_ser');
    expect(sanitizeLabel('!!!')).toBe('srv');
  });

  it('returns null-safe short names that the registry will reject loudly', () => {
    const tooShort = sanitizeMcpToolName('a', '??');
    expect(tooShort === null || tooShort.length < 3).toBe(true);
  });
});

describe('MCP reconnect classification', () => {
  it('retries transport loss but not remote JSON-RPC/application errors', () => {
    expect(isRetryableMcpTransportError(new Error('mcp: server exited'))).toBe(true);
    expect(isRetryableMcpTransportError(new Error('mcp-http: session terminated by server (HTTP 404)'))).toBe(true);
    expect(isRetryableMcpTransportError(new Error('mcp: permission denied (code -32001)'))).toBe(false);
    expect(isRetryableMcpTransportError(new Error('mcp-http: tools/list page 0 returned unexpected shape'))).toBe(false);
  });
});

describe('McpManager (real child processes)', () => {
  it('connects enabled servers, skips disabled, records failures honestly', async () => {
    const manager = new McpManager({
      listServers: () => [
        mkServer({ label: 'live', env: { FAKE_TOOLS: 'echo,fetch_page' } }),
        mkServer({ label: 'off', enabled: false }),
        mkServer({ label: 'broken', command: 'definitely-not-a-real-command-far-lab' }),
      ],
    });
    managers.push(manager);
    const statuses = await manager.connectAll();
    const byLabel = Object.fromEntries(statuses.map((s) => [s.label, s]));
    expect(byLabel.live.state).toBe('connected');
    expect(byLabel.off.state).toBe('disabled');
    expect(byLabel.broken.state).toBe('failed');
    expect(byLabel.broken.error).toMatch(/spawn failed|ENOENT/i);

    const registry = new ToolRegistry();
    const { registered, skipped } = await manager.registerTools(registry);
    expect(registered.map((r) => r.registeredAs).sort()).toEqual(['mcp_live_echo', 'mcp_live_fetch_page']);
    expect(skipped).toEqual([]);
    // risk class stamped from the integration's conservative default
    expect(registry.get('mcp_live_echo')?.riskClass).toBe('execute');
    // RU-3 T1: MCP output is third-party content — bridged tools carry trust 'external'
    expect(registry.get('mcp_live_echo')?.trust).toBe('external');
    const out = await registry.get('mcp_live_echo')!.execute({}, { signal: { aborted: false }, emit: () => {}, recordReceipt: { record: () => {} }, depth: 0 });
    expect(out.ok).toBe(true);
  });

  it('sanitizes hostile names and dedupes collisions across servers with the same label', async () => {
    const manager = new McpManager({
      listServers: () => [
        mkServer({ label: 'A', env: { FAKE_TOOLS: 'UPPER.Case!,echo' } }),
        mkServer({ label: 'A', env: { FAKE_TOOLS: 'echo' } }),
      ],
    });
    managers.push(manager);
    await manager.connectAll();
    const registry = new ToolRegistry();
    const { registered, skipped } = await manager.registerTools(registry);
    const names = registered.map((r) => r.registeredAs).sort();
    expect(names).toContain('mcp_a_upper_case');
    expect(names.filter((n) => n.startsWith('mcp_a_echo')).length).toBe(2); // echo + deduped echo_2
    expect(names.find((n) => n === 'mcp_a_echo_2')).toBeDefined();
    expect(skipped).toEqual([]);
  });

  it('skips unsalvageable names loudly instead of guessing', async () => {
    // 1-char prefix + junk remote sanitizes below the 3-char registry minimum —
    // the one genuinely unsalvageable shape (default mcp_ prefixes rarely hit it).
    const manager = new McpManager({ listServers: () => [mkServer({ label: 'A', toolNamePrefix: 'x', env: { FAKE_TOOLS: '!!' } })] });
    managers.push(manager);
    await manager.connectAll();
    const registry = new ToolRegistry();
    const { registered, skipped } = await manager.registerTools(registry);
    expect(registered).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/cannot be mapped into a valid kernel tool name/);
  });

  it('testIntegration: ok path summarizes tools + latency, failure path returns the error', async () => {
    const manager = new McpManager({ listServers: () => [] });
    managers.push(manager);
    const ok = await manager.testIntegration(mkServer({ label: 'live', env: { FAKE_TOOLS: 'echo' } }));
    expect(ok.ok).toBe(true);
    expect(ok.summary).toMatch(/1 tool.*echo/);

    const bad = await manager.testIntegration(mkServer({ command: 'definitely-not-a-real-command-far-lab' }));
    expect(bad.ok).toBe(false);
    expect(bad.summary).toMatch(/spawn failed|ENOENT/i);
  });

  it('reconnects once after a real stdio server exit and retries the logical tool call', async () => {
    const marker = path.join(os.tmpdir(), `far-mcp-reconnect-${seq()}`);
    fs.rmSync(marker, { force: true });
    const manager = new McpManager({
      listServers: () => [mkServer({ label: 'reconnect', env: { FAKE_TOOLS: 'echo', FAIL_FIRST_CALL_MARKER: marker } })],
      sleep: async () => {},
      random: () => 0,
    });
    managers.push(manager);
    await manager.connectAll();
    const registry = new ToolRegistry();
    await manager.registerTools(registry);

    const out = await registry.get('mcp_reconnect_echo')!.execute(
      { value: 1 },
      { signal: { aborted: false }, emit: () => {}, recordReceipt: { record: () => {} }, depth: 0 },
    );
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(marker, 'utf8')).toBe('failed-once');
    const status = manager.statusOf().find((s) => s.label === 'reconnect');
    expect(status?.state).toBe('connected');
    expect(status?.reconnectCount).toBe(1);
    expect(status?.lastReconnectAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    fs.rmSync(marker, { force: true });
  });
});
