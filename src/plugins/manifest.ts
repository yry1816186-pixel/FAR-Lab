import { z } from 'zod';

/**
 * Plugin manifest (TIS T5): the reviewed-at-install unit of a plugin — a
 * declarative bundle that expands into tool integrations (skills, commands,
 * hook rules, MCP server configs) plus an OPTIONAL entry JS file that runs in
 * a subprocess host speaking the same JSON-RPC-over-stdio protocol as MCP
 * servers (initialize / tools/list / tools/call + hooks/beforeTool,
 * hooks/afterTool). The product process never loads plugin code in-process.
 *
 * Import is local-directory only (no remote fetch): supply-chain discipline —
 * the researcher (or an OSS due-diligence pass) reviews these files first.
 */

export const PluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'plugin name: lowercase kebab'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver x.y.z'),
  license: z.string().trim().min(1).max(100),
  /** Where this plugin came from (repo URL, local note) — provenance for re-review. */
  sourceUri: z.string().trim().max(500).optional(),
  skills: z.array(z.object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
    description: z.string().trim().min(1).max(500),
    whenToUse: z.string().max(1000).optional(),
    priority: z.number().int().min(0).max(100).default(0),
    body: z.string().min(1).max(50_000),
  })).max(20).default([]),
  commands: z.array(z.object({
    name: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
    label: z.string().trim().min(1).max(80),
    template: z.string().min(1).max(10_000),
    scope: z.enum(['palette', 'composer', 'both']).default('both'),
  })).max(20).default([]),
  hookRules: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    event: z.enum(['before_tool', 'after_tool', 'turn_end']),
    match: z.object({
      toolPattern: z.string().min(1).max(200).optional(),
      riskClass: z.enum(['read', 'edit', 'execute', 'destructive']).optional(),
    }),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('block'), reason: z.string().min(1).max(500) }),
      z.object({ type: z.literal('require_approval'), reason: z.string().max(500).optional() }),
      z.object({ type: z.literal('log'), note: z.string().max(500).optional() }),
    ]),
  })).max(20).default([]),
  mcpServers: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    transport: z.enum(['stdio', 'http']),
    command: z.string().min(1).max(500).optional(),
    args: z.array(z.string().min(1).max(500)).max(50).default([]),
    env: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
    url: z.string().url().max(2000).optional(),
    headers: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
    toolNamePrefix: z.string().regex(/^[a-z][a-z0-9_]{0,15}$/).optional(),
    riskClass: z.enum(['read', 'edit', 'execute', 'destructive']).default('execute'),
    timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  })).max(10).default([]),
  /** Optional JS entry executed only inside the plugin host subprocess. */
  entry: z.object({ file: z.string().regex(/^[\w.-]{1,200}$/) }).optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** Stable plugin identity for provenance records. */
export const pluginIdOf = (manifest: PluginManifest): string => `${manifest.name}@${manifest.version}`;

export const MANIFEST_FILENAME = 'far-plugin.json';
