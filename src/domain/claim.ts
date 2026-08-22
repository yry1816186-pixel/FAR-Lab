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
