import { z } from 'zod';
import { CorpusSnapshotId, SourceDocumentId, RunId } from './ids.js';

/** What depth of content the system ACTUALLY retrieved — the claim ceiling (D-006). */
export const ContentDepth = z.enum(['metadata_only', 'abstract', 'full_text', 'data']);
export type ContentDepth = z.infer<typeof ContentDepth>;

/**
 * Retrieval family. 'user_provided' marks documents the RESEARCHER supplied
 * at run creation (R1 entry upgrade) — they bypass search adapters entirely
 * (sourceAdapterFor fails closed on them), join the corpus as guaranteed
 * entries, and carry provenance explicitly.
 */
export const SourceFamily = z.enum(['openalex', 'arxiv', 'crossref', 'europepmc', 'user_provided']);
export type SourceFamily = z.infer<typeof SourceFamily>;

/** Persistent external identifier types the system can resolve and cross-check. */
export const SourceIdentifier = z.object({
  kind: z.enum(['doi', 'arxiv', 'pubmed', 'url', 'openalex', 'corpus', 'other']),
  value: z.string().min(1),
});
export type SourceIdentifier = z.infer<typeof SourceIdentifier>;

export const AccessState = z.enum(['open', 'restricted', 'paywalled', 'unavailable', 'unknown']);
export type AccessState = z.infer<typeof AccessState>;

export const SourceDocument = z.object({
  id: SourceDocumentId,
  runId: RunId,
  family: SourceFamily,
  identifiers: z.array(SourceIdentifier).min(1),
  title: z.string(),
  publicationYear: z.number().int().optional(),
  authors: z.array(z.string()).default([]),
  venue: z.string().optional(),
  contentDepth: ContentDepth,
  accessState: AccessState,
  /** sha256 over the CANONICAL normalized payload (raw bytes proved unstable — source spike). */
  contentHash: z.string().length(64),
  /** Volatile fields removed before hashing (cited_by_count etc. — spike-derived exclusion list). */
  hashBasis: z.string().default('canonical-json-volatile-excluded-v1'),
  retrievedAt: z.string().datetime(),
  parseStatus: z.enum(['ok', 'partial', 'failed']),
  abstractText: z.string().optional(),
  fullTextRef: z.string().optional(), // artifact-store ref when depth=full_text
  license: z.string().optional(),
  oaUrl: z.string().url().optional(),
  /** Result of identifier-resolution verification (verify_sources stage). Absent = not yet verified. */
  verification: z.object({
    method: z.enum(['crossref_doi', 'arxiv_id', 'openalex_id', 'europepmc_id', 'url']),
    resolved: z.boolean(),
    titleMatch: z.boolean().optional(),
    /**
     * W6/F3 (refchecker EXTRACT): multi-signal wrong-paper risk grade for resolved
     * docs whose title did NOT match — zero surname overlap AND (year gap >=2 or
     * unknown) AND venue-incompatible. Identifier stays authoritative (resolved is
     * never flipped); the flag makes the metadata conflict visible and countable.
     */
    wrongPaperSuspect: z.boolean().optional(),
    /**
     * RU-6 GO1 (Crossref Retraction Watch, update-to field): corpus-trust gate.
     * Derived from the resolved Crossref record's update-to entries — a retracted
     * or expression-of-concern work is still resolvable (identifier stays
     * authoritative) but its claims are demoted downstream and the status is
     * rendered everywhere the source appears.
     */
    retractionStatus: z.enum(['retracted', 'corrected', 'expression_of_concern', 'reinstated']).optional(),
    detail: z.string().optional(),
    checkedAt: z.string().datetime(),
  }).optional(),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

export const RetrievalQuery = z.object({
  purpose: z.enum(['discovery', 'supporting', 'counter_evidence', 'methodological', 'identifier_resolution', 'gap_followup']),
  text: z.string().min(1),
  family: SourceFamily.optional(),
});
export type RetrievalQuery = z.infer<typeof RetrievalQuery>;

/**
 * D-015 retrieval fusion record: how the raw multi-query pool became the final corpus.
 * Absent on pre-fusion snapshots (optional keeps stored objects readable).
 */
export const RetrievalFusion = z.object({
  algorithm: z.literal('rrf-k60+llm-listwise-rerank-v1'),
  /** Unique documents in the post-dedup pool BEFORE corpus-cap selection. */
  poolSize: z.number().int().nonnegative(),
  /** Whether the LLM listwise rerank reordered the pool (false = fallback to RRF order). */
  rerankApplied: z.boolean(),
  /** When rerank was attempted but failed: the visible failure reason (absent when not attempted). */
  rerankFailure: z.string().optional(),
  /** Counter-origin documents kept in the final corpus (quota floor evidence). */
  counterSeatsKept: z.number().int().nonnegative(),
  /**
   * W6/F2: arXiv zero-result recovery searches executed (k4/k2 cascades).
   * Absent when no recovery was needed (all arXiv searches returned results).
   */
  variantSearches: z.number().int().nonnegative().optional(),
  /** OpenAlex->Europe PMC failover searches executed after openalex target failures. */
  failoverSearches: z.number().int().nonnegative().optional(),
  /** W6/F4: listwise-rerank sliding windows executed (absent = single window / no rerank). */
  rerankWindows: z.number().int().positive().optional(),
  /** Compact human-auditable note of the selection (e.g. "cap 12 of pool 31"). */
  selection: z.string().min(1),
});
export type RetrievalFusion = z.infer<typeof RetrievalFusion>;

/** Immutable record of what the system actually searched and saw. */
export const CorpusSnapshot = z.object({
  id: CorpusSnapshotId,
  runId: RunId,
  queries: z.array(RetrievalQuery).min(1),
  documentIds: z.array(SourceDocumentId),
  createdAt: z.string().datetime(),
  /** Which families were attempted but unavailable/failed — failures stay visible. */
  familyFailures: z.array(z.object({ family: SourceFamily, reason: z.string() })).default([]),
  fusion: RetrievalFusion.optional(),
});
export type CorpusSnapshot = z.infer<typeof CorpusSnapshot>;
