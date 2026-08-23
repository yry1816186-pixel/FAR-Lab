import { describe, it, expect } from 'vitest';
import { expandHookRulesToPermissions, composeLogHooks, matchesToolPattern } from '../src/agent/hooks-compose.js';
import { HookRuleIntegration, ToolIntegrationSchema } from '../src/domain/tool-integration.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import type { ToolIntegration } from '../src/domain/tool-integration.js';

const seq = (() => { let n = 0; return () => `tint_hk${String(n += 1).padStart(20, '0')}`.slice(0, 32); })();

const mkRule = (over: Record<string, unknown>): ToolIntegration =>
  ToolIntegrationSchema.parse({
    id: seq(), label: 'rule', enabled: true, kind: 'hook_rule', event: 'before_tool',
    match: { toolPattern: 'mcp_x_*' }, action: { type: 'log', note: 'observed' },
    createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z', createdBy: 'researcher',
    ...over,
  });

const known = [
  { name: 'mcp_x_echo', riskClass: 'execute' as const },
  { name: 'read_evidence', riskClass: 'read' as const },
  { name: 'run_model', riskClass: 'destructive' as const },
];

describe('pattern matching', () => {
  it('exact and trailing-* prefix semantics', () => {
    expect(matchesToolPattern('mcp_x_echo', 'mcp_x_echo')).toBe(true);
    expect(matchesToolPattern('mcp_x_echo', 'mcp_x_other')).toBe(false);
    expect(matchesToolPattern('mcp_x_*', 'mcp_x_echo')).toBe(true);
    expect(matchesToolPattern('mcp_x_*', 'mcp_y_echo')).toBe(false);
  });
});

describe('expandHookRulesToPermissions', () => {
  it('block → bypassImmune deny over matching tools only', () => {
    const rules = [mkRule({ action: { type: 'block', reason: 'not in this lab' } })] as HookRuleIntegration[];
    const perms = expandHookRulesToPermissions(rules, known);
    expect(perms).toHaveLength(1);
    expect(perms[0]).toMatchObject({ tool: 'mcp_x_echo', effect: 'deny', bypassImmune: true });
  });

  it('require_approval → ask rules; riskClass matching composes with pattern', () => {
    const rules = [
      mkRule({ action: { type: 'require_approval', reason: 'costs money' } }),
      mkRule({ match: { riskClass: 'destructive' }, action: { type: 'require_approval' } }),
    ] as HookRuleIntegration[];
    const perms = expandHookRulesToPermissions(rules, known);
    const asked = perms.filter((p) => p.effect === 'ask').map((p) => p.tool).sort();
    expect(asked).toEqual(['mcp_x_echo', 'run_model']);
    expect(perms.every((p) => p.bypassImmune !== true)).toBe(true);
  });

  it('disabled rules and log actions contribute nothing', () => {
    const rules = [
      mkRule({ enabled: false, action: { type: 'block', reason: 'x' } }),
      mkRule({ action: { type: 'log' } }),
      mkRule({ event: 'after_tool', action: { type: 'log' } }),
    ] as HookRuleIntegration[];
    expect(expandHookRulesToPermissions(rules, known)).toEqual([]);
  });

  it('compiled ask rules deny fail-closed in a headless PermissionEngine, allow with a granting handler', async () => {
    const rules = [mkRule({ action: { type: 'require_approval', reason: 'check' } })] as HookRuleIntegration[];
    const headless = new PermissionEngine({ rules: expandHookRulesToPermissions(rules, known), defaultEffect: 'allow' });
    expect((await headless.decide('mcp_x_echo', {}, 'execute')).effect).toBe('deny');

    const granting = new PermissionEngine({
      rules: expandHookRulesToPermissions(rules, known),
      defaultEffect: 'allow',
      ask: async () => true,
    });
    const first = await granting.decide('mcp_x_echo', {}, 'execute');
    expect(first.effect).toBe('allow');
    expect(first.asked).toBe(true);
    const cached = await granting.decide('mcp_x_echo', {}, 'execute');
    expect(cached.effect).toBe('allow');
    expect(cached.cachedGrant).toBe(true);
  });
});

describe('composeLogHooks', () => {
  it('delivers before/after/turn_end log entries with turn numbers', async () => {
    const entries: Array<{ rule: string; event: string; turn: number; tool?: string }> = [];
    const bus = composeLogHooks(
      [
        mkRule({ label: 'watch', action: { type: 'log', note: 'seen' } }),
        mkRule({ label: 'tail', event: 'after_tool', action: { type: 'log' } }),
        mkRule({ label: 'tick', event: 'turn_end', match: { toolPattern: 'any' }, action: { type: 'log' } }),
      ] as HookRuleIntegration[],
      {
        log: (e) => { entries.push({ rule: e.rule, event: e.event, turn: e.turn, tool: e.tool }); },
        riskClassOf: () => 'execute',
      },
    );
    await bus.beforeToolCall({ tool: 'mcp_x_echo', args: {}, turn: 3 });
    await bus.afterToolCall({ tool: 'mcp_x_echo', args: {}, turn: 3 }, { ok: true });
    await bus.turnEnd({ turn: 3, action: 'use_tool', finished: false });
    expect(entries.map((e) => `${e.rule}:${e.event}`).sort()).toEqual(['tail:after_tool', 'tick:turn_end', 'watch:before_tool']);
    expect(entries.every((e) => e.turn === 3)).toBe(true);
  });
});
