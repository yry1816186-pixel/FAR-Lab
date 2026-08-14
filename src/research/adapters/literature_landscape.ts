/**
 * research/adapters/literature_landscape — domain-general ExperimentAdapter.
 *
 * The one analysis step EVERY research run can execute honestly: a
 * deterministic landscape analysis over the run's OWN frozen corpus (the
 * documents really retrieved for this question — text modality, §13).
 * No LLM, no extra network in replay mode; in live mode the corpus was
 * genuinely fetched. Metrics are pure functions of the corpus snapshot, so
 * `far research verify` can recompute them byte-for-byte.
 *
 * Scientific meaning (what the numbers actually say):
 *   - counterEvidenceShare: fraction of retrieved documents attributed to
 *     ADVERSARIAL query strategies (non-replication / null-result / criticism /
 *     alternative-explanation). A LOW share is a real, measurable confirmation
 *     bias in the evidence base — it proposes (never forces) a targeted
 *     counter-evidence expansion of the plan.
 *   - freshness: median publication year + share of documents from the last
 *     five years. A stale corpus is a real limitation for fast-moving fields.
 *   - sourceFamilies: how many independent bibliographic families grounded the
 *     run (single-family grounding is a known singleton risk).
 *
 * Honesty rules (same as the exoplanet adapter):
 *   - nulls/unknown years are counted, never imputed;
 *   - thresholds are documented constants, not tuned per-run;
 *   - a healthy landscape is reported as 'no change proposed' (feedback may
 *     honestly propose nothing — iteration is never forced).
 */

import type { CorpusSnapshot } from '../../retrieval/corpus.ts';

/** Adversarial query suffixes (SSOT: retrieval/counter_evidence.ts COUNTER_EVIDENCE_SUFFIXES). */
const COUNTER_SUFFIXES: readonly string[] = [
  'failure to replicate',
  'null result',
  'no effect',
  'criticism',
  'alternative explanation',
];

/** Documented thresholds (constants — never tuned per run). */
export const LANDSCAPE_THRESHOLDS = {
  /** Below this counter-evidence share the corpus is confirmation-skewed. */
  counterShareFloor: 0.10,
  /** Below this share of ≤5-year-old documents the corpus is stale. */
  freshShareFloor: 0.20,
  /** Freshness window in years. */
  freshWindowYears: 5,
} as const;

/** Deterministic landscape metrics over one corpus snapshot. */
export interface LiteratureLandscapeObservation {
  readonly kind: 'literature-landscape';
  /** Corpus identity this analysis was computed over (recomputable). */
  readonly snapshotId: string;
  readonly rootHash: string;
  readonly totalDocuments: number;
  /** Documents attributed to the primary (supporting) query. */
  readonly supportingDocuments: number;
  /** Documents attributed to adversarial query strategies. */
  readonly counterEvidenceDocuments: number;
  /** counterEvidenceDocuments / totalDocuments (0 when no documents). */
  readonly counterEvidenceShare: number;
  /** Median publication year over dated documents (null when none dated). */
  readonly medianPublicationYear: number | null;
  /** Documents with unknown publication date (counted, not imputed). */
  readonly unknownYearDocuments: number;
  /** Share of documents published within the freshness window (0..1). */
  readonly freshShare: number;
  /** Distinct bibliographic source families represented. */
  readonly sourceFamilies: readonly string[];
  /** Field-agnostic identifiers for the query set (provenance). */
  readonly queryCount: number;
  /** ISO timestamp of the analysis. */
  readonly producedAt: string;
}

/** Dataset card for the landscape adapter (input = the run's own corpus). */
export interface LandscapeDatasetCard {
  readonly source: string;
  readonly sourceUrl: string;
  readonly version: string;
  readonly persistentId: string;
  readonly license: string;
  readonly downloadedAt: string;
  readonly checksumField: string;
  readonly checksumValue: string;
  readonly fields: readonly string[];
  readonly knownBias: string;
  readonly allowedInference: string;
  readonly forbiddenInference: string;
}

function parseYear(publicationDate: string | null): number | null {
  if (publicationDate === null) return null;
  const year = Number(publicationDate.slice(0, 4));
  return Number.isInteger(year) && year >= 1500 && year <= 2200 ? year : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Classify one retrieval query: adversarial, primary, or decomposition. */
export function isCounterEvidenceQuery(query: string): boolean {
  const q = query.toLowerCase();
  return COUNTER_SUFFIXES.some((suffix) => q.includes(suffix));
}

/** Compute the landscape metrics (pure — same corpus ⇒ same result). */
export function analyzeLiteratureLandscape(
  corpus: CorpusSnapshot,
  producedAt: string,
  currentYear: number,
): { result: LiteratureLandscapeObservation; datasetCard: LandscapeDatasetCard } {
  const docs = corpus.documents;
  let supporting = 0;
  let counter = 0;
  const years: number[] = [];
  let unknownYear = 0;
  let fresh = 0;
  const families = new Set<string>();
  const primaryQuery = corpus.sourceQueries[0] ?? null;

  for (const doc of docs) {
    families.add(doc.sourceType);
    if (primaryQuery !== null && doc.retrievalQuery === primaryQuery) {
      supporting += 1;
    } else if (isCounterEvidenceQuery(doc.retrievalQuery)) {
      counter += 1;
    }
    const year = parseYear(doc.publicationDate);
    if (year === null) {
      unknownYear += 1;
    } else {
      years.push(year);
      if (year >= currentYear - LANDSCAPE_THRESHOLDS.freshWindowYears + 1) {
        fresh += 1;
      }
    }
  }

  const result: LiteratureLandscapeObservation = {
    kind: 'literature-landscape',
    snapshotId: corpus.snapshotId,
    rootHash: corpus.rootHash,
    totalDocuments: docs.length,
    supportingDocuments: supporting,
    counterEvidenceDocuments: counter,
    counterEvidenceShare: docs.length === 0 ? 0 : counter / docs.length,
    medianPublicationYear: median(years),
    unknownYearDocuments: unknownYear,
    freshShare: docs.length === 0 ? 0 : fresh / docs.length,
    sourceFamilies: [...families].sort(),
    queryCount: corpus.sourceQueries.length,
    producedAt,
  };

  const datasetCard: LandscapeDatasetCard = {
    source: 'Run grounding corpus (OpenAlex/arXiv/Crossref adapters)',
    sourceUrl: 'https://openalex.org',
    version: `corpus snapshot ${corpus.snapshotId.slice(0, 12)}`,
    persistentId: corpus.snapshotId,
    license: 'per-document source licenses (bibliographic metadata; abstracts per-source terms)',
    downloadedAt: corpus.createdAt,
    checksumField: 'corpusRootHash',
    checksumValue: corpus.rootHash,
    fields: ['title', 'authors', 'publicationDate', 'doi', 'retrievalQuery', 'sourceType'],
    knownBias: 'query-construction bias: retrieval attribution classifies by query string; titles/abstracts are not semantically classified',
    allowedInference: 'descriptive corpus-landscape statistics and evidence-mix diagnostics for THIS run',
    forbiddenInference: 'field-wide publication-rate claims; causal claims about the hypothesis; quality judgments of individual documents',
  };

  return { result, datasetCard };
}
