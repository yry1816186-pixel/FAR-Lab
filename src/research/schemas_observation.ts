// src/research/schemas_observation.ts
//
// Observation-family zod boundaries — the SSOT for the persisted
// `observations[]` of a ResearchRun (discriminated on `adapter`).
//
// Extracted from schemas.ts on 2026-08-21 when the third adapter family
// (climate, CPS-4 G2) pushed that file past the 800-line complexity budget.
// Every NEW domain adapter's zod member lands here, not in schemas.ts;
// schemas.ts re-exports all names so the public import surface is unchanged.
// TS counterpart union: src/research/experiment.ts `Observation`.
// Registry: src/schema/domain_registry.ts `Observation` entry.

import { z } from 'zod';

export const RadiusInsolationObservationZod = z.object({
  status: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
  n: z.number().int().nonnegative(),
  excludedMissing: z.number().int().nonnegative(),
  pearsonR: z.number().nullable(),
  pValue: z.number().nullable(),
  confidenceInterval: z.tuple([z.number(), z.number()]).nullable(),
  significantAt05: z.boolean(),
  meanInsolation: z.number().nullable(),
  params: z.object({
    minRadiusEarth: z.number(),
    maxPeriodDays: z.number(),
    confidenceLevel: z.number(),
    source: z.enum(['plan', 'default']),
  }),
  inputHash: z.string(),
  analyzedAt: z.string(),
  summary: z.string(),
});

export const ExoplanetDatasetCardZod = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  version: z.string(),
  persistentId: z.string(),
  license: z.string(),
  downloadedAt: z.string(),
  query: z.string(),
  rawChecksum: z.string(),
  rowCount: z.number().int().nonnegative(),
  fields: z.array(z.string()),
  units: z.record(z.string(), z.string()),
  missingNotes: z.array(z.string()),
  qualityNotes: z.array(z.string()),
  allowedInference: z.string(),
  forbiddenInference: z.string(),
  reproductionCommand: z.string(),
  fetchMode: z.enum(['LIVE', 'RECORDED_REPLAY']),
});

// ── Climate trend observation (GISS global annual) ───────────────────────────
// Mirrors ClimateTrendResult (adapters/climate_analysis.ts) and ClimateDatasetCard
// (adapters/climate_dataset.ts, no fetchMode field). CPS-4 G2: without this member
// every CLI run re-read (inspect/verify/export/compare/feedback/second analyze)
// failed strict parse on climate observations ("Invalid discriminator value").

export const ClimateTrendObservationZod = z.object({
  windowYears: z.tuple([z.number(), z.number()]),
  n: z.number().int().nonnegative(),
  trendPerDecadeC: z.number(),
  ci95PerDecadeC: z.tuple([z.number(), z.number()]),
  pValue: z.number(),
  slopeIsZero: z.boolean(),
  significantAt05: z.boolean(),
});

export const ClimateDatasetCardZod = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  version: z.string(),
  persistentId: z.string(),
  license: z.string(),
  downloadedAt: z.string(),
  query: z.string(),
  rawChecksum: z.string(),
  rowCount: z.number().int().nonnegative(),
  fields: z.array(z.string()),
  units: z.record(z.string(), z.string()),
  missingNotes: z.array(z.string()),
  qualityNotes: z.array(z.string()),
  allowedInference: z.string(),
  forbiddenInference: z.string(),
  reproductionCommand: z.string(),
});

// ── Literature-landscape observation (domain-general adapter) ────────────────

export const LiteratureLandscapeObservationZod = z.object({
  kind: z.literal('literature-landscape'),
  snapshotId: z.string(),
  rootHash: z.string(),
  totalDocuments: z.number().int().nonnegative(),
  supportingDocuments: z.number().int().nonnegative(),
  counterEvidenceDocuments: z.number().int().nonnegative(),
  counterEvidenceShare: z.number().min(0).max(1),
  medianPublicationYear: z.number().nullable(),
  unknownYearDocuments: z.number().int().nonnegative(),
  freshShare: z.number().min(0).max(1),
  sourceFamilies: z.array(z.string()),
  queryCount: z.number().int().nonnegative(),
  producedAt: z.string(),
});

export const LandscapeDatasetCardZod = z.object({
  source: z.string(),
  sourceUrl: z.string(),
  version: z.string(),
  persistentId: z.string(),
  license: z.string(),
  downloadedAt: z.string(),
  checksumField: z.string(),
  checksumValue: z.string(),
  fields: z.array(z.string()),
  knownBias: z.string(),
  allowedInference: z.string(),
  forbiddenInference: z.string(),
});

export const ObservationZod = z.discriminatedUnion('adapter', [
  z.object({
    id: z.string(),
    adapter: z.literal('exoplanet-archive-radius-insolation'),
    affectsHypothesisIds: z.array(z.string()),
    result: RadiusInsolationObservationZod,
    datasetCard: ExoplanetDatasetCardZod,
    mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    producedAt: z.string(),
  }),
  z.object({
    id: z.string(),
    adapter: z.literal('giss-global-annual-trend'),
    affectsHypothesisIds: z.array(z.string()),
    result: ClimateTrendObservationZod,
    datasetCard: ClimateDatasetCardZod,
    mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    producedAt: z.string(),
  }),
  z.object({
    id: z.string(),
    adapter: z.literal('literature-landscape'),
    affectsHypothesisIds: z.array(z.string()),
    result: LiteratureLandscapeObservationZod,
    datasetCard: LandscapeDatasetCardZod,
    mode: z.enum(['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED']),
    producedAt: z.string(),
  }),
]);
