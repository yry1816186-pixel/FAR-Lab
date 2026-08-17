/**
 * retrieval/types — content-provenance types for documents retrieved from
 * authoritative scientific sources (OpenAlex / arXiv / Crossref).
 *
 * Why this module exists (forensic K1, 2026-08-12): the verdict kernel is
 * deterministic and real, but the EVIDENCE feeding it was LLM parametric
 * memory + hardcoded fixtures. This module is the contract for REAL retrieved
 * documents — every field below is program-populated from an actual network
 * response; an LLM never gets to invent a document or its provenance.
 *
 * Provenance discipline (directive §10): for any hypothesis that cites a
 * document D, a third party must be able to answer: what is D, where did it
 * come from, when was it fetched, was it modified, how do I verify it? The
 * fields here are engineered so those questions have deterministic answers.
 *
 * Model neutrality / untrusted-content discipline (§12): retrieved content is
 * DATA, never instructions. Downstream consumers must route any text through
 * sanitizeExternalContent() before it touches a model context; this module
 * does NOT do that itself (it returns raw structured fields).
 */

/** Authoritative scientific source repositories FAR-Lab can retrieve from. */
export const DOCUMENT_SOURCES = ['openalex', 'arxiv', 'crossref'] as const;
/** Type alias: a document source repository identifier. */
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

/** Parser version tag (bumped when an adapter's parsing logic changes). */
export const RETRIEVAL_PARSER_VERSION = 'openalex-atom-v1';

/**
 * A document retrieved from an authoritative scientific source.
 *
 * `documentId` is PROGRAM-GENERATED (deterministic hash of source+pid+content),
 * never supplied by an LLM. This is the trust anchor: a hypothesis citing
 * documentId D can be resolved back to exactly this provenance record.
 */
export interface RetrievedDocument {
  /** Program-generated stable id (hash-derived). NEVER LLM-supplied. */
  readonly documentId: string;
  /** Source repository. */
  readonly sourceType: DocumentSource;
  /** Human-readable source name (e.g. "OpenAlex"). */
  readonly sourceName: string;
  /**
   * Persistent identifier at the source (OpenAlex work id / arXiv id / DOI).
   * The canonical handle a third party uses to re-resolve this document.
   */
  readonly persistentIdentifier: string;
  /** DOI if the source exposes one (normalized lowercase, null if absent). */
  readonly doi: string | null;
  /** Canonical resolver URL (where a third party can view/verify the document). */
  readonly canonicalUrl: string;
  /** Document title as returned by the source (whitespace-normalized). */
  readonly title: string;
  /** Author display names, in source order. */
  readonly authors: readonly string[];
  /** Publication date (ISO yyyy-mm-dd or yyyy-mm or yyyy), null if unknown. */
  readonly publicationDate: string | null;
  /** ISO timestamp when FAR-Lab retrieved this document. */
  readonly retrievedAt: string;
  /**
   * 'cache' when this document was replayed from the persistent retrieval
   * cache (retrievedAt = the ORIGINAL fetch time; rawHash stable). Absent =
   * fresh live fetch (additive optional — pre-cache documents simply lack it).
   */
  readonly retrievedFrom?: 'cache' | undefined;
  /** The query string that produced this hit. */
  readonly retrievalQuery: string;
  /** Method tag (e.g. "openalex-rest", "arxiv-api-atom", "crossref-rest"). */
  readonly retrievalMethod: string;
  /** sha256 of the raw response payload (exact bytes/strings as received). */
  readonly rawHash: string;
  /** sha256 of the normalized canonical-JSON representation of this document. */
  readonly normalizedHash: string;
  /** Parser version that produced this record (see RETRIEVAL_PARSER_VERSION). */
  readonly parserVersion: string;
  /** Abstract / summary text (whitespace-normalized), null if absent. */
  readonly abstract: string | null;
  /** License string if stated by the source, null otherwise. */
  readonly licenseMetadata: string | null;
  /**
   * Present when an abstract existed at the source but was WITHHELD by our
   * compliance gate (day-r13: Crossref records without a permissive record-
   * level license — see COMPLIANCE-data-redistribution.md §5.2). Distinguishes
   * "we chose not to ship it" from "the source had none". Provenance
   * annotation only — deliberately NOT part of normalizedDocumentHash.
   */
  readonly abstractWithheldReason?: 'crossref_record_license_not_permissive' | undefined;
}

/** A retrieval request. */
export interface RetrievalQuery {
  /** Free-text search query. */
  readonly text: string;
  /** Maximum number of documents to return (adapter may return fewer). */
  readonly maxResults: number;
  /** Which source to query. */
  readonly source: DocumentSource;
}

/** How a retrieval was served. */
export type RetrievalFetchMode = 'live' | 'replay';

/** The result of a retrieval call. */
export interface RetrievalResult {
  readonly query: RetrievalQuery;
  readonly documents: readonly RetrievedDocument[];
  /** 'live' = real network fetch this call; 'replay' = served from a recorded fixture. */
  readonly fetchMode: RetrievalFetchMode;
  /** ISO timestamp of this retrieval call. */
  readonly retrievedAt: string;
}

/**
 * A retrieval adapter: maps a RetrievalQuery to real (or replayed) documents.
 * Each authoritative source implements this interface.
 */
export interface RetrievalAdapter {
  readonly source: DocumentSource;
  readonly sourceName: string;
  retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]>;
}
