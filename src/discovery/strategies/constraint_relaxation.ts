/**
 * Strategy: constraint_relaxation — perturb the field's default assumptions
 * (directive §2.1-6).
 *
 * Epistemic move: every field runs on default assumptions it has stopped
 * noticing — simplifications baked into the standard models (linearity,
 * homogeneity, equilibrium, independence) and constraints its methodology
 * imposes (sample boundaries, controlled conditions). This strategy picks
 * ONE such default and perturbs it: RELAX the simplification and see how the
 * conclusions change, or TIGHTEN the constraint until it contradicts the
 * data and read the exposed contradiction as a new question. Either
 * direction is legal; hiding which one was taken is not — the unused
 * direction carries an explicit placeholder so the marker pair is always
 * machine-greppable.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const constraintRelaxationStrategy: StrategyDefinition = {
  id: 'constraint_relaxation',
  signature: 'domain_default_assumptions, question -> assumption_perturbation_conjecture',
  epistemicMove:
    'relax or tighten one domain-default assumption and read the changed (or contradictory) conclusions as a new conjecture',
  maxPerCall: 2,
  requiredMarkers: ['RELAXED_ASSUMPTION:', 'TIGHTENED_ASSUMPTION:'],
  evaluateApplicability: () => ALWAYS_APPLICABLE,
  instruction: [
    'Identify the DEFAULT assumptions the field no longer notices: simplifications the',
    'standard models bake in (linearity, homogeneity, equilibrium, independence) and',
    'constraints methodology imposes (sample boundaries, controlled conditions). Pick ONE',
    'and perturb it in a single direction:',
    '- RELAX it: drop the simplification — how do the field\'s conclusions change when the',
    '  constraint no longer holds?',
    '- TIGHTEN it: push the constraint until it CONTRADICTS the reported data — what new',
    '  question does the contradiction expose?',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST contain BOTH markers. Fill in the',
    'chosen direction — "RELAXED_ASSUMPTION: <the assumption being relaxed and how',
    'conclusions change>" or "TIGHTENED_ASSUMPTION: <the constraint being tightened and the',
    'contradiction exposed>" — and give the unused direction its explicit placeholder',
    '"(not used — direction: relax)" or "(not used — direction: tighten)". The',
    'falsificationMethod MUST target a consequence that only holds under the perturbed',
    'assumption (it should fail when the default is restored). A candidate that perturbs',
    'nothing fails this strategy.',
  ].join('\n'),
};
