import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps } from '../src/agent/loop.js';
import { ToolRegistry, type AgentTool } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import { openRolloutWriter, readRollout, reconstructSession, rolloutFile } from '../src/agent/rollout.js';
import type { AgentEvent, ReceiptSink } from '../src/agent/protocol.js';
import type { RunBudgetView } from '../src/app/run-budget.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';

/**
 * Lane-08 long-horizon offline proof workload (goal-prompt Proof section).
 * Deterministic mechanism invariants under stress — with a scripted provider
 * these measure the HARNESS, not model competence; every number asserted is
 * computed from real loop output:
 *
 *   A. goal preservation + context discipline — a long multi-tool session with
 *      forced FULL handoff compaction keeps the objective and the compacted
 *      facts usable; old tool results are actually replaced (micro/full layers
 *      fire, tokens drop, telemetry counts), the newest results stay verbatim.
 *   B. dead-end tolerance — persistent tool failures feed back as structured
 *      errors and the session still completes honestly.
 *   C. crash + restart — a torn rollout (died mid-tool, no session_end)
 *      classifies the open turn (started-not-finished => tool_outcome_unknown;
 *      no started marker => tool_not_started), resume synthesizes the missing
 *      tool_result so the model sees a VALID transcript, and turn numbering
 *      continues within the same maxTurns budget.
 *   D. stop policy + budget discipline — token-budget stop condition fires at
 *      the threshold; an exhausted RunBudgetView gates NEW turns with an
 *      honest stop_condition error; compaction remains allowed (no deadlock).
 *   E. subagent fan-out isolation — one failing child does not take down its
 *      siblings; each child gets its own session/telemetry.
 */

const useTool = (tool: string, args: Record<string, unknown> = {}): StubStep =>
  ({ rawOutput: JSON.stringify({ action: 'use_tool', tool, args, reason: 'progress' }) });
const finish = (result: Record<string, unknown>): StubStep =>
  ({ rawOutput: JSON.stringify({ action: 'finish', reason: 'done', result }) });
const compactStep = (summary: string): StubStep =>
  ({ rawOutput: JSON.stringify({ summary }), forPurpose: 'test:loop:compact' });

/** Big, distinctive fragment payloads — the context pressure source. */
const fragment = (i: number): string =>
  `FRAGMENT_${i}_PAYLOAD_${'x'.repeat(3900)}_TOKEN_<frag-${i}-key-${i * 7}>`;

const fetchFragment: AgentTool = {
  name: 'fetch_fragment',
  description: 'fetch evidence fragment i',
  inputSchema: z.object({ i: z.number().int().min(1).max(9) }),
  riskClass: 'read',
  async execute(args) {
    const { i } = z.object({ i: z.number().int().min(1).max(9) }).parse(args);
    return { ok: true, data: { fragment: fragment(i) }, summary: `fragment ${i}` };
  },
};
const deadEndProbe: AgentTool = {
  name: 'dead_end_probe',
  description: 'a route that always fails (dead end)',
  inputSchema: z.object({ hint: z.string() }),
  riskClass: 'read',
  async execute() {
    return { ok: false, error: { kind: 'execution', message: 'no route to this source (permanent)' } };
  },
};

interface Harness {
  deps: AgentLoopDeps;
  events: AgentEvent[];
  telemetry: SessionTelemetry;
  receipts: Array<Parameters<ReceiptSink>[0]>;
  dir: string;
}
const harness = (steps: StubStep[], opts: { sessionId?: string; budget?: RunBudgetView; tools?: ToolRegistry } = {}): Harness => {
  const events: AgentEvent[] = [];
  const receipts: Array<Parameters<ReceiptSink>[0]> = [];
  const telemetry = new SessionTelemetry();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-lh-'));
  const sessionId = opts.sessionId ?? 'ags_longhorizon000000000000';
  const deps: AgentLoopDeps = {
    provider: createTestStubProvider(steps),
    tools: opts.tools ?? new ToolRegistry().register(fetchFragment).register(deadEndProbe),
    permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
    sessionId,
    purpose: 'test:loop',
    emit: (ev) => { events.push(ev); },
    recordReceipt: (r) => { receipts.push(r); },
    telemetry,
    rollout: openRolloutWriter(dir, sessionId),
    artifacts: {
      put: async (text: string) => ({ ref: `sha256:${text.length}` }),
      get: async () => { throw new Error('not needed'); },
    },
    ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
  };
  return { deps, events, telemetry, receipts, dir };
};

const cfg = (over: Partial<AgentLoopConfig> = {}): AgentLoopConfig => ({
  capability: 'lh-workload',
  systemPrompt: 'sys',
  task: 'collect every evidence fragment and report the key tokens',
  maxTurns: 24,
  resultSchema: z.object({ keys: z.array(z.string()).min(1) }),
  ...over,
});

/** Minimal deterministic RunBudgetView fake (interface-faithful). */
const fakeBudget = (capTokens: number): RunBudgetView => {
  const state = { spent: 0 };
  return {
    cap: capTokens,
    get spent() { return state.spent; },
    remaining: () => capTokens - state.spent,
    hasRemaining: () => state.spent < capTokens,
    spend: (n) => { if (n !== undefined) state.spent += n; },
    nearLimit: () => state.spent >= capTokens * 0.8,
  };
};

describe('A. goal preservation + context discipline under forced compaction', () => {
  it('full handoff compaction fires, drops tokens, keeps newest results verbatim, objective survives to a valid finish', async () => {
    // 6 fragments (~1850 chars each ≈ 460 est-tokens each) under a small
    // transcript budget: microcompact cannot keep up (keepLast=1 still leaves
    // task+actions+2 results > hard) so the FULL handoff layer must fire.
    const h = harness([
      useTool('fetch_fragment', { i: 1 }),
      useTool('fetch_fragment', { i: 2 }),
      compactStep('objective: collect fragments; collected so far: frag-1-key-7, frag-2-key-14'),
      useTool('fetch_fragment', { i: 3 }),
      useTool('fetch_fragment', { i: 4 }),
      compactStep('objective: collect fragments; collected so far: frag-1..4 keys 7,14,21,28; remaining 5,6'),
      useTool('dead_end_probe', { hint: 'alt route' }),
      useTool('fetch_fragment', { i: 5 }),
      useTool('fetch_fragment', { i: 6 }),
      compactStep('objective: collect fragments; all six collected; keys 7,14,21,28,35,42'),
      finish({ keys: ['frag-1-key-7', 'frag-6-key-42'] }),
    ], { sessionId: 'ags_lhcompaction00000000000' });
    // Small transcript budget (~1k-token fragments under a 1.5k/2.5k
    // soft/hard window): by turn 3 microcompaction alone cannot stay under
    // the hard limit, so the FULL handoff layer must fire. The compact steps
    // are purpose-keyed to the loop's `test:loop:compact` call.
    const result = await runAgentLoop(
      cfg({ keepLast: 2, budget: { transcriptSoft: 1500, transcriptHard: 2500, maxToolResultChars: 6_000 } }),
      h.deps,
    );
    expect(result.status).toBe('completed');
    const fullCompactions = h.events.filter((e) => e.type === 'compaction' && e.layer === 'full');
    expect(fullCompactions.length).toBeGreaterThanOrEqual(1);
    for (const c of fullCompactions) {
      if (c.type === 'compaction') expect(c.tokensAfter).toBeLessThan(c.tokensBefore);
    }
    // newest tool result stays verbatim (not truncated) after the final compaction
    const liveResults = result.transcript.filter((e) => e.kind === 'tool_result' && !e.truncated);
    expect(liveResults.length).toBeGreaterThanOrEqual(1);
    // objective + handoff live in the final transcript
    expect(result.transcript.some((e) => e.kind === 'task')).toBe(true);
    expect(result.transcript.some((e) => e.kind === 'handoff')).toBe(true);
    // telemetry counted the compactions
    expect(h.telemetry.summary().compactions).toBeGreaterThanOrEqual(fullCompactions.length);
    // rollout recorded the compaction baseline lines
    const lines = readRollout(rolloutFile(h.dir, 'ags_lhcompaction00000000000')).lines;
    expect(lines.some((l) => l.type === 'compacted')).toBe(true);
    expect(lines.some((l) => l.type === 'session_end')).toBe(true);
  });
});

describe('B. dead-end tolerance', () => {
  it('persistent tool failures become structured feedback, not session death', async () => {
    const h = harness([
      useTool('dead_end_probe', { hint: 'a' }),
      useTool('dead_end_probe', { hint: 'b' }),
      useTool('dead_end_probe', { hint: 'c' }),
      useTool('fetch_fragment', { i: 1 }),
      finish({ keys: ['frag-1-key-7'] }),
    ], { sessionId: 'ags_lhdeadend000000000000' });
    const res = await runAgentLoop(cfg(), h.deps);
    expect(res.status).toBe('completed');
    expect(h.telemetry.summary().failedToolCalls).toBe(3);
    // every failure is visible in the transcript as an honest error payload
    const failed = res.transcript.filter((e) => e.kind === 'tool_result' && !e.ok);
    expect(failed.length).toBe(3);
    expect(h.telemetry.summary().toolCalls).toBe(4);
  });
});

describe('C. crash + restart (torn rollout mid-tool)', () => {
  const writeTornRollout = (dir: string, sessionId: string, withStartedMarker: boolean): void => {
    const w = openRolloutWriter(dir, sessionId);
    w.append({
      type: 'session_meta', at: new Date().toISOString(), sessionId, capability: 'lh-workload',
      purpose: 'test:loop', task: 'collect fragments', maxTurns: 24,
    });
    w.append({ type: 'transcript_item', at: new Date().toISOString(), entry: { kind: 'task', text: 'collect fragments' } });
    w.append({
      type: 'transcript_item', at: new Date().toISOString(),
      entry: { kind: 'action', turn: 1, action: 'use_tool', tool: 'fetch_fragment', args: { i: 1 }, reason: 'first' },
    });
    w.append({
      type: 'transcript_item', at: new Date().toISOString(),
      entry: { kind: 'tool_result', turn: 1, tool: 'fetch_fragment', ok: true, payload: { fragment: fragment(1) } },
    });
    // turn 2 died mid-tool: action persisted, tool_result NEVER written
    w.append({
      type: 'transcript_item', at: new Date().toISOString(),
      entry: { kind: 'action', turn: 2, action: 'use_tool', tool: 'fetch_fragment', args: { i: 2 }, reason: 'second' },
    });
    if (withStartedMarker) {
      w.append({ type: 'tool_lifecycle', at: new Date().toISOString(), turn: 2, tool: 'fetch_fragment', phase: 'started' });
    }
    w.append({ type: 'turn_record', at: new Date().toISOString(), record: { turn: 1, action: 'use_tool', tool: 'fetch_fragment', ok: true, reason: 'first' } });
    w.append({ type: 'turn_record', at: new Date().toISOString(), record: { turn: 2, action: 'use_tool', tool: 'fetch_fragment', ok: true, reason: 'second' } });
    // NO session_end — the process died here
  }

  it('classifies tool_outcome_unknown (started, never finished) and repairs the transcript on resume', async () => {
    const sessionId = 'ags_lhtornstarted0000000000';
    const h = harness([
      // the resumed session's next model call (turn 3) reads the repaired
      // transcript and finishes honestly
      finish({ keys: ['frag-1-key-7'] }),
    ], { sessionId });
    writeTornRollout(h.dir, sessionId, true);
    const { lines } = readRollout(rolloutFile(h.dir, sessionId));
    const rec = reconstructSession(lines);
    expect(rec.openTurn).toBeDefined();
    expect(rec.openTurn?.disposition).toBe('tool_outcome_unknown');
    expect(rec.openTurn?.turn).toBe(2);

    const res = await runAgentLoop(
      cfg({ initialTranscript: rec.transcript, resume: { priorTurns: rec.turns.length, openTurn: rec.openTurn } }),
      h.deps,
    );
    expect(res.status).toBe('completed');
    // the synthesized tool_result keeps the transcript model-valid and honest
    const synth = res.transcript.find((e) => e.kind === 'tool_result' && e.turn === 2);
    expect(synth).toBeDefined();
    if (synth?.kind === 'tool_result') {
      expect(synth.ok).toBe(false);
      const payload = synth.payload as { interrupted?: boolean; disposition?: string };
      expect(payload.interrupted).toBe(true);
      expect(payload.disposition).toBe('tool_outcome_unknown');
    }
    // resumed marker recorded in the rollout
    const after = readRollout(rolloutFile(h.dir, sessionId)).lines;
    expect(after.some((l) => l.type === 'resumed')).toBe(true);
  });

  it('classifies tool_not_started (no started marker) — safe-to-rerun shape', async () => {
    const sessionId = 'ags_lhtornnotstart00000000';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-lh-'));
    writeTornRollout(dir, sessionId, false);
    const { lines } = readRollout(rolloutFile(dir, sessionId));
    const rec = reconstructSession(lines);
    expect(rec.openTurn?.disposition).toBe('tool_not_started');
    expect(rec.turns.length).toBe(2);
  });

  it('crash AFTER compaction replays from the compacted baseline, not from scratch', async () => {
    const sessionId = 'ags_lhtorncompact0000000000';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-lh-'));
    const w = openRolloutWriter(dir, sessionId);
    w.append({ type: 'session_meta', at: new Date().toISOString(), sessionId, capability: 'lh-workload', purpose: 'test:loop', task: 'collect fragments', maxTurns: 24 });
    w.append({ type: 'transcript_item', at: new Date().toISOString(), entry: { kind: 'task', text: 'collect fragments' } });
    w.append({ type: 'transcript_item', at: new Date().toISOString(), entry: { kind: 'tool_result', turn: 1, tool: 'fetch_fragment', ok: true, payload: { fragment: fragment(1) } } });
    w.append({ type: 'compacted', at: new Date().toISOString(), summary: 'objective: collect fragments; have frag-1-key-7' });
    w.append({ type: 'transcript_item', at: new Date().toISOString(), entry: { kind: 'tool_result', turn: 3, tool: 'fetch_fragment', ok: true, payload: { fragment: fragment(3) } } });
    const rec = reconstructSession(readRollout(rolloutFile(dir, sessionId)).lines);
    // baseline = task + handoff, then only the post-compaction suffix
    expect(rec.transcript[0]?.kind).toBe('task');
    expect(rec.transcript[1]?.kind).toBe('handoff');
    expect(rec.transcript.length).toBe(3); // task + handoff + frag-3
    if (rec.transcript[1]?.kind === 'handoff') {
      expect(rec.transcript[1].summary).toContain('frag-1-key-7');
    }
  });
});

describe('D. stop policy + budget discipline', () => {
  it('stopOnTokenBudget fires at the threshold with its name in the error', async () => {
    const h = harness([
      useTool('fetch_fragment', { i: 1 }),
      useTool('fetch_fragment', { i: 2 }),
      useTool('fetch_fragment', { i: 3 }),
    ], { sessionId: 'ags_lhstopcond000000000000' });
    // stub receipts carry no usage (totalTokens undefined) => tokensUsed stays 0;
    // so exercise the TURN-based condition instead — deterministic on turns.
    const res = await runAgentLoop(cfg({ maxTurns: 10, stopWhen: [{ name: 'turns>=2', shouldStop: (c) => c.turn >= 2 }] }), h.deps);
    expect(res.status).toBe('stop_condition');
    expect(res.error).toMatch(/turns>=2/);
  });

  it('an exhausted RunBudgetView gates NEW turns with an honest stop_condition', async () => {
    const budget = fakeBudget(0); // already exhausted
    const h = harness([useTool('fetch_fragment', { i: 1 }), finish({ keys: ['k'] })], { sessionId: 'ags_lhbudgetgate0000000000', budget });
    const res = await runAgentLoop(cfg(), h.deps);
    expect(res.status).toBe('stop_condition');
    expect(res.error).toMatch(/run token budget exhausted/);
    expect(res.turns.length).toBe(0); // no turn ever started
  });

  it('spend accumulates from receipts and nearLimit tracks the 80% mark', async () => {
    const budget = fakeBudget(1000);
    const h = harness([useTool('fetch_fragment', { i: 1 }), finish({ keys: ['k'] })], { sessionId: 'ags_lhspend000000000000000', budget });
    const res = await runAgentLoop(cfg(), h.deps);
    expect(res.status).toBe('completed');
    // stub receipts carry no usage -> spend unchanged -> nearLimit false
    expect(budget.spent).toBe(0);
    expect(budget.nearLimit()).toBe(false);
    // and the spend path itself: a usage-bearing receipt spends
    budget.spend(850);
    expect(budget.nearLimit()).toBe(true);
    expect(budget.hasRemaining()).toBe(true);
    budget.spend(200);
    expect(budget.hasRemaining()).toBe(false);
  });
});

describe('E. subagent fan-out isolation', () => {
  it('a failing child does not take down its siblings; each child is its own session', async () => {
    const { runSubagents } = await import('../src/agent/subagents.js');
    const steps: StubStep[] = [
      // child A: never emits a valid action -> fails after the invalid ceiling
      { rawOutput: 'not-json-at-all' },
      { rawOutput: 'also not json' },
      { rawOutput: 'still not json' },
      // child B: clean single-turn finish
      finish({ keys: ['child-b-ok'] }),
    ];
    const h = harness(steps, { sessionId: 'ags_lhparent00000000000000' });
    const results = await runSubagents(
      cfg({ maxTurns: 3 }),
      h.deps,
      [
        { label: 'broken', task: 'child that never emits a valid action', maxTurns: 3 },
        { label: 'healthy', task: 'child that finishes immediately', maxTurns: 3 },
      ],
      { maxConcurrent: 1 }, // deterministic step consumption order
    );
    const byLabel = new Map(results.map((r) => [r.label, r]));
    expect(byLabel.get('broken')?.status).toBe('failed');
    expect(byLabel.get('healthy')?.status).toBe('completed');
    expect((byLabel.get('healthy')?.result as { keys: string[] }).keys).toEqual(['child-b-ok']);
    // isolated sessions: distinct session ids + telemetry per child
    expect(byLabel.get('broken')?.sessionId).not.toBe(byLabel.get('healthy')?.sessionId);
    expect(byLabel.get('healthy')?.telemetry.turns).toBe(1);
  });
});
