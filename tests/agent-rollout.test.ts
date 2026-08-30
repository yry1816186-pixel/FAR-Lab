import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openRolloutWriter, readRollout, reconstructSession, rolloutFile } from '../src/agent/rollout.js';

const DIR = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-rollout-'));

describe('session rollout (Codex JSONL format, TS port)', () => {
  it('round-trips appended lines verbatim', () => {
    const dir = DIR();
    const w = openRolloutWriter(dir, 'ags_roundtrip00000000000000aaaa');
    w.append({ type: 'session_meta', at: '2026-08-22T00:00:00Z', sessionId: 'ags_roundtrip00000000000000aaaa', capability: 'c', purpose: 'p', task: 't', maxTurns: 4 });
    w.append({ type: 'transcript_item', at: '2026-08-22T00:00:01Z', entry: { kind: 'task', text: 'objective' } });
    w.append({ type: 'tool_lifecycle', at: '2026-08-22T00:00:02Z', turn: 1, tool: 'echo', phase: 'started' });
    w.append({ type: 'session_end', at: '2026-08-22T00:00:03Z', status: 'completed' });
    const { lines, malformed } = readRollout(w.file);
    expect(malformed).toBe(0);
    expect(lines.map((l) => l.type)).toEqual(['session_meta', 'transcript_item', 'tool_lifecycle', 'session_end']);
  });

  it('drops a torn tail line from a crash without failing the read (Codex scanner semantics)', () => {
    const dir = DIR();
    const file = rolloutFile(dir, 'ags_torn0000000000000000000aaaa');
    fs.writeFileSync(file, `${JSON.stringify({ type: 'session_end', at: 't', status: 'failed' })}\n{"type":"transcript_item","at":"t","entr`);
    const { lines, malformed } = readRollout(file);
    expect(lines.length).toBe(1);
    expect(malformed).toBe(1);
  });

  it('missing file reads as empty (fresh start), not an error', () => {
    const { lines, malformed } = readRollout(rolloutFile(DIR(), 'ags_missing0000000000000000aaaa'));
    expect(lines).toEqual([]);
    expect(malformed).toBe(0);
  });

  it('reconstructs forward from the newest compacted baseline (Codex resume semantics)', () => {
    const lines = [
      { type: 'session_meta', at: 't0', sessionId: 'ags_x0000000000000000000000aaaa', capability: 'c', purpose: 'p', task: 'objective', maxTurns: 8 },
      { type: 'transcript_item', at: 't1', entry: { kind: 'task', text: 'objective' } },
      { type: 'transcript_item', at: 't2', entry: { kind: 'tool_result', turn: 1, tool: 'search', ok: true, payload: 'old-irrelevant' } },
      { type: 'compacted', at: 't3', summary: 'handoff summary text' },
      { type: 'transcript_item', at: 't4', entry: { kind: 'action', turn: 3, action: 'use_tool' as const, tool: 'read', reason: 'r' } },
      { type: 'transcript_item', at: 't5', entry: { kind: 'tool_result', turn: 3, tool: 'read', ok: true, payload: 'x' } },
    ] as const;
    const rec = reconstructSession(lines);
    expect(rec.transcript).toEqual([
      { kind: 'task', text: 'objective' },
      { kind: 'handoff', summary: 'handoff summary text' },
      { kind: 'action', turn: 3, action: 'use_tool', tool: 'read', reason: 'r' },
      { kind: 'tool_result', turn: 3, tool: 'read', ok: true, payload: 'x' },
    ]);
    expect(rec.openTurn).toBeUndefined();
  });

  it('persists the compaction keep-window in its baseline, including action hashes', () => {
    const actionHash = 'a'.repeat(64);
    const kept = {
      kind: 'tool_result' as const,
      turn: 2,
      tool: 'write_note',
      ok: true,
      payload: { saved: true },
      actionHash,
    };
    const rec = reconstructSession([
      { type: 'session_meta', at: 't0', sessionId: 'ags_k0000000000000000000000aaaa', capability: 'c', purpose: 'p', task: 'objective', maxTurns: 8 },
      { type: 'transcript_item', at: 't1', entry: { kind: 'task', text: 'objective' } },
      { type: 'compacted', at: 't2', summary: 'handoff with durable keep window', keptEntries: [kept] },
    ]);
    expect(rec.transcript).toEqual([
      { kind: 'task', text: 'objective' },
      { kind: 'handoff', summary: 'handoff with durable keep window' },
      kept,
    ]);
  });

  it('retains committed effects outside the compacted model transcript', () => {
    const committed = {
      kind: 'tool_result' as const,
      turn: 1,
      tool: 'write_note',
      ok: true,
      payload: { saved: true },
      actionHash: 'b'.repeat(64),
    };
    const rec = reconstructSession([
      { type: 'session_meta', at: 't0', sessionId: 'ags_e0000000000000000000000aaaa', capability: 'c', purpose: 'p', task: 'objective', maxTurns: 8 },
      { type: 'transcript_item', at: 't1', entry: { kind: 'task', text: 'objective' } },
      { type: 'effect_committed', at: 't2', entry: committed },
      { type: 'compacted', at: 't3', summary: 'effect completed; continue with verification' },
    ]);
    expect(rec.transcript).toEqual([
      { kind: 'task', text: 'objective' },
      { kind: 'handoff', summary: 'effect completed; continue with verification' },
    ]);
    expect(rec.committedEffects).toEqual([committed]);
  });

  it('classifies an interrupted turn: started-without-finished = outcome unknown; no marker = not started', () => {
    const meta = { type: 'session_meta', at: 't0', sessionId: 'ags_y0000000000000000000000aaaa', capability: 'c', purpose: 'p', task: 'objective', maxTurns: 8 } as const;
    const action = { kind: 'action', turn: 2, action: 'use_tool' as const, tool: 'search', reason: 'r' };

    const unknown = reconstructSession([
      meta,
      { type: 'transcript_item', at: 't1', entry: { kind: 'task', text: 'objective' } },
      { type: 'tool_lifecycle', at: 't2', turn: 2, tool: 'search', phase: 'started' },
      { type: 'transcript_item', at: 't3', entry: action },
    ]);
    expect(unknown.openTurn).toEqual({ turn: 2, tool: 'search', disposition: 'tool_outcome_unknown' });

    const notStarted = reconstructSession([
      meta,
      { type: 'transcript_item', at: 't1', entry: action },
    ]);
    expect(notStarted.openTurn).toEqual({ turn: 2, tool: 'search', disposition: 'tool_not_started' });
  });

  it('a resolved final tool action means no open turn', () => {
    const rec = reconstructSession([
      { type: 'session_meta', at: 't0', sessionId: 'ags_z0000000000000000000000aaaa', capability: 'c', purpose: 'p', task: 'objective', maxTurns: 8 },
      { type: 'transcript_item', at: 't1', entry: { kind: 'action', turn: 1, action: 'use_tool', tool: 'search', reason: 'r' } },
      { type: 'tool_lifecycle', at: 't2', turn: 1, tool: 'search', phase: 'started' },
      { type: 'transcript_item', at: 't3', entry: { kind: 'tool_result', turn: 1, tool: 'search', ok: true, payload: 'x' } },
      { type: 'tool_lifecycle', at: 't4', turn: 1, tool: 'search', phase: 'finished' },
    ]);
    expect(rec.openTurn).toBeUndefined();
  });
});
