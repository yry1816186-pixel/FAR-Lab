import type { ToolResult } from './tool.js';

/**
 * Lifecycle extension bus (H4, pi-style): behavior beyond the kernel is external. Hooks
 * may BLOCK a tool call (reason fed back to the model), REWRITE its args, or TERMINATE
 * the whole loop — the kernel owns no policy of its own.
 */

export interface ToolCallInfo {
  tool: string;
  args: unknown;
  turn: number;
}

export interface BeforeToolCallOutcome {
  /** Human/model-readable refusal reason; the call is not executed. */
  blocked?: string;
  /** Replacement args (last rewrite wins across handlers). */
  args?: unknown;
  /** Hard stop of the entire session with a reason. */
  terminate?: string;
}

export type BeforeToolCallHandler = (call: ToolCallInfo) => BeforeToolCallOutcome | Promise<BeforeToolCallOutcome>;
export type AfterToolCallHandler = (call: ToolCallInfo, result: ToolResult) => void | Promise<void>;
export interface TurnEndInfo { turn: number; action: 'use_tool' | 'finish' | 'invalid_action'; finished: boolean }
export type TurnEndHandler = (info: TurnEndInfo) => void | Promise<void>;

export class ExtensionBus {
  private readonly before: BeforeToolCallHandler[] = [];
  private readonly after: AfterToolCallHandler[] = [];
  private readonly turnEnds: TurnEndHandler[] = [];

  onBeforeToolCall(handler: BeforeToolCallHandler): () => void {
    this.before.push(handler);
    return () => { this.before.splice(this.before.indexOf(handler), 1); };
  }

  onAfterToolCall(handler: AfterToolCallHandler): () => void {
    this.after.push(handler);
    return () => { this.after.splice(this.after.indexOf(handler), 1); };
  }

  onTurnEnd(handler: TurnEndHandler): () => void {
    this.turnEnds.push(handler);
    return () => { this.turnEnds.splice(this.turnEnds.indexOf(handler), 1); };
  }

  /** Aggregation: first block wins, last args-rewrite wins, terminate is sticky. */
  async beforeToolCall(call: ToolCallInfo): Promise<BeforeToolCallOutcome> {
    let blocked: string | undefined;
    let terminate: string | undefined;
    let args: unknown;
    for (const handler of [...this.before]) {
      const out = await handler(args === undefined ? call : { ...call, args });
      if (out.blocked !== undefined && blocked === undefined) blocked = out.blocked;
      if (out.args !== undefined) args = out.args;
      if (out.terminate !== undefined && terminate === undefined) terminate = out.terminate;
    }
    return { ...(blocked !== undefined ? { blocked } : {}), ...(args !== undefined ? { args } : {}), ...(terminate !== undefined ? { terminate } : {}) };
  }

  async afterToolCall(call: ToolCallInfo, result: ToolResult): Promise<void> {
    for (const handler of [...this.after]) await handler(call, result);
  }

  async turnEnd(info: TurnEndInfo): Promise<void> {
    for (const handler of [...this.turnEnds]) await handler(info);
  }
}
