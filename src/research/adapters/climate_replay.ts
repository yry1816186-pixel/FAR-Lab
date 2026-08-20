/**
 * research/adapters/climate_replay — loader for the committed REAL GISS
 * snapshot (tests/fixtures/research/giss_zonann_annual.csv).
 *
 * Single source of truth for the offline/RECORDED_REPLAY climate experiment
 * path — shared by the CLI (far research analyze) and the REST API, mirroring
 * exoplanet_replay. 2026-08-21 defect (CPS-4 G1): the offline wiring loaded
 * only the exoplanet replay, so a climate run analyzed with live=false fell
 * through to a LIVE GISS fetch (experiment=LIVE on an offline run) — breaking
 * the offline contract. This loader restores the dual-path symmetry: live
 * fetch (climate_dataset) or committed replay (here), never an accidental
 * network call in offline mode.
 *
 * The fixture is genuine NASA GISTEMP v4 ZonAnn data (Glob column, J-D annual
 * values, 1880-2025 full record; captured 2026-08-21). Parsing reuses
 * parseGissAnnualGlob — the SAME parser as the live path — so replay and live
 * agree on data semantics by construction (no second parser to drift).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../../paths.ts';
import { rawSha256Hex } from '../../retrieval/hash.ts';
import {
  GISS_ZONAL_ANNUAL_URL,
  parseGissAnnualGlob,
  type ClimateAnnualPoint,
  type ClimateDatasetCard,
} from './climate_dataset.ts';

/** Result of loading the committed climate replay snapshot. */
export interface ClimateReplay {
  readonly rows: readonly ClimateAnnualPoint[];
  readonly card: ClimateDatasetCard;
}

/**
 * Load the committed REAL GISS snapshot as replay rows + a replay dataset
 * card. Throws when the fixture is missing/unreadable/empty (fail-closed —
 * never silently serves an empty series), matching exoplanet replay's
 * error semantics. The card is fully deterministic (no wall-clock), so the
 * same fixture always yields the same replay card.
 *
 * `fixturePath` is a test-only injection hook (fail-semantics tests point it
 * at missing/garbage files); production callers omit it and get the committed
 * fixture.
 */
export function loadClimateReplayRows(fixturePath?: string): ClimateReplay {
  const path = fixturePath ?? join(PACKAGE_ROOT, 'tests', 'fixtures', 'research', 'giss_zonann_annual.csv');
  const raw = readFileSync(path, 'utf8');
  const rows = parseGissAnnualGlob(raw);
  if (rows.length === 0) {
    throw new Error(`climate replay fixture is empty or unreadable: ${path}`);
  }
  const card: ClimateDatasetCard = {
    source: 'NASA GISS GISTEMP v4 (Zonal Annual Means)',
    sourceUrl: GISS_ZONAL_ANNUAL_URL,
    version: 'v4 (committed real sample)',
    persistentId: 'giss-gistemp-v4-zonann#glob',
    license: 'public-domain (NASA)',
    // fixture 捕获时间（固定值，非墙钟）——离线重放必须确定性可复现。
    downloadedAt: '2026-08-21T00:00:00.000Z',
    query: 'Glob row · J-D (annual) column · full record (committed sample)',
    rawChecksum: rawSha256Hex(raw),
    rowCount: rows.length,
    fields: ['year', 'anomalyC'],
    units: { anomalyC: 'deg C (1951-1980 base)' },
    missingNotes: [],
    qualityNotes: [
      'Bounded committed snapshot of the Zonal Annual Means table (replay fixture); monthly/hemispheric series not consumed',
    ],
    allowedInference: 'Global annual mean surface temperature anomaly trend over the committed window',
    forbiddenInference: 'Regional attribution, sea-ice/sea-level claims, or any causal claim about drivers',
    reproductionCommand: `replay fixture: ${path}`,
  };
  return { rows, card };
}
