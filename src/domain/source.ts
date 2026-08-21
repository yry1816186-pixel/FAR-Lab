import { z } from 'zod';
import { CorpusSnapshotId, SourceDocumentId, RunId } from './ids.js';

/** What depth of content the system ACTUALLY retrieved — the claim ceiling (D-006). */
export const ContentDepth = z.enum(['metadata_only', 'abstract', 'full_text', 'data']);
export type ContentDepth = z.infer<typeof ContentDepth>;

export const SourceFamily = z.enum(['openalex', 'arxiv', 'crossref']);
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
    method: z.enum(['crossref_doi', 'arxiv_id', 'openalex_id', 'url']),
    resolved: z.boolean(),
    titleMatch: z.boolean().optional(),
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

/** Immutable record of what the system actually searched and saw. */
export const CorpusSnapshot = z.object({
  id: CorpusSnapshotId,
  runId: RunId,
  queries: z.array(RetrievalQuery).min(1),
  documentIds: z.array(SourceDocumentId),
  createdAt: z.string().datetime(),
  /** Which families were attempted but unavailable/failed — failures stay visible. */
  familyFailures: z.array(z.object({ family: SourceFamily, reason: z.string() })).default([]),
});
export type CorpusSnapshot = z.infer<typeof CorpusSnapshot>;
