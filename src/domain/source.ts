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

/**
 * Canonical publication-type vocabulary, mapped per family from native API types
 * (OpenAlex `type`, Crossref `type`, EuropePMC `pubType`; arXiv records ARE
 * preprints by construction). Reviews vs primary research vs preprints vs
 * corrections are different EVIDENTIAL objects: a review aggregates (secondary),
 * an erratum corrects (must not double-count the original), a preprint has not
 * passed peer review. Optional — legacy stored objects read fine without it.
 */
export const PublicationType = z.enum([
  'primary_research',
  'review',
  'preprint',
  'editorial_letter',
  'book_chapter',
  'correction',
  'other',
]);
export type PublicationType = z.infer<typeof PublicationType>;

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
  fullTextSdmRef: z.string().optional(), // structured fulltext understanding (sdm artifact; fetchable via GET /api/v1/ingest/:ref)
  license: z.string().optional(),
  oaUrl: z.string().url().optional(),
  /**
   * Canonical publication type (review/preprint/correction/...). Absent on
   * legacy objects and records whose family API exposes no type signal.
   */
  publicationType: PublicationType.optional(),
  /**
   * RU-R GO2: search-time retraction hint derived from Crossref update-to
   * metadata in the SEARCH response (best effort — coverage depends on the
   * family that surfaced the record). The authoritative status is
   * verification.retractionStatus after identifier resolution; consumers should
   * read that first and fall back to this hint.
   */
  retractionStatus: z.enum(['retracted', 'corrected', 'expression_of_concern', 'reinstated']).optional(),
  /**
   * RU-R frontier candidate 2: retraction REASONS from the offline Retraction
   * Watch table (search-time hint tier, present only when the table produced
   * or enriched the status). Feeds uncertainty-note wording; empty array is
   * never persisted.
   */
  retractionReasons: z.array(z.string().min(1)).optional(),
  /** Misconduct vs honest-error reading of retractionReasons (never guessed; 'unclassified' when the vocabulary is unrecognized). */
  retractionClass: z.enum(['misconduct', 'honest_error', 'unclassified']).optional(),
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
  purpose: z.enum([
    'discovery',
    'supporting',
    'counter_evidence',
    'methodological',
    'identifier_resolution',
    'gap_followup',
    /** Citation-graph expansion (backward references / forward citations) off a pooled seed. */
    'citation_chase',
  ]),
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
  /**
   * Citation-graph expansion (backward references + forward citations) off
   * high-ranked pool seeds. Absent when not executed (no capable family,
   * family failure, or no resolvable seed).
   */
  citationChase: z
    .object({
      seeds: z.number().int().positive(),
      backward: z.number().int().nonnegative(),
      forward: z.number().int().nonnegative(),
      /** New unique documents the chase added to the pool (after dedup). */
      added: z.number().int().nonnegative(),
      /**
       * Depth-2 backward chase (method lineage of the method paper): one hop-2
       * seed max, references only. Absent when hop 2 did not execute.
       */
      hop2: z
        .object({
          seed: z.string(),
          added: z.number().int().nonnegative(),
        })
        .optional(),
      /** Visible failure note when the chase was attempted and aborted (enrichment, non-fatal). */
      failure: z.string().optional(),
    })
    .optional(),
  /**
   * Search-saturation observation over the executed record-bearing searches:
   * novelty rate = share of a search's records that were NEW to the pool at
   * flush time. `saturated` is a decision INPUT for later retrieval rounds
   * (gap-seek, iteration), not a hard stop.
   */
  saturation: z
    .object({
      searches: z.number().int().positive(),
      meanNovelty: z.number().min(0).max(1),
      /** Mean novelty over the LAST half of the searches (diminishing-returns tail). */
      tailNovelty: z.number().min(0).max(1),
      saturated: z.boolean(),
    })
    .optional(),
  /** Composition of the FINAL corpus: families, year spread, publication types. */
  diversity: z
    .object({
      familyCounts: z.record(z.string(), z.number().int().nonnegative()),
      /** Max single-family share of the corpus (0..1) — single-database bias observation. */
      familyConcentration: z.number().min(0).max(1),
      yearMin: z.number().int().optional(),
      yearMax: z.number().int().optional(),
      publicationTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
    })
    .optional(),
  /**
   * RU-R GO2: retracted documents demoted out of cap competition (kept only when
   * the pool cannot fill the cap — visibility over silent drop). Derived from
   * search-time Crossref update-to metadata; resolve-time verification remains
   * authoritative. Absent when no retracted document was in the pool.
   */
  retractedDemoted: z.number().int().nonnegative().optional(),
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
