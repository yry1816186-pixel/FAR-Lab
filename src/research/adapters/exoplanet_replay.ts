/**
 * research/adapters/exoplanet_replay — loader for the committed REAL archive
 * sample (tests/fixtures/research/exoplanet_ps_sample.json).
 *
 * Single source of truth for the offline/RECORDED_REPLAY experiment path —
 * shared by the CLI (far research analyze) and the REST API. The sample is
 * genuine NASA Exoplanet Archive data captured 2026-08-13 (bounded, not
 * exhaustive; §11.2/§16.1 小型合法样本).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../../paths.ts';
import type { ExoplanetDatasetCard, PsRow } from './exoplanet_dataset.ts';

/** Result of loading the committed replay sample. */
export interface ExoplanetReplay {
  readonly rows: readonly PsRow[];
  readonly card: ExoplanetDatasetCard;
}

/**
 * Load the committed REAL archive sample as replay rows + a replay dataset
 * card. Throws when the fixture is missing/unreadable (fail-closed — never
 * silently serves an empty sample).
 */
export function loadExoplanetReplayRows(): ExoplanetReplay {
  const fixturePath = join(PACKAGE_ROOT, 'tests', 'fixtures', 'research', 'exoplanet_ps_sample.json');
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as {
    source?: string;
    url?: string;
    query?: string;
    capturedAt?: string;
    license?: string;
    note?: string;
    rows?: ReadonlyArray<Record<string, unknown>>;
  };
  const rows: PsRow[] = (parsed.rows ?? []).map((r) => ({
    plName: typeof r.pl_name === 'string' ? r.pl_name : '(unnamed)',
    radiusEarth: typeof r.pl_rade === 'number' ? r.pl_rade : null,
    massEarth: typeof r.pl_bmasse === 'number' ? r.pl_bmasse : null,
    periodDays: typeof r.pl_orbper === 'number' ? r.pl_orbper : null,
    stellarTeffK: typeof r.st_teff === 'number' ? r.st_teff : null,
    stellarRadiusRsun: typeof r.st_rad === 'number' ? r.st_rad : null,
    stellarMassMsun: typeof r.st_mass === 'number' ? r.st_mass : null,
  }));
  if (rows.length === 0) {
    throw new Error(`exoplanet replay fixture is empty or unreadable: ${fixturePath}`);
  }
  const card: ExoplanetDatasetCard = {
    source: parsed.source ?? 'NASA Exoplanet Archive',
    sourceUrl: parsed.url ?? 'https://exoplanetarchive.ipac.caltech.edu',
    version: 'PS table (committed real sample)',
    persistentId: 'nasa-exoplanet-archive:ps',
    license: parsed.license ?? 'NASA public domain (PD)',
    downloadedAt: parsed.capturedAt ?? '2026-08-13T00:00:00.000Z',
    query: parsed.query ?? '(committed sample)',
    rawChecksum: '(committed-sample)',
    rowCount: rows.length,
    fields: ['pl_name', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'st_teff', 'st_rad', 'st_mass'],
    units: {},
    missingNotes: [],
    qualityNotes: [parsed.note ?? 'REAL archive snapshot (bounded, not exhaustive)'],
    allowedInference: 'Population-level correlation in this snapshot',
    forbiddenInference: 'No per-system causal claims',
    reproductionCommand: `replay fixture: ${fixturePath}`,
    fetchMode: 'RECORDED_REPLAY',
  };
  return { rows, card };
}
