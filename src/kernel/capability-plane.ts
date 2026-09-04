import { z } from 'zod';
import type { ModelProvider, ArtifactStore, SourceAdapter } from '../shared/ports.js';
import type { Store } from '../persistence/store.js';
import type { ToolIntegration, SourceFamily } from '../domain/index.js';
import { newId } from '../domain/ids.js';
import { runAgentLoop, type AgentLoopStatus } from '../agent/loop.js';
import { assembleSessionCapabilities } from '../agent/capabilities/assembly.js';
import type { AgentTool } from '../agent/tool.js';
import { SessionTelemetry } from '../agent/telemetry.js';
import { openRolloutWriter } from '../agent/rollout.js';
import { AgentSession, AgentReport } from '../domain/agent.js';
import type { ReceiptSink } from '../agent/protocol.js';
import type { RunBudgetView } from '../app/run-budget.js';
import type { ReasoningStyle, ReasoningGear } from '../domain/model-config.js';
import { resolveKernelCapability, KERNEL_CAPABILITY_NAMES } from './capabilities/registry.js';

/**
 * Ω ADR D5 capability plane: one run-scoped seam through which stages and
 * kernel-authored workflow steps invoke agent-kernel capabilities (tool loop,
 * subagents, MCP, skills) under the SAME budget/receipt/audit governance the
 * pipeline honors. This is what dissolves the two-runtime split (B2): the
 * pipeline no longer needs its own parallel tool loop to act.
 */

export interface KernelAgentRequest {
  /** Registered capability name (src/kernel/capabilities/registry.ts). */
  capability: string;
  task: string;
  /** Result contract; the loop feeds finish payloads failing it back (bounded re-asks). */
  resultSchema: z.ZodType<unknown>;
  systemPrompt?: string;
  maxTurns?: number;
  contextEntries?: Array<{ label: string; payload: unknown }>;
  /** Capability-scoped builtin tools (bound to this run by the registry/caller). */
  builtinTools?: readonly AgentTool[];
  /** Cooperative abort for the session (wire-level cancellation is bound by the caller). */
  signal?: AbortSignal;
}

export interface KernelAgentOutcome {
  ok: boolean;
  result?: Record<string, unknown>;
  /** Fail-visible reason: loop status + error, never swallowed. */
  error?: string;
  status: AgentLoopStatus;
  turns: number;
  sessionId: string;
  reportId: string | null;
  /** Objects the capability materialized into the scientific layer (Ω A4), when > 0. */
  materialized?: number;
}

export interface KernelCapabilityPlane {
  runAgent(req: KernelAgentRequest): Promise<KernelAgentOutcome>;
  /** Registry-driven execution (plan steps call this by capability name). Unknown names fail visibly. */
  runCapability(name: string, opts?: { signal?: AbortSignal }): Promise<KernelAgentOutcome>;
}

export interface RunKernelPlaneDeps {
  provider: ModelProvider;
  store: Store;
  runId: string;
  /** Workspace tool integrations (read-class MCP admission inside the assembly). */
  integrations: ToolIntegration[];
  /** Literature source adapters for capability tools (same adapters the retrieve stage uses). */
  sourceFor: (family: SourceFamily) => SourceAdapter;
  artifacts?: ArtifactStore;
  budget?: RunBudgetView;
  /** Receipts land on the run with stage `agent:<capability>` (StageContext.recordReceipt contract). */
  recordReceipt: ReceiptSink;
  reasoning?: { style: ReasoningStyle; gear: ReasoningGear };
  rolloutDir: string;
}

/**
 * Per-call session assembly: every runAgent call gets its own tool registry,
 * permissions, MCP connections and rollout file, closed in finally. Agent steps
 * are rare, minutes-long operations — connection reuse is not worth lifecycle
 * complexity at this seam yet.
 */
export const createRunKernelPlane = (deps: RunKernelPlaneDeps): KernelCapabilityPlane => ({
  runCapability: async (name, opts) => {
    const spec = resolveKernelCapability(name);
    if (spec === undefined) {
      return {
        ok: false,
        error: `unknown kernel capability '${name}' (registered: ${KERNEL_CAPABILITY_NAMES.join(', ')})`,
        status: 'failed' as AgentLoopStatus,
        turns: 0,
        sessionId: '',
        reportId: null,
      };
    }
    const built = spec.build(deps.store, deps.runId);
    return createRunKernelPlane(deps).runAgent({
      capability: spec.name,
      task: built.task,
      resultSchema: spec.resultSchema,
      ...(spec.systemPrompt !== undefined ? { systemPrompt: spec.systemPrompt } : {}),
      ...(spec.maxTurns !== undefined ? { maxTurns: spec.maxTurns } : {}),
      ...(built.contextEntries.length > 0 ? { contextEntries: built.contextEntries } : {}),
      builtinTools: spec.makeTools(deps),
      ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
    });
  },
  runAgent: async (req) => {
    const sessionId = newId('ags');
    const telemetry = new SessionTelemetry();
    const startedAt = new Date().toISOString();
    const assembly = await assembleSessionCapabilities({
      builtinTools: req.builtinTools ?? [],
      integrations: deps.integrations,
      policy: { capability: req.capability, admittedRiskClasses: ['read'] },
      builtinAdmission: 'read_class_only',
    });
    try {
      const res = await runAgentLoop(
        {
          capability: req.capability,
          systemPrompt: req.systemPrompt ?? `You are the ${req.capability} capability of a scientific research system. Work strictly from tool results; never fabricate sources, numbers or verdicts.`,
          task: req.task,
          resultSchema: req.resultSchema,
          maxTurns: req.maxTurns ?? 8,
          contextEntries: req.contextEntries,
          // Substrate cancel bridge: wire-level abort (this process) AND the persisted
          // cancelRequested flag (external/another-process cancels) both stop the
          // session at turn boundaries — a long agent step must not outlive a user cancel.
          shouldAbort: () => deps.store.getRun(deps.runId)?.cancelRequested === true,
          ...(req.signal !== undefined ? { signal: req.signal } : {}),
        },
        {
          provider: deps.provider,
          tools: assembly.registry,
          permissions: assembly.permissions,
          sessionId,
          purpose: `agent:${req.capability}`,
          emit: () => {},
          recordReceipt: deps.recordReceipt,
          telemetry,
          ...(deps.budget !== undefined ? { budget: deps.budget } : {}),
          ...(deps.reasoning !== undefined ? { reasoning: deps.reasoning } : {}),
          ...(deps.artifacts !== undefined ? { artifacts: deps.artifacts } : {}),
          rollout: openRolloutWriter(deps.rolloutDir, sessionId),
          rolloutFactory: (sid: string) => openRolloutWriter(deps.rolloutDir, sid),
        },
      );
      const status = res.status === 'completed' ? 'completed' : res.status === 'aborted' ? 'cancelled' : 'failed';
      deps.store.putObject('agent_session', AgentSession.parse({
        id: sessionId,
        runId: deps.runId,
        capability: req.capability,
        purpose: `agent:${req.capability}`,
        status,
        startedAt,
        endedAt: new Date().toISOString(),
        task: req.task.slice(0, 2000),
        config: { maxTurns: req.maxTurns ?? 8 },
        turns: res.turns,
        ...(res.error !== undefined ? { lastError: res.error } : {}),
      }));
      let reportId: string | null = null;
      let materialized = 0;
      if (res.status === 'completed' && res.result !== undefined) {
        reportId = newId('agr');
        deps.store.putObject('agent_report', AgentReport.parse({
          id: reportId,
          runId: deps.runId,
          sessionId,
          capability: req.capability,
          createdAt: new Date().toISOString(),
          result: res.result,
          telemetry: telemetry.summary(),
        }));
        // Ω A4: capability-owned materialization into the scientific layer (debate
        // findings → FeedbackSignals). Count is surfaced in the outcome for audit.
        const spec = resolveKernelCapability(req.capability);
        if (spec?.materialize !== undefined) {
          materialized = spec.materialize(deps.store, deps.runId, { id: reportId, sessionId, result: res.result });
        }
      }
      return {
        ok: res.status === 'completed' && res.result !== undefined,
        ...(res.result !== undefined ? { result: res.result } : {}),
        ...(res.status !== 'completed' || res.result === undefined
          ? { error: res.error ?? `agent loop ended with status ${res.status} and no result` }
          : {}),
        status: res.status,
        turns: res.turns.length,
        sessionId,
        reportId,
        ...(materialized > 0 ? { materialized } : {}),
      };
    } finally {
      await assembly.close();
    }
  },
});
