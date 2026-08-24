import type { PublicationType, SourceFamily } from '../domain/source.js';

/**
 * Deterministic retrieval observations (RU-R GO3): search-saturation and
 * corpus-diversity metrics computed from the REAL pool/flush data and persisted
 * on the CorpusSnapshot fusion record. Pure functions — no LLM, no network;
 * they are decision INPUTS (gap-seek, iteration rounds, strategy), never
 * silent hard stops.
 */

/** A search must return at least this many records before its novelty rate is meaningful. */
export const SATURATION_MIN_SEARCHES = 4;
/** Tail (last half) mean novelty below this = saturated signal. */
export const SATURATION_TAIL_THRESHOLD = 0.2;

export interface SaturationObservation {
  searches: number;
  meanNovelty: number;
  tailNovelty: number;
  saturated: boolean;
}

/**
 * Novelty rate sequence -> saturation observation. Novelty rate of one search =
 * share of its records that were NEW to the pool at flush time (0 = everything
 * already known, 1 = everything new). Zero-record searches carry no novelty
 * information (engine mismatch, measured separately) and are excluded by the
 * CALLER; this function receives only record-bearing rates.
 */
export const saturationMetrics = (noveltyRates: readonly number[]): SaturationObservation => {
  const n = noveltyRates.length;
  if (n === 0) {
    return { searches: 0, meanNovelty: 0, tailNovelty: 0, saturated: false };
  }
  const round = (v: number): number => Number(v.toFixed(4));
  const mean = round(noveltyRates.reduce((a, b) => a + b, 0) / n);
  const tailLen = Math.max(1, Math.ceil(n / 2));
  const tail = noveltyRates.slice(-tailLen);
  const tailMean = round(tail.reduce((a, b) => a + b, 0) / tail.length);
  return {
    searches: n,
    meanNovelty: mean,
    tailNovelty: tailMean,
    saturated: n >= SATURATION_MIN_SEARCHES && tailMean < SATURATION_TAIL_THRESHOLD,
  };
};

export interface DiversityObservation {
  familyCounts: Record<string, number>;
  /** Max single-family share (0..1) — 1.0 means the whole corpus is one family. */
  familyConcentration: number;
  yearMin?: number;
  yearMax?: number;
  publicationTypeCounts: Record<string, number>;
}

export interface DiversityEntry {
  readonly family: SourceFamily;
  readonly publicationYear?: number;
  readonly publicationType?: PublicationType;
}

/**
 * Composition snapshot of the FINAL selected corpus: family counts + max-family
 * concentration (single-database bias observation), year spread, publication
 * type mix. Counts omit absent fields honestly (a record without a year is not
 * counted in the spread; without a type not in the type mix).
 */
export const diversitySnapshot = (entries: readonly DiversityEntry[]): DiversityObservation => {
  const familyCounts: Record<string, number> = {};
  const publicationTypeCounts: Record<string, number> = {};
  let yearMin: number | undefined;
  let yearMax: number | undefined;
  for (const e of entries) {
    familyCounts[e.family] = (familyCounts[e.family] ?? 0) + 1;
    if (e.publicationType !== undefined) {
      publicationTypeCounts[e.publicationType] = (publicationTypeCounts[e.publicationType] ?? 0) + 1;
    }
    if (e.publicationYear !== undefined) {
      yearMin = yearMin === undefined ? e.publicationYear : Math.min(yearMin, e.publicationYear);
      yearMax = yearMax === undefined ? e.publicationYear : Math.max(yearMax, e.publicationYear);
    }
  }
  const total = entries.length;
  const maxFamily = Object.values(familyCounts).reduce((a, b) => Math.max(a, b), 0);
  return {
    familyCounts,
    familyConcentration: total === 0 ? 0 : Number((maxFamily / total).toFixed(4)),
    ...(yearMin !== undefined ? { yearMin } : {}),
    ...(yearMax !== undefined ? { yearMax } : {}),
    publicationTypeCounts,
  };
};

/** Compact human-readable one-liner for summaries ("openalex=5 crossref=4; years 1998-2026; …"). */
export const diversitySummaryLine = (d: DiversityObservation): string => {
  const fams = Object.entries(d.familyCounts)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([f, c]) => `${f}=${c}`)
    .join(' ');
  const types = Object.entries(d.publicationTypeCounts)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t, c]) => `${t}=${c}`)
    .join(' ');
  const years = d.yearMin !== undefined && d.yearMax !== undefined ? `; years ${d.yearMin}-${d.yearMax}` : '';
  const typePart = types.length > 0 ? `; types ${types}` : '';
  return `families ${fams}${years}${typePart}`;
};
