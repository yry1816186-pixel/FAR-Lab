/**
 * discovery/types — the discovery layer's own vocabulary (import-free on
 * purpose so research/types can reference StrategyId without a runtime cycle).
 *
 * Two things live here:
 *
 * 1. ConjectureState — the honest-epistemology ladder (directive §2.4). A
 *    generated idea is NOT a discovery; it climbs a deterministic ladder and
 *    every promotion is a typed, auditable transition. REDISCOVERY and
 *    NOVEL_VALIDATED are alternative terminal outcomes (not a chain: a
 *    rediscovery is not a stepping stone to novelty), and NOVEL_VALIDATED is
 *    unreachable without an explicit human-review reference — the disclosure
 *    discipline made structural.
 *
 * 2. StrategyId — the closed set of orthogonal reasoning strategies
 *    (directive §2.1, Appendix A). The full catalog is 10; ≥8 is the minimum
 *    shipping quota (batched rollout allowed, target line is 10).
 *
 * Zero-entropy discipline: no Date.now / Math.random / process.env reads —
 * these are pure type-level and transition-check constructs.
 */

// ── Conjecture confidence ladder (directive §2.4) ────────────────────────────

export const CONJECTURE_STATES = [
  'RAW_IDEA',
  'STRUCTURED_CONJECTURE',
  'CORROBORATED',
  'KERNEL_ADJUDICATED',
  'REDISCOVERY',
  'NOVEL_VALIDATED',
] as const;

export type ConjectureState = (typeof CONJECTURE_STATES)[number];

/** Terminal outcomes: once literature-matched or human-validated, no further transitions. */
export const TERMINAL_CONJECTURE_STATES: ReadonlySet<ConjectureState> = new Set([
  'REDISCOVERY',
  'NOVEL_VALIDATED',
]);

/**
 * Legal promotion edges. Every edge is a DEMOTION-FREE forward step; nothing
 * falls back down the ladder (a refuted conjecture simply never promotes past
 * KERNEL_ADJUDICATED — its verdict is carried by the kernel, not this ladder).
 */
export const CONJECTURE_TRANSITIONS: Readonly<
  Record<ConjectureState, readonly ConjectureState[]>
> = {
  RAW_IDEA: ['STRUCTURED_CONJECTURE'],
  STRUCTURED_CONJECTURE: ['CORROBORATED'],
  CORROBORATED: ['KERNEL_ADJUDICATED'],
  KERNEL_ADJUDICATED: ['REDISCOVERY', 'NOVEL_VALIDATED'],
  REDISCOVERY: [],
  NOVEL_VALIDATED: [],
};

/** Typed promotion evidence (directive §2.4 — each promotion needs a deterministic check). */
export interface ConjecturePromotionEvidence {
  /** Reference to the deterministic check that justified this promotion (gate/verdict id, content hash, …). */
  readonly deterministicCheckRef?: string;
  /** REQUIRED for → REDISCOVERY: the matching literature pointer (DOI/citation content hash). */
  readonly matchingLiterature?: string;
  /** REQUIRED for → NOVEL_VALIDATED: explicit human-review record reference (disclosure discipline). */
  readonly humanReviewRef?: string;
}

/**
 * Apply one ladder transition. Throws on illegal edges, on terminal states,
 * and when a promotion demanding evidence arrives without it — fail-closed,
 * never silently accept (§7 spirit; this vocabulary feeds the trust chain).
 */
export function transitionConjectureState(
  from: ConjectureState,
  to: ConjectureState,
  evidence: ConjecturePromotionEvidence = {},
): ConjectureState {
  if (!CONJECTURE_STATES.includes(from)) {
    throw new Error(`unknown conjecture state: ${String(from)}`);
  }
  const legal = CONJECTURE_TRANSITIONS[from];
  if (!legal.includes(to)) {
    throw new Error(
      `illegal conjecture transition: ${from} → ${to} (legal targets: [${legal.join(', ') || 'none'}])`,
    );
  }
  if (to === 'REDISCOVERY' && (evidence.matchingLiterature ?? '').trim() === '') {
    throw new Error(
      'promotion to REDISCOVERY requires non-empty evidence.matchingLiterature (the matching work must be named)',
    );
  }
  if (to === 'NOVEL_VALIDATED' && (evidence.humanReviewRef ?? '').trim() === '') {
    throw new Error(
      'promotion to NOVEL_VALIDATED requires non-empty evidence.humanReviewRef (AI-generated findings never self-certify as discoveries — directive §2.4)',
    );
  }
  return to;
}

/** Whether a state can still transition (false for terminal outcomes). */
export function isTerminalConjectureState(state: ConjectureState): boolean {
  return TERMINAL_CONJECTURE_STATES.has(state);
}

// ── Orthogonal reasoning strategies (directive §2.1, Appendix A) ─────────────

/**
 * The closed strategy catalog. Order matters: it is the deterministic fan-out
 * call order, the tie-break order for candidate truncation, and the registry
 * index — changing it changes deterministic outputs, so it is append-only.
 */
export const STRATEGY_IDS = [
  'induction',
  'abduction',
  'analogy',
  'inversion',
  'extreme_conditions',
  'constraint_relaxation',
  'counterfactual',
  'failure_mining',
  'contradiction_mining',
  'data_driven',
] as const;

export type StrategyId = (typeof STRATEGY_IDS)[number];

/** Parse/validate a user-supplied strategy subset (CLI `--strategies`). Fail-closed on unknown names. */
export function parseStrategyIdList(raw: string): readonly StrategyId[] {
  const names = raw
    .split(/[+,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) {
    throw new Error('strategy list must not be empty');
  }
  const unknown = names.filter((n) => !(STRATEGY_IDS as readonly string[]).includes(n));
  if (unknown.length > 0) {
    throw new Error(
      `unknown strategy id(s): ${unknown.join(', ')} — valid ids: ${STRATEGY_IDS.join(', ')}`,
    );
  }
  const unique = [...new Set(names)] as StrategyId[];
  // Preserve catalog order regardless of user input order (determinism).
  return STRATEGY_IDS.filter((id) => unique.includes(id));
}

/** PARAPHRASE_RISK marker prefix used by the fan-out dedup pass (deterministic, machine-greppable). */
export const PARAPHRASE_RISK_MARKER = 'PARAPHRASE_RISK';
