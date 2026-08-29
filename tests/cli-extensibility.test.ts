import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * far mcp / far plugin CLI (extensibility lane) — REAL end-to-end through the
 * compiled CLI in child processes against a throwaway workspace: a REAL local
 * stdio MCP server (full JSON-RPC protocol, same pattern as tests/api-tools)
 * answers the probe; a REAL local plugin directory imports through the same
 * expansion the settings UI uses.
 */

let tmp: string;
let serverScript: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cli-ext-'));
  serverScript = path.join(tmp, 'echo-server.cjs');
  fs.writeFileSync(serverScript, `const readline = require('node:readline');
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const t = line.trim(); if (!t) return;
  let msg; try { msg = JSON.parse(t); } catch { return; }
  if (msg.id === undefined || msg.id === null) return;
  if (msg.method === 'initialize') send(msg.id, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'echo-fixture', version: '1.0.0' } });
  else if (msg.method === 'tools/list') send(msg.id, { tools: [{ name: 'echo', description: 'echo tool' }] });
  else if (msg.method === 'tools/call') send(msg.id, { content: [{ type: 'text', text: 'ok' }], isError: false });
});
`);
});

afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const far = (args: string[]): { status: number | null; stdout: string; stderr: string } => {
  const dist = path.resolve('dist/cli/main.js');
  const r = spawnSync(process.execPath, [dist, ...args], {
    env: { ...process.env, FARLAB_DATA_DIR: tmp, FAR_DOTENV: 'off' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

describe('far mcp (real store + real MCP round trip)', () => {
  it('add stages DISABLED, list shows it, enable flips it', () => {
    const add = far(['mcp', 'add', 'echo-fixture', '--command', process.execPath, '--args', serverScript, '--risk', 'read']);
    expect(add.status).toBe(0);
    expect(add.stdout).toContain('echo-fixture');
    expect(add.stdout).toContain('disabled by default');

    const list = far(['mcp', 'list', '--json']);
    expect(list.status).toBe(0);
    const rows = JSON.parse(list.stdout) as Array<{ label: string; enabled: boolean; riskClass: string }>;
    const created = rows.find((r) => r.label === 'echo-fixture');
    expect(created).toBeDefined();
    expect(created?.enabled).toBe(false);
    expect(created?.riskClass).toBe('read');

    const enable = far(['mcp', 'enable', 'echo-fixture']);
    expect(enable.status).toBe(0);
    const after = JSON.parse(far(['mcp', 'list', '--json']).stdout) as Array<{ label: string; enabled: boolean }>;
    expect(after.find((r) => r.label === 'echo-fixture')?.enabled).toBe(true);
  }, 120_000);

  it('probe does a REAL initialize + tools/list round trip and persists lastTest', () => {
    const probe = far(['mcp', 'probe', 'echo-fixture', '--json']);
    expect(probe.status).toBe(0);
    const record = JSON.parse(probe.stdout) as { ok: boolean; summary: string };
    expect(record.ok).toBe(true);
    expect(record.summary).toContain('1 tool');

    const list = JSON.parse(far(['mcp', 'list', '--json']).stdout) as Array<{ label: string; lastTest?: { ok: boolean; summary: string } }>;
    const stored = list.find((r) => r.label === 'echo-fixture')?.lastTest;
    expect(stored?.ok).toBe(true);
  }, 120_000);

  it('probe of a dead server fails honestly with a nonzero exit', () => {
    far(['mcp', 'add', 'dead-server', '--command', 'definitely-not-a-real-binary-xyz', '--args', '']);
    const probe = far(['mcp', 'probe', 'dead-server']);
    expect(probe.status).toBe(1);
    expect(probe.stdout).toContain('FAIL');
  }, 120_000);
});

describe('far plugin (real local plugin import)', () => {
  it('install expands far-plugin.json into disabled integrations; list shows provenance', () => {
    const pluginDir = path.join(tmp, 'my-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'far-plugin.json'), JSON.stringify({
      name: 'demo-discipline',
      version: '1.0.0',
      license: 'MIT',
      skills: [{ name: 'demo-skill', description: 'a demo skill from the plugin CLI test', body: 'Be terse.' }],
      hookRules: [{ label: 'block-destructive', event: 'before_tool', match: { riskClass: 'destructive' }, action: { type: 'block', reason: 'plugin policy' } }],
    }));
    const install = far(['plugin', 'install', pluginDir]);
    expect(install.status).toBe(0);
    expect(install.stdout).toContain('demo-discipline@1.0.0');
    expect(install.stdout).toContain('DISABLED');

    const list = far(['plugin', 'list', '--json']);
    expect(list.status).toBe(0);
    const rows = JSON.parse(list.stdout) as Array<{ label: string; kind: string; enabled: boolean; provenance?: { pluginId?: string } }>;
    expect(rows.some((r) => r.kind === 'skill' && r.provenance?.pluginId === 'demo-discipline@1.0.0')).toBe(true);
    expect(rows.some((r) => r.kind === 'hook_rule')).toBe(true);
    expect(rows.every((r) => r.enabled === false)).toBe(true);
  }, 120_000);
});
