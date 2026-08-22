import { canonicalSha256 } from '../shared/crypto.js';

/**
 * Permission engine (H5): ordered first-match rules with deny>ask>allow discipline and
 * FAIL-CLOSED default. Ask-grants are cached with a TTL and bound to the exact
 * (tool, canonical args) pair — an approval never generalizes to other arguments
 * (OpenClaw exact-context approval model).
 */

export type PermissionEffect = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
  /** Exact tool name; undefined matches any tool. */
  tool?: string;
  /** Additional argument predicate (evaluated only on tool match). */
  argsMatch?: (args: unknown) => boolean;
  effect: PermissionEffect;
  note?: string;
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
  now?: () => number;
}

export class PermissionEngine {
  private readonly grants = new Map<string, number>();

  constructor(private readonly opts: PermissionEngineOptions) {}

  async decide(tool: string, args: unknown): Promise<PermissionDecision> {
    for (const rule of this.opts.rules ?? []) {
      if (rule.tool !== undefined && rule.tool !== tool) continue;
      if (rule.argsMatch !== undefined && !rule.argsMatch(args)) continue;
      if (rule.effect !== 'ask') {
        return { effect: rule.effect, rule: rule.note ?? rule.tool ?? 'rule', cachedGrant: false, asked: false };
      }
      return this.decideAsk(tool, args, rule);
    }
    const fallback = this.opts.defaultEffect ?? 'deny';
    if (fallback === 'ask') return this.decideAsk(tool, args, undefined);
    return { effect: fallback, cachedGrant: false, asked: false };
  }

  private async decideAsk(tool: string, args: unknown, rule: PermissionRule | undefined): Promise<PermissionDecision> {
    const key = grantKey(tool, args);
    const now = this.opts.now?.() ?? Date.now();
    const expiry = this.grants.get(key);
    if (expiry !== undefined && expiry > now) {
      return { effect: 'allow', rule: rule?.note ?? `${tool}:cached-grant`, cachedGrant: true, asked: false };
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
