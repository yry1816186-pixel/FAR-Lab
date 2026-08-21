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
});
export type ScientificClaim = z.infer<typeof ScientificClaim>;
