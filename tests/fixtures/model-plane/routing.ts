import type { ModelProvider } from '../../../src/shared/ports.js';
import {
  capabilitiesForModel,
  isQwenFamily,
  type ModelCapabilities,
} from '../../../src/model-plane/capabilities.js';

/**
 * DETERMINISTIC TASK-CLASS ROUTER (model-plane lane, 2026-08-24).
 *
 * One route per (task-class, call): the agent runtime asks for a TASK CLASS, not a
 * global model. Properties mandated by the mission and enforced here:
 *
 *  - deterministic: pure function of (taskClass, candidates, policy, budgetCtx);
 *    score ties break lexicographically by route name — same inputs, same decision.
 *  - observable: the RoutingDecision lists EVERY candidate considered with an
 *    accept/reject reason; decisions ride on receipts (plane.ts stamps them).
 *  - budget-aware: routes whose reference price exceeds the remaining call budget are
 *    rejected with reason 'over-remaining-budget' (only when BOTH numbers are known —
 *    unknown price never silently blocks or passes a route).
 *  - policy-aware: 'competition' mode admits ONLY qwen-family models (official rule,
 *    research doc §A1). Default mode is model-agnostic — ANY provider/model worldwide
 *    routes freely (user directive 2026-08-26: the product supports all models, all
 *    protocols; no project-wide provider bans exist in the router).
 *  - reproducible: selectedVia names the exact decision rule that picked the route.
 *  - overridable: policy.overrides[taskClass] wins over scoring (selectedVia 'override');
 *    explicit override of a rejected route fails visible (it must still pass the
 *    competition gate + hard capability requirements — an override is a preference,
 *    not a policy escape hatch).
 */

export const TASK_CLASSES = [
  'cheap_extraction',   // mechanical extraction over given text; cost-sensitive
  'high_quality_reasoning', // hypothesis generation/critique, scientific synthesis
  'vision',             // image→structured understanding
  'structured_output',  // schema-adherence-critical projections
  'long_context',       // corpus-scale packaging/synthesis
  'review',             // adversarial review, falsification critique
  'ranking',            // ordering/judging candidates
  'coding',             // code generation/editing
  'embedding',          // dense vectors
  'rerank',             // relevance reranking
  'conversation',       // interactive chat (resident agent)
] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

export interface RouteCandidate {
  /** Stable UNIQUE route key: builtin provider name ('dashscope'), 'custom:<mcfg id>', or any unique label for multi-model routes. */
  name: string;
  provider: ModelProvider;
  modelId: string;
  /**
   * Registry lookup key when `name` is a multi-model label (e.g. name='qwen-plus-route',
   * providerName='dashscope'). Defaults to `name` — single-model builtin routes need nothing.
   */
  providerName?: string;
  /** Registry-resolved at construction time (undefined = not in registry, UNVERIFIED). */
  capabilities?: ModelCapabilities;
}

export type RoutingPolicyMode = 'default' | 'competition';

export interface RoutingPolicy {
  mode: RoutingPolicyMode;
  /**
   * task class → route name pin. Wins over scoring; still subject to hard gates
   * (competition qwen-only in that mode, task-class hard requirements like vision).
   */
  overrides?: Partial<Record<TaskClass, string>>;
}

export interface BudgetCtx {
  /** Remaining USD the researcher allows for THIS call (ceiling minus spent); undefined = unconstrained. */
  remainingUsd?: number;
  /** Rough input size in tokens, for context-fit pruning when the registry knows the window. */
  estimatedInputTokens?: number;
}

export interface RoutingDecisionCandidateVerdict {
  name: string;
  modelId: string;
  accepted: boolean;
  reason: string;
  score?: number;
}

export interface RoutingDecision {
  taskClass: TaskClass;
  policyMode: RoutingPolicyMode;
  selectedRoute: string | null;
  selectedVia: 'override' | 'capability-score' | 'only-route' | null;
  candidates: RoutingDecisionCandidateVerdict[];
  budgetCtx?: BudgetCtx;
}

/** Registry provider key for a candidate (explicit providerName > route name). */
const providerKeyOf = (cand: RouteCandidate): string => cand.providerName ?? cand.name;

/**
 * Hard gates every route passes in every mode. Returns a rejection reason or null.
 * Default mode is provider-agnostic by design (user directive 2026-08-26): no
 * per-vendor ban exists — the ONLY policy gate is competition mode, which pins the
 * official-rule route (Qwen-family base on Bailian). The historical project-wide
 * DeepSeek ban (2026-08-22) was REMOVED by that directive; git history keeps the
 * provenance.
 */
const hardGate = (
  cand: RouteCandidate,
  policy: RoutingPolicy,
  taskClass: TaskClass,
): string | null => {
  if (policy.mode === 'competition') {
    if (!isQwenFamily(cand.modelId)) return 'competition-policy: base model must be Qwen-family (official rule 2026-08-24)';
    const pk = providerKeyOf(cand);
    if (pk !== 'dashscope' && !pk.startsWith('custom:')) {
      return 'competition-policy: calling route must be Bailian(dashscope) or a custom Bailian endpoint';
    }
  }
  // Task-class hard requirements — capability facts, not preferences.
  const caps = cand.capabilities;
  if (caps === undefined) {
    // Unknown capabilities: eligible only for classes with no hard capability gate.
    // vision/embedding/rerank/long_context REQUIRE verified facts; text classes
    // tolerate unverified (a custom endpoint may legitimately serve any chat model).
    if (taskClass === 'vision' || taskClass === 'embedding' || taskClass === 'rerank' || taskClass === 'long_context') {
      return 'capabilities-unverified: registry has no entry for this model — cannot prove the hard requirement for this task class';
    }
    return null;
  }
  switch (taskClass) {
    case 'vision': if (!caps.vision) return 'no-vision-capability'; break;
    case 'embedding': if (!caps.embedding) return 'no-embedding-capability'; break;
    case 'rerank': if (!caps.rerank) return 'no-rerank-capability'; break;
    case 'structured_output':
      if (caps.structuredOutput === 'prompt_contract') return 'no-server-structured-output (prompt-contract only)';
      break;
    default: break;
  }
  return null;
};

/** Preference score per task class (higher = better). Pure, deterministic. */
const classScore = (cand: RouteCandidate, taskClass: TaskClass): number => {
  const caps = cand.capabilities;
  const latencyPref: Record<string, { fast: number; balanced: number; deep: number }> = {
    cheap_extraction: { fast: 3, balanced: 2, deep: 0 },
    high_quality_reasoning: { fast: 0, balanced: 2, deep: 3 },
    vision: { fast: 1, balanced: 3, deep: 2 },
    structured_output: { fast: 1, balanced: 3, deep: 2 },
    long_context: { fast: 0, balanced: 2, deep: 3 },
    review: { fast: 0, balanced: 2, deep: 3 },
    ranking: { fast: 1, balanced: 3, deep: 2 },
    coding: { fast: 1, balanced: 3, deep: 2 },
    embedding: { fast: 3, balanced: 1, deep: 0 },
    rerank: { fast: 3, balanced: 1, deep: 0 },
    conversation: { fast: 2, balanced: 3, deep: 1 },
  };
  let score = latencyPref[taskClass]!.balanced; // unverified-capability routes score as balanced
  if (caps !== undefined) {
    score = latencyPref[taskClass]![caps.latencyClass];
    // Vendor-agnostic capability bonuses (user directive 2026-08-26: preferences must
    // not favor one vendor's family — match what the model IS, by its registry key).
    if (taskClass === 'coding' && /coder|code/i.test(caps.modelKey)) score += 2;
    if (taskClass === 'high_quality_reasoning' && caps.reasoning) score += 1;
    if (taskClass === 'review' && caps.reasoning) score += 1;
    if (taskClass === 'long_context' && /long/i.test(caps.modelKey)) score += 2;
    if (taskClass === 'structured_output' && caps.structuredOutput === 'json_schema_strict') score += 2;
    if (taskClass === 'cheap_extraction' && caps.priceRef !== undefined && caps.priceRef.inputPerMTok <= 1) score += 1;
    if (taskClass === 'vision' && caps.structuredOutput !== undefined) score += 0; // vision gate already hard
  }
  return score;
};

/** Context-window + budget pruning against KNOWN facts only. */
const softGate = (cand: RouteCandidate, taskClass: TaskClass, budget: BudgetCtx): string | null => {
  const caps = cand.capabilities;
  if (caps?.contextTokens !== undefined && budget.estimatedInputTokens !== undefined) {
    // Reserve output headroom (25%) — a context-fit route must leave room to answer.
    if (budget.estimatedInputTokens > caps.contextTokens * 0.75) {
      return `context-overflow: input ~${budget.estimatedInputTokens}tok exceeds 75% of verified ${caps.contextTokens}tok window`;
    }
  }
  if (budget.remainingUsd !== undefined && caps?.priceRef !== undefined) {
    // Worst-case single-call estimate at the LOWEST tier input price over the estimated
    // input + a 4k output allowance. Reference pricing only (see capabilities.ts honesty
    // rule) — this gate PRUNES, it never computes billed cost.
    const estInput = budget.estimatedInputTokens ?? 8_000;
    const estUsd = ((estInput + 4_000) / 1e6) * caps.priceRef.inputPerMTok
      + (4_000 / 1e6) * caps.priceRef.outputPerMTok;
    if (caps.priceRef.currency === 'USD' && estUsd > budget.remainingUsd) {
      return `over-remaining-budget: est ~$${estUsd.toFixed(4)} > $${budget.remainingUsd.toFixed(4)} remaining (reference pricing)`;
    }
    // CNY reference prices can still guard with the documented Beijing free-tier reality:
    // a CNY-priced route against a USD budget is price-incomparable — never prune on it.
  }
  return null;
};

export const routeCall = (
  taskClass: TaskClass,
  candidates: RouteCandidate[],
  policy: RoutingPolicy = { mode: 'default' },
  budget: BudgetCtx = {},
): RoutingDecision => {
  if (!TASK_CLASSES.includes(taskClass)) {
    throw new Error(`unknown task class: ${taskClass}`);
  }
  const verdicts: RoutingDecisionCandidateVerdict[] = [];
  const eligible: RouteCandidate[] = [];
  const byName = new Map(candidates.map((c) => [c.name, c] as const));
  const seenNames = new Set<string>();
  for (const cand of candidates) {
    if (seenNames.has(cand.name)) throw new Error(`duplicate route name "${cand.name}" — route keys must be unique`);
    seenNames.add(cand.name);
  }

  for (const cand of candidates) {
    const hard = hardGate(cand, policy, taskClass);
    if (hard !== null) {
      verdicts.push({ name: cand.name, modelId: cand.modelId, accepted: false, reason: hard });
      continue;
    }
    const soft = softGate(cand, taskClass, budget);
    if (soft !== null) {
      verdicts.push({ name: cand.name, modelId: cand.modelId, accepted: false, reason: soft });
      continue;
    }
    verdicts.push({
      name: cand.name, modelId: cand.modelId, accepted: true,
      reason: 'eligible', score: classScore(cand, taskClass),
    });
    eligible.push(cand);
  }

  // Override: highest precedence among accepted routes — but it must be ACCEPTED first
  // (overrides express preference among usable routes, never bypass hard gates).
  const overrideName = policy.overrides?.[taskClass];
  if (overrideName !== undefined) {
    const hit = eligible.find((c) => c.name === overrideName);
    if (hit !== undefined) {
      return { taskClass, policyMode: policy.mode, selectedRoute: hit.name, selectedVia: 'override', candidates: verdicts, ...(Object.keys(budget).length > 0 ? { budgetCtx: budget } : {}) };
    }
    const existed = byName.get(overrideName);
    const verdict = verdicts.find((v) => v.name === overrideName);
    throw new Error(
      `routing override "${overrideName}" for task class "${taskClass}" is not usable: ` +
        (existed === undefined
          ? 'no such route among candidates'
          : `rejected by gates (${verdict?.reason ?? 'unknown'}) — override is a preference, not a policy escape`),
    );
  }

  if (eligible.length === 0) {
    return { taskClass, policyMode: policy.mode, selectedRoute: null, selectedVia: null, candidates: verdicts, ...(Object.keys(budget).length > 0 ? { budgetCtx: budget } : {}) };
  }
  if (eligible.length === 1) {
    return { taskClass, policyMode: policy.mode, selectedRoute: eligible[0]!.name, selectedVia: 'only-route', candidates: verdicts, ...(Object.keys(budget).length > 0 ? { budgetCtx: budget } : {}) };
  }
  // Deterministic: score desc, then name asc — same inputs always route identically.
  const ranked = eligible
    .slice()
    .sort((a, b) => classScore(b, taskClass) - classScore(a, taskClass) || a.name.localeCompare(b.name));
  return { taskClass, policyMode: policy.mode, selectedRoute: ranked[0]!.name, selectedVia: 'capability-score', candidates: verdicts, ...(Object.keys(budget).length > 0 ? { budgetCtx: budget } : {}) };
};

/** Convenience: build RouteCandidates from (name, provider, modelId) with registry lookup (providerName defaults to name). */
export const candidate = (name: string, provider: ModelProvider, modelId: string, providerName?: string): RouteCandidate => {
  const pk = providerName ?? name;
  const caps = capabilitiesForModel(pk, modelId);
  return caps !== undefined ? { name, provider, modelId, ...(providerName !== undefined ? { providerName } : {}), capabilities: caps } : { name, provider, modelId, ...(providerName !== undefined ? { providerName } : {}) };
};
