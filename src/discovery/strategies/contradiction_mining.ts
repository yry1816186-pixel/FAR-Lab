/**
 * Strategy: contradiction_mining — cross-literature conflict pairs
 * (directive §2.1-9).
 *
 * Epistemic move: find two corpus documents whose conclusions genuinely
 * CONFLICT — same quantity with opposite signs, materially different effect
 * sizes, incompatible sample behaviors — and instead of averaging the
 * conflict away, propose a moderating mechanism or hidden variable that
 * makes BOTH sides locally correct. A conflict is signal: it means some
 * third quantity varies between the two studies. The resolution must name
 * both conflicting conclusions (with documentIds) and the moderator that
 * reconciles them — dismissing one side as error is not resolution.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const contradictionMiningStrategy: StrategyDefinition = {
  id: 'contradiction_mining',
  signature: 'conflicting_corpus_conclusions, question -> moderating_mechanism_hypothesis',
  epistemicMove:
    'mine conflicting corpus conclusion pairs and propose the moderating mechanism that makes both locally correct',
  maxPerCall: 2,
  requiredMarkers: ['CONFLICT_A:', 'CONFLICT_B:', 'RESOLUTION_MECHANISM:'],
  evaluateApplicability: (input) => {
    // A conflict pair needs two documents to disagree; with one document
    // there is nothing to mine (fabricating a conflict is prohibited).
    if (input.corpus.documentCount < 2) {
      return {
        applicable: false,
        skipReason: `contradiction_mining needs >= 2 corpus documents to conflict (corpus has ${input.corpus.documentCount})`,
      };
    }
    return ALWAYS_APPLICABLE;
  },
  instruction: [
    'Search the corpus for a PAIR of genuinely conflicting conclusions: the same quantity',
    'reported with opposite signs, materially different effect sizes, or incompatible',
    'sample behaviors. Propose a moderating mechanism or hidden variable — a third quantity',
    'that varies between the two studies — such that BOTH conclusions are locally correct',
    'under it. Do NOT average the conflict away and do NOT dismiss one side as error: the',
    'conflict is the signal.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"CONFLICT_A: <conclusion> [documentId]", "CONFLICT_B: <conflicting conclusion>',
    '[documentId]", followed by "RESOLUTION_MECHANISM: <the moderator or hidden variable>',
    'The falsificationMethod MUST target a prediction in which the moderator SPLITS the',
    'conflicting samples — sorting observations by the moderator should turn one reported',
    'conclusion into two conditioned ones. A resolution that cannot be conditioned on',
    'anything measurable fails this strategy.',
  ].join('\n'),
};
