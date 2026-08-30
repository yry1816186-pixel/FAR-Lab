import { newId } from '../domain/ids.js';
import type { AgentTelemetrySummary, AgentTurnRecord } from '../domain/agent.js';
import { mapBounded } from '../pipeline/stages/shared.js';
import { SessionTelemetry } from './telemetry.js';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps, type AgentLoopResult } from './loop.js';
import type { TranscriptEntry } from './protocol.js';
import type { RunBudgetView } from '../app/run-budget.js';

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
  /** Optional child-local token ceiling; a finite parent budget may lower it further. */
  tokenBudget?: number;
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

/**
 * Child-local reservation layered over the receipt-derived parent budget.
 *
 * The parent remains the single spend authority: every completed child model call
 * forwards its usage to `parent.spend`. The local counter only prevents one sibling
 * from consuming another sibling's reservation during a concurrent fan-out.
 */
const reservedBudget = (parent: RunBudgetView | undefined, cap: number): RunBudgetView => {
  let spent = 0;
  return {
    cap,
    get spent() { return spent; },
    remaining: () => {
      const local = Math.max(0, cap - spent);
      const parentRemaining = parent?.remaining() ?? null;
      return parentRemaining === null ? local : Math.min(local, parentRemaining);
    },
    hasRemaining: () => spent < cap && (parent?.hasRemaining() ?? true),
    spend: (totalTokens) => {
      if (totalTokens === undefined || totalTokens <= 0) return;
      spent += totalTokens;
      parent?.spend(totalTokens);
    },
    nearLimit: () => spent >= cap * 0.8 || (parent?.nearLimit() ?? false),
  };
};

/**
 * Deterministically split the parent's currently remaining finite budget across
 * children before fan-out. Remainders go to earlier specs in declared order. An
 * explicit child ceiling can only reduce its share, never borrow a sibling's.
 */
export const splitSubagentBudgets = (
  parent: RunBudgetView | undefined,
  specs: readonly SubagentSpec[],
): Array<RunBudgetView | undefined> => {
  if (specs.length === 0) return [];
  const parentRemaining = parent?.remaining() ?? null;
  if (parentRemaining === null) {
    return specs.map((spec) => spec.tokenBudget === undefined
      ? parent
      : reservedBudget(parent, Math.max(0, Math.floor(spec.tokenBudget))));
  }

  const total = Math.max(0, Math.floor(parentRemaining));
  const base = Math.floor(total / specs.length);
  const remainder = total % specs.length;
  return specs.map((spec, index) => {
    const equalShare = base + (index < remainder ? 1 : 0);
    const requested = spec.tokenBudget === undefined ? equalShare : Math.max(0, Math.floor(spec.tokenBudget));
    return reservedBudget(parent, Math.min(equalShare, requested));
  });
};

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
  const childBudgets = splitSubagentBudgets(deps.budget, specs);
  return mapBounded(specs.map((spec, index) => ({ spec, budget: childBudgets[index] })), maxConcurrent, async ({ spec, budget }): Promise<SubagentResult> => {
    const telemetry = new SessionTelemetry();
    const childDeps: AgentLoopDeps = {
      ...deps,
      sessionId: newId('ags'),
      parentSessionId: deps.sessionId,
      purpose: `${deps.purpose}:sub:${spec.label}`,
      depth: parentDepth + 1,
      telemetry,
      tools: spec.toolNames !== undefined ? deps.tools.restrict(spec.toolNames) : deps.tools,
      ...(budget !== undefined ? { budget } : {}),
    };
    if (deps.rolloutFactory !== undefined) childDeps.rollout = deps.rolloutFactory(childDeps.sessionId);
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
