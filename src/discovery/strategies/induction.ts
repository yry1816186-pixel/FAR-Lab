/**
 * Strategy: induction — inductive extrapolation (directive §2.1-1).
 *
 * Epistemic move: find ≥2 DISTINCT regularities reported across corpus
 * documents, propose ONE unified mechanism that explains them all, and state
 * what the mechanism predicts BEYOND the observed conditions. The unification
 * requirement is structural: the mechanism field must enumerate the source
 * regularities (REGULARITY_1:, REGULARITY_2:, …) so the critique stage — and
 * any auditor — can check the induction actually spans multiple observations
 * instead of restating one paper.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const inductionStrategy: StrategyDefinition = {
  id: 'induction',
  signature: 'corpus_reported_regularities, question -> unified_mechanism + extrapolated_prediction',
  epistemicMove:
    'unify multiple corpus-reported local regularities under one mechanism and extrapolate it beyond observed conditions',
  maxPerCall: 2,
  requiredMarkers: ['REGULARITY_1:', 'REGULARITY_2:'],
  evaluateApplicability: (input) => {
    // Unification needs at least two documents to span; with one document
    // this strategy would merely restate that document (paraphrase risk).
    if (input.corpus.documentCount < 2) {
      return {
        applicable: false,
        skipReason: `induction needs >= 2 corpus documents to unify (corpus has ${input.corpus.documentCount})`,
      };
    }
    return ALWAYS_APPLICABLE;
  },
  instruction: [
    'Identify TWO OR MORE distinct empirical regularities reported in DIFFERENT corpus',
    'documents (each regularity must name its source documentId). Then propose ONE',
    'unified causal mechanism that explains all of them, and state one prediction the',
    'mechanism makes OUTSIDE the range of conditions already observed in the corpus.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST enumerate the regularities it',
    'unifies as "REGULARITY_1: <regularity> [documentId]", "REGULARITY_2: <regularity>',
    '[documentId]", … followed by "UNIFIED_MECHANISM: <the mechanism>" and',
    '"EXTRAPOLATION: <the beyond-observed-conditions prediction>".',
    'A candidate whose mechanism rests on a single document fails this strategy.',
  ].join('\n'),
};
