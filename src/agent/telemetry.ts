import type { AgentTelemetrySummary, TokenUsage } from '../domain/agent.js';

/**
 * Session telemetry (H5): real counts measured in-process — turns, model calls (from
 * receipts), tool calls, asks, compactions, wall time. No token numbers are invented:
 * usage stays undefined unless the provider reported it.
 */
export class SessionTelemetry {
  private readonly startedAtMs: number;
  private turns = 0;
  private modelCalls = 0;
  private toolCalls = 0;
  private failedToolCalls = 0;
  private permissionAsks = 0;
  private compactions = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private sawUsage = false;

  constructor(now: () => number = () => Date.now()) {
    this.startedAtMs = now();
    this.now = now;
  }

  private readonly now: () => number;

  recordTurn(): void { this.turns += 1; }
  recordModelCall(usage: TokenUsage | undefined): void {
    this.modelCalls += 1;
    if (usage === undefined) return;
    this.sawUsage = true;
    this.promptTokens += usage.promptTokens ?? 0;
    this.completionTokens += usage.completionTokens ?? 0;
  }
  recordToolCall(ok: boolean): void {
    this.toolCalls += 1;
    if (!ok) this.failedToolCalls += 1;
  }
  recordAsk(): void { this.permissionAsks += 1; }
  recordCompaction(): void { this.compactions += 1; }

  summary(): AgentTelemetrySummary {
    return {
      turns: this.turns,
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      failedToolCalls: this.failedToolCalls,
      permissionAsks: this.permissionAsks,
      compactions: this.compactions,
      ...(this.sawUsage ? { promptTokens: this.promptTokens, completionTokens: this.completionTokens } : {}),
      wallMs: Math.max(0, this.now() - this.startedAtMs),
    };
  }
}
