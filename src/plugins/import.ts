import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MANIFEST_FILENAME, PluginManifestSchema, pluginIdOf, type PluginManifest } from './manifest.js';
import { ToolIntegrationSchema, integrationSemanticIssues, newId, type ToolIntegration } from '../domain/index.js';

/**
 * Plugin import (TIS T5): expand a reviewed local plugin directory into tool
 * integrations. Every expanded integration is stored DISABLED — import stages
 * the work, the researcher activates after review (explicit gating, no silent
 * capability growth). The entry file (when present) becomes an mcp_server
 * integration pointing at the subprocess host: plugins reuse the MCP client
 * and its risk-class/permission machinery instead of a second protocol.
 *
 * Path discipline: import reads ONLY the given directory; the manifest entry
 * file is contained by the host. No network fetch, ever.
 */

export interface PluginImportResult {
  manifest: PluginManifest;
  /** Staged integrations (disabled; persisted by the caller after review). */
  integrations: ToolIntegration[];
  warnings: string[];
}

export class PluginImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginImportError';
  }
}

/** Absolute path of the compiled host entry (dist/plugins/host-main.js). */
export const hostMainPath = (): string => fileURLToPath(new URL('./host-main.js', import.meta.url));

const sanitizePrefix = (name: string): string => {
  const raw = name.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 12).replace(/_+$/, '');
  return raw.length > 0 ? raw : 'plugin';
};

export const readPluginManifest = (dir: string): PluginManifest => {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, MANIFEST_FILENAME), 'utf8');
  } catch {
    throw new PluginImportError(`cannot read ${MANIFEST_FILENAME} in ${dir}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new PluginImportError(`manifest is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = PluginManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new PluginImportError(`invalid manifest: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; ')}`);
  }
  return parsed.data;
};

/** Expand a validated manifest into staged (disabled) integrations. */
export const expandPluginManifest = (
  manifest: PluginManifest,
  pluginDir: string,
  now = (): string => new Date().toISOString(),
): PluginImportResult => {
  const warnings: string[] = [];
  const pluginId = pluginIdOf(manifest);
  const base = {
    enabled: false,
    createdAt: now(),
    updatedAt: now(),
    createdBy: 'plugin_import' as const,
    provenance: { pluginId },
  };
  const out: ToolIntegration[] = [];
  const push = (over: Record<string, unknown>): void => {
    const candidate = { ...base, id: newId('tint'), ...over };
    const parsed = ToolIntegrationSchema.safeParse(candidate);
    if (!parsed.success) {
      warnings.push(`skipped '${String(over.label)}': ${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}`);
      return;
    }
    const semantic = integrationSemanticIssues(parsed.data);
    if (semantic.length > 0) {
      warnings.push(`skipped '${String(over.label)}': ${semantic.join('; ')}`);
      return;
    }
    out.push(parsed.data);
  };

  for (const skill of manifest.skills) {
    push({ kind: 'skill', label: `${manifest.name}/${skill.name}`, name: skill.name, description: skill.description, priority: skill.priority, ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}), body: skill.body });
  }
  for (const command of manifest.commands) {
    push({ kind: 'command', label: `${manifest.name}/${command.name}`, name: command.name, template: command.template, scope: command.scope });
  }
  for (const rule of manifest.hookRules) {
    push({ kind: 'hook_rule', label: `${manifest.name}/${rule.label}`, event: rule.event, match: rule.match, action: rule.action });
  }
  for (const server of manifest.mcpServers) {
    push({ kind: 'mcp_server', label: `${manifest.name}/${server.label}`, transport: server.transport, command: server.command, args: server.args, env: server.env, url: server.url, headers: server.headers, toolNamePrefix: server.toolNamePrefix, riskClass: server.riskClass, timeoutMs: server.timeoutMs });
  }
  if (manifest.entry !== undefined) {
    push({
      kind: 'mcp_server',
      label: `${manifest.name} (entry)`,
      transport: 'stdio',
      command: process.execPath,
      args: [hostMainPath(), pluginDir],
      toolNamePrefix: sanitizePrefix(manifest.name),
      riskClass: 'execute',
      timeoutMs: 30_000,
    });
  }
  return { manifest, integrations: out, warnings };
};

/** Input contract for the import API route. */
export const PluginImportInputSchema = z.object({
  dir: z.string().min(1).max(1000),
  /** Researcher confirmation that the plugin files were reviewed (honesty gate, not a sandbox). */
  reviewed: z.literal(true),
});
export type PluginImportInput = z.infer<typeof PluginImportInputSchema>;

export const importPlugin = (input: PluginImportInput, now?: () => string): PluginImportResult => {
  const dir = path.resolve(input.dir);
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isDirectory()) {
    throw new PluginImportError(`not a directory: ${dir}`);
  }
  const manifest = readPluginManifest(dir);
  return expandPluginManifest(manifest, dir, now);
};
