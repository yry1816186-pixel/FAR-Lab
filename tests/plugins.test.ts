import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPluginHost } from '../src/plugins/host-main.js';
import { expandPluginManifest, readPluginManifest, importPlugin, PluginImportError, hostMainPath } from '../src/plugins/import.js';
import { pluginIdOf, MANIFEST_FILENAME } from '../src/plugins/manifest.js';
import { McpStdioClient } from '../src/agent/mcp.js';

/**
 * Plugin runtime: the in-process host factory drives the REAL protocol logic
 * (line framing, timeouts, error honesty); the manifest expander covers
 * staging semantics (disabled by default, provenance, skip-loudly). The
 * subprocess round-trip runs only when dist/ is built — production always is;
 * dev trees without a build skip it honestly.
 */

const fixturePluginDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-plugin-'));
  fs.writeFileSync(path.join(dir, MANIFEST_FILENAME), JSON.stringify({
    name: 'demo-plugin',
    version: '1.2.0',
    license: 'MIT',
    sourceUri: 'https://example.invalid/demo-plugin',
    skills: [{ name: 'demo-skill', description: 'demo skill', body: 'Use tables.' }],
    commands: [{ name: 'demo-cmd', label: 'Demo', template: 'run {{x}}' }],
    hookRules: [{ label: 'watch', event: 'before_tool', match: { toolPattern: 'demo_*' }, action: { type: 'log', note: 'seen' } }],
    mcpServers: [{ label: 'inner', transport: 'stdio', command: 'node', args: ['inner.cjs'] }],
    entry: { file: 'entry.cjs' },
  }));
  fs.writeFileSync(path.join(dir, 'entry.cjs'), `
module.exports = {
  tools: [
    { name: 'greet', description: 'greet someone', async execute(args) { return { greeting: 'hi ' + (args && args.who || 'world') }; } },
    { name: 'boom', description: 'always fails', async execute() { throw new Error('kaputt'); } },
    { name: 'hang', description: 'never resolves', async execute() { return new Promise(() => {}); } },
  ],
  hooks: {
    async beforeToolCall(call) { if (call.tool === 'forbidden') return { blocked: 'not allowed' }; return {}; },
  },
};
`);
  return dir;
};

const lineDriver = (dir: string) => {
  const out: string[] = [];
  const created = createPluginHost(dir, (line) => out.push(line));
  if ('error' in created) throw new Error(created.error);
  const send = async (line: string): Promise<Record<string, unknown>> => {
    out.length = 0;
    created.host.handleLine(line);
    for (let i = 0; i < 300 && out.length === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    if (out.length === 0) throw new Error('no response line');
    return JSON.parse(out[0]!) as Record<string, unknown>;
  };
  return { send };
};

describe('plugin manifest + expansion', () => {
  it('reads and validates the fixture manifest', () => {
    const dir = fixturePluginDir();
    const manifest = readPluginManifest(dir);
    expect(pluginIdOf(manifest)).toBe('demo-plugin@1.2.0');
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.entry?.file).toBe('entry.cjs');
  });

  it('rejects malformed manifests loudly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-plugin-bad-'));
    fs.writeFileSync(path.join(dir, MANIFEST_FILENAME), JSON.stringify({ name: 'X', version: 'not-semver' }));
    expect(() => readPluginManifest(dir)).toThrow(PluginImportError);
  });

  it('expands to DISABLED integrations with plugin provenance, entry included', () => {
    const dir = fixturePluginDir();
    const { integrations, warnings } = expandPluginManifest(readPluginManifest(dir), dir, () => '2026-08-23T00:00:00.000Z');
    expect(warnings).toEqual([]);
    expect(integrations.every((i) => i.enabled === false)).toBe(true);
    expect(integrations.every((i) => i.createdBy === 'plugin_import' && i.provenance?.pluginId === 'demo-plugin@1.2.0')).toBe(true);
    const byKind = Object.fromEntries(integrations.filter((i) => i.label !== 'demo-plugin (entry)').map((i) => [i.kind, i]));
    expect(byKind.skill.name).toBe('demo-skill');
    expect(byKind.command.name).toBe('demo-cmd');
    expect(byKind.hook_rule.event).toBe('before_tool');
    expect(byKind.mcp_server.command).toBe('node');
    expect(byKind.mcp_server.args).toEqual(['inner.cjs']);
    const entry = integrations.find((i) => i.kind === 'mcp_server' && i.label === 'demo-plugin (entry)');
    expect(entry).toBeDefined();
    expect(entry?.transport).toBe('stdio');
    expect(entry?.args![0]).toBe(hostMainPath());
    expect(entry?.args![1]).toBe(path.resolve(dir));
    expect(entry?.toolNamePrefix).toBe('demo_plugin');
  });

  it('importPlugin requires an existing directory', () => {
    expect(() => importPlugin({ dir: path.join(os.tmpdir(), 'definitely-not-here-xyz'), reviewed: true })).toThrow(PluginImportError);
  });
});

describe('plugin host protocol (in-process, real logic)', () => {
  it('initialize → tools/list → tools/call round trip', async () => {
    const { send } = lineDriver(fixturePluginDir());
    const init = await send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    expect(init.result).toMatchObject({ serverInfo: { name: 'plugin:demo-plugin', version: '1.2.0' } });

    const list = await send('{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}');
    const tools = (list.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((t) => t.name)).toEqual(['greet', 'boom', 'hang']);

    const call = await send('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"greet","arguments":{"who":"far"}}}');
    expect(call.result).toMatchObject({ isError: false, content: { greeting: 'hi far' } });
  });

  it('tool failures return isError with the message — never crash the host', async () => {
    const { send } = lineDriver(fixturePluginDir());
    await send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    const boom = await send('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"boom","arguments":{}}}');
    expect((boom.result as { isError: boolean }).isError).toBe(true);
    const unknown = await send('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nope","arguments":{}}}');
    expect((unknown.result as { isError: boolean }).isError).toBe(true);
    const badMethod = await send('{"jsonrpc":"2.0","id":4,"method":"wat","params":{}}');
    expect(badMethod.error).toBeDefined();
  });

  it('hooks: block verdicts pass through; timeouts fail open with a loud marker', async () => {
    const { send } = lineDriver(fixturePluginDir());
    await send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    const blocked = await send('{"jsonrpc":"2.0","id":2,"method":"hooks/beforeTool","params":{"tool":"forbidden","args":{},"turn":1}}');
    expect(blocked.result).toMatchObject({ blocked: 'not allowed' });
    const allowed = await send('{"jsonrpc":"2.0","id":3,"method":"hooks/beforeTool","params":{"tool":"fine","args":{},"turn":1}}');
    expect(allowed.result).toEqual({});
  });

  it('a broken entry file makes every request answer with the load error', async () => {
    const dir = fixturePluginDir();
    fs.writeFileSync(path.join(dir, 'entry.cjs'), 'throw new Error("broken plugin");');
    const { send } = lineDriver(dir);
    const res = await send('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
    expect(res.error?.message).toMatch(/broken plugin/);
  });
});

describe('plugin host subprocess (dist-gated end-to-end)', () => {
  const compiled = path.resolve('dist/plugins/host-main.js');
  const distReady = fs.existsSync(compiled);
  it.skipIf(!distReady)('McpStdioClient drives the real host child process', async () => {
    const dir = fixturePluginDir();
    const client = new McpStdioClient({ command: process.execPath, args: [compiled, dir], timeoutMs: 8000 });
    await client.connect();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['greet', 'boom', 'hang']);
    const res = await client.callTool('greet', { who: 'sub' });
    expect(res.ok).toBe(true);
    expect(res.content).toMatchObject({ greeting: 'hi sub' });
    await client.close();
  });
});
