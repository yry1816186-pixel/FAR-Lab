import fs from 'node:fs';
import path from 'node:path';
import type { AgentTurnRecord } from '../domain/agent.js';
import type { TranscriptEntry } from './protocol.js';

/**
 * Session rollout persistence — append-only JSONL per agent session.
 * Wire format and reconstruction semantics ported from openai/codex
 * (codex-rs/history + rollout crates, Apache-2.0): tagged lines, a `compacted`
 * line acts as the new-history baseline and only its suffix is replayed forward;
 * a torn tail from a crash is dropped on read instead of aborting.
 * The open-turn crash classification follows deepseek-ai/deepseek-harness
 * `session/repair.ts` (MIT): distinguish "tool never started" (safe to re-run)
 * from "outcome unknown" (side effects possible — surface, never silently retry),
 * plus Claude Code's orphaned tool_use completion (design-level): the resumed
 * loop synthesizes the missing tool_result so the transcript stays model-valid.
 */

export type RolloutLine =
  | { type: 'session_meta'; at: string; sessionId: string; runId?: string; capability: string; purpose: string; task: string; maxTurns: number; parentSessionId?: string }
  | { type: 'resumed'; at: string; priorTurns: number; disposition?: string }
  | { type: 'transcript_item'; at: string; entry: TranscriptEntry }
  | { type: 'tool_lifecycle'; at: string; turn: number; tool: string; phase: 'started' | 'finished' }
  /** Durable effect ledger: survives transcript compaction and seeds resume deduplication. */
  | { type: 'effect_committed'; at: string; entry: Extract<TranscriptEntry, { kind: 'tool_result' }> }
  | { type: 'compacted'; at: string; summary: string; keptEntries?: TranscriptEntry[] }
  | { type: 'turn_record'; at: string; record: AgentTurnRecord }
  | { type: 'session_end'; at: string; status: string };

export interface RolloutWriter {
  readonly file: string;
  append(line: RolloutLine): void;
}

export const rolloutFile = (dir: string, sessionId: string): string => path.join(dir, `${sessionId}.jsonl`);

/** Append-only writer. Lines are small and bursts are short — sync append keeps ordering trivially correct. */
export const openRolloutWriter = (dir: string, sessionId: string): RolloutWriter => {
  fs.mkdirSync(dir, { recursive: true });
  const file = rolloutFile(dir, sessionId);
  return {
    file,
    append: (line) => { fs.appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8'); },
  };
};

export interface RolloutReadResult {
  lines: RolloutLine[];
  /** Counted, never fatal: a torn tail line from a crash is skipped (Codex scanner semantics). */
  malformed: number;
}

export const readRollout = (file: string): RolloutReadResult => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { lines: [], malformed: 0 };
  }
  const lines: RolloutLine[] = [];
  let malformed = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim().length === 0) continue;
    try {
      lines.push(JSON.parse(raw) as RolloutLine);
    } catch {
      malformed += 1;
    }
  }
  return { lines, malformed };
};

export type InterruptedTurnDisposition = 'tool_not_started' | 'tool_outcome_unknown';

export interface ReconstructedSession {
  meta?: Extract<RolloutLine, { type: 'session_meta' }>;
  ended?: Extract<RolloutLine, { type: 'session_end' }>;
  transcript: TranscriptEntry[];
  turns: AgentTurnRecord[];
  /** Successful effect results retained independently of the compacted model transcript. */
  committedEffects: Array<Extract<TranscriptEntry, { kind: 'tool_result' }>>;
  /** Present when the rollout ends mid-turn with an executed-but-unresolved tool call. */
  openTurn?: { turn: number; tool: string; disposition: InterruptedTurnDisposition };
}

export const reconstructSession = (lines: readonly RolloutLine[]): ReconstructedSession => {
  const meta = lines.find((l): l is Extract<RolloutLine, { type: 'session_meta' }> => l.type === 'session_meta');
  const ended = lines.findLast((l): l is Extract<RolloutLine, { type: 'session_end' }> => l.type === 'session_end');

  // Codex resume semantics: newest→oldest scan finds the Compacted baseline; replay its suffix forward.
  const items = lines.filter((l) => l.type === 'transcript_item' || l.type === 'compacted');
  const lastCompactedIdx = items.findLastIndex((l) => l.type === 'compacted');
  const transcript: TranscriptEntry[] = [];
  if (lastCompactedIdx >= 0) {
    const baseline = items[lastCompactedIdx] as Extract<RolloutLine, { type: 'compacted' }>;
    transcript.push({ kind: 'task', text: meta?.task ?? '' });
    if (baseline.summary.length > 0) transcript.push({ kind: 'handoff', summary: baseline.summary });
    transcript.push(...(baseline.keptEntries ?? []));
    for (const l of items.slice(lastCompactedIdx + 1)) {
      if (l.type === 'transcript_item') transcript.push(l.entry);
    }
  } else {
    for (const l of items) {
      if (l.type === 'transcript_item') transcript.push(l.entry);
    }
  }

  const turns = lines.filter((l): l is Extract<RolloutLine, { type: 'turn_record' }> => l.type === 'turn_record').map((l) => l.record);

  const effectsByHash = new Map<string, Extract<TranscriptEntry, { kind: 'tool_result' }>>();
  for (const line of lines) {
    if (line.type !== 'effect_committed') continue;
    const entry = line.entry;
    if (entry.ok && entry.actionHash !== undefined && !effectsByHash.has(entry.actionHash)) {
      effectsByHash.set(entry.actionHash, entry);
    }
  }
  // Compatibility for rollouts written after action hashes existed but before the
  // dedicated effect line: a still-live transcript result remains usable.
  for (const entry of transcript) {
    if (entry.kind === 'tool_result' && entry.ok && entry.actionHash !== undefined && !effectsByHash.has(entry.actionHash)) {
      effectsByHash.set(entry.actionHash, entry);
    }
  }
  const committedEffects = [...effectsByHash.values()];

  // dsh interruptedTurnClosers: an action(use_tool) with no tool_result after it is an open turn.
  // With the write order tool_lifecycle(started) → [execute] → transcript_item(tool_result) →
  // tool_lifecycle(finished): started-without-finished means the process died DURING execution
  // (outcome unknown); no started marker means the tool never began (safe to re-run).
  let openTurn: ReconstructedSession['openTurn'];
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const e = transcript[i]!;
    if (e.kind !== 'action' || e.action !== 'use_tool' || e.tool === undefined) continue;
    const hasResult = transcript.slice(i + 1).some((r) => r.kind === 'tool_result' && r.turn === e.turn);
    if (hasResult) break; // last tool action resolved — no open turn
    const started = lines.some((l) => l.type === 'tool_lifecycle' && l.turn === e.turn && l.tool === e.tool && l.phase === 'started');
    const finished = lines.some((l) => l.type === 'tool_lifecycle' && l.turn === e.turn && l.tool === e.tool && l.phase === 'finished');
    openTurn = {
      turn: e.turn,
      tool: e.tool,
      disposition: started && !finished ? 'tool_outcome_unknown' : 'tool_not_started',
    };
    break;
  }

  return { meta, ended, transcript, turns, committedEffects, ...(openTurn !== undefined ? { openTurn } : {}) };
};
