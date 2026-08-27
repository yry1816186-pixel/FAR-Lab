import { z } from 'zod';
import { ClaimId, SourceDocumentId, RunId } from './ids.js';

export const CitationBindingStatus = z.enum([
  'verified', // identifier resolved AND content supports the claim location
  'resolved_unaligned', // source resolved but retrieved content does NOT cover the claim — fail-closed
  'unresolved', // identifier could not be resolved
  'missing', // claim cites nothing
]);
export type CitationBindingStatus = z.infer<typeof CitationBindingStatus>;

/** Points at WHERE in the retrieved payload the claim's support lives. */
export const ClaimLocator = z.object({
  sourceDocumentId: SourceDocumentId,
  section: z.string().optional(),
  quote: z.string().min(1), // verbatim excerpt that grounds the claim
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
});
export type ClaimLocator = z.infer<typeof ClaimLocator>;

/**
 * A bounded proposition extracted from content the system ACTUALLY retrieved.
 * Never supported by model memory; never promoted above its locator's content depth.
 */
export const ScientificClaim = z.object({
  id: ClaimId,
  runId: RunId,
  text: z.string().min(1),
  locators: z.array(ClaimLocator).min(1), // a claim without grounding is not admitted
  bindingStatus: CitationBindingStatus,
  /** True when the retrieved excerpt literally contains the claim semantics; alignment check output. */
  alignmentChecked: z.boolean().default(false),
  extractionModelRef: z.string().optional(), // provider/model that extracted it (provenance)
  uncertainties: z.array(z.string()).default([]),
  /**
   * Deterministic GRADE-lite certainty (W-G/F-B; the GRADE approach is a public
   * methodology, gradeworkinggroup.org — the mapping to our attributes is ours).
   * Set at claim-admission time; NOT an LLM judgment and never a scientific truth claim.
   */
  gradeCertainty: z.enum(['high', 'moderate', 'low', 'very_low']).optional(),
  /**
   * T2 content taint (RU-3, single vocabulary owner: domain/memory.ts
   * ContentTaint): claims extracted from retrieved literature are structurally
   * derived_untrusted — set deterministically at extraction, never by an LLM.
   * Hard invariant: derived-untrusted content never enters permission decisions,
   * approval justifications, verdicts, or unlabelled exports.
   */
  taint: z.enum(['trusted', 'untrusted_literal', 'derived_untrusted']).optional(),
  /**
   * HX §15 evidence annotation/classification — the researcher judgement layer.
   * Strictly additive on top of the deterministic extraction fields: pipeline
   * provenance (locators/binding/grade/taint) is never overwritten. Downstream
   * read surfaces must DISCLOSE this layer (researcher-adjusted ACH excludes
   * excluded claims' relations; the claim itself never vanishes from the record
   * or unlabelled exports — exclusion is a judgement, not an erasure).
   */
  researcher: z.object({
    excluded: z.boolean().default(false),
    excludedAt: z.string().datetime().optional(),
    excludedReason: z.string().max(2_000).optional(),
    pinned: z.boolean().default(false),
    pinnedAt: z.string().datetime().optional(),
    /** Researcher role judgement on the neutral proposition (never alters gradeCertainty). */
    classification: z.enum(['core-evidence', 'counter-evidence', 'background', 'methodological-concern']).optional(),
    classifiedAt: z.string().datetime().optional(),
    annotations: z.array(z.object({
      text: z.string().min(1).max(2_000),
      at: z.string().datetime(),
    })).default([]),
  }).default({ excluded: false, pinned: false, annotations: [] }),
});
export type ScientificClaim = z.infer<typeof ScientificClaim>;

/** GRADE-lite inputs — each field is a deterministic proxy for one GRADE domain. */
export interface GradeEvidence {
  /** GRADE risk-of-bias proxy: quote-alignment passed (bindingStatus verified). */
  verifiedBinding: boolean;
  /** GRADE imprecision proxy: the claim text carries explicit quantities/effects. */
  quantitative: boolean;
  /** GRADE indirectness proxy: grounding source published within the recency window. */
  recentSource: boolean;
  /** GRADE inconsistency proxy: count of contradicting/qualifying relations touching this claim. */
  contradictionSignals: number;
}

/**
 * Deterministic certainty downgrade ladder (GRADE-lite): start high; each failed
 * domain steps down one level (floor very_low). Pure, total, offline-testable.
 */
export const gradeClaimCertainty = (e: GradeEvidence): { certainty: ScientificClaim['gradeCertainty']; downgraded: string[] } => {
  const ladder = ['high', 'moderate', 'low', 'very_low'] as const;
  const downgraded: string[] = [];
  let level = 0;
  if (!e.verifiedBinding) { level += 1; downgraded.push('risk_of_bias:unverified_binding'); }
  if (!e.quantitative) { level += 1; downgraded.push('imprecision:no_explicit_quantity'); }
  if (!e.recentSource) { level += 1; downgraded.push('indirectness:stale_source'); }
  if (e.contradictionSignals > 0) { level += 1; downgraded.push(`inconsistency:${e.contradictionSignals}_contradiction_signal(s)`); }
  return { certainty: ladder[Math.min(level, ladder.length - 1)], downgraded };
};

/** GRADE imprecision-domain probe (single owner of the quantity regex): explicit quantities/effects. */
export const hasExplicitQuantity = (text: string): boolean =>
  /\d|fold|percent|%|higher|lower|increase|decrease|significant/i.test(text);

/** Full admission-time grade: GRADE-lite ladder + forensic downgrades + retraction floor. */
export interface FinalGradeInput extends GradeEvidence {
  /** GRIM + range-guard failures measured on the verbatim quote (>= 0). */
  forensicFails: number;
  /** Source is retracted or under expression of concern (floors at very_low). */
  retractedOrEoc: boolean;
}

/**
 * The complete deterministic certainty computation used at claim admission AND at
 * the post-contradiction rescore (SCIENCE lane 2026-08-24): previously the
 * inconsistency domain was permanently 0 because nothing recomputed a grade after
 * claim-claim contradictions were adjudicated. One owner, two callers. Pure.
 */
export const finalGradeCertainty = (e: FinalGradeInput): {
  certainty: ScientificClaim['gradeCertainty'];
  downgraded: string[];
} => {
  const base = gradeClaimCertainty(e);
  const ladder = ['high', 'moderate', 'low', 'very_low'] as const;
  let idx = ladder.indexOf(base.certainty ?? 'very_low');
  if (idx < 0) idx = ladder.length - 1;
  if (e.retractedOrEoc) {
    return { certainty: 'very_low', downgraded: [...base.downgraded, 'retraction:retracted_or_eoc_floor'] };
  }
  const steps = Math.min(e.forensicFails, ladder.length - 1 - idx);
  const downgraded = steps > 0 ? [...base.downgraded, `forensics:${e.forensicFails}_grim_or_range_failure(s)`] : [...base.downgraded];
  return { certainty: ladder[Math.min(idx + steps, ladder.length - 1)]!, downgraded };
};
