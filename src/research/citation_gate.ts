/**
 * research/citation_gate — the deterministic citation gate (directive §9.5).
 *
 * Hard rules this module enforces at the run level:
 *   1. Unbound citations are NEVER effective evidence. They are excluded from
 *      every evidence-counting dimension and named in the report.
 *   2. Accepted claims must be 100% bound: the primary hypothesis can only be
 *      selected among fully-bound candidates when at least one exists.
 *   3. When a candidate has unbound citations and none is fully bound, the
 *      gate verdict is INCONCLUSIVE (an honest degradation, never a silent
 *      acceptance).
 *
 * The report is PURE (same bindings → same report): `far research verify`
 * recomputes it and v2 run files are upgraded through it.
 */

import type { RetrievedDocument } from '../retrieval/types.ts';
import type { CitationBinding, CitationGateReport, EvidenceRelation } from './types.ts';

/**
 * Derive the claim↔document evidence relations for one binding. Pure: the
 * relations are the citation lists themselves annotated with the resolution
 * outcome — fields the model never extracted (locator / studyType / quality /
 * uncertainty / directness) stay honest nulls.
 */
export function buildEvidenceRelations(
  claimId: string,
  binding: Pick<CitationBinding, 'supportingIds' | 'counterIds' | 'boundSupporting' | 'boundCounter'>,
): readonly EvidenceRelation[] {
  const boundIds = new Set([
    ...binding.boundSupporting.map((d) => d.documentId),
    ...binding.boundCounter.map((d) => d.documentId),
  ]);
  const relations: EvidenceRelation[] = [];
  for (const id of binding.supportingIds) {
    relations.push(relationFor(claimId, id, 'supports', boundIds.has(id)));
  }
  for (const id of binding.counterIds) {
    relations.push(relationFor(claimId, id, 'contradicts', boundIds.has(id)));
  }
  return relations;
}

function relationFor(
  claimId: string,
  documentId: string,
  relation: 'supports' | 'contradicts',
  bound: boolean,
): EvidenceRelation {
  return {
    claimId,
    documentId,
    relation,
    locator: null,
    directness: null,
    studyType: null,
    quality: null,
    uncertainty: null,
    extractedBy: 'model',
    validatedBy: bound ? 'deterministic-bind' : null,
    validationStatus: bound ? 'bound' : 'unbound',
    failureReason: bound
      ? null
      : 'cited id does not resolve in the grounding corpus — excluded from effective evidence',
  };
}

/**
 * Whether a document belongs to a binding's resolved set (helper for the
 * orchestrator's re-binding after authoritative re-resolution).
 */
export function documentResolvesInBinding(
  doc: RetrievedDocument,
  binding: Pick<CitationBinding, 'boundSupporting' | 'boundCounter'>,
): boolean {
  return (
    binding.boundSupporting.some((d) => d.documentId === doc.documentId) ||
    binding.boundCounter.some((d) => d.documentId === doc.documentId)
  );
}

/**
 * Compute the run-level citation gate report (pure). Deterministic for the
 * same inputs — recomputable by `far research verify` and the v2 upgrade path.
 */
export function computeCitationGateReport(input: {
  readonly bindings: Readonly<Record<string, CitationBinding>>;
  readonly primaryHypothesisId: string | null;
}): CitationGateReport {
  const { bindings, primaryHypothesisId } = input;

  const cited = new Set<string>();
  const bound = new Set<string>();
  const unbound = new Set<string>();
  const perHypothesis: Record<string, { allBound: boolean; unbound: string[] }> = {};

  for (const [id, b] of Object.entries(bindings)) {
    for (const c of [...b.supportingIds, ...b.counterIds]) {
      cited.add(c);
    }
    for (const d of [...b.boundSupporting, ...b.boundCounter]) {
      bound.add(d.documentId);
    }
    for (const u of b.unbound) {
      unbound.add(u);
    }
    perHypothesis[id] = { allBound: b.allBound, unbound: [...b.unbound] };
  }

  const totalCited = cited.size;
  const boundCount = totalCited === 0 ? 0 : [...cited].filter((c) => bound.has(c)).length;
  const boundRate = totalCited === 0 ? 1 : boundCount / totalCited;

  const primaryAllBound =
    primaryHypothesisId !== null ? (perHypothesis[primaryHypothesisId]?.allBound ?? false) : false;

  const anyAllBound = Object.values(perHypothesis).some((p) => p.allBound);
  const gateVerdict: CitationGateReport['gateVerdict'] =
    unbound.size === 0 ? 'PASS' : anyAllBound ? 'DEGRADED' : 'INCONCLUSIVE';

  return {
    boundRate,
    totalCited,
    boundCount,
    unboundEvidenceCount: unbound.size,
    resolvedViaRetrieval: [],
    perHypothesis,
    primaryRequiresAllBound: true,
    primaryAllBound,
    gateVerdict,
  };
}
