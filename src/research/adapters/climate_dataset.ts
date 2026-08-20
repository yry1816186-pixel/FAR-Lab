/**
 * research/adapters/climate_dataset — NASA GISS Surface Temperature Analysis
 * (GISTEMP v4) global annual temperature anomalies (Phase-3 domain #2 adapter).
 *
 * Data source: NASA Goddard Institute for Space Studies, GISTEMP v4
 * (https://data.giss.nasa.gov/gistemp/) — the authoritative global surface
 * temperature anomaly record (public domain; CSV served without a key).
 *
 * Data-finding order (directive §11.2): national data center (NASA) → paper
 * repositories → peer-reviewed datasets.
 *
 * Every fetch produces a DatasetCard (source, version, persistent id, license,
 * download date, checksum, fields, missing/quality notes, allowed-inference
 * bounds, reproduction command) — required by §11.3.
 *
 * Honesty: the fetch is a BOUNDED snapshot (one sync CSV fetch of the Zonal
 * Annual Means table). It does not claim exhaustive coverage of the GISTEMP
 * record; the annual global ("Glob") series is the single series consumed.
 */

import { rawSha256Hex } from '../../retrieval/hash.ts';

/** The GISS host (single authoritative host — fail-closed allowlist). */
export const GISS_HOST = 'data.giss.nasa.gov';

/** Zonal annual means CSV (v4): rows = latitude bands, columns = Year + 12 months + J-D. */
export const GISS_ZONAL_ANNUAL_URL = `https://${GISS_HOST}/gistemp/tabledata_v4/ZonAnn.Ts+dSST.csv`;

const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

/** One annual global temperature anomaly (deg C, relative to 1951-1980 base). */
export interface ClimateAnnualPoint {
  readonly year: number;
  /** J-D (January-December) global mean anomaly, deg C. */
  readonly anomalyC: number;
}

/** The DatasetCard for this fetch (directive §11.3). */
export interface ClimateDatasetCard {
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
}

/** Result of a climate dataset fetch. */
export interface ClimateDatasetResult {
  readonly rows: readonly ClimateAnnualPoint[];
  readonly card: ClimateDatasetCard;
}

/** Sleep helper with jitter (deterministic tests inject a fake). */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse the GISS Zonal Annual Means CSV body into the annual global series.
 *
 * Format (verified live 2026-08-21): comma-separated; the FIRST row is the
 * header `Year,Glob,NHem,SHem,…` (columns = latitude bands; "Glob" = global),
 * and every data row is `<year>,<glob anomaly>,…`. The Glob column index is
 * located from the header dynamically (not hardcoded). Header rows, comments
 * and malformed lines are skipped (fail-closed on absent data, not on noise).
 */
export function parseGissAnnualGlob(csv: string): readonly ClimateAnnualPoint[] {
  const lines = csv.split(/\r?\n/);
  let globCol = -1;
  const points: ClimateAnnualPoint[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const cols = line.split(',');
    if (globCol < 0) {
      const yearIdx = cols.indexOf('Year');
      globCol = cols.indexOf('Glob');
      if (yearIdx < 0 || globCol < 0) continue; // not the header (or header not yet seen)
      continue;
    }
    if (cols.length <= globCol) continue;
    const year = Number(cols[0]?.trim());
    const anomaly = Number(cols[globCol]?.trim());
    if (!Number.isInteger(year) || year < 1800 || year > 2100) continue;
    if (!Number.isFinite(anomaly)) continue;
    points.push({ year, anomalyC: anomaly });
  }
  return points.sort((a, b) => a.year - b.year);
}

/**
 * Fetch the GISTEMP zonal annual means and extract the global annual series.
 * Fail-closed: network/parse failure propagates (never silently empty).
 */
export async function fetchGissGlobalAnomalies(now: () => Date = () => new Date()): Promise<ClimateDatasetResult> {
  let lastError: unknown = null;
  let body: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(GISS_ZONAL_ANNUAL_URL, {
          headers: { 'User-Agent': 'FAR-Lab-retrieval/1.0 (scientific-evidence-verification)' },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`giss: non-2xx status ${response.status} from ${GISS_ZONAL_ANNUAL_URL}`);
        }
        body = await response.text();
      } finally {
        clearTimeout(timer);
      }
      break;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
      }
    }
  }
  if (body === null) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  const rows = parseGissAnnualGlob(body);
  if (rows.length === 0) {
    throw new Error('giss: parsed zero annual global points — refusing to build a card on nothing');
  }
  const downloadedAt = now().toISOString();
  const checksum = rawSha256Hex(body);
  const card: ClimateDatasetCard = {
    source: 'NASA GISS GISTEMP v4 (Zonal Annual Means)',
    sourceUrl: GISS_ZONAL_ANNUAL_URL,
    version: 'v4',
    persistentId: `giss-gistemp-v4-zonann#glob`,
    license: 'public-domain (NASA)',
    downloadedAt,
    query: 'Glob row · J-D (annual) column · full record',
    rawChecksum: checksum,
    rowCount: rows.length,
    fields: ['year', 'anomalyC'],
    units: { anomalyC: 'deg C (1951-1980 base)' },
    missingNotes: [],
    qualityNotes: ['Bounded snapshot of the Zonal Annual Means table; monthly/hemispheric series not consumed'],
    allowedInference: 'Global annual mean surface temperature anomaly trend over the fetched window',
    forbiddenInference: 'Regional attribution, sea-ice/sea-level claims, or any causal claim about drivers',
    reproductionCommand:
      `node -e "fetch('${GISS_ZONAL_ANNUAL_URL}').then(r=>r.text()).then(t=>console.log(require('crypto').createHash('sha256').update(t).digest('hex')))"`,
  };
  return { rows, card };
}
