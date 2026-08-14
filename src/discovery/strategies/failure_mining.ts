/**
 * Strategy: failure_mining — limitations & known-unknowns extraction
 * (directive §2.1-8).
 *
 * Epistemic move: mine the corpus's limitations / future-work / negative-result
 * passages for explicitly acknowledged unknowns and turn those "known unknowns"
 * directly into conjecture seeds. This is the highest-precision strategy in the
 * catalog (the gap is literature-attested, so the seed is real) — which is why
 * every candidate must carry a LIMITATION_ORIGIN pointer back to the document
 * that admitted the gap.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const failureMiningStrategy: StrategyDefinition = {
  id: 'failure_mining',
  signature: 'corpus_limitation_passages, question -> gap_seeded_conjectures',
  epistemicMove:
    'extract acknowledged limitations/future-work/negative results from the corpus and seed conjectures from those explicit gaps',
  maxPerCall: 2,
  requiredMarkers: ['LIMITATION_ORIGIN:'],
  evaluateApplicability: (input) => {
    // Without any abstract there is no limitations text to mine.
    const withAbstract = input.corpus.documents.filter((d) => d.abstract !== null).length;
    if (withAbstract === 0) {
      return {
        applicable: false,
        skipReason: 'failure_mining needs at least one corpus document with an abstract (0 have abstracts)',
      };
    }
    return ALWAYS_APPLICABLE;
  },
  instruction: [
    'Search the corpus documents for acknowledged LIMITATIONS, future-work statements,',
    'negative results, and "we could not determine …" passages. Each such passage names',
    'a known unknown. Turn the most consequential known unknowns into candidate',
    'hypotheses: what would be true if the gap were filled by mechanism X?',
    '',
    'STRUCTURAL REQUIREMENT: at least one entry of the "assumptions" array MUST be',
    'formatted as "LIMITATION_ORIGIN: <documentId>: <the admitted unknown this',
    'candidate builds on>". A gap-seeded candidate that cannot point at the document',
    'admitting the gap is fabricated provenance and fails this strategy.',
    'The "risks" field must name what evidence class is currently missing.',
  ].join('\n'),
};
