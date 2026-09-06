import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps, type AgentLoopResult } from './loop.js';
import { SessionTelemetry } from './telemetry.js';

/**
 * Canonical runtime entry point for every long-lived agent session.
 *
 * Conversation, kernel capabilities, refiners and sub-agents may add their
 * own event/receipt policy, but they must share the same loop implementation
 * and telemetry lifecycle. Keeping this seam small makes it possible to add
 * cross-runtime controls (global cancellation, quotas, tracing) once without
 * creating a second agent executor.
 */
export type UnifiedAgentLoopDeps = Omit<AgentLoopDeps, 'telemetry'> & {
  telemetry?: SessionTelemetry;
};

export interface UnifiedAgentLoopResult extends AgentLoopResult {
  telemetry: SessionTelemetry;
}

export async function runUnifiedAgentLoop(
  config: AgentLoopConfig,
  deps: UnifiedAgentLoopDeps,
): Promise<UnifiedAgentLoopResult> {
  const telemetry = deps.telemetry ?? new SessionTelemetry();
  const result = await runAgentLoop(config, { ...deps, telemetry });
  return { ...result, telemetry };
}
