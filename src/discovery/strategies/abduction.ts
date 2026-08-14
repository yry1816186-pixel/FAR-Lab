/**
 * Strategy: abduction — inference to a minimal explanatory set (directive
 * §2.1-2).
 *
 * Epistemic move: given the phenomena the corpus reports, search for the
 * SMALLEST set of mechanisms that JOINTLY explains all of them. Abduction is
 * inference to the best explanation, and its discipline is parsimony: if one
 * mechanism can carry both phenomena, two mechanisms is over-fitting the
 * explananda. The joint-explanation demand is structural (PHENOMENON_1:, …,
 * MINIMAL_SET:) and the falsifier must be a JOINT prediction — one that fails
 * when any single mechanism is removed, so a corroborating test speaks for
 * the SET, never for one member alone.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const abductionStrategy: StrategyDefinition = {
  id: 'abduction',
  signature: 'observed_phenomena_set, question -> minimal_explanatory_mechanism_set',
  epistemicMove:
    'collect corpus-reported phenomena and infer the smallest mechanism set that jointly explains them all',
  maxPerCall: 2,
  requiredMarkers: ['PHENOMENON_1:', 'PHENOMENON_2:', 'MINIMAL_SET:'],
  evaluateApplicability: (input) => {
    // Joint explanation needs at least two phenomena drawn from the corpus;
    // a single document cannot supply a phenomenon SET to explain.
    if (input.corpus.documentCount < 2) {
      return {
        applicable: false,
        skipReason: `abduction needs >= 2 corpus documents to draw phenomena from (corpus has ${input.corpus.documentCount})`,
      };
    }
    return ALWAYS_APPLICABLE;
  },
  instruction: [
    'Enumerate TWO OR MORE phenomena that corpus documents actually report (each phenomenon',
    'must name its source documentId). Then search for the MINIMAL set of mechanisms that',
    'JOINTLY explains every enumerated phenomenon: if ONE mechanism can explain them all,',
    'use one — never multiply mechanisms beyond what the phenomena demand, and never leave a',
    'phenomenon unexplained by the set.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"PHENOMENON_1: <phenomenon> [documentId]", "PHENOMENON_2: <phenomenon> [documentId]",',
    '… followed by "MINIMAL_SET: <the mechanism or mechanisms, listed member by member>".',
    'The falsificationMethod MUST target a JOINT prediction of the minimal set: a prediction',
    'that should FAIL if any single mechanism were removed from the set. A candidate whose',
    'phenomena come from one document only, or whose falsifier survives the deletion of a',
    'mechanism, fails this strategy.',
  ].join('\n'),
};
