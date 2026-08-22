import type { ToolRegistry } from './tool.js';
import { estimateTokens } from './budget.js';
import type { TranscriptEntry } from './protocol.js';

/**
 * Layered compaction (H2, Claude Code 3-layer by cost):
 *   1. microcompact — deterministic, zero LLM cost: old tool payloads replaced by the
 *      tool's own summarize() (pre-extracted summary) or a head-trimmed stub
 *   2. full handoff — one LLM call producing a successor-facing summary (objective,
 *      work done, decisions, remaining); the LLM call itself lives in the loop
 */

export const transcriptTokens = (entries: readonly TranscriptEntry[]): number =>
  entries.reduce((sum, e) => sum + estimateTokens(e), 0);

/** Serialize a payload; oversized ones become a head stub with the true size recorded. */
export const headTrim = (payload: unknown, maxChars: number): Record<string, unknown> => {
  let text: string;
  try {
    text = JSON.stringify(payload) ?? 'null';
  } catch {
    text = String(payload);
  }
  if (text.length <= maxChars) return { preserved: true };
  return { truncated: true, head: text.slice(0, maxChars), originalChars: text.length };
};

type ToolResultEntry = Extract<TranscriptEntry, { kind: 'tool_result' }>;

/**
 * Deterministic microcompaction: tool_result payloads strictly older than the last
 * `keepLast` tool results are compacted. task/context/steer/handoff entries are never
 * touched — they are the objective and the injected evidence, not the noise.
 */
export const microcompact = (entries: readonly TranscriptEntry[], tools: ToolRegistry, keepLast: number): TranscriptEntry[] => {
  const toolResults = entries.filter((e): e is ToolResultEntry => e.kind === 'tool_result');
  if (toolResults.length <= keepLast) return [...entries];
  const cutoffTurn = toolResults[toolResults.length - keepLast]!.turn;
  return entries.map((e) => {
    if (e.kind !== 'tool_result' || e.turn >= cutoffTurn || e.truncated) return e;
    const summarize = tools.get(e.tool)?.summarize;
    const payload = summarize !== undefined ? summarize(e.payload) : headTrim(e.payload, 400);
    return { ...e, payload, truncated: true };
  });
};

/** Transcript after a full handoff: objective + summary + the most recent `keepLast` entries verbatim. */
export const compactedTranscript = (
  entries: readonly TranscriptEntry[],
  task: string,
  handoffSummary: string,
  keepLast: number,
): TranscriptEntry[] => [
  { kind: 'task', text: task },
  { kind: 'handoff', summary: handoffSummary },
  ...entries.slice(-keepLast),
];

/** Prompt for the handoff summarizer — written for a SUCCESSOR LLM that never saw this session. */
export const HANDOFF_PROMPT = `You are writing a handoff summary for another AI agent that takes over this research session mid-flight and has seen NOTHING of it. Compress the transcript into: (1) the objective, (2) work completed and what the tools actually returned (keep concrete identifiers, titles and numbers), (3) decisions made and why, (4) open questions and remaining work. Never invent facts absent from the transcript. Reply as {"summary": "<compact handoff>"}.`;
