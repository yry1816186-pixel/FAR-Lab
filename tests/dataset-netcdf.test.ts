import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { acquireNetcdfDataset, extractNetcdfFeatures } from '../src/experiment/dataset-netcdf.js';

/**
 * AOSSA scientific data plane: NetCDF acquisition + derived features on a REAL
 * gridded dataset (NCEP/NCAR reanalysis air temperature, downloaded to
 * work/scenario-b). When the file is absent the suite skips honestly — a
 * synthetic .nc would test the parser, not the data plane.
 */

const REAL_NC = path.resolve('work/scenario-b/air_temperature.nc');
const T0 = '2026-08-30T00:00:00.000Z';
const dbs: Db[] = [];
const dirs: string[] = [];

const makeEnv = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-nc-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  dbs.push(db);
  const store = new Store(db);
  const question = ResearchQuestion.parse({
    id: newId('q'), text: 'Does air temperature variability carry a learnable monthly structure?',
    background: '', goalType: 'predictive',
    scope: { domain: 'climate science', phenomena: ['near-surface air temperature'] }, constraints: {}, createdAt: T0,
  });
  const run = store.createRun(question);
  return { store, runId: run.id, artifacts: openArtifactStore(path.join(dir, 'artifacts')) };
};

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!fs.existsSync(REAL_NC))('netcdf data plane (real NCEP file, real sidecar)', () => {
  it('acquires an immutable raw record with a real xarray profile and QC at record time', async () => {
    const { store, runId, artifacts } = makeEnv();
    const rec = await acquireNetcdfDataset(store, artifacts, runId, REAL_NC, 'air', { now: () => T0 });
    expect(rec.format).toBe('netcdf');
    expect(rec.contentRef).toMatch(/^sha256:/);
    expect(rec.columns).toContain('air');
    expect(rec.nRows).toBe(2920 * 25 * 53);
    expect(rec.lineage[0]?.kind).toBe('acquired');
    expect(rec.lineage[0]?.detail).toContain('structureHash');
    const events = store.listEvents(runId).filter((e) => (e.detail as Record<string, unknown>).kind === 'netcdf_acquired');
    expect(events).toHaveLength(1);
    const d = events[0]!.detail as Record<string, unknown>;
    expect(d.units).toMatchObject({ air: 'degK' });
    expect(Array.isArray(d.qcFindings)).toBe(true);
    // raw immutability: content-addressed artifact readable back
    const raw = await artifacts.get(rec.contentRef);
    expect(raw).not.toBeNull();
  }, 180_000);

  it('rejects a variable that is not in the file (fail-closed, no silent fallback)', async () => {
    const { store, runId, artifacts } = makeEnv();
    await expect(acquireNetcdfDataset(store, artifacts, runId, REAL_NC, 'not_a_var', { now: () => T0 }))
      .rejects.toThrow(/not present in/);
  }, 120_000);

  it('derives a tabular feature dataset whose lineage chains to the raw ref', async () => {
    const { store, runId, artifacts } = makeEnv();
    const raw = await acquireNetcdfDataset(store, artifacts, runId, REAL_NC, 'air', { now: () => T0 });
    const { record, csv } = await extractNetcdfFeatures(store, artifacts, raw, 'global_mean_timeseries', { now: () => T0 });
    expect(record.format).toBe('csv');
    expect(record.nRows).toBe(2920);
    expect(record.lineage.map((l) => l.kind)).toEqual(['acquired', 'preprocess']);
    expect(record.lineage[1]?.detail).toContain(raw.id);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('time,value');
    expect(lines[1]).toMatch(/^2013-01-01,27[0-9.]+$/); // Kelvin magnitudes
    const derived = await artifacts.get(record.contentRef);
    expect(derived).toBe(csv);
  }, 180_000);
});

describe('audit C1 regression: monthly gridpoint coordinates are physical, never index-fabricated', () => {
  it('monthly_mean_per_gridpoint emits lat in the file coordinate range and lon likewise', async () => {
    const { createSidecar } = await import('../src/experiment/python.js');
    const sidecar = createSidecar();
    try {
      const r = await sidecar.call<{ csv: string; nRows: number }>('netcdf_extract_features', {
        path: REAL_NC, variable: 'air', feature: 'monthly_mean_per_gridpoint', maxRows: 4000,
      }, 180_000);
      expect(r.ok).toBe(true);
      const lines = (r.result?.csv ?? '').trim().split('\n');
      expect(lines[0]).toBe('time,lat,lon,value');
      const lats = new Set<number>(); const lons = new Set<number>();
      for (const ln of lines.slice(1)) {
        const p = ln.split(',');
        lats.add(parseFloat(p[1]!)); lons.add(parseFloat(p[2]!));
      }
      // NCEP grid: lat 15..75 (25 values), lon 200..330 (53 values)
      for (const v of lats) { expect(v).toBeGreaterThanOrEqual(15); expect(v).toBeLessThanOrEqual(75); }
      for (const v of lons) { expect(v).toBeGreaterThanOrEqual(200); expect(v).toBeLessThanOrEqual(330); }
      expect(lats.size).toBeGreaterThan(10);
      expect(lons.size).toBeGreaterThan(20);
    } finally { sidecar.close(); }
  }, 180_000);
});
