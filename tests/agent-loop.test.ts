import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runAgentLoop, stopAfterTurns, stopOnTokenBudget, type AgentLoopConfig, type AgentLoopDeps } from '../src/agent/loop.js';
import { ToolRegistry, type AgentTool } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import { ExtensionBus } from '../src/agent/hooks.js';
import type { AgentEvent, ReceiptSink } from '../src/agent/protocol.js';
import type { ArtifactStore } from '../src/shared/ports.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { canonicalSha256 } from '../src/shared/crypto.js';

const echoTool = (spy?: { calls: unknown[] }): AgentTool => ({
  name: 'echo',
  description: 'echo text back',
  inputSchema: z.object({ text: z.string() }),
  async execute(args) {
    spy?.calls.push(args);
    return { ok: true, data: { echo: (args as { text: string }).text } };
  },
});

function depsFor(steps: StubStep[]) {
  const events: AgentEvent[] = [];
  const receipts: Parameters<ReceiptSink>[0][] = [];
  const telemetry = new SessionTelemetry();
  const tools = new ToolRegistry().register(echoTool());
  const deps: AgentLoopDeps = {
    provider: createTestStubProvider(steps),
    tools,
    permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
    sessionId: 'ags_testsession0000000000aaaa',
    purpose: 'test:loop',
    emit: (ev) => { events.push(ev); },
    recordReceipt: (r) => { receipts.push(r); },
    telemetry,
  };
  return { deps, events, receipts, telemetry, tools };
}

const baseCfg = (over: Partial<AgentLoopConfig> = {}): AgentLoopConfig => ({
  capability: 'test-cap',
  systemPrompt: 'test system',
  task: 'do the thing',
  maxTurns: 6,
  resultSchema: z.object({ answer: z.string().min(2) }),
  ...over,
});

const useTool = (tool: string, args: Record<string, unknown> = {}): string =>
  JSON.stringify({ action: 'use_tool', tool, args, reason: 'progress' });
const finish = (result: Record<string, unknown>): string => JSON.stringify({ action: 'finish', reason: 'done', result });

describe('agent kernel loop', () => {
  it('runs tool call then finish; emits ordered events and records receipts per model call', async () => {
    const { deps, events, receipts, telemetry } = depsFor([
      { rawOutput: useTool('echo', { text: 'hi' }) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(baseCfg(), deps);
    expect(res.status).toBe('completed');
    expect(res.result).toEqual({ answer: 'ok' });
    expect(receipts.length).toBe(2);
    expect(receipts.every((r) => r.kind === 'model_call')).toBe(true);
    expect(telemetry.summary().modelCalls).toBe(2);
    expect(telemetry.summary().toolCalls).toBe(1);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('session_started');
    expect(types).toContain('tool_used');
    expect(types.at(-1)).toBe('session_finished');
    const toolEvent = events.find((e) => e.type === 'tool_used');
    expect(toolEvent && toolEvent.type === 'tool_used' && toolEvent.tool).toBe('echo');
  });

  it('hash-deduplicates a repeated successful effectful action and replays its result', async () => {
    const spy: { calls: unknown[] } = { calls: [] };
    const { deps, events, telemetry } = depsFor([
      { rawOutput: useTool('echo', { text: 'same effect' }) },
      { rawOutput: useTool('echo', { text: 'same effect' }) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(
      baseCfg(),
      { ...deps, tools: new ToolRegistry().register(echoTool(spy)) },
    );
    expect(res.status).toBe('completed');
    expect(spy.calls).toHaveLength(1);
    expect(telemetry.summary().toolCalls).toBe(1);
    const results = res.transcript.filter((e) => e.kind === 'tool_result');
    expect(results).toHaveLength(2);
    expect(results[0]?.actionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(results[1]?.actionHash).toBe(results[0]?.actionHash);
    expect(results[1]?.deduplicatedFromTurn).toBe(1);
    expect(results[1]?.payload).toEqual(results[0]?.payload);
    const replay = events.find((e) => e.type === 'tool_used' && e.deduplicatedFromTurn === 1);
    expect(replay?.durationMs).toBe(0);
  });

  it('does not deduplicate identical read actions because a fresh poll can be intentional', async () => {
    const spy: { calls: unknown[] } = { calls: [] };
    const readEcho: AgentTool = { ...echoTool(spy), riskClass: 'read' };
    const { deps } = depsFor([
      { rawOutput: useTool('echo', { text: 'poll' }) },
      { rawOutput: useTool('echo', { text: 'poll' }) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(baseCfg(), { ...deps, tools: new ToolRegistry().register(readEcho) });
    expect(res.status).toBe('completed');
    expect(spy.calls).toHaveLength(2);
    expect(res.transcript.filter((e) => e.kind === 'tool_result' && e.deduplicatedFromTurn !== undefined)).toHaveLength(0);
  });

  it('deduplicates a committed effect after compaction and process resume', async () => {
    const spy: { calls: unknown[] } = { calls: [] };
    const args = { text: 'already written' };
    const actionHash = canonicalSha256({
      tool: 'echo', source: 'builtin', version: null, riskClass: 'execute', args,
    });
    const committed = {
      kind: 'tool_result' as const,
      turn: 1,
      tool: 'echo',
      ok: true,
      payload: { echo: args.text },
      actionHash,
    };
    const { deps } = depsFor([
      { rawOutput: useTool('echo', args) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(
      baseCfg({
        initialTranscript: [{ kind: 'task', text: 'do the thing' }, { kind: 'handoff', summary: 'write completed before restart' }],
        resume: { priorTurns: 1, committedEffects: [committed] },
      }),
      { ...deps, tools: new ToolRegistry().register(echoTool(spy)) },
    );
    expect(res.status).toBe('completed');
    expect(spy.calls).toHaveLength(0);
    const replay = res.transcript.find((entry) => entry.kind === 'tool_result' && entry.deduplicatedFromTurn === 1);
    expect(replay?.actionHash).toBe(actionHash);
  });

  it('feeds schema-invalid tool args back to the model instead of crashing', async () => {
    const spy: { calls: unknown[] } = { calls: [] };
    const { deps } = depsFor([
      { rawOutput: useTool('echo', { text: 42 }) }, // wrong type: string required
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(baseCfg(), { ...deps, tools: new ToolRegistry().register(echoTool(spy)) });
    expect(res.status).toBe('completed');
    expect(spy.calls.length).toBe(0); // never executed with invalid args
    const feedback = res.transcript.find((e) => e.kind === 'tool_result');
    expect(feedback && feedback.kind === 'tool_result' && (feedback.payload as { validationError?: string }).validationError).toMatch(/invalid arguments/);
  });

  it('feeds unknown-tool calls back with the available catalog', async () => {
    const { deps } = depsFor([
      { rawOutput: useTool('nonexistent_tool') },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(baseCfg(), deps);
    expect(res.status).toBe('completed');
    const err = res.transcript.find((e) => e.kind === 'error');
    expect(err && err.kind === 'error' && err.message).toMatch(/unknown tool 'nonexistent_tool' — available: echo/);
  });

  it('fails closed on provider failure (no silent retry at loop level)', async () => {
    const { deps } = depsFor([{ fail: { kind: 'rate_limited', message: 'slow down' } }]);
    const res = await runAgentLoop(baseCfg(), deps);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/rate_limited.*slow down/);
  });

  it('stops after N consecutive unparseable model actions', async () => {
    const { deps } = depsFor([
      { rawOutput: 'this is not json' },
      { rawOutput: 'still not json' },
      { rawOutput: '{"action":"bogus"}' },
    ]);
    const res = await runAgentLoop(baseCfg({ maxConsecutiveInvalid: 3 }), deps);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/consecutive invalid/);
  });

  it('stops at max turns when the model never finishes', async () => {
    const { deps } = depsFor([
      { rawOutput: useTool('echo', { text: 'a' }) },
      { rawOutput: useTool('echo', { text: 'b' }) },
      { rawOutput: useTool('echo', { text: 'c' }) },
    ]);
    const res = await runAgentLoop(baseCfg({ maxTurns: 3 }), deps);
    expect(res.status).toBe('max_turns');
    expect(res.error).toMatch(/max turns \(3\)/);
  });

  it('injects steering text between turns and records it', async () => {
    let steeredOnce = false;
    const { deps, events } = depsFor([
      { rawOutput: useTool('echo', { text: 'x' }) },
      { rawOutput: finish({ answer: 'steered ok' }) },
    ]);
    const res = await runAgentLoop(baseCfg({ steer: () => (steeredOnce ? null : (steeredOnce = true, 'focus on mechanism')) }), deps);
    expect(res.status).toBe('completed');
    expect(res.transcript.some((e) => e.kind === 'steer')).toBe(true);
    expect(events.some((e) => e.type === 'steered')).toBe(true);
  });

  it('aborts cooperatively before the first turn', async () => {
    const { deps, events } = depsFor([{ rawOutput: finish({ answer: 'never' }) }]);
    const res = await runAgentLoop(baseCfg({ shouldAbort: () => true }), deps);
    expect(res.status).toBe('aborted');
    // provider step untouched: the loop never made a model call (no turn ever started)
    expect(events.filter((e) => e.type === 'turn_started').length).toBe(0);
  });

  it('hook block feeds the refusal back; rewrite reaches the tool; terminate ends the session', async () => {
    const spy: { calls: unknown[] } = { calls: [] };
    const blocked = new ExtensionBus();
    blocked.onBeforeToolCall(() => ({ blocked: 'forbidden by policy' }));
    const { deps: d1 } = depsFor([
      { rawOutput: useTool('echo', { text: 'hi' }) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const r1 = await runAgentLoop(baseCfg(), { ...d1, tools: new ToolRegistry().register(echoTool(spy)), hooks: blocked });
    expect(r1.status).toBe('completed');
    expect(spy.calls.length).toBe(0);
    expect(r1.transcript.some((e) => e.kind === 'tool_result' && (e.payload as { blocked?: boolean }).blocked === true)).toBe(true);

    const rewriter = new ExtensionBus();
    rewriter.onBeforeToolCall(() => ({ args: { text: 'rewritten' } }));
    const { deps: d2 } = depsFor([
      { rawOutput: useTool('echo', { text: 'original' }) },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const spy2: { calls: unknown[] } = { calls: [] };
    await runAgentLoop(baseCfg(), { ...d2, tools: new ToolRegistry().register(echoTool(spy2)), hooks: rewriter });
    expect(spy2.calls[0]).toEqual({ text: 'rewritten' });

    const terminator = new ExtensionBus();
    terminator.onBeforeToolCall(() => ({ terminate: 'budget exhausted' }));
    const { deps: d3 } = depsFor([{ rawOutput: useTool('echo', { text: 'x' }) }]);
    const r3 = await runAgentLoop(baseCfg(), { ...d3, tools: new ToolRegistry().register(echoTool()), hooks: terminator });
    expect(r3.status).toBe('aborted');
    expect(r3.error).toMatch(/terminated by hook: budget exhausted/);
  });

  it('rejects a contract-violating finish, feeds the reasons back, and accepts the corrected one', async () => {
    const { deps } = depsFor([
      { rawOutput: finish({ wrong: 'shape' }) },
      { rawOutput: finish({ answer: 'fixed' }) },
    ]);
    const res = await runAgentLoop(baseCfg({ maxFinishReasks: 2 }), deps);
    expect(res.status).toBe('completed');
    expect(res.result).toEqual({ answer: 'fixed' });
    expect(res.transcript.some((e) => e.kind === 'error' && e.message.includes('finish payload rejected'))).toBe(true);
  });

  it('spills oversized tool results to the artifact store and leaves a ref in the transcript', async () => {    const big: AgentTool = {
      name: 'bigpayload',
      description: 'returns a huge payload',
      inputSchema: z.object({}),
      async execute() {
        return { ok: true, data: { blob: 'x'.repeat(5000) } };
      },
    };
    const store = new Map<string, string>();
    const artifacts: ArtifactStore = {
      put: async (payload: string) => {
        const ref = `sha256:${'a'.repeat(63)}${store.size}`;
        store.set(ref, payload);
        return { ref, hash: ref.slice(7), size: payload.length };
      },
      get: async (ref: string) => store.get(ref) ?? null,
      path: (ref: string) => `/tmp/${ref}`,
    };
    const { deps } = depsFor([
      { rawOutput: useTool('bigpayload') },
      { rawOutput: finish({ answer: 'ok' }) },
    ]);
    const res = await runAgentLoop(
      baseCfg({ budget: { transcriptSoft: 1_000_000, transcriptHard: 2_000_000, maxToolResultChars: 200 } }),
      { ...deps, tools: new ToolRegistry().register(big), artifacts },
    );
    expect(res.status).toBe('completed');
    const spilled = res.transcript.find((e) => e.kind === 'tool_result');
    expect(spilled && spilled.kind === 'tool_result' && spilled.spilledTo).toMatch(/^sha256:/);
    const ref = spilled && spilled.kind === 'tool_result' ? spilled.spilledTo! : '';
    expect(await artifacts.get(ref)).toContain('blob');
  });

  it('degrades by dropping oldest tool results when even a full handoff overflows the hard budget', async () => {
    const big: AgentTool = {
      name: 'echo',
      description: 'echo text back',
      inputSchema: z.object({ text: z.string() }),
      async execute(args) { return { ok: true, data: { echo: (args as { text: string }).text, blob: 'x'.repeat(2_000) } }; },
    };
    const { deps, events } = depsFor([
      { rawOutput: useTool('echo', { text: 'a' }) },
      { rawOutput: useTool('echo', { text: 'b' }) },
      { rawOutput: finish({ answer: 'ok' }) },
      // purpose-keyed handoff step: full-compaction model call (does not consume the cursor)
      {
        rawOutput: JSON.stringify({
          objective: 'Complete the test task and return a contract-valid answer.',
          completed: ['Ran two distinct echo actions and retained their successful outputs.'],
          decisions: ['Use the successful echo outputs; do not execute those calls again.'],
          remaining: ['Return the final answer from the preserved recent transcript.'],
          references: [],
        }),
        forPurpose: 'test:loop:compact',
      },
    ]);
    const res = await runAgentLoop(
      baseCfg({ maxTurns: 3, budget: { transcriptSoft: 60, transcriptHard: 120, maxToolResultChars: 100_000 } }),
      { ...deps, tools: new ToolRegistry().register(big) },
    );
    expect(res.status).toBe('completed');
    const layers = events.filter((e): e is Extract<AgentEvent, { type: 'compaction' }> => e.type === 'compaction').map((e) => e.layer);
    expect(layers).toContain('full');
    expect(layers).toContain('degrade');
    // degradation actually reclaimed budget and the session survived to finish
    const degradeEvent = events.find((e): e is Extract<AgentEvent, { type: 'compaction' }> => e.type === 'compaction' && e.layer === 'degrade');
    expect(degradeEvent?.tokensAfter).toBeLessThanOrEqual(120);
    expect(degradeEvent?.bySourceAfter).toBeDefined();
  });

  it('a malformed handoff summary degrades to a fact-only local handoff instead of crashing', async () => {
    const big: AgentTool = {
      name: 'echo',
      description: 'echo text back',
      inputSchema: z.object({ text: z.string() }),
      riskClass: 'read',
      async execute(args) { return { ok: true, data: { echo: (args as { text: string }).text, blob: 'x'.repeat(2_000) } }; },
    };
    const { deps, events } = depsFor([
      { rawOutput: useTool('echo', { text: 'a' }) },
      { rawOutput: useTool('echo', { text: 'b' }) },
      { rawOutput: finish({ answer: 'ok' }) },
      { rawOutput: '{"summary":"old unstructured shape"}', forPurpose: 'test:loop:compact' },
    ]);
    const res = await runAgentLoop(
      baseCfg({ maxTurns: 3, budget: { transcriptSoft: 60, transcriptHard: 240, maxToolResultChars: 100_000 } }),
      { ...deps, tools: new ToolRegistry().register(big) },
    );
    expect(res.status).toBe('completed');
    const handoff = res.transcript.find((e) => e.kind === 'handoff');
    expect(handoff?.summary).toContain('Semantic summarization was unavailable');
    expect(handoff?.summary).toContain('handoff model call failed (invalid_output)');
    expect(events.some((e) => e.type === 'compaction' && e.layer === 'degrade')).toBe(true);
  });

  it('fails visibly when the immutable task alone cannot fit the hard context budget', async () => {
    const { deps, events, receipts } = depsFor([
      {
        rawOutput: JSON.stringify({
          objective: 'Continue the oversized task without inventing prior progress.',
          completed: ['Inspected the supplied task text and found it exceeds the configured context limit.'],
          decisions: ['Do not truncate the researcher objective silently.'],
          remaining: ['Shorten the task or raise the explicit context budget before resuming.'],
          references: [],
        }),
        forPurpose: 'test:loop:compact',
      },
    ]);
    const res = await runAgentLoop(
      baseCfg({ task: 'research objective '.repeat(300), budget: { transcriptSoft: 1, transcriptHard: 20, maxToolResultChars: 100_000 } }),
      deps,
    );
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/task context alone exceeds transcriptHard/);
    expect(receipts).toHaveLength(1);
    expect(events.some((event) => event.type === 'compaction' && event.layer === 'degrade')).toBe(true);
  });
});

// ---- Wave-S v2-harness: dual timeout + composable stop conditions ----

describe('agent loop dual timeout + stop conditions', () => {
  it('totalTimeoutMs exhausted ends the session with the distinct total_timeout status', async () => {
    const { deps } = depsFor([{ rawOutput: useTool('echo', { text: 'x' }) }, { rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg({ totalTimeoutMs: 0 }), deps);
    expect(res.status).toBe('total_timeout');
    expect(res.error).toContain('totalTimeoutMs');
  });

  it('stepTimeoutMs exceeded after the model call skips the tool phase (step_timeout)', async () => {
    const { deps } = depsFor([{ rawOutput: useTool('echo', { text: 'x' }) }, { rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg({ stepTimeoutMs: 0 }), deps);
    expect(res.status).toBe('step_timeout');
    expect(res.error).toContain('stepTimeoutMs');
    // the tool must NOT have executed — an over-budget turn does not pay for tools
    expect(res.turns.every((t) => t.action !== 'use_tool' || t.ok === undefined)).toBe(true);
  });

  it('a tool that never settles is cut by the remaining step deadline and the run ends step_timeout (FA-HAR-01)', async () => {
    const hung: AgentTool = {
      name: 'echo',
      description: 'never settles',
      inputSchema: z.object({ text: z.string() }),
      execute: () => new Promise(() => { /* hangs forever, ignores its abort signal */ }),
    };
    const { deps } = depsFor([{ rawOutput: useTool('echo', { text: 'x' }) }, { rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg({ stepTimeoutMs: 120 }), { ...deps, tools: new ToolRegistry().register(hung) });
    expect(res.status).toBe('step_timeout');
    expect(res.error).toContain('echo');
    expect(res.error).toContain('stepTimeoutMs');
  });

  it('a custom stop condition fires with its name recorded; conditions run before work', async () => {
    const { deps } = depsFor([{ rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg({
      stopWhen: [{ name: 'never-answer-on-turn-1', shouldStop: (ctx) => ctx.turn === 1 }],
    }), deps);
    expect(res.status).toBe('stop_condition');
    expect(res.error).toContain('never-answer-on-turn-1');
    // nothing ran: no model receipts burned after the condition fired
    expect(res.turns).toHaveLength(0);
  });

  it('builtin factories: stopOnTokenBudget uses cumulative receipt tokens', async () => {
    const { deps } = depsFor([{ rawOutput: finish({ answer: 'ok' }) }]);
    // threshold 0 fires before turn 1 regardless of the stub's usage numbers
    const res = await runAgentLoop(baseCfg({ stopWhen: [stopOnTokenBudget(0)] }), deps);
    expect(res.status).toBe('stop_condition');
    expect(res.error).toContain('tokens>=0');
  });

  it('unfired conditions never interfere with a normal completed session', async () => {
    const { deps } = depsFor([{ rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg({ stepTimeoutMs: 60_000, totalTimeoutMs: 60_000, stopWhen: [stopAfterTurns(99)] }), deps);
    expect(res.status).toBe('completed');
  });
});

describe('agent kernel on the unified model plane (run-budget governance)', () => {
  const budgetView = (over: Partial<{ cap: number | null; spent: number; has: boolean }> = {}) => ({
    cap: over.cap ?? 1000,
    spent: over.spent ?? 0,
    remaining: () => (over.cap === null ? null : 100),
    hasRemaining: () => over.has ?? true,
    nearLimit: () => false,
    spend: (_t?: number) => {},
  });

  it('an exhausted run budget ends the session before ANY model call (stop_condition, no receipt)', async () => {
    const { deps, receipts } = depsFor([{ rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg(), { ...deps, budget: budgetView({ has: false, spent: 1000 }) });
    expect(res.status).toBe('stop_condition');
    expect(res.error).toContain('run token budget exhausted');
    expect(receipts).toHaveLength(0); // the gate fired BEFORE the provider call
  });

  it('a healthy budget leaves the session running and spends usage per model call', async () => {
    const spends: Array<number | undefined> = [];
    const { deps } = depsFor([{ rawOutput: finish({ answer: 'ok' }) }]);
    const res = await runAgentLoop(baseCfg(), {
      ...deps,
      budget: { ...budgetView(), spend: (t?: number) => { spends.push(t); } },
    });
    expect(res.status).toBe('completed');
    expect(spends).toHaveLength(1); // one turn model call, one spend record
    expect(spends[0]).toBeUndefined(); // stub usage is {} (no real token accounting) — the spend CALL is the wiring fact
  });
});
