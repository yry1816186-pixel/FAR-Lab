/**
 * research/adapters/exoplanet_dataset — NASA Exoplanet Archive PS table access
 * (Phase 3 hero-case dataset adapter).
 *
 * The NASA Exoplanet Archive (exoplanetarchive.ipac.caltech.edu) is the
 * authoritative aggregation of confirmed exoplanet parameters. NASA content is
 * public domain; the TAP endpoint serves JSON without an API key.
 *
 * Data-finding order (directive §11.2): national data center (NASA/IPAC) →
 * paper repositories → peer-reviewed datasets. The archive is item 1.
 *
 * Every fetch produces a DatasetCard (source, version, persistent id, license,
 * download date, checksum, fields, missing/quality notes, allowed-inference
 * bounds, reproduction command) — required by §11.3.
 *
 * Honesty: the fetch is a BOUNDED snapshot (one sync TAP query). It does not
 * claim exhaustive coverage of the archive.
 */

import { createHash } from 'node:crypto';
import { rawSha256Hex } from '../../retrieval/hash.ts';

/** The archive host (single authoritative host — fail-closed allowlist). */
export const EXOPLANET_ARCHIVE_HOST = 'exoplanetarchive.ipac.caltech.edu';

/** TAP sync endpoint. */
const TAP_SYNC_URL = `https://${EXOPLANET_ARCHIVE_HOST}/TAP/sync`;

const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

/** One row of the PS table (fields we consume). */
export interface PsRow {
  readonly plName: string;
  readonly radiusEarth: number | null;
  readonly massEarth: number | null;
  readonly periodDays: number | null;
  readonly stellarTeffK: number | null;
  readonly stellarRadiusRsun: number | null;
  readonly stellarMassMsun: number | null;
}

/** The DatasetCard for this fetch (directive §11.3). */
export interface ExoplanetDatasetCard {
  readonly source: string;
  readonly sourceUrl: string;
  readonly version: string;
  readonly persistentId: string;
  readonly license: string;
  readonly downloadedAt: string;
  readonly query: string;
  readonly rawChecksum: string;
  readonly rowCount: number;
  readonly fields: readonly string[];
  readonly units: Readonly<Record<string, string>>;
  readonly missingNotes: readonly string[];
  readonly qualityNotes: readonly string[];
  readonly allowedInference: string;
  readonly forbiddenInference: string;
  readonly reproductionCommand: string;
  readonly fetchMode: 'LIVE' | 'RECORDED_REPLAY';
}

/** Result of a (live or replay) PS-table fetch. */
export interface ExoplanetFetchResult {
  readonly rows: readonly PsRow[];
  readonly card: ExoplanetDatasetCard;
  readonly fetchMode: 'LIVE' | 'RECORDED_REPLAY';
}

/** Default PS-table query: hot-Jupiter parameter neighborhood (bounded). */
export const HOT_JUPITER_QUERY = [
  'SELECT TOP 400 pl_name, pl_rade, pl_bmasse, pl_orbper, st_teff, st_rad, st_mass',
  'FROM ps',
  "WHERE default_flag=1 AND pl_rade > 6 AND pl_orbper < 10 AND st_teff IS NOT NULL",
  'ORDER BY pl_orbper ASC',
].join(' ');

/** JSON row shape returned by TAP sync. */
interface TapRow {
  pl_name?: string;
  pl_rade?: number | null;
  pl_bmasse?: number | null;
  pl_orbper?: number | null;
  st_teff?: number | null;
  st_rad?: number | null;
  st_mass?: number | null;
}

/** Normalize a TAP row (nulls preserved — never silently zero-filled). */
function normalizeRow(r: TapRow): PsRow {
  return {
    plName: typeof r.pl_name === 'string' ? r.pl_name : '(unnamed)',
    radiusEarth: typeof r.pl_rade === 'number' ? r.pl_rade : null,
    massEarth: typeof r.pl_bmasse === 'number' ? r.pl_bmasse : null,
    periodDays: typeof r.pl_orbper === 'number' ? r.pl_orbper : null,
    stellarTeffK: typeof r.st_teff === 'number' ? r.st_teff : null,
    stellarRadiusRsun: typeof r.st_rad === 'number' ? r.st_rad : null,
    stellarMassMsun: typeof r.st_mass === 'number' ? r.st_mass : null,
  };
}

/** Parse the TAP JSON array body into rows (pure; fail-closed on garbage). */
export function parseTapRows(body: string): readonly PsRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('exoplanet_dataset: TAP response was not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('exoplanet_dataset: TAP response was not a JSON array');
  }
  return (parsed as ReadonlyArray<TapRow>).map(normalizeRow);
}

/**
 * Live fetch: one bounded sync TAP query against the archive (retry with
 * backoff; timeout; fail-closed on any error — never silently returns []).
 */
export async function fetchExoplanetPsLive(
  query: string,
  now: () => Date = () => new Date(),
): Promise<ExoplanetFetchResult> {
  const url = `${TAP_SYNC_URL}?query=${encodeURIComponent(query)}&format=json`;
  const downloadedAt = now().toISOString();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FAR-Lab-research/1.0 (scientific-hypothesis-planning; bounded TAP query)',
        },
      });
      if (!response.ok) {
        throw new Error(`non-2xx status ${response.status}`);
      }
      const body = await response.text();
      const rows = parseTapRows(body);
      const card: ExoplanetDatasetCard = {
        source: 'NASA Exoplanet Archive',
        sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu',
        version: 'PS table (TAP sync snapshot)',
        persistentId: 'nasa-exoplanet-archive:ps',
        license: 'NASA public domain (PD)',
        downloadedAt,
        query,
        rawChecksum: rawSha256Hex(body),
        rowCount: rows.length,
        fields: ['pl_name', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'st_teff', 'st_rad', 'st_mass'],
        units: {
          pl_rade: 'Earth radii',
          pl_bmasse: 'Earth masses',
          pl_orbper: 'days',
          st_teff: 'K',
          st_rad: 'Solar radii',
          st_mass: 'Solar masses',
        },
        missingNotes: [
          'pl_bmasse / st_rad / st_mass are null for many systems (archive coverage) — rows with nulls are excluded from analysis and counted honestly',
        ],
        qualityNotes: [
          'default_flag=1 selects the default parameter set (no duplicate solutions)',
          'TOP 400 is a bounded snapshot, NOT exhaustive (§9.3 bounded retrieval)',
        ],
        allowedInference: 'Population-level correlation between measured planet/star parameters in this snapshot',
        forbiddenInference: 'No per-system causal claims; no claims about planets outside this snapshot',
        reproductionCommand: `curl "${TAP_SYNC_URL}?query=${encodeURIComponent(query)}&format=json"`,
        fetchMode: 'LIVE',
      };
      return { rows, card, fetchMode: 'LIVE' };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `exoplanet_dataset: live fetch failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/** sha256 of a replay payload (for the replay card's checksum). */
export function replayChecksum(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
