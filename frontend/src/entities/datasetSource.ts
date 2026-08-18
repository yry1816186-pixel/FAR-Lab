/**
 * entities/datasetSource — dataset provenance labels (IC-11; ADR-015).
 *
 * Mirrors src/schema/dataset_source.ts. The backend states the fact; the
 * frontend renders it and never infers a stronger claim. `replay`/`fixture`
 * data is never presented as live inference.
 */

export const DATASET_SOURCES = ['online', 'cached_fixture', 'replay', 'fixture'] as const;

export type DatasetSourceKind = (typeof DATASET_SOURCES)[number];

export function isDatasetSource(value: unknown): value is DatasetSourceKind {
  return typeof value === 'string' && (DATASET_SOURCES as readonly string[]).includes(value);
}

/** i18n key suffix + tone per source kind (labels resolved via useT). */
export const DATASET_SOURCE_TONE: Readonly<Record<DatasetSourceKind, 'ok' | 'info' | 'warn' | 'muted'>> = {
  online: 'ok',
  cached_fixture: 'info',
  replay: 'warn',
  fixture: 'muted',
};
