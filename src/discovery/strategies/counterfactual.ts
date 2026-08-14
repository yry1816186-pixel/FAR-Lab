/**
 * Strategy: counterfactual — collapse-surface mapping (directive §2.1-7).
 *
 * Epistemic move: pick ONE key variable the question's reported conclusions
 * depend on and construct the counterfactual world where it is absent or
 * inverted. Which observations would COLLAPSE, which would be UNAFFECTED?
 * The collapse surface is a map of the implicit causal structure — what
 * the field's conclusions secretly lean on. A variable whose removal
 * collapses everything or nothing carries no causal information; the
 * informative counterfactual splits the observations.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const counterfactualStrategy: StrategyDefinition = {
  id: 'counterfactual',
  signature: 'key_variable, question -> counterfactual_collapse_map',
  epistemicMove:
    'remove or invert one key variable and map which reported observations collapse and which survive',
  maxPerCall: 2,
  requiredMarkers: ['COUNTERFACTUAL_VARIABLE:', 'COLLAPSE_CONSEQUENCE:'],
  evaluateApplicability: () => ALWAYS_APPLICABLE,
  instruction: [
    'Choose ONE key variable that the reported observations and conclusions depend on, and',
    'construct the counterfactual world in which that variable is ABSENT or INVERTED.',
    'Derive explicitly which reported observations would COLLAPSE in that world and which',
    'would be UNAFFECTED — the boundary between the two is the implicit causal structure',
    'this strategy exists to expose.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"COUNTERFACTUAL_VARIABLE: <the variable and how it is removed or inverted>" followed',
    'by "COLLAPSE_CONSEQUENCE: <the observations that would collapse>" (also name what',
    'survives). The falsificationMethod MUST target an edge of the collapse surface: a',
    'near-counterfactual condition where partial collapse should already be measurable. A',
    'counterfactual whose collapse set is everything or nothing carries no causal',
    'information and fails this strategy.',
  ].join('\n'),
};
