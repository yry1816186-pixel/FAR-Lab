import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { microcompact, compactedTranscript, transcriptTokens, headTrim } from '../src/agent/compaction.js';
import { ToolRegistry } from '../src/agent/tool.js';
import { defaultBudget, estimateTokens } from '../src/agent/budget.js';
import type { TranscriptEntry } from '../src/agent/protocol.js';

const toolResult = (turn: number, payload: unknown): TranscriptEntry =>
  ({ kind: 'tool_result', turn, tool: 'search', ok: true, payload });

describe('compaction (layered, by cost)', () => {
  it('microcompact keeps the last N tool results verbatim and summarizes older ones via the tool', () => {
    const tools = new ToolRegistry().register({
      name: 'search',
      description: 'search',
      inputSchema: z.object({}),
      summarize: (payload) => `summary of ${(payload as { q: string }).q}`,
      async execute() { return { ok: true }; },
    });
    const entries: TranscriptEntry[] = [
      { kind: 'task', text: 'objective' },
      { kind: 'context', label: 'hypotheses', payload: { h: 1 } },
      toolResult(1, { q: 'a', rows: 'x'.repeat(200) }),
      toolResult(2, { q: 'b', rows: 'x'.repeat(200) }),
      toolResult(3, { q: 'c', rows: 'x'.repeat(200) }),
      { kind: 'steer', text: 'focus' },
      toolResult(4, { q: 'd', rows: 'x'.repeat(200) }),
    ];
    const out = microcompact(entries, tools, 2);
    const byTurn = new Map(out.filter((e): e is Extract<TranscriptEntry, { kind: 'tool_result' }> => e.kind === 'tool_result').map((e) => [e.turn, e]));
    expect(byTurn.get(1)!.truncated).toBe(true);
    expect(byTurn.get(1)!.payload).toBe('summary of a');
    expect(byTurn.get(2)!.truncated).toBe(true);
    expect(byTurn.get(2)!.payload).toBe('summary of b');
    expect(byTurn.get(3)!.truncated).toBeUndefined(); // inside keep window: untouched
    expect(byTurn.get(4)!.truncated).toBeUndefined();
    // objective and injected evidence are never compacted
    expect(out[0]).toEqual({ kind: 'task', text: 'objective' });
    expect(out.some((e) => e.kind === 'context')).toBe(true);
    expect(out.some((e) => e.kind === 'steer')).toBe(true);
  });

  it('falls back to a head-trimmed stub when the tool offers no summarize()', () => {
    const tools = new ToolRegistry().register({
      name: 'search', description: 'd', inputSchema: z.object({}), async execute() { return { ok: true }; },
    });
    const entries = [toolResult(1, { q: 'a', rows: 'x'.repeat(2_000) }), toolResult(2, { q: 'b' })];
    const out = microcompact(entries, tools, 1);
    const first = out.find((e): e is Extract<TranscriptEntry, { kind: 'tool_result' }> => e.kind === 'tool_result' && e.turn === 1)!;
    expect(first.truncated).toBe(true);
    const payload = first.payload as { truncated: boolean; head: string; originalChars: number };
    expect(payload.truncated).toBe(true);
    expect(payload.head.length).toBe(400);
    expect(payload.originalChars).toBeGreaterThan(400);
  });

  it('microcompact is a no-op when within the keep window', () => {
    const tools = new ToolRegistry().register({ name: 'search', description: 'd', inputSchema: z.object({}), async execute() { return { ok: true }; } });
    const entries = [toolResult(1, { q: 'a' }), toolResult(2, { q: 'b' })];
    expect(microcompact(entries, tools, 4)).toEqual(entries);
  });

  it('a full handoff transcript = task + handoff summary + last entries verbatim', () => {
    const entries: TranscriptEntry[] = [
      { kind: 'task', text: 'objective' },
      { kind: 'context', label: 'ctx', payload: { a: 1 } },
      toolResult(1, { q: 'old' }),
      toolResult(2, { q: 'recent' }),
      toolResult(3, { q: 'newest' }),
    ];
    const out = compactedTranscript(entries, 'objective', 'handoff text', 2);
    expect(out[0]).toEqual({ kind: 'task', text: 'objective' });
    expect(out[1]).toEqual({ kind: 'handoff', summary: 'handoff text' });
    expect(out.slice(2)).toEqual(entries.slice(-2));
  });

  it('token estimates are monotone in content and the default budget reserves headroom', () => {
    expect(estimateTokens({ a: 'x'.repeat(400) })).toBeGreaterThan(estimateTokens({ a: 'x' }));
    expect(transcriptTokens([{ kind: 'task', text: 'hello world' }])).toBeGreaterThan(0);
    const b = defaultBudget(128_000);
    expect(b.transcriptSoft).toBeLessThan(b.transcriptHard);
    expect(b.transcriptHard).toBeLessThan(128_000 * 0.3);
  });

  it('headTrim preserves small payloads and reports true sizes for large ones', () => {
    expect(headTrim({ a: 1 }, 100)).toEqual({ preserved: true });
    const trimmed = headTrim({ a: 'x'.repeat(1_000) }, 100);
    expect(trimmed.truncated).toBe(true);
    expect(trimmed.originalChars).toBeGreaterThan(1_000);
  });
});
