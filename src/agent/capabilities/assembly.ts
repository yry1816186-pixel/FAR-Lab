import type { ToolIntegration, McpServerIntegration, HookRuleIntegration, SkillIntegration } from '../../domain/tool-integration.js';
import { ToolRegistry, type AgentTool } from '../tool.js';
import { PermissionEngine } from '../permissions.js';
import { McpManager, type McpRegistration, type McpServerStatus, type McpSkip } from '../mcp-manager.js';
import { ExtensionBus } from '../hooks.js';
import { expandHookRulesToPermissions, composeLogHooks, type KnownTool, type ToolRiskClassName } from '../hooks-compose.js';
import { loadSkillsFromDir, selectSkills, renderSkillsPrompt, type AgentSkill } from '../skills.js';
import { makeListCapabilitiesTool, type SkillCapabilityRecord, type ToolCapabilityRecord } from './catalog.js';

/**
 * Session capability assembly (R2-09): the ONE authoritative composition that
 * turns (capability policy + builtin tools + stored tool integrations) into a
 * kernel session's capability plane — tool registry, permission engine,
 * hook-rule bus, skill injection, and the capability records that back the
 * model-facing discovery view.
 *
 * Lifecycle is session-scoped by design: every session re-assembles from the
 * CURRENT store truth, so enable/disable/update/removal of integrations take
 * effect at the next assembly without any in-place registry mutation (kernel
 * registries are append-only). Availability states are honest per server —
 * a failing server never blocks the others, a policy-refused server never
 * spawns a process.
 *
 * Least-privilege admission: an ENABLED mcp_server joins only when its
 * researcher-declared riskClass is in policy.admittedRiskClasses. Enabling an
 * integration is consent for the tool plane, not a blanket grant into every
 * kernel session. Disabled servers keep their honest 'disabled' state instead
 * of vanishing.
 */

export interface CapabilityPolicy {
  /** Kernel capability this session runs as (named in admission messages and the catalog view). */
  capability: string;
  /** Risk classes an ENABLED mcp_server may join with ('read' for autonomous research capabilities). */
  admittedRiskClasses: readonly ToolRiskClassName[];
}

export interface AssemblySkillInput {
  /** Selection text (task + domain terms) the relevance matcher scores against. */
  task: string;
  dirs: Array<{ dir: string; tier: 'builtin' | 'project' | 'user' }>;
  limits: { maxCount: number; maxChars: number };
}

export interface AssembleSessionInput {
  builtinTools: readonly AgentTool[];
  integrations: readonly ToolIntegration[];
  policy: CapabilityPolicy;
  skills?: AssemblySkillInput;
  /** Hook-rule log sink (session event stream); absent drops log lines on the floor. */
  onHookLog?: (entry: { rule: string; event: 'before_tool' | 'after_tool' | 'turn_end'; turn: number; tool?: string; detail: string }) => void;
}

export interface AssembledSession {
  registry: ToolRegistry;
  permissions: PermissionEngine;
  hookBus: ExtensionBus;
  mcpManager: McpManager;
  mcpStatuses: McpServerStatus[];
  mcpRegistered: McpRegistration[];
  mcpSkipped: McpSkip[];
  selectedSkills: AgentSkill[];
  skillsPrompt: string;
  /** Every capability this session knows about, available or not (discovery + reporting truth). */
  capabilityRecords: ToolCapabilityRecord[];
  skillRecords: SkillCapabilityRecord[];
  /** Closes managed MCP clients. Callers MUST call this when the session ends. */
  close(): Promise<void>;
}

export const assembleSessionCapabilities = async (input: AssembleSessionInput): Promise<AssembledSession> => {
  const { builtinTools, integrations, policy } = input;

  // --- registry: builtin tools + the discovery tool, then MCP tools on top ---
  const registry = new ToolRegistry();
  for (const tool of builtinTools) {
    registry.register(tool.source === undefined ? { ...tool, source: 'builtin' } : tool);
  }

  // --- MCP admission (capability-scoped least privilege) ---
  const mcpIntegrations = integrations.filter((i): i is McpServerIntegration => i.kind === 'mcp_server');
  const admittedMcp = mcpIntegrations.filter((i) => policy.admittedRiskClasses.includes(i.riskClass) || !i.enabled);
  const refusedMcp = mcpIntegrations
    .filter((i) => i.enabled && !policy.admittedRiskClasses.includes(i.riskClass))
    .map((i): McpServerStatus => ({
      integrationId: i.id,
      label: i.label,
      state: 'disabled',
      error: `admission policy: ${policy.capability} admits MCP risk classes ${policy.admittedRiskClasses.join('|')} only; this server has riskClass '${i.riskClass}'`,
    }));
  const mcpManager = new McpManager({ listServers: () => admittedMcp });
  const mcpStatuses = [...refusedMcp, ...(await mcpManager.connectAll())];

  // Discovery tool is registered BEFORE MCP tools so name collisions dedupe
  // against it (the manager suffixes colliding remote names, never overwrites).
  const listCapabilities = makeListCapabilitiesTool(
    () => capabilityRecords,
    () => skillRecords,
    { capability: policy.capability, admittedRiskClasses: policy.admittedRiskClasses },
  );
  registry.register(listCapabilities);
  const { registered: mcpTools, skipped: mcpSkipped } = await mcpManager.registerTools(registry);

  // --- permissions: builtin allow + adapted MCP allow + researcher hook rules ---
  const hookRules = integrations.filter((i): i is HookRuleIntegration => i.kind === 'hook_rule');
  const knownTools: KnownTool[] = registry.names().map((name) => ({ name, riskClass: registry.get(name)?.riskClass }));
  const permissions = new PermissionEngine({
    rules: [
      ...builtinTools.map((t) => ({ tool: t.name, effect: 'allow' as const })),
      { tool: 'list_capabilities', effect: 'allow' as const },
      // Admitted (policy-passing) MCP servers contribute their adapted tools as
      // allow rules; risk classes are stamped per-integration and the explore
      // mode still gates non-read tools. Non-admitted servers were refused
      // above — they never reach this expansion.
      ...mcpTools.map((r) => ({ tool: r.registeredAs, effect: 'allow' as const })),
      // Researcher hook rules: block → bypassImmune deny, require_approval → ask
      // (exact-(tool,args) approval binding; headless ask denies fail-closed).
      ...expandHookRulesToPermissions(hookRules, knownTools),
    ],
    defaultEffect: 'deny',
  });

  // --- hook-rule log bus ---
  const hookBus = composeLogHooks(hookRules, {
    log: (entry) => input.onHookLog?.(entry),
    riskClassOf: (tool) => registry.get(tool)?.riskClass,
  });

  // --- skills: tier dirs + store-backed (enabled) at user tier, relevance-selected ---
  const allSkills: AgentSkill[] = [];
  if (input.skills !== undefined) {
    for (const { dir, tier } of input.skills.dirs) allSkills.push(...loadSkillsFromDir(dir, tier).skills);
  }
  const skillIntegrations = integrations.filter((i): i is SkillIntegration => i.kind === 'skill' && i.enabled);
  for (const integration of skillIntegrations) {
    allSkills.push({
      name: integration.name,
      description: integration.description,
      ...(integration.whenToUse !== undefined && integration.whenToUse.length > 0 ? { whenToUse: integration.whenToUse } : {}),
      tier: 'user',
      priority: integration.priority,
      body: integration.body,
    });
  }
  const selectedSkills = input.skills !== undefined
    ? selectSkills(input.skills.task, allSkills, input.skills.limits)
    : [];
  const skillsPrompt = renderSkillsPrompt(selectedSkills);

  // --- capability records (identity + availability truth for discovery/reporting) ---
  const statusByIntegration = new Map(mcpStatuses.map((s) => [s.integrationId, s]));
  const registeredByLabel = new Map<string, McpRegistration[]>();
  for (const r of mcpTools) {
    const list = registeredByLabel.get(r.serverLabel) ?? [];
    list.push(r);
    registeredByLabel.set(r.serverLabel, list);
  }
  const capabilityRecords: ToolCapabilityRecord[] = [
    ...builtinTools.map((t): ToolCapabilityRecord => ({
      id: `builtin:${t.name}`,
      name: t.name,
      kind: 'builtin',
      source: t.source ?? 'builtin',
      ...(t.version !== undefined ? { version: t.version } : {}),
      ...(t.riskClass !== undefined ? { riskClass: t.riskClass } : {}),
      ...(t.trust !== undefined ? { trust: t.trust } : {}),
      availability: { state: 'available' },
    })),
    {
      id: 'builtin:list_capabilities',
      name: 'list_capabilities',
      kind: 'builtin',
      source: 'builtin',
      riskClass: 'read',
      availability: { state: 'available' },
    },
    ...mcpIntegrations.flatMap((i): ToolCapabilityRecord[] => {
      const status = statusByIntegration.get(i.id);
      if (status === undefined || status.state !== 'connected') {
        const availability = refusedMcp.some((r) => r.integrationId === i.id)
          ? { state: 'refused' as const, reason: statusByIntegration.get(i.id)?.error ?? 'session admission policy' }
          : status?.state === 'failed'
            ? { state: 'failed' as const, reason: status.error ?? 'connection failed' }
            : { state: 'disabled' as const, reason: 'disabled by the researcher' };
        return [{
          id: `mcp:${i.label}:*`,
          name: `mcp:${i.label}`,
          kind: 'mcp',
          source: i.provenance?.pluginId ?? i.label,
          ...(i.riskClass !== undefined ? { riskClass: i.riskClass } : {}),
          trust: 'external' as const,
          availability,
        }];
      }
      const registered = registeredByLabel.get(i.label) ?? [];
      return registered.map((r): ToolCapabilityRecord => ({
        id: `mcp:${i.label}:${r.remoteName}`,
        name: r.registeredAs,
        kind: 'mcp',
        source: i.provenance?.pluginId ?? i.label,
        ...(r.serverVersion !== undefined ? { version: r.serverVersion } : {}),
        riskClass: i.riskClass,
        trust: 'external' as const,
        ...(r.serverHints !== undefined ? { serverHints: r.serverHints } : {}),
        availability: { state: 'available' },
      }));
    }),
  ];
  const selectedNames = new Set(selectedSkills.map((s) => s.name));
  const skillRecords: SkillCapabilityRecord[] = allSkills.map((s) => ({
    name: s.name,
    tier: s.tier,
    source: s.tier,
    injected: selectedNames.has(s.name),
  }));

  return {
    registry,
    permissions,
    hookBus,
    mcpManager,
    mcpStatuses,
    mcpRegistered: mcpTools,
    mcpSkipped,
    selectedSkills,
    skillsPrompt,
    capabilityRecords,
    skillRecords,
    async close(): Promise<void> {
      await mcpManager.close();
    },
  };
};
