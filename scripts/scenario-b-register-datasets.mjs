/**
 * Register the NCEP NetCDF data plane onto an EXISTING run (scenario-B native
 * leg, 2026-08-30): acquire + extract + materialize ONLY — no spec, no
 * execution. The run's execute stage then binds the derived dataset via
 * auto-serialization (datasetRecordId), making the EEL leg pipeline-native.
 *
 * Usage: node scripts/scenario-b-register-datasets.mjs <runId>
 * Env: FARLAB_DATA_DIR (workspace containing air_temperature.nc and far.db).
 */
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from '../dist/persistence/db.js';
import { Store } from '../dist/persistence/store.js';
import { openArtifactStore } from '../dist/persistence/artifacts.js';
import { acquireNetcdfDataset, extractNetcdfFeatures } from '../dist/experiment/dataset-netcdf.js';

const runId = process.argv[2];
if (runId === undefined) { console.error('usage: node scripts/scenario-b-register-datasets.mjs <runId>'); process.exit(2); }
const dataDir = process.env.FARLAB_DATA_DIR ?? 'work/scenario-b';
const ncPath = path.resolve(dataDir, 'air_temperature.nc');
if (!fs.existsSync(ncPath)) { console.error(`missing ${ncPath}`); process.exit(3); }
const db = openDb(path.join(dataDir, 'far.db'));
const store = new Store(db);
if (store.getRun(runId) === null) { console.error(`run ${runId} not found in ${dataDir}`); process.exit(3); }
const artifacts = openArtifactStore(path.join(dataDir, 'artifacts'));

const raw = await acquireNetcdfDataset(store, artifacts, runId, ncPath, 'air', { license: 'public domain (NCEP/NCAR reanalysis via xarray-data)' });
const { record: derived } = await extractNetcdfFeatures(store, artifacts, raw, 'monthly_mean_per_gridpoint', {
  materializeDir: path.join(dataDir, 'derived'),
});
console.log(JSON.stringify({ raw: raw.id, derived: derived.id, path: derived.source.path, nRows: derived.nRows }));
