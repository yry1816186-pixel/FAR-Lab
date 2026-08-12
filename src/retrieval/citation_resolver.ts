/**
 * retrieval/citation_resolver — deterministic citation binding (K1 Phase 3).
 *
 * This is the mechanism that makes LLM citations UNFABRICATABLE (forensic K3
 * root cause: the agent_loop accepted LLM-emitted evidenceIds with zero
 * validation; the R-identifier rule was dead code). A hypothesis may only cite
 * documents that RESOLVE in the corpus snapshot that grounded it. Any cited id
 * that does not resolve is UNBOUND — it cannot serve as evidence.
 *
 * Crucial honesty distinction (directive §20 vs §16):
 *   - "unbound" here means "not present in THIS corpus snapshot" — it is NOT a
 *     claim that the underlying paper is fabricated (the corpus is finite). The
 *     honest verdict consequence is therefore INCONCLUSIVE/UNTESTED ("we cannot
 *     ground this citation"), NOT REFUTED. Fabricated-DOI detection (a DOI that
 *     does not exist in Crossref at all) is the SEPARATE K5 resource_checker,
 *     which legitimately maps to REFUTED via the kernel's R-identifier rule.
 *
 * Deterministic, side-effect-free, no LLM involvement: the resolver is a pure
 * set-membership check over the snapshot's documentIds.
 */
import type { CorpusSnapshot } from './corpus.ts';
import { corpusGet } from './corpus.ts';
import type { RetrievedDocument } from './types.ts';

/** The result of validating a set of cited documentIds against a corpus. */
export interface CitationValidation {
  /** The documentIds the hypothesis cited (as-supplied, order preserved). */
  readonly citedIds: readonly string[];
  /** Citations that RESOLVE in the corpus (real retrieved documents). */
  readonly bound: readonly RetrievedDocument[];
  /** Citations that do NOT resolve (unbound — cannot serve as evidence). */
  readonly unbound: readonly string[];
  /** The snapshot these citations were checked against. */
  readonly snapshotId: string;
  /** True iff every cited id resolved (no unbound citations). */
  readonly allBound: boolean;
}

/**
 * A deterministic citation resolver bound to one corpus snapshot.
 * Stateless beyond the snapshot reference; safe to reuse across hypotheses
 * that share the same grounding corpus.
 */
export class CitationResolver {
  private readonly snapshot: CorpusSnapshot;

  constructor(snapshot: CorpusSnapshot) {
    this.snapshot = snapshot;
  }

  /** Resolve a single documentId → document, or null if not in the corpus. */
  resolve(documentId: string): RetrievedDocument | null {
    return corpusGet(this.snapshot, documentId);
  }

  /** Validate a set of cited documentIds against the corpus. */
  validate(citedIds: readonly string[]): CitationValidation {
    const bound: RetrievedDocument[] = [];
    const unbound: string[] = [];
    const seen = new Set<string>();
    for (const id of citedIds) {
      if (seen.has(id)) continue; // de-duplicate cited ids
      seen.add(id);
      const doc = this.resolve(id);
      if (doc) {
        bound.push(doc);
      } else {
        unbound.push(id);
      }
    }
    return {
      citedIds: [...citedIds],
      bound,
      unbound,
      snapshotId: this.snapshot.snapshotId,
      allBound: unbound.length === 0,
    };
  }

  /** The snapshotId this resolver is bound to. */
  get boundSnapshotId(): string {
    return this.snapshot.snapshotId;
  }
}

/**
 * The honest verdict-consequence hint for an unbound citation.
 *
 * Unbound citations cannot ground a verdict → the claim cannot be CONFIRMED on
 * their basis. The defensible forced verdict is INCONCLUSIVE (tested but the
 * cited evidence is not grounded), matching the kernel's R8 family. Callers
 * (agent_loop integration, Phase 4) use this hint to prevent a verdict from
 * resting on unbound citations. This function does NOT touch the kernel; it
 * only states the consequence deterministically.
 */
export function citationValidationVerdictHint(validation: CitationValidation): {
  readonly forcedMinimumVerdict: 'INCONCLUSIVE' | 'NONE';
  readonly reasonCode: string | null;
} {
  if (validation.allBound) {
    return { forcedMinimumVerdict: 'NONE', reasonCode: null };
  }
  return {
    forcedMinimumVerdict: 'INCONCLUSIVE',
    reasonCode: 'CITATION_UNBOUND',
  };
}
