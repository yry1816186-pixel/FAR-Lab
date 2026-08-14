/**
 * Strategy: analogy — cross-domain structural analogy (directive §2.1-3).
 *
 * Epistemic move: retrieve an isomorphic problem from a DISTANT domain and
 * import its mechanism structure as a candidate explanation. Historically a
 * large class of discoveries came from exactly this move — but analogies also
 * breed pseudo-explanations, so the mapping is forced to be explicit and
 * falsifiable: source domain, the structural correspondence, and the
 * conditions under which the analogy breaks are all named inside
 * relationToExistingTheory.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const analogyStrategy: StrategyDefinition = {
  id: 'analogy',
  signature: 'question, distant_domain_repertoire -> structurally_mapped_candidate_explanation',
  epistemicMove:
    'import a mechanism structure from a distant discipline and map it onto the question, naming where the mapping breaks',
  maxPerCall: 2,
  requiredMarkers: ['SOURCE_DOMAIN:', 'MAPPING:', 'FAILURE_CONDITIONS:'],
  evaluateApplicability: () => ALWAYS_APPLICABLE,
  instruction: [
    'Think of a DISTANT domain (a different discipline — e.g. epidemiology for an',
    'astronomy question, ecology for a materials question, economics for a neural',
    'science question) that has already solved a STRUCTURALLY isomorphic problem.',
    'Import that solution structure as a candidate explanation for the question.',
    '',
    'STRUCTURAL REQUIREMENT: the "relationToExistingTheory" field MUST be formatted as',
    '"SOURCE_DOMAIN: <domain>" then "MAPPING: <which structural elements correspond to',
    'which elements of the question>" then "FAILURE_CONDITIONS: <conditions under which',
    'the analogy stops holding>". The falsificationMethod must target a consequence',
    'that the MAPPING specifically predicts (not merely a generic prediction of the',
    'target domain).',
    'An analogy without explicit failure conditions is not a hypothesis.',
  ].join('\n'),
};
