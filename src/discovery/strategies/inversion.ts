/**
 * Strategy: inversion — negation of the mainstream assumption (directive
 * §2.1-4).
 *
 * Epistemic move: locate the explanation the corpus treats as dominant for
 * the question, ASSUME IT IS FALSE, and derive what should then be observed.
 * The value of the move lives entirely in the discriminating observation:
 * a world where the mainstream explanation is false must differ observably
 * from the mainstream world, or the negation is empty contrarianism. Both
 * the negated assumption and the if-false signal are named inside the
 * mechanism so the critique stage can check the inversion is testable.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const inversionStrategy: StrategyDefinition = {
  id: 'inversion',
  signature: 'mainstream_explanation, question -> negated_assumption + discriminating_observation',
  epistemicMove:
    'negate the corpus-dominant explanation and derive the discriminating observation its falsity demands',
  maxPerCall: 2,
  requiredMarkers: ['MAINSTREAM_ASSUMPTION:', 'IF_FALSE_OBSERVABLE:'],
  evaluateApplicability: () => ALWAYS_APPLICABLE,
  instruction: [
    'Identify the explanation the corpus treats as DOMINANT for this question (the one most',
    'documents presuppose or converge on). Explicitly assume it is FALSE, then derive what',
    'SHOULD be observed in that inverted world: a discriminating observation on which the',
    'mainstream world and the inverted world genuinely disagree.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"MAINSTREAM_ASSUMPTION: <the dominant explanation being negated>" followed by',
    '"IF_FALSE_OBSERVABLE: <the alternative signal that should appear if it is false>".',
    'The falsificationMethod MUST target that discriminating observation specifically —',
    'not a generic prediction that holds in both worlds. An inversion without a',
    'discriminating observation is contrarianism, not a hypothesis.',
  ].join('\n'),
};
