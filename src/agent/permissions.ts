import { canonicalSha256 } from '../shared/crypto.js';

/**
 * Permission engine (H5): ordered first-match rules with deny>ask>allow discipline and
 * FAIL-CLOSED default. Ask-grants are cached with a TTL and bound to the exact
 * (tool, canonical args) pair — an approval never generalizes to other arguments
 * (OpenClaw exact-context approval model).
 */

export type PermissionEffect = 'allow' | 'deny' | 'ask';

/**
 * Session-level permission mode (Wave-S v2-harness, agentscope _engine.py:594-848
 * lineage): a coarse session stance that composes with the rule set — mode effects act
 * as an implicit rule that still LOSES to explicit deny (strictest-wins is preserved).
 * - default: rules alone decide;
 * - explore: research/read-only — non-read tools are denied even when rules allow;
 * - accept_edits: edit-class tools auto-allowed (explicit deny still wins);
 * - bypass: everything allowed EXCEPT rules marked bypassImmune (dangerous operations
 *   can never be bypassed by a mode switch — the switch itself is auditable).
 */
export type PermissionMode = 'default' | 'explore' | 'accept_edits' | 'bypass';

export type ToolRiskClass = 'read' | 'edit' | 'execute' | 'destructive';

export interface PermissionRule {
  /** Exact tool name; undefined matches any tool. */
  tool?: string;
  /** Additional argument predicate (evaluated only on tool match). */
  argsMatch?: (args: unknown) => boolean;
  effect: PermissionEffect;
  note?: string;
  /** Survives bypass mode: dangerous operations cannot be mode-switched away. */
  bypassImmune?: boolean;
}

export interface PermissionDecision {
  effect: PermissionEffect;
  rule?: string;
  /** True when an ask was resolved by a still-valid cached grant. */
  cachedGrant: boolean;
  /** True when a human/agent ask handler actually ran this call (vs. static rule). */
  asked: boolean;
}

export type AskHandler = (tool: string, args: unknown) => Promise<boolean>;

export interface PermissionEngineOptions {
  rules?: PermissionRule[];
  /** Unmatched tools fall here. Default 'deny' — fail closed, never silently allow. */
  defaultEffect?: PermissionEffect;
  /** Absent ask handler => ask degrades to deny (headless/no-interactive default). */
  ask?: AskHandler;
  /** TTL of ask-grants in ms (default 5 min). */
  approvalTtlMs?: number;
  /** Initial session mode (default 'default'); switch at runtime via setMode. */
  mode?: PermissionMode;
  now?: () => number;
}

export class PermissionEngine {
  private readonly grants = new Map<string, number>();
  private mode: PermissionMode;

  constructor(private readonly opts: PermissionEngineOptions) {
    this.mode = opts.mode ?? 'default';
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  /** Session stance switch (agentscope mode machine). Every switch is caller-auditable. */
  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  /**
   * Codex execpolicy discipline (ported, Apache-2.0): collect EVERY matching rule and
   * take the STRICTEST effect (deny > ask > allow). An early permissive rule can never
   * override a later restriction — policy composition is safe by construction, unlike
   * first-match-wins where rule order silently changes security. The session mode
   * contributes one implicit rule under the same strictest-wins composition.
   */
  async decide(tool: string, args: unknown, riskClass?: ToolRiskClass): Promise<PermissionDecision> {
    const RANK: Record<PermissionEffect, number> = { deny: 3, ask: 2, allow: 1 };
    const effectiveRisk: ToolRiskClass = riskClass ?? 'execute';
    let strictest: PermissionEffect | undefined;
    let via: string | undefined;
    const consider = (effect: PermissionEffect, label: string): void => {
      if (strictest === undefined || RANK[effect] > RANK[strictest]) {
        strictest = effect;
        via = label;
      }
    };
    for (const rule of this.opts.rules ?? []) {
      if (this.mode === 'bypass' && rule.bypassImmune !== true) continue;
      if (rule.tool !== undefined && rule.tool !== tool) continue;
      if (rule.argsMatch !== undefined && !rule.argsMatch(args)) continue;
      consider(rule.effect, rule.note ?? rule.tool ?? 'rule');
    }
    // Mode implicit rules — composed via strictest-wins; explicit DENY always outranks
    // any mode. accept_edits additionally answers 'ask' affirmatively for edit-class
    // tools (that is the mode's entire purpose) without touching explicit denies.
    let modeAllow = false;
    if (this.mode === 'explore' && effectiveRisk !== 'read') {
      consider('deny', 'mode=explore(non-read tool)');
    }
    if (this.mode === 'accept_edits' && effectiveRisk === 'edit') {
      modeAllow = true;
      consider('allow', 'mode=accept_edits(edit-class tool)');
    }
    if (this.mode === 'bypass') {
      consider('allow', 'mode=bypass');
    }
    if (modeAllow && strictest === 'ask') {
      strictest = 'allow';
      via = 'mode=accept_edits(auto-accepts ask for edit-class)';
    }
    if (strictest === undefined) {
      const fallback = this.opts.defaultEffect ?? 'deny';
      if (fallback === 'ask') return this.decideAsk(tool, args, undefined);
      return { effect: fallback, cachedGrant: false, asked: false };
    }
    if (strictest !== 'ask') return { effect: strictest, rule: via, cachedGrant: false, asked: false };
    return this.decideAsk(tool, args, via);
  }

  private async decideAsk(tool: string, args: unknown, label: string | undefined): Promise<PermissionDecision> {
    const key = grantKey(tool, args);
    const now = this.opts.now?.() ?? Date.now();
    const expiry = this.grants.get(key);
    if (expiry !== undefined && expiry > now) {
      return { effect: 'allow', rule: label ?? `${tool}:cached-grant`, cachedGrant: true, asked: false };
    }
    if (expiry !== undefined) this.grants.delete(key); // expired grants never authorize
    const ask = this.opts.ask;
    if (ask === undefined) return { effect: 'deny', rule: `${tool}:ask-without-handler`, cachedGrant: false, asked: false };
    const granted = await ask(tool, args);
    if (!granted) return { effect: 'deny', rule: `${tool}:ask-denied`, cachedGrant: false, asked: true };
    const ttl = this.opts.approvalTtlMs ?? 5 * 60_000;
    this.grants.set(key, now + ttl);
    return { effect: 'allow', rule: `${tool}:ask-granted(ttl=${Math.floor(ttl / 1000)}s)`, cachedGrant: false, asked: true };
  }

  /** Drop all cached grants (e.g. on session end — approvals are session-scoped). */
  clearGrants(): void {
    this.grants.clear();
  }
}

/** Approval identity = tool + canonical serialization of args (order-insensitive). */
const grantKey = (tool: string, args: unknown): string =>
  canonicalSha256(JSON.stringify({ tool, args: sortKeysDeep(args) }));

const sortKeysDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, val]) => [k, sortKeysDeep(val)]),
    );
  }
  return v;
};
