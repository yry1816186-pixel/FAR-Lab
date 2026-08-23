import { z } from 'zod';
import { ToolIntegrationId } from './ids.js';

/**
 * Tool integrations (TIS): the PRODUCT configuration layer for external tools a
 * researcher wires into agent sessions — MCP servers (stdio/streamable-HTTP),
 * inline skills, prompt-template commands, and declarative hook rules. Same
 * trust posture as ModelProviderConfig: created/edited at runtime, persisted in
 * local SQLite, secrets (env/header values) masked in every API projection and
 * never serialized back out.
 *
 * Plugins (arbitrary JS, subprocess-isolated) import INTO these entities at
 * install time (kind-by-kind expansion, provenance.pluginId records the origin);
 * the plugin runtime itself lives in src/plugins/.
 *
 * Cross-field semantics (stdio↔command, http↔url, hook event↔action) are
 * deliberately NOT zod superRefine — wrapped schemas cannot serve as
 * discriminatedUnion members or be .omit()-ed for drafts. They live in
 * `integrationSemanticIssues`, enforced at every creation boundary
 * (API create/update, draft instantiation, plugin import).
 */

/** Who created this integration — researcher directly, a conversation proposal, or a plugin import. */
export const ToolCreatedBy = z.enum(['researcher', 'conversation', 'plugin_import']);
export type ToolCreatedBy = z.infer<typeof ToolCreatedBy>;

export const ToolProvenance = z.object({
  conversationId: z.string().regex(/^conv_[a-z0-9]+$/).optional(),
  messageId: z.string().regex(/^cmsg_[a-z0-9]+$/).optional(),
  /** Plugin origin: manifest name@version — stable across re-imports. */
  pluginId: z.string().min(1).max(200).optional(),
});
export type ToolProvenance = z.infer<typeof ToolProvenance>;

/** Honest record of the researcher's last explicit test action (no background polling = no fake liveness). */
export const ToolTestRecord = z.object({
  at: z.string().datetime(),
  ok: z.boolean(),
  /** Human summary, e.g. "3 tools listed" or the failure reason. */
  summary: z.string().min(1).max(1000),
});
export type ToolTestRecord = z.infer<typeof ToolTestRecord>;

const IntegrationBase = {
  id: ToolIntegrationId,
  label: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: ToolCreatedBy,
  provenance: ToolProvenance.optional(),
} as const;

export const McpServerIntegration = z.object({
  ...IntegrationBase,
  kind: z.literal('mcp_server'),
  transport: z.enum(['stdio', 'http']),
  /** stdio: executable to spawn (args array, never a shell string). */
  command: z.string().min(1).max(500).optional(),
  args: z.array(z.string().min(1).max(500)).max(50).default([]),
  /** Values may hold secrets — masked in API projections, plaintext only in local SQLite. */
  env: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
  /** http: streamable-HTTP endpoint. */
  url: z.string().url().max(2000).optional(),
  headers: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
  /** Registry-name prefix for adapted tools (default: sanitized label). */
  toolNamePrefix: z.string().regex(/^[a-z][a-z0-9_]{0,15}$/).optional(),
  /** Risk class stamped on every adapted tool — conservative default 'execute'. */
  riskClass: z.enum(['read', 'edit', 'execute', 'destructive']).default('execute'),
  /** Per-request timeout for this server's client (ms). */
  timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  lastTest: ToolTestRecord.optional(),
});
export type McpServerIntegration = z.infer<typeof McpServerIntegration>;

export const SkillIntegration = z.object({
  ...IntegrationBase,
  kind: z.literal('skill'),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'lowercase kebab-ish skill name'),
  description: z.string().trim().min(1).max(500),
  whenToUse: z.string().max(1000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  body: z.string().min(1).max(50_000),
});
export type SkillIntegration = z.infer<typeof SkillIntegration>;

export const CommandIntegration = z.object({
  ...IntegrationBase,
  kind: z.literal('command'),
  name: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/, 'lowercase command name (composer /name trigger)'),
  template: z.string().min(1).max(10_000),
  scope: z.enum(['palette', 'composer', 'both']).default('both'),
});
export type CommandIntegration = z.infer<typeof CommandIntegration>;

/** What a declarative hook rule does when its match hits. */
export const HookAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('block'), reason: z.string().min(1).max(500) }),
  z.object({ type: z.literal('require_approval'), reason: z.string().max(500).optional() }),
  z.object({ type: z.literal('log'), note: z.string().max(500).optional() }),
]);
export type HookAction = z.infer<typeof HookAction>;

export const HookRuleIntegration = z.object({
  ...IntegrationBase,
  kind: z.literal('hook_rule'),
  event: z.enum(['before_tool', 'after_tool', 'turn_end']),
  match: z.object({
    /** Prefix match with trailing '*' (e.g. 'mcp_arxiv_*') or exact tool name. */
    toolPattern: z.string().min(1).max(200).optional(),
    riskClass: z.enum(['read', 'edit', 'execute', 'destructive']).optional(),
  }),
  action: HookAction,
});
export type HookRuleIntegration = z.infer<typeof HookRuleIntegration>;

export const ToolIntegrationSchema = z.discriminatedUnion('kind', [
  McpServerIntegration,
  SkillIntegration,
  CommandIntegration,
  HookRuleIntegration,
]);
export type ToolIntegration = z.infer<typeof ToolIntegrationSchema>;

/** Cross-field semantics enforced at every creation boundary (see module doc). */
export const integrationSemanticIssues = (
  integration: ToolIntegration | ToolIntegrationDraft,
): string[] => {
  const issues: string[] = [];
  if (integration.kind === 'mcp_server') {
    if (integration.transport === 'stdio' && (integration.command === undefined || integration.command.length === 0)) {
      issues.push('stdio transport requires a command');
    }
    if (integration.transport === 'http' && integration.url === undefined) {
      issues.push('http transport requires a url');
    }
  }
  if (integration.kind === 'hook_rule') {
    if (integration.match.toolPattern === undefined && integration.match.riskClass === undefined) {
      issues.push('match requires toolPattern and/or riskClass');
    }
    if (integration.event === 'turn_end' && integration.action.type !== 'log') {
      issues.push('turn_end rules can only log');
    }
    if (integration.event === 'after_tool' && integration.action.type === 'block') {
      issues.push('after_tool rules run post-execution — use require_approval on before_tool instead');
    }
  }
  return issues;
};

/** Conversation-proposal draft: a full integration minus server-assigned identity/timestamps/origin. */
export const McpServerDraft = McpServerIntegration.omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, lastTest: true });
export const SkillDraft = SkillIntegration.omit({ id: true, createdAt: true, updatedAt: true, createdBy: true });
export const CommandDraft = CommandIntegration.omit({ id: true, createdAt: true, updatedAt: true, createdBy: true });
export const HookRuleDraft = HookRuleIntegration.omit({ id: true, createdAt: true, updatedAt: true, createdBy: true });

export const ToolIntegrationDraftSchema = z.discriminatedUnion('kind', [
  McpServerDraft,
  SkillDraft,
  CommandDraft,
  HookRuleDraft,
]);
export type ToolIntegrationDraft = z.infer<typeof ToolIntegrationDraftSchema>;

/**
 * Conversation action args (TIS T4): the resident agent's propose_action payload
 * for kind='create_tool_integration'. The draft's `enabled` is FORCED to false at
 * execution — the agent can stage a tool config, only the researcher activates it.
 */
export const CreateToolIntegrationArgsSchema = z.object({
  draft: ToolIntegrationDraftSchema,
  rationale: z.string().min(1).max(2000),
  warnings: z.array(z.string().max(500)).max(10).default([]),
});
export type CreateToolIntegrationArgs = z.infer<typeof CreateToolIntegrationArgsSchema>;

/** Instantiate a stored integration from an approved draft (server assigns identity; semantics re-checked). */
export const instantiateDraft = (
  draft: ToolIntegrationDraft,
  identity: { id: string; createdBy: ToolCreatedBy; provenance?: ToolProvenance },
): ToolIntegration => {
  const issues = integrationSemanticIssues(draft);
  if (issues.length > 0) throw new Error(`tool integration draft invalid: ${issues.join('; ')}`);
  return ToolIntegrationSchema.parse({
    ...draft,
    id: identity.id,
    createdBy: identity.createdBy,
    ...(identity.provenance !== undefined ? { provenance: identity.provenance } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

/** Display hint for a secret-bearing value: last 4 chars only; empty stays empty (maskApiKey lineage). */
export const maskSecret = (value: string): string =>
  value.length === 0 ? '' : `••••${value.slice(-4)}`;

/** Mask every env/header value for API projections — secret values never leave the store verbatim. */
export const maskIntegrationSecrets = <T extends ToolIntegration>(integration: T): T => {
  if (integration.kind === 'mcp_server') {
    return {
      ...integration,
      env: Object.fromEntries(Object.entries(integration.env).map(([k, v]) => [k, maskSecret(v)])),
      headers: Object.fromEntries(Object.entries(integration.headers).map(([k, v]) => [k, maskSecret(v)])),
    } as T;
  }
  return integration;
};
