/**
 * Strategy: data_driven — mechanism conjectures from reported empirical
 * patterns (directive §2.1-10).
 *
 * Epistemic move: find a numeric pattern the corpus abstracts actually
 * REPORT (a correlation, a scaling law, a trend, a threshold), restate it
 * with its numbers, and propose the GENERATIVE mechanism that would produce
 * it. The guardrail is "correlation is not causation", made structural: the
 * mechanism must be a causal story whose falsifiable consequences go beyond
 * restating the pattern — a mechanism that merely re-describes the
 * correlation explains nothing.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const dataDrivenStrategy: StrategyDefinition = {
  id: 'data_driven',
  signature: 'corpus_reported_numeric_patterns, question -> generative_mechanism_conjecture',
  epistemicMove:
    'restate a corpus-reported numeric pattern and conjecture the causal mechanism that generates it',
  maxPerCall: 2,
  requiredMarkers: ['EMPIRICAL_PATTERN:', 'MECHANISM_EXPLANATION:'],
  evaluateApplicability: (input) => {
    // v0 deterministic heuristic: a document whose abstract contains at
    // least one digit plausibly reports a numeric pattern (correlation,
    // scaling, trend, threshold). Blind spots accepted for v0: a purely
    // verbal pattern report is missed, and a digit in a non-numeric role
    // (e.g. a compound name) is a false positive — both only affect the
    // skip decision, never candidate content.
    const withNumericAbstract = input.corpus.documents.filter((d) => /\d/.test(d.abstract ?? '')).length;
    if (withNumericAbstract === 0) {
      return {
        applicable: false,
        skipReason: 'data_driven needs at least one corpus abstract reporting numeric patterns (0 abstracts contain digits)',
      };
    }
    return ALWAYS_APPLICABLE;
  },
  instruction: [
    'Find a NUMERIC pattern reported in a corpus abstract: a correlation, a scaling law, a',
    'trend, or a threshold — with the numbers the abstract actually reports. First RESTATE',
    'the pattern exactly as reported (numbers included, source documentId named), then',
    'propose the generative mechanism that would PRODUCE it. Correlation is not causation:',
    'the mechanism must be a causal story, and its falsifiable consequences must go beyond',
    'restating the pattern itself.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"EMPIRICAL_PATTERN: <the reported pattern with its numbers> [documentId]" followed by',
    '"MECHANISM_EXPLANATION: <the mechanism that generates the pattern>". The',
    'falsificationMethod MUST target a causal EDGE of the mechanism — an intervention or',
    'natural experiment on the proposed cause — because re-measuring the correlation only',
    're-tests the pattern, not the mechanism. A candidate whose mechanism merely',
    're-describes the pattern fails this strategy.',
  ].join('\n'),
};
