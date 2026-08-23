/**
 * Plugin host (TIS T5). Production entry: `node dist/plugins/host-main.js <pluginDir>`
 *
 * Loads the plugin's manifest + optional entry file IN THE HOST PROCESS ONLY and
 * serves the plugin RPC over newline JSON-RPC stdio — the same framing as the
 * MCP stdio transport, plus two hook methods MCP does not define:
 *
 *   initialize            -> { protocolVersion, serverInfo: { name, version } }
 *   tools/list            -> { tools: [{ name, description }] }
 *   tools/call            -> { content, isError }        (execute, timeout-bounded)
 *   hooks/beforeTool      -> { blocked?, reason? }       (2s child-side timeout)
 *   hooks/afterTool       -> {}                          (2s child-side timeout)
 *
 * Plugin entry contract (CJS or ESM module):
 *   module.exports = {
 *     tools: [{ name, description, inputSchema?, async execute(args) => any }],
 *     hooks?: { async beforeToolCall(call) => ({ blocked?, reason? } | {}),
 *               async afterToolCall(call, result) => void }
 *   };
 *
 * The line handler is exported as a factory (createPluginHost) so tests drive
 * protocol logic in-process; the child-process wiring below is what production
 * runs. Honesty notes: a crashing plugin dies in the HOST (the product process
 * and the session survive); tool/hook executions are timeout-bounded so a hung
 * plugin cannot stall a session; every failure is returned as an error result,
 * never swallowed. A plugin runs with the researcher's own OS privileges — that
 * is the documented trust model (SECURITY.md), not a sandbox claim.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILENAME, PluginManifestSchema, type PluginManifest } from './manifest.js';

const TOOL_TIMEOUT_MS = 30_000;
const HOOK_TIMEOUT_MS = 2_000;

interface PluginTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  execute: (args: unknown) => unknown;
}
interface PluginHooks {
  beforeToolCall?: (call: { tool: string; args: unknown; turn: number }) => Promise<{ blocked?: string; reason?: string } | void> | { blocked?: string; reason?: string } | void;
  afterToolCall?: (call: { tool: string; args: unknown; turn: number }, result: { ok: boolean }) => Promise<void> | void;
}

export const loadPluginEntry = async (pluginDir: string, manifest: PluginManifest): Promise<{ tools: PluginTool[]; hooks: PluginHooks }> => {
  if (manifest.entry === undefined) return { tools: [], hooks: {} };
  const file = path.resolve(pluginDir, manifest.entry.file);
  // Path containment: the resolved entry must stay inside the plugin dir.
  if (!file.startsWith(pluginDir + path.sep)) throw new Error(`entry escapes plugin dir: ${manifest.entry.file}`);
  const ext = path.extname(file);
  let mod: unknown;
  if (ext === '.mjs') {
    mod = await import(file);
  } else {
    const req = createRequire(import.meta.url);
    mod = req(file);
  }
  const resolved = (mod as { default?: unknown }).default !== undefined ? (mod as { default: unknown }).default : mod;
  if (typeof resolved !== 'object' || resolved === null) throw new Error('plugin entry must export an object');
  const m = resolved as { tools?: unknown; hooks?: unknown };
  if (m.tools !== undefined && !Array.isArray(m.tools)) throw new Error('plugin entry "tools" must be an array');
  const tools: PluginTool[] = [];
  for (const raw of (m.tools as unknown[]) ?? []) {
    if (typeof raw !== 'object' || raw === null) throw new Error('plugin tool entries must be objects');
    const t = raw as Partial<PluginTool>;
    if (typeof t.name !== 'string' || t.name.length === 0) throw new Error('plugin tool requires a name');
    if (typeof t.execute !== 'function') throw new Error(`plugin tool '${t.name}' requires an execute function`);
    tools.push({ name: t.name, ...(t.description !== undefined ? { description: t.description } : {}), ...(t.inputSchema !== undefined ? { inputSchema: t.inputSchema } : {}), execute: t.execute });
  }
  const hooks: PluginHooks = typeof m.hooks === 'object' && m.hooks !== null ? (m.hooks as PluginHooks) : {};
  return { tools, hooks };
};

const withTimeout = async <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)),
  ]);

export interface PluginHostLineResult {
  lines: string[];
}

/**
 * In-process host: feed protocol lines, collect response lines. Constructor
 * load failures return { error } — callers surface it, never guess past it.
 */
export const createPluginHost = (
  pluginDir: string,
  write: (line: string) => void,
): { host: { handleLine: (line: string) => void } } | { error: string } => {
  let manifest: PluginManifest;
  try {
    const parsed = PluginManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(pluginDir, MANIFEST_FILENAME), 'utf8')));
    if (!parsed.success) return { error: `invalid manifest: ${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` };
    manifest = parsed.data;
  } catch (e) {
    return { error: `cannot read ${MANIFEST_FILENAME}: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Async load: entry failures latch into an error state that answers every
  // request honestly instead of half-starting.
  let state: { status: 'loading' } | { status: 'ready'; tools: PluginTool[]; hooks: PluginHooks } | { status: 'failed'; message: string } = { status: 'loading' };
  void loadPluginEntry(pluginDir, manifest)
    .then((loaded) => { state = { status: 'ready', tools: loaded.tools, hooks: loaded.hooks }; })
    .catch((e: unknown) => { state = { status: 'failed', message: e instanceof Error ? e.message : String(e) }; });

  const send = (id: number, result: unknown): void => write(JSON.stringify({ jsonrpc: '2.0' as const, id, result }));
  const sendErr = (id: number, message: string): void => write(JSON.stringify({ jsonrpc: '2.0' as const, id, error: { code: -32000, message } }));

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let msg: { id?: number; method?: string; params?: { name?: string; arguments?: unknown; tool?: string; args?: unknown; turn?: number; result?: { ok: boolean } } };
    try {
      msg = JSON.parse(trimmed) as typeof msg;
    } catch {
      return; // non-protocol noise on stdin is ignored
    }
    if (msg.id === undefined || msg.id === null) return; // notifications: initialized etc.
    const { id, method } = msg;
    void (async () => {
      if (state.status === 'loading') {
        // Spin until the entry settles (bounded by the sender's request timeout).
        for (let i = 0; i < 200 && state.status === 'loading'; i += 1) await new Promise((r) => setTimeout(r, 10));
      }
      if (state.status === 'failed') {
        sendErr(id, `plugin entry failed to load: ${state.message}`);
        return;
      }
      const { tools, hooks } = state.status === 'ready' ? state : { tools: [] as PluginTool[], hooks: {} as PluginHooks };
      try {
        switch (method) {
          case 'initialize':
            send(id, { protocolVersion: '2025-06-18', serverInfo: { name: `plugin:${manifest.name}`, version: manifest.version } });
            return;
          case 'tools/list':
            send(id, { tools: tools.map((t) => ({ name: t.name, ...(t.description !== undefined ? { description: t.description } : {}), ...(t.inputSchema !== undefined ? { inputSchema: t.inputSchema } : {}) })) });
            return;
          case 'tools/call': {
            const name = msg.params?.name;
            const tool = tools.find((t) => t.name === name);
            if (tool === undefined) {
              send(id, { content: [{ type: 'text', text: `unknown tool: ${String(name)}` }], isError: true });
              return;
            }
            try {
              const out = await withTimeout(Promise.resolve(tool.execute(msg.params?.arguments ?? {})), TOOL_TIMEOUT_MS, `plugin tool '${tool.name}'`);
              send(id, { content: out ?? null, isError: false });
            } catch (e) {
              send(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
            }
            return;
          }
          case 'hooks/beforeTool': {
            if (hooks.beforeToolCall === undefined) { send(id, {}); return; }
            try {
              const out = await withTimeout(Promise.resolve(hooks.beforeToolCall({ tool: msg.params?.tool ?? '', args: msg.params?.args, turn: msg.params?.turn ?? 0 })), HOOK_TIMEOUT_MS, 'plugin beforeToolCall');
              send(id, out ?? {});
            } catch (e) {
              // A failing/timeout hook must not corrupt the session — report loudly, allow.
              send(id, { pluginHookError: e instanceof Error ? e.message : String(e) });
            }
            return;
          }
          case 'hooks/afterTool': {
            if (hooks.afterToolCall === undefined) { send(id, {}); return; }
            try {
              await withTimeout(Promise.resolve(hooks.afterToolCall({ tool: msg.params?.tool ?? '', args: msg.params?.args, turn: msg.params?.turn ?? 0 }, msg.params?.result ?? { ok: true })), HOOK_TIMEOUT_MS, 'plugin afterToolCall');
              send(id, {});
            } catch (e) {
              send(id, { pluginHookError: e instanceof Error ? e.message : String(e) });
            }
            return;
          }
          default:
            sendErr(id, `method not found: ${String(method)}`);
        }
      } catch (e) {
        sendErr(id, e instanceof Error ? e.message : String(e));
      }
    })();
  };

  return { host: { handleLine } };
};

const main = (): void => {
  const pluginDir = process.argv[2];
  if (pluginDir === undefined) {
    process.stderr.write('host-main: plugin dir argument required\n');
    process.exit(2);
  }
  const created = createPluginHost(path.resolve(pluginDir), (line) => process.stdout.write(`${line}\n`));
  if ('error' in created) {
    process.stderr.write(`host-main: ${created.error}\n`);
    process.exit(2);
  }
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', created.host.handleLine);
};

// ESM entry check (require.main equivalent): run only when executed directly,
// never when imported for the in-process factory (tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
