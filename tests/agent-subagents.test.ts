import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runSubagents, splitSubagentBudgets } from '../src/agent/subagents.js';
import type { AgentLoopConfig, AgentLoopDeps } from '../src/agent/loop.js';
import { ToolRegistry } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import type { AgentEvent } from '../src/agent/protocol.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { RunBudgetView } from '../src/app/run-budget.js';

const echoTool = () => ({
  name: 'echo',
  description: 'echo',
  inputSchema: z.object({ text: z.string() }),
  async execute(args: unknown) { return { ok: true, data: args as Record<string, unknown> }; },
});

const depsWith = (steps: StubStep[]) => {
  const events: AgentEvent[] = [];
  const telemetry = new SessionTelemetry();
  const deps: AgentLoopDeps = {
    provider: createTestStubProvider(steps),
    tools: new ToolRegistry().register(echoTool()),
    permissions: new PermissionEngine({ rules: [{ effect: 'allow' }] }),
    sessionId: 'ags_parent0000000000000000aa',
    purpose: 't:cap',
    emit: (ev) => { events.push(ev); },
    recordReceipt: () => {},
    telemetry,
  };
  return { deps, events };
};

const cfg: AgentLoopConfig = {
  capability: 'sub-test',
  systemPrompt: 's',
  task: 'parent task',
  maxTurns: 4,
};

const finiteBudget = (cap: number, initialSpent = 0): RunBudgetView => {
  let spent = initialSpent;
  return {
    cap,
    get spent() { return spent; },
    remaining: () => Math.max(0, cap - spent),
    hasRemaining: () => spent < cap,
    spend: (n) => { if (n !== undefined && n > 0) spent += n; },
    nearLimit: () => spent >= cap * 0.8,
  };
};

describe('sub-agent fan-out', () => {
  it('splits finite parent tokens deterministically and forwards real spend to the parent', () => {
    const parent = finiteBudget(120, 20);
    const children = splitSubagentBudgets(parent, [
      { label: 'a', task: 'a' },
      { label: 'b', task: 'b' },
      { label: 'c', task: 'c', tokenBudget: 7 },
    ]);
    expect(children.map((b) => b?.cap)).toEqual([34, 33, 7]);
    expect(children.map((b) => b?.remaining())).toEqual([34, 33, 7]);
    children[0]!.spend(10);
    expect(children[0]!.spent).toBe(10);
    expect(parent.spent).toBe(30);
    expect(children[1]!.remaining()).toBe(33);
  });

  it('an exhausted parent gives every child an honest zero reservation without model calls', async () => {
    const { deps } = depsWith([]);
    const results = await runSubagents(cfg, { ...deps, budget: finiteBudget(0) }, [
      { label: 'a', task: 'a' },
      { label: 'b', task: 'b' },
    ], { maxConcurrent: 2 });
    expect(results.map((r) => r.status)).toEqual(['stop_condition', 'stop_condition']);
    expect(results.every((r) => r.error?.includes('run token budget exhausted'))).toBe(true);
  });

  it('runs isolated child loops sequentially (maxConcurrent 1) with own sessions and shared provider', async () => {
    const useTool = JSON.stringify({ action: 'use_tool', tool: 'echo', args: { text: 'x' }, reason: 'r' });
    const finishA = JSON.stringify({ action: 'finish', reason: 'done', result: { answer: 'A' } });
    const finishB = JSON.stringify({ action: 'finish', reason: 'done', result: { answer: 'B' } });
    const { deps, events } = depsWith([
      { rawOutput: useTool }, { rawOutput: finishA }, // child 1 (pro)
      { rawOutput: useTool }, { rawOutput: finishB }, // child 2 (contra)
    ]);
    const results = await runSubagents(cfg, deps, [
      { label: 'pro', task: 'find supporting' },
      { label: 'contra', task: 'find contradicting' },
    ], { maxConcurrent: 1 });
    expect(results.map((r) => r.status)).toEqual(['completed', 'completed']);
    expect(results[0]!.result).toEqual({ answer: 'A' });
    expect(results[1]!.result).toEqual({ answer: 'B' });
    expect(results[0]!.sessionId).not.toBe(results[1]!.sessionId);
    expect(results[0]!.sessionId).not.toBe(deps.sessionId);

    const starts = events.filter((e): e is Extract<AgentEvent, { type: 'session_started' }> => e.type === 'session_started');
    expect(starts.length).toBe(2);
    expect(starts.every((s) => s.parentSessionId === deps.sessionId)).toBe(true);
    // each child exercised one tool call
    expect(results.every((r) => r.telemetry.toolCalls === 1)).toBe(true);
    expect(results.every((r) => r.telemetry.modelCalls === 2)).toBe(true);
  });

  it('runs purpose-keyed scripts in parallel (interleave-proof)', async () => {
    const finishPro = JSON.stringify({ action: 'finish', reason: 'done', result: { found: 2 } });
    const finishContra = JSON.stringify({ action: 'finish', reason: 'done', result: { found: 0 } });
    const { deps } = depsWith([
      { rawOutput: finishPro, forPurpose: 't:cap:sub:pro:turn' },
      { rawOutput: finishContra, forPurpose: 't:cap:sub:contra:turn' },
    ]);
    const results = await runSubagents(cfg, deps, [
      { label: 'pro', task: 't1', maxTurns: 2 },
      { label: 'contra', task: 't2', maxTurns: 2 },
    ], { maxConcurrent: 2 });
    expect(results.map((r) => r.status)).toEqual(['completed', 'completed']);
    expect(results[0]!.result).toEqual({ found: 2 });
    expect(results[1]!.result).toEqual({ found: 0 });
  });

  it('restricts child tools to the requested subset (fail-closed on unknown names)', async () => {
    const { deps } = depsWith([]);
    expect(() => deps.tools.restrict(['echo'])).not.toThrow();
    expect(() => deps.tools.restrict(['echo', 'does_not_exist'])).toThrow(/unknown tool 'does_not_exist'/);
    const restricted = deps.tools.restrict(['echo']);
    expect(restricted.names()).toEqual(['echo']);
  });

  it('refuses to spawn beyond maxDepth (fail-closed)', async () => {
    const { deps } = depsWith([]);
    await expect(runSubagents(cfg, { ...deps, depth: 1 }, [{ label: 'x', task: 't' }], { maxDepth: 1 }))
      .rejects.toThrow(/exceeds maxDepth 1/);
  });

  it('a failing child surfaces its error; the sibling still completes', async () => {
    const { deps } = depsWith([
      { rawOutput: JSON.stringify({ action: 'finish', reason: 'ok', result: { ok: true } }), forPurpose: 't:cap:sub:good:turn' },
      { fail: { kind: 'auth_error', message: 'no key' }, forPurpose: 't:cap:sub:bad:turn' },
    ]);
    const results = await runSubagents(cfg, deps, [
      { label: 'good', task: 't', maxTurns: 2 },
      { label: 'bad', task: 't', maxTurns: 2 },
    ], { maxConcurrent: 2 });
    const good = results.find((r) => r.label === 'good')!;
    const bad = results.find((r) => r.label === 'bad')!;
    expect(good.status).toBe('completed');
    expect(bad.status).toBe('failed');
    expect(bad.error).toMatch(/auth_error.*no key/);
  });
});
