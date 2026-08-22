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

/**
 * Per-source token accounting (Claude Code /context discipline): where the
 * estimated transcript budget actually goes. Estimates only — surfaced for
 * observability, never billed as exact token counts.
 */
export const SOURCE_KEYS = ['task', 'context', 'actions', 'toolResults', 'steer', 'handoff'] as const;
export type TranscriptSource = (typeof SOURCE_KEYS)[number];

export const transcriptTokensBySource = (entries: readonly TranscriptEntry[]): Record<TranscriptSource, number> => {
  const out: Record<TranscriptSource, number> = { task: 0, context: 0, actions: 0, toolResults: 0, steer: 0, handoff: 0 };
  for (const e of entries) {
    const n = estimateTokens(e);
    if (e.kind === 'task') out.task += n;
    else if (e.kind === 'context') out.context += n;
    else if (e.kind === 'action') out.actions += n;
    else if (e.kind === 'tool_result') out.toolResults += n;
    else if (e.kind === 'steer') out.steer += n;
    else out.handoff += n;
  }
  return out;
};

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

/**
 * Prompt for the handoff summarizer — structure ported from openai/codex
 * prompts/templates/compact/{prompt.md, summary_prefix.md} (Apache-2.0): a
 * successor-facing four-point handoff that explicitly says NOT to redo work.
 */
export const HANDOFF_PROMPT = `Another AI agent already worked on this task for a while and you are taking over mid-flight. Summarize its transcript so far as a handoff for the next agent, which cannot see the conversation. The summary must cover, in this order:
1. Objective and work completed so far (with concrete results and tool outputs — keep identifiers, titles, numbers).
2. Decisions made and their reasons.
3. Remaining work and open questions.
4. Key data references (ids, query texts, source titles) the successor will need.
Do not redo work already described. Be concise and structured. Never invent facts absent from the transcript. Reply as {"summary": "<handoff text>"}.`;
