import { z } from 'zod';
import type { AgentTool, ToolResult } from '../tool.js';

/**
 * Capability catalog (R2-09): unified identity/provenance/availability records
 * for everything a session can call, plus the model-facing DISCOVERY view.
 *
 * Design rule: one record per callable capability — builtin tools and
 * MCP-adapted tools alike — carrying the identity plane (id/source/version,
 * risk class, content trust, untrusted server hints) and an honest
 * availability state for the ones that did NOT make it into the session
 * (refused by policy, failed to connect, researcher-disabled). The model
 * composes capabilities from these attributes instead of memorizing
 * implementation-specific tool names, and can see WHY a capability is absent.
 */

export type ToolRiskClassName = 'read' | 'edit' | 'execute' | 'destructive';

export type CapabilityAvailability =
  | { state: 'available' }
  | { state: 'refused'; reason: string }
  | { state: 'failed'; reason: string }
  | { state: 'disabled'; reason?: string };

/** Server self-declared hints (MCP spec annotations) — display-only, untrusted. */
export interface CapabilityServerHints {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolCapabilityRecord {
  /** Stable identity: builtin:<name> | mcp:<integrationLabel>:<remoteName>. */
  id: string;
  /** Session registry name (what the model calls). */
  name: string;
  kind: 'builtin' | 'mcp';
  /** Provenance: 'builtin' | MCP server label | pluginId. */
  source: string;
  version?: string;
  riskClass?: ToolRiskClassName;
  trust?: 'own' | 'external';
  serverHints?: CapabilityServerHints;
  availability: CapabilityAvailability;
}

export interface SkillCapabilityRecord {
  name: string;
  tier: 'builtin' | 'project' | 'user';
  source: string;
  injected: boolean;
}

export interface CapabilityPolicyInfo {
  capability: string;
  admittedRiskClasses: readonly ToolRiskClassName[];
}

const availabilityText = (a: CapabilityAvailability): string => {
  switch (a.state) {
    case 'available': return 'available';
    case 'refused': return `refused by session admission policy — ${a.reason}`;
    case 'failed': return `failed — ${a.reason}`;
    case 'disabled': return a.reason !== undefined ? `disabled — ${a.reason}` : 'disabled by the researcher';
  }
};

/** Model-facing discovery payload: available tools, unavailable capabilities with reasons, injected skills, policy. */
export const capabilityView = (
  records: readonly ToolCapabilityRecord[],
  skills: readonly SkillCapabilityRecord[],
  policy: CapabilityPolicyInfo,
): { tools: unknown[]; unavailable: unknown[]; skills: unknown[]; admissionPolicy: string } => ({
  tools: records
    .filter((r) => r.availability.state === 'available')
    .map((r) => ({
      name: r.name, kind: r.kind, source: r.source,
      ...(r.version !== undefined ? { version: r.version } : {}),
      ...(r.riskClass !== undefined ? { riskClass: r.riskClass } : {}),
      ...(r.trust !== undefined ? { trust: r.trust } : {}),
      ...(r.serverHints !== undefined ? { serverHints: r.serverHints } : {}),
    })),
  unavailable: records
    .filter((r) => r.availability.state !== 'available')
    .map((r) => ({ id: r.id, kind: r.kind, source: r.source, state: availabilityText(r.availability) })),
  skills: skills.map((s) => ({ name: s.name, tier: s.tier, source: s.source, injected: s.injected })),
  admissionPolicy: `${policy.capability}: MCP servers of risk class ${policy.admittedRiskClasses.join('|')} only (researcher-enabled integrations outside these classes are refused before any connection)`,
});

/**
 * The `list_capabilities` discovery tool (registered by the session assembly):
 * lets the model enumerate the session's capability plane — identity, source,
 * version, risk/trust attributes and honest availability states — instead of
 * inferring it from prompt text. Read-class, own-trust, zero side effects.
 */
export const makeListCapabilitiesTool = (
  records: () => readonly ToolCapabilityRecord[],
  skills: () => readonly SkillCapabilityRecord[],
  policy: CapabilityPolicyInfo,
): AgentTool => ({
  name: 'list_capabilities',
  description: 'List this session\'s capability plane: every available tool with its identity (source, version, riskClass, trust, untrusted server hints), capabilities that are unavailable and WHY (refused/failed/disabled), the skills injected this session, and the MCP admission policy.',
  inputSchema: z.object({}),
  riskClass: 'read',
  async execute(): Promise<ToolResult> {
    const view = capabilityView(records(), skills(), policy);
    const nAvail = view.tools.length;
    const nUnavail = view.unavailable.length;
    return {
      ok: true,
      data: view,
      summary: `${nAvail} available, ${nUnavail} unavailable, ${view.skills.length} skills`,
    };
  },
});
