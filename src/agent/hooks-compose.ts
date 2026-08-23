import type { HookRuleIntegration } from '../domain/tool-integration.js';
import type { PermissionRule } from './permissions.js';
import { ExtensionBus } from './hooks.js';

/**
 * Hook-rule composition (TIS): declarative hook_rule integrations compiled into
 * kernel surfaces. Two layers, by action type:
 *
 *   block / require_approval → PermissionRule[] (strictest-wins engine): block
 *   becomes a bypassImmune deny (a researcher's explicit policy cannot be
 *   mode-switched away), require_approval becomes 'ask' — inheriting the
 *   engine's exact-(tool,args) approval binding, TTL caching and headless
 *   fail-closed default (ask without a handler denies).
 *
 *   log (all events) → ExtensionBus observation handlers.
 *
 * Patterns are expanded against the session's known tool list at assembly time
 * (toolPattern glob / riskClass match) — finite, deterministic, no runtime
 * string matching in the hot path.
 */

export type ToolRiskClassName = 'read' | 'edit' | 'execute' | 'destructive';

/** toolPattern match: exact name, or trailing-'*' prefix glob. */
export const matchesToolPattern = (pattern: string, tool: string): boolean => {
  if (pattern.endsWith('*')) return tool.startsWith(pattern.slice(0, -1));
  return tool === pattern;
};

export interface KnownTool {
  name: string;
  riskClass: ToolRiskClassName | undefined;
}

export const ruleMatchesTool = (
  rule: Pick<HookRuleIntegration, 'match'>,
  tool: KnownTool,
): boolean => {
  const { toolPattern, riskClass } = rule.match;
  if (toolPattern !== undefined && !matchesToolPattern(toolPattern, tool.name)) return false;
  if (riskClass !== undefined && (tool.riskClass ?? 'execute') !== riskClass) return false;
  return true;
};

/** Expand block/require_approval rules into permission rules over the known session tools. */
export const expandHookRulesToPermissions = (
  rules: readonly HookRuleIntegration[],
  knownTools: readonly KnownTool[],
): PermissionRule[] => {
  const out: PermissionRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.event !== 'before_tool' || rule.action.type === 'log') continue;
    for (const tool of knownTools) {
      if (!ruleMatchesTool(rule, tool)) continue;
      if (rule.action.type === 'block') {
        out.push({
          tool: tool.name,
          effect: 'deny',
          bypassImmune: true,
          note: `hook:${rule.label}: ${rule.action.reason}`,
        });
      } else {
        out.push({
          tool: tool.name,
          effect: 'ask',
          note: `hook:${rule.label}${rule.action.reason !== undefined ? `: ${rule.action.reason}` : ''}`,
        });
      }
    }
  }
  return out;
};

export interface HookLogDeps {
  /** Observation sink for log actions (session event stream). */
  log: (entry: { rule: string; event: 'before_tool' | 'after_tool' | 'turn_end'; turn: number; tool?: string; detail: string }) => void;
  /** riskClass lookup for rules that match on risk (kernel convention: absent = 'execute'). */
  riskClassOf: (tool: string) => ToolRiskClassName | undefined;
}

/** Compile log-action rules (all events) into a session-scoped ExtensionBus. */
export const composeLogHooks = (rules: readonly HookRuleIntegration[], deps: HookLogDeps): ExtensionBus => {
  const bus = new ExtensionBus();
  type LogRule = HookRuleIntegration & { action: { type: 'log'; note?: string } };
  const enabled = rules.filter((r): r is LogRule => r.enabled && r.action.type === 'log');

  const beforeRules = enabled.filter((r) => r.event === 'before_tool');
  if (beforeRules.length > 0) {
    bus.onBeforeToolCall(async (call) => {
      for (const rule of beforeRules) {
        if (ruleMatchesTool(rule, { name: call.tool, riskClass: deps.riskClassOf(call.tool) })) {
          deps.log({ rule: rule.label, event: 'before_tool', turn: call.turn, tool: call.tool, detail: rule.action.note ?? 'matched' });
        }
      }
      return {};
    });
  }

  const afterRules = enabled.filter((r) => r.event === 'after_tool');
  if (afterRules.length > 0) {
    bus.onAfterToolCall(async (call) => {
      for (const rule of afterRules) {
        if (ruleMatchesTool(rule, { name: call.tool, riskClass: deps.riskClassOf(call.tool) })) {
          deps.log({ rule: rule.label, event: 'after_tool', turn: call.turn, tool: call.tool, detail: rule.action.note ?? 'matched' });
        }
      }
    });
  }

  const turnEndRules = enabled.filter((r) => r.event === 'turn_end');
  if (turnEndRules.length > 0) {
    bus.onTurnEnd(async (info) => {
      for (const rule of turnEndRules) {
        // turn_end carries no tool — pattern rules are noted as armed, risk rules likewise.
        deps.log({ rule: rule.label, event: 'turn_end', turn: info.turn, detail: `${rule.action.note ?? 'armed'} (turn ${info.turn} ${info.action})` });
      }
    });
  }

  return bus;
};
