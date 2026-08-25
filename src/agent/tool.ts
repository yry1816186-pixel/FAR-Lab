import { z } from 'zod';
import { describeShape } from '../pipeline/llm.js';
import type { ReceiptSink } from './protocol.js';

/**
 * Tool system (H1): typed schema (zod), registry, and a ToolResult discipline where
 * validation failures are fed BACK to the model as structured errors (OpenCode pattern)
 * instead of crashing the loop. Tools must never throw for expected failures — return
 * {ok:false, error}; only programming errors propagate.
 */

export interface ToolResult {
  ok: boolean;
  /** JSON-safe payload returned to the model (subject to truncate/spill discipline). */
  data?: unknown;
  error?: { kind: 'validation' | 'execution' | 'permission'; message: string };
  /** One-line human summary for events/session records (never sent to the model). */
  summary?: string;
}

export interface ToolContext {
  /** Cooperative cancellation — tools MUST check before expensive work. */
  signal: { aborted: boolean };
  /** Progress note into the event stream (tool-level milestones). */
  emit: (note: string, detail?: Record<string, unknown>) => void;
  /** Provenance: side-effecting tools (retrieval, execution) record their own receipts. */
  recordReceipt: ReceiptSink;
  /** Sub-agent depth this tool executes at (0 = main session). */
  depth: number;
}

export interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<unknown>;
  /** Deterministic cheap summary for compaction; absent => raw payload is head-truncated. */
  readonly summarize?: (payload: unknown) => string;
  /**
   * Risk class (Wave-S v2-harness, agentscope permission-mode lineage) drives the
   * session mode machine in permissions.ts. Absent = 'execute' (conservative: the
   * explore mode treats undeclared tools as non-read and denies them).
   */
  readonly riskClass?: 'read' | 'edit' | 'execute' | 'destructive';
  /**
   * Content trust (RU-3 COGSEC T1). 'external' marks tools whose outputs are
   * untrusted external content (MCP-bridged servers, document parsing, web).
   * The loop marks their tool_result entries `untrusted: true` and instructs
   * the model to treat them strictly as data. Absent = 'own' (our code).
   */
  readonly trust?: 'own' | 'external';
  /**
   * Capability identity (R2-09): stable version of this tool when the source
   * exposes one (plugin manifest version, MCP serverInfo.version). Absent =
   * unversioned builtin. Surfaced in the model-facing catalog so composition
   * decisions can see staleness, never used for behavior gating.
   */
  readonly version?: string;
  /**
   * Provenance label (R2-09): where this tool came from — 'builtin', the MCP
   * server label, or pluginId — so the model-facing catalog and session
   * reports can attribute every callable capability to its source.
   */
  readonly source?: string;
  /**
   * Server-declared hints (R2-09, MCP spec annotations): UNTRUSTED metadata
   * (readOnlyHint etc.) surfaced for display/composition only — they never
   * override the researcher-declared riskClass or permission decisions.
   */
  readonly annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): this {
    if (!TOOL_NAME_RE.test(tool.name)) throw new Error(`invalid tool name: ${tool.name}`);
    if (!(tool.inputSchema instanceof z.ZodType)) throw new Error(`tool ${tool.name}: inputSchema must be a zod schema`);
    if (this.tools.has(tool.name)) throw new Error(`tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** New registry restricted to `allowed` (sub-agent tool scoping). Fails closed on unknown names. */
  restrict(allowed: readonly string[]): ToolRegistry {
    const out = new ToolRegistry();
    for (const name of allowed) {
      const tool = this.tools.get(name);
      if (tool === undefined) throw new Error(`restrict: unknown tool '${name}'`);
      out.tools.set(name, tool);
    }
    return out;
  }

  /**
   * Model-facing catalog: name, one-line description, args contract shape, and
   * the capability-identity plane (R2-09): risk class, content trust, version
   * and source. Consumers compose capabilities on these attributes instead of
   * implementation-specific knowledge; unknown fields are ignorable for
   * callers built against the older {name, description, args} shape.
   */
  catalog(): Array<{
    name: string;
    description: string;
    args: string;
    riskClass?: 'read' | 'edit' | 'execute' | 'destructive';
    trust?: 'own' | 'external';
    version?: string;
    source?: string;
  }> {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      args: describeShape(t.inputSchema),
      ...(t.riskClass !== undefined ? { riskClass: t.riskClass } : {}),
      ...(t.trust !== undefined ? { trust: t.trust } : {}),
      ...(t.version !== undefined ? { version: t.version } : {}),
      ...(t.source !== undefined ? { source: t.source } : {}),
    }));
  }
}

/** Validate tool args against the tool schema; failure message is model-readable (fed back verbatim). */
export const validateToolArgs = (tool: AgentTool, args: unknown): { ok: true; value: unknown } | { ok: false; message: string } => {
  const parsed = tool.inputSchema.safeParse(args);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    message: `invalid arguments for tool '${tool.name}': ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).slice(0, 5).join('; ')}`,
  };
};
