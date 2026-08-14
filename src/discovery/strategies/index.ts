/**
 * discovery/strategies — the strategy registry (directive §2.1, Appendix A).
 *
 * STRATEGY_REGISTRY is the deterministic fan-out order: call order, candidate
 * tie-break order, and CLI subset ordering all derive from it. APPEND-ONLY:
 * inserting or reordering entries changes deterministic outputs — new
 * strategies are added at the end and the order is never shuffled. The
 * registry-length guard test pins the catalog at 10 (the full §2.1 catalog;
 * ≥8 is the minimum shipping quota).
 */

import type { StrategyDefinition } from './strategy.ts';
import { inductionStrategy } from './induction.ts';
import { abductionStrategy } from './abduction.ts';
import { analogyStrategy } from './analogy.ts';
import { inversionStrategy } from './inversion.ts';
import { extremeConditionsStrategy } from './extreme_conditions.ts';
import { constraintRelaxationStrategy } from './constraint_relaxation.ts';
import { counterfactualStrategy } from './counterfactual.ts';
import { failureMiningStrategy } from './failure_mining.ts';
import { contradictionMiningStrategy } from './contradiction_mining.ts';
import { dataDrivenStrategy } from './data_driven.ts';

export {
  inductionStrategy,
  abductionStrategy,
  analogyStrategy,
  inversionStrategy,
  extremeConditionsStrategy,
  constraintRelaxationStrategy,
  counterfactualStrategy,
  failureMiningStrategy,
  contradictionMiningStrategy,
  dataDrivenStrategy,
};
export type { StrategyDefinition };

/**
 * Registered strategies in deterministic catalog order (= STRATEGY_IDS order):
 * call order, candidate tie-break order, and CLI subset ordering all derive
 * from this array. APPEND-ONLY — never insert or reorder.
 */
export const STRATEGY_REGISTRY: readonly StrategyDefinition[] = [
  inductionStrategy,
  abductionStrategy,
  analogyStrategy,
  inversionStrategy,
  extremeConditionsStrategy,
  constraintRelaxationStrategy,
  counterfactualStrategy,
  failureMiningStrategy,
  contradictionMiningStrategy,
  dataDrivenStrategy,
];
