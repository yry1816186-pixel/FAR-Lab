import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps } from '../src/agent/loop.js';
import { ToolRegistry, type AgentTool } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import { openRolloutWriter, readRollout, reconstructSession } from '../src/agent/rollout.js';
import type { StubStep } from '../src/providers/test-stub.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';

const echoTool: AgentTool = {
  name: 'echo',
  description: 'echo text back',
  inputSchema: z.object({ text: z.string() }),
  async execute(args) { return { ok: true, data: { echo: (args as { text: string }).text } }; },
};

const dir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'far-resume-'));

const depsWith = (steps: StubStep[], rolloutDir: string, sessionId: string): AgentLoopDeps => ({
  provider: createTestStubProvider(steps),
  tools: new ToolRegistry().register(echoTool),
  permissions: new PermissionEngine({ rules: [{ effect: 'allow' }] }),
  sessionId,
  purpose: 't:loop',
  emit: () => {},
  recordReceipt: () => {},
  telemetry: new SessionTelemetry(),
  rollout: openRolloutWriter(rolloutDir, sessionId),
});

const cfgBase = (over: Partial<AgentLoopConfig> = {}): AgentLoopConfig => ({
  capability: 'resume-test',
  systemPrompt: 's',
  task: 'do the thing',
  maxTurns: 3,
  resultSchema: z.object({ answer: z.string().min(1) }),
  ...over,
});

const useTool = (text: string): string => JSON.stringify({ action: 'use_tool', tool: 'echo', args: { text }, reason: 'r' });
const finish = (): string => JSON.stringify({ action: 'finish', reason: 'done', result: { answer: 'ok' } });

describe('loop crash + resume (H6)', () => {
  it('a crash mid-session (provider throws) leaves a resumable rollout; the resumed loop continues and completes', async () => {
    const d = dir();
    const sid = 'ags_crash00000000000000000000aaa';
    // Turn 1 succeeds (echo), turn 2 crashes hard: the stub is exhausted and THROWS,
    // simulating process death — the loop never writes turn-2 lines or a session_end.
    const crashed = depsWith([{ rawOutput: useTool('first') }], d, sid);
    await expect(runAgentLoop(cfgBase(), crashed)).rejects.toThrow(/script exhausted/);

    const { lines, malformed } = readRollout(crashed.rollout!.file);
    expect(malformed).toBe(0);
    expect(lines.some((l) => l.type === 'session_end')).toBe(false);
    const rec = reconstructSession(lines);
    expect(rec.openTurn).toBeUndefined(); // turn 1 fully resolved
    expect(rec.turns.map((t) => t.turn)).toEqual([1]);

    // Resume: same session id, fresh provider finishes; turn numbering continues at 2.
    const resumed = depsWith([{ rawOutput: finish() }], d, sid);
    const res = await runAgentLoop(
      cfgBase({ initialTranscript: rec.transcript, resume: { priorTurns: 1 } }),
      resumed,
    );
    expect(res.status).toBe('completed');
    // the resumed SEGMENT records its own turn 2 (the finish); prior turns merge at the capability layer
    expect(res.turns.map((t) => t.turn)).toEqual([2]);
    // the persisted transcript carries the pre-crash tool result into the resumed session
    expect(res.transcript.some((e) => e.kind === 'tool_result' && (e.payload as { echo?: string }).echo === 'first')).toBe(true);
    const after = readRollout(resumed.rollout!.file);
    expect(after.lines.some((l) => l.type === 'resumed')).toBe(true);
    expect(after.lines.some((l) => l.type === 'session_end')).toBe(true);
  });

  it('orphaned tool_use repair: an interrupted turn gets an honest synthesized tool_result (Claude Code pattern)', async () => {
    const d = dir();
    const sid = 'ags_orphan0000000000000000000aaa';
    // Craft the crash state directly: action written, execution STARTED, no result/finished.
    const w = openRolloutWriter(d, sid);
    w.append({ type: 'session_meta', at: '2026-08-22T00:00:00Z', sessionId: sid, capability: 'resume-test', purpose: 't:loop', task: 'do the thing', maxTurns: 3 });
    w.append({ type: 'transcript_item', at: 't1', entry: { kind: 'task', text: 'do the thing' } });
    w.append({ type: 'transcript_item', at: 't2', entry: { kind: 'action', turn: 1, action: 'use_tool', tool: 'echo', args: { text: 'x' }, reason: 'r' } });
    w.append({ type: 'tool_lifecycle', at: 't3', turn: 1, tool: 'echo', phase: 'started' });

    const rec = reconstructSession(readRollout(w.file).lines);
    expect(rec.openTurn).toEqual({ turn: 1, tool: 'echo', disposition: 'tool_outcome_unknown' });

    const resumed = depsWith([{ rawOutput: finish() }], d, sid);
    const res = await runAgentLoop(
      cfgBase({ initialTranscript: rec.transcript, resume: { priorTurns: 1, openTurn: rec.openTurn } }),
      resumed,
    );
    expect(res.status).toBe('completed');
    const orphan = res.transcript.find((e) => e.kind === 'tool_result' && (e.payload as { interrupted?: boolean }).interrupted === true);
    expect(orphan).toBeDefined();
    expect((orphan!.kind === 'tool_result' ? orphan!.payload as { disposition?: string } : {}).disposition).toBe('tool_outcome_unknown');
    // the tool itself never re-ran (outcome unknown — surfaced, not blindly retried)
    expect(res.turns.filter((t) => t.action === 'use_tool').length).toBe(0);
  });
});
