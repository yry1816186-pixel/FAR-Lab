/**
 * research/citation — bind a hypothesis's cited documentIds to the corpus
 * (directive §9.5). Pure: reuses the retrieval CitationResolver, which is a
 * deterministic set-membership check — no LLM, no I/O.
 *
 * A hypothesis may cite only documentIds present in the grounding corpus; any
 * cited id that does not resolve is UNBOUND and cannot serve as evidence
 * (directive §9.5: 100% binding for accepted claims, 0 unbound-as-evidence).
 */

import type { CitationResolver } from '../retrieval/citation_resolver.ts';
import { buildEvidenceRelations } from './citation_gate.ts';
import type { CitationBinding, HypothesisCandidate } from './types.ts';

/**
 * Bind a candidate's supporting + counter-evidence citations to the corpus.
 * Also derives the claim↔document evidence relations (supports/contradicts,
 * bound/unbound) — pure set-membership, no LLM, no I/O.
 */
export function bindCitations(
  candidate: HypothesisCandidate,
  resolver: CitationResolver,
): CitationBinding {
  const supporting = resolver.validate(candidate.supportingCitations);
  const counter = resolver.validate(candidate.counterEvidenceCitations);
  const unbound = [...new Set([...supporting.unbound, ...counter.unbound])];
  const base = {
    supportingIds: [...candidate.supportingCitations],
    counterIds: [...candidate.counterEvidenceCitations],
    boundSupporting: [...supporting.bound],
    boundCounter: [...counter.bound],
    unbound,
    allBound: unbound.length === 0,
    snapshotId: resolver.boundSnapshotId,
  };
  return {
    ...base,
    relations: buildEvidenceRelations(candidate.id, base),
  };
}
