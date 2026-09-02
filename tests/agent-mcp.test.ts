import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpStdioClient, mcpToolAdapter } from '../src/agent/mcp.js';

/**
 * Real stdio round-trip: we spawn an actual node child process speaking newline JSON-RPC
 * (the MCP stdio transport) — no in-process fakes, so framing, id-correlation and process
 * teardown are exercised for real.
 */
const SERVER = `
const readline = require('node:readline');
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
const sendErr = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  if (msg.id === undefined || msg.id === null) return; // notifications: initialized etc.
  if (msg.method === 'initialize') {
    send(msg.id, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake-mcp', version: '0.0.1' } });
  } else if (msg.method === 'tools/list') {
    send(msg.id, { tools: [{ name: 'echo', description: 'echo args back', inputSchema: { type: 'object' } }] });
  } else if (msg.method === 'tools/call') {
    const delay = msg.params && msg.params.name === 'slow' ? 5000 : 0;
    setTimeout(() => {
      if (msg.params && msg.params.name === 'echo') {
        send(msg.id, { content: [{ type: 'text', text: JSON.stringify(msg.params.arguments ?? {}) }], isError: false });
      } else {
        send(msg.id, { content: [{ type: 'text', text: 'unknown or slow tool' }], isError: true });
      }
    }, delay);
  } else {
    sendErr(msg.id, -32601, 'method not found: ' + msg.method);
  }
});
`;

const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-mcp-')), 'fake-server.cjs');
fs.writeFileSync(scriptPath, SERVER);

const clients: McpStdioClient[] = [];
afterAll(async () => { await Promise.all(clients.map((c) => c.close().catch(() => {}))); });

describe('MCP stdio client (real child process)', () => {
  it('connects via initialize handshake and lists tools', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [scriptPath], timeoutMs: 5000 });
    clients.push(client);
    await client.connect();
    const tools = await client.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0]!.name).toBe('echo');
  });

  it('adapts a remote tool into the AgentTool contract (args pass-through, result verbatim)', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [scriptPath], timeoutMs: 5000 });
    clients.push(client);
    await client.connect();
    const tool = mcpToolAdapter(client, (await client.listTools())[0]!, 'fake-server');
    expect(tool.name).toBe('echo');
    const ok = await tool.execute({ a: 1, b: 'x' }, { signal: { aborted: false }, emit: () => {}, recordReceipt: () => {}, depth: 0 });
    expect(ok.ok).toBe(true);
    expect(ok.data).toEqual([{ type: 'text', text: '{"a":1,"b":"x"}' }]);
    // non-object args are rejected client-side
    const bad = await tool.execute('not-an-object', { signal: { aborted: false }, emit: () => {}, recordReceipt: () => {}, depth: 0 });
    expect(bad.ok).toBe(false);
    expect(bad.error?.kind).toBe('validation');
  });

  it('surfaces remote isError results as execution failures, never as success', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [scriptPath], timeoutMs: 5000 });
    clients.push(client);
    await client.connect();
    const res = await client.callTool('does_not_exist', {});
    expect(res.ok).toBe(false);
    expect(res.isError).toBe(true);
  });

  it('times out a hanging request instead of blocking the loop forever', async () => {
    // The timeout also covers spawning and initializing the real Node child.
    // Keep enough headroom for a saturated CI worker while the fake tool stays
    // far beyond the budget, so this tests request timeout rather than startup.
    const client = new McpStdioClient({ command: process.execPath, args: [scriptPath], timeoutMs: 1000 });
    clients.push(client);
    await client.connect();
    await expect(client.callTool('slow', {})).rejects.toThrow(/timed out after 1000ms/);
  });

  it('rejects requests made before connect (fail-closed)', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [scriptPath] });
    clients.push(client);
    await expect(client.listTools()).rejects.toThrow(/not connected/);
  });
});

// ---- Wave-S/v2-tools-sandbox: pagination + list_changed (two real defects, main-agent verified) ----

const PAGINATING_SERVER = `
const readline = require('node:readline');
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
const notify = (method) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  if (msg.method === 'initialize') {
    send(msg.id, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'paged-mcp', version: '0.0.1' } });
    // real servers push list_changed after registration/hot-reload; emit right after init
    setTimeout(() => notify('notifications/tools/list_changed'), 50);
  } else if (msg.method === 'tools/list') {
    const cursor = msg.params && msg.params.cursor;
    if (!cursor) {
      send(msg.id, {
        tools: [
          { name: 'alpha', description: 'page 1', inputSchema: { type: 'object' } },
          { name: 'echo', description: 'repeated across pages', inputSchema: { type: 'object' } },
        ],
        nextCursor: 'page2',
      });
    } else if (cursor === 'page2') {
      send(msg.id, {
        tools: [
          { name: 'echo', description: 'REPEAT — must dedupe', inputSchema: { type: 'object' } },
          { name: 'beta', description: 'page 2', inputSchema: { type: 'object' } },
        ],
      });
    } else {
      send(msg.id, { tools: [] });
    }
  } else {
    send(msg.id, { tools: [] });
  }
});
`;

const pagedScriptPath = path.join(path.dirname(scriptPath), 'paged-server.cjs');
fs.writeFileSync(pagedScriptPath, PAGINATING_SERVER);

describe('MCP client pagination + tools/list_changed (real child process)', () => {
  it('follows nextCursor pages and dedupes repeated tool names (silent-truncation defect)', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [pagedScriptPath], timeoutMs: 5000 });
    clients.push(client);
    await client.connect();
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(['alpha', 'echo', 'beta']);
  });

  it('notifications/tools/list_changed reaches subscribers (previously dropped at the dispatch guard)', async () => {
    const client = new McpStdioClient({ command: process.execPath, args: [pagedScriptPath], timeoutMs: 5000 });
    clients.push(client);
    let fired = 0;
    const unsubscribe = client.onToolsChanged(() => { fired += 1; });
    await client.connect();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fired).toBe(1);
    unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fired).toBe(1); // unsubscribed handlers stop firing
  });
});
