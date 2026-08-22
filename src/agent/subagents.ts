import { newId } from '../domain/ids.js';
import type { AgentTelemetrySummary, AgentTurnRecord } from '../domain/agent.js';
import { mapBounded } from '../pipeline/stages/shared.js';
import { SessionTelemetry } from './telemetry.js';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps, type AgentLoopResult } from './loop.js';
import type { TranscriptEntry } from './protocol.js';

/**
 * Parallel sub-agent fan-out (H3, Codex agent discipline): each child is an ISOLATED loop
 * (own session, transcript, budget, telemetry) sharing the provider and permission
 * engine. Depth is capped and enforced fail-closed — children cannot express further
 * spawns because they own no spawn tool; capability-level nesting hits the guard here.
 */

export interface SubagentSpec {
  /** Stable label used in purpose strings and result correlation (e.g. 'pro: hyp_1'). */
  label: string;
  task: string;
  contextEntries?: Array<{ label: string; payload: unknown }>;
  /** Restrict the child to these tools (fail-closed on unknown names). */
  toolNames?: string[];
  maxTurns?: number;
}

export interface SubagentResult {
  label: string;
  sessionId: string;
  status: AgentLoopResult['status'];
  result?: Record<string, unknown>;
  error?: string;
  turns: AgentTurnRecord[];
  transcript: TranscriptEntry[];
  telemetry: AgentTelemetrySummary;
}

export interface SubagentOptions {
  maxConcurrent?: number;
  /** Highest allowed child depth (default 1: children of children are refused). */
  maxDepth?: number;
}

export const runSubagents = async (
  cfg: AgentLoopConfig,
  deps: AgentLoopDeps,
  specs: readonly SubagentSpec[],
  opts: SubagentOptions = {},
): Promise<SubagentResult[]> => {
  const parentDepth = deps.depth ?? 0;
  const maxDepth = opts.maxDepth ?? 1;
  if (parentDepth + 1 > maxDepth) {
    throw new Error(`runSubagents: spawning at depth ${parentDepth + 1} exceeds maxDepth ${maxDepth} (fail-closed)`);
  }
  const maxConcurrent = opts.maxConcurrent ?? 3;
  return mapBounded(specs, maxConcurrent, async (spec): Promise<SubagentResult> => {
    const telemetry = new SessionTelemetry();
    const childDeps: AgentLoopDeps = {
      ...deps,
      sessionId: newId('ags'),
      parentSessionId: deps.sessionId,
      purpose: `${deps.purpose}:sub:${spec.label}`,
      depth: parentDepth + 1,
      telemetry,
      tools: spec.toolNames !== undefined ? deps.tools.restrict(spec.toolNames) : deps.tools,
    };
    const res = await runAgentLoop(
      {
        ...cfg,
        task: spec.task,
        contextEntries: spec.contextEntries ?? cfg.contextEntries,
        maxTurns: spec.maxTurns ?? cfg.maxTurns,
      },
      childDeps,
    );
    return {
      label: spec.label,
      sessionId: childDeps.sessionId,
      status: res.status,
      result: res.result,
      error: res.error,
      turns: res.turns,
      transcript: res.transcript,
      telemetry: telemetry.summary(),
    };
  });
};
