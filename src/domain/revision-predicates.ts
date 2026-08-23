/**
 * RU-14 A8.4 — deterministic revision-quality predicates (packet verdict: BUILD).
 *
 * Pure functions over before/after hypothesis snapshots. They score a
 * Revision v_n → v_n+1 mechanically so revision quality never rests on LLM
 * self-report:
 *  - decisionRulePreservation: every decision rule survives verbatim or is
 *    explicitly upgraded; silent weakening is caught;
 *  - falsifiabilityRetention: the revised hypothesis must stay testable and
 *    keep its predictions/spec — falsifiability cannot quietly evaporate;
 *  - scopeDelta: changed-field ratio, an honest size-of-edit measure.
 *
 * An LLM advisory layer may later CONSUME this vector; it never replaces it
 * (deterministic-first constitution).
 */

export interface FalsificationSnapshot {
  decisionRule?: string;
  [k: string]: unknown;
}

export interface HypothesisSnapshot {
  id: string;
  version: number;
  status?: string;
  statement: string;
  mechanism?: string;
  predictions?: string[];
  testability?: string;
  falsification?: FalsificationSnapshot;
}

/** Fields that carry the hypothesis's scientific content for scope accounting. */
const SCOPE_FIELDS = ['statement', 'mechanism', 'predictions'] as const;

export interface RulePreservationResult {
  preserved: boolean;
  /** Field names of rules whose text changed between versions. */
  changedRules: string[];
  /** Rules present before but absent after. */
  droppedRules: string[];
}

const RULE_FIELDS = ['decisionRule', 'supportCondition', 'weakeningCondition', 'falsificationCondition'] as const;

export function decisionRulePreservation(before: HypothesisSnapshot, after: HypothesisSnapshot): RulePreservationResult {
  const changedRules: string[] = [];
  const droppedRules: string[] = [];
  const fb = before.falsification;
  const fa = after.falsification;
  if (!fb) {
    // No rule existed before — nothing to preserve.
    return { preserved: true, changedRules, droppedRules };
  }
  if (!fa) {
    return { preserved: false, changedRules, droppedRules: ['falsification'] };
  }
  for (const f of RULE_FIELDS) {
    const b = fb[f];
    const a = fa[f];
    if (typeof b === 'string' && typeof a === 'string') {
      if (b !== a) changedRules.push(f);
    } else if (typeof b === 'string' && a === undefined) {
      droppedRules.push(f);
    }
    // absent-before → present-after is an addition: not a preservation failure.
  }
  return { preserved: changedRules.length === 0 && droppedRules.length === 0, changedRules, droppedRules };
}

export interface FalsifiabilityResult {
  retained: boolean;
  detail: string;
}

export function falsifiabilityRetention(before: HypothesisSnapshot, after: HypothesisSnapshot): FalsifiabilityResult {
  if (after.testability === 'unfalsifiable') {
    return { retained: false, detail: 'testability degraded to unfalsifiable' };
  }
  const beforePreds = before.predictions ?? [];
  const afterPreds = new Set(after.predictions ?? []);
  const lostPredictions = beforePreds.filter((p) => !afterPreds.has(p));
  if (beforePreds.length > 0 && afterPreds.size === 0) {
    return { retained: false, detail: `all ${beforePreds.length} prediction(s) removed without replacement` };
  }
  const hadSpec = before.falsification !== undefined;
  const stillHasSpec = after.falsification !== undefined;
  if (hadSpec && !stillHasSpec) {
    return { retained: false, detail: 'falsification spec removed' };
  }
  if (lostPredictions.length > 0 && afterPreds.size > 0) {
    // Partial prediction loss with replacements surviving: allowed but disclosed.
    return { retained: true, detail: `${lostPredictions.length} prediction(s) removed; ${afterPreds.size} remain` };
  }
  return { retained: true, detail: 'falsifiability intact' };
}

export interface ScopeDeltaResult {
  /** Number of considered fields whose content actually changed. */
  changedStatements: number;
  /** Total fields compared. */
  totalConsidered: number;
  ratio: number;
  /** Names of the changed fields (for disclosure). */
  changedFields: string[];
}

export function scopeDelta(before: HypothesisSnapshot, after: HypothesisSnapshot): ScopeDeltaResult {
  let changed = 0;
  const changedFields: string[] = [];
  for (const f of SCOPE_FIELDS) {
    const b = JSON.stringify(before[f] ?? null);
    const a = JSON.stringify(after[f] ?? null);
    if (b !== a) {
      changed += 1;
      changedFields.push(f);
    }
  }
  const total = SCOPE_FIELDS.length;
  return { changedStatements: changed, totalConsidered: total, ratio: changed / total, changedFields };
}

export interface RevisionPredicateVector {
  decisionRulesPreserved: boolean;
  falsifiabilityRetained: boolean;
  scope: ScopeDeltaResult;
  rulePreservation: RulePreservationResult;
  falsifiability: FalsifiabilityResult;
}

/** Composite vector for one revision step. Deterministic; same inputs → same output. */
export function revisionPredicates(before: HypothesisSnapshot, after: HypothesisSnapshot): RevisionPredicateVector {
  return {
    decisionRulesPreserved: decisionRulePreservation(before, after).preserved,
    falsifiabilityRetained: falsifiabilityRetention(before, after).retained,
    scope: scopeDelta(before, after),
    rulePreservation: decisionRulePreservation(before, after),
    falsifiability: falsifiabilityRetention(before, after),
  };
}
