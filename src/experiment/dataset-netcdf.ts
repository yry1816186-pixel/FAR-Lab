import nodePath from 'node:path';
import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { sha256FileHex } from '../shared/crypto.js';
import { DatasetRecord, newId, type RunId } from '../domain/index.js';
import { createSidecar, type Sidecar } from './python.js';

/**
 * AOSSA scientific data plane (scenario B): NetCDF acquisition + derived
 * feature datasets.
 *
 *  - acquireNetcdfDataset: immutable RAW record — file sha256 content-ref,
 *    xarray profile (dims/coords/units/attrs) + record-time QC findings from
 *    the real sidecar, FAIR-ish metadata (license unknown-until-declared),
 *    lineage step 'acquired';
 *  - extractNetcdfFeatures: DERIVED tabular record — the sidecar derives a
 *    bounded CSV feature table (closed enum of aggregations) which becomes a
 *    content-addressed artifact + DatasetRecord(format csv) whose lineage
 *    'preprocess' step names the raw ref. One truth: the derived record
 *    references the raw; nothing re-parses the file on the TS side.
 *
 * The sidecar is REQUIRED (real profile/extraction authority); tests inject
 * the real uv-run sidecar or skip when no real file is present.
 */

export interface NetcdfProfileResult {
  path: string;
  dims: Record<string, number>;
  coords: Array<{ name: string; dtype: string; size: number; units?: string; attrs: Record<string, unknown> }>;
  variables: Array<{
    name: string; dtype: string; shape: number[]; units?: string;
    nanCount?: number; infCount?: number; missingFraction?: number;
    min?: number | null; max?: number | null;
  }>;
  globalAttrs: Record<string, unknown>;
  structureHash: string;
  qcFindings: Array<Record<string, unknown>>;
  nDataVars: number;
  engine: string;
}

export interface AcquireNetcdfOptions {
  sidecar?: () => Sidecar;
  now?: () => string;
  license?: string;
  timeoutMs?: number;
}

/**
 * Security W2 (defense-in-depth): a netcdf source is an operator-supplied
 * local file, and model-drafted specs only ever name a plain absolute local
 * path. URIs and relative paths are rejected before any byte is read;
 * FARLAB_DATA_ROOT (when set) fences reads to one data directory.
 */
const assertLocalNetcdfPath = (path: string): void => {
  if (path.includes('://')) {
    throw new Error(`netcdf source must be a local filesystem path, not a URI: ${path}`);
  }
  if (!nodePath.isAbsolute(path)) {
    throw new Error(`netcdf source must be an absolute path (got relative: ${path})`);
  }
  const root = process.env.FARLAB_DATA_ROOT;
  if (root !== undefined && root !== '') {
    const resolvedRoot = nodePath.resolve(root);
    const resolved = nodePath.resolve(path);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + nodePath.sep)) {
      throw new Error(`netcdf source escapes FARLAB_DATA_ROOT ${resolvedRoot}: ${path}`);
    }
    // Symlink escape fence (same pattern as workspace-tools): a link planted
    // inside the data root must not read outside it. Lexical containment alone
    // is defeatable by a symlink whose target lives beyond the root.
    let realRoot: string | undefined;
    let real: string | undefined;
    try {
      realRoot = fs.realpathSync(resolvedRoot);
      real = fs.realpathSync(resolved);
    } catch {
      // realpath unavailable (missing target / exotic FS): lexical containment already holds.
    }
    if (realRoot !== undefined && real !== undefined &&
        real !== realRoot && !real.startsWith(realRoot + nodePath.sep)) {
      throw new Error(`netcdf source resolves outside FARLAB_DATA_ROOT ${realRoot} (symlink?): ${path}`);
    }
  }
};


export const acquireNetcdfDataset = async (
  store: Store,
  artifacts: ArtifactStore,
  runId: RunId,
  path: string,
  variable: string,
  opts: AcquireNetcdfOptions = {},
): Promise<DatasetRecord> => {
  const now = opts.now ?? (() => new Date().toISOString());
  assertLocalNetcdfPath(path);
  // FA-DAT-01 streaming acquisition: the file is hashed and landed chunk-by-chunk
  // (putStream), so the 200MB full-buffer ceiling is gone — a 500MB+ NetCDF is a
  // capability, not an OOM. The xarray PROFILE stays sidecar-owned (the sidecar
  // memory-maps/reads the file itself).
  if (artifacts.putStream === undefined) {
    throw new Error('artifact store does not support streaming put — netcdf acquisition cannot proceed without a full buffer');
  }
  const raw = await artifacts.putStream(createReadStream(path));
  const sha = raw.hash;

  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  let profile: NetcdfProfileResult;
  try {
    const r = await sidecar.call<NetcdfProfileResult>('netcdf_profile', { path }, opts.timeoutMs ?? 120_000);
    if (!r.ok || r.result === undefined) {
      throw new Error(`netcdf_profile failed: ${r.error?.message ?? 'no result'}`);
    }
    profile = r.result;
  } finally {
    sidecar.close();
  }
  if (!profile.variables.some((v) => v.name === variable)) {
    throw new Error(`variable '${variable}' not present in ${path} (vars: ${profile.variables.map((v) => v.name).join(', ')})`);
  }
  const shaAfter = await sha256FileHex(path);
  if (shaAfter !== sha) {
    throw new Error(`netcdf file changed during acquisition (hash mismatch ${sha.slice(0, 12)} -> ${shaAfter.slice(0, 12)}) — refusing a lineage that does not match the profiled bytes`);
  }


  const record = DatasetRecord.parse({
    id: newId('ds') as DatasetRecord['id'],
    runId,
    name: `${variable}@${path.split(/[\\/]/).pop() ?? path}`,
    source: { resolver: 'local_netcdf', path, variable, sha256Expected: sha },
    license: opts.license ?? 'unknown',
    format: 'netcdf',
    contentRef: raw.ref,
    targetColumn: variable,
    columns: profile.variables.map((v) => v.name),
    nRows: Object.values(profile.dims).reduce((a, b) => a * b, 1),
    lineage: [
      {
        kind: 'acquired',
        detail: `netcdf raw acquired (sha256 ${sha.slice(0, 16)}…, xarray profile: ${profile.nDataVars} vars, dims ${JSON.stringify(profile.dims)}, structureHash ${profile.structureHash.slice(0, 16)}…, qc ${profile.qcFindings.length} finding(s))`,
        at: now(),
      },
    ],
    fetchedAt: now(),
  });
  store.putObjectEvented('dataset_record', record, {
    type: 'note',
    detail: {
      kind: 'netcdf_acquired',
      datasetRecordId: record.id,
      rawRef: raw.ref,
      variable,
      dims: profile.dims,
      structureHash: profile.structureHash,
      qcFindings: profile.qcFindings,
      units: Object.fromEntries(profile.variables.filter((v) => v.units !== undefined).map((v) => [v.name, v.units])),
    },
  }, now());
  return record;
};

export interface NetcdfExtractOptions {
  sidecar?: () => Sidecar;
  now?: () => string;
  timeoutMs?: number;
  maxRows?: number;
  /** When set, the derived CSV is ALSO written to <dir>/<recordId>.csv and source.path points there (operator-vouched real file the EEL local-dataset leg can consume). */
  materializeDir?: string;
}

export type NetcdfFeatureMode = 'global_mean_timeseries' | 'monthly_mean_per_gridpoint' | 'flatten_all';

export const extractNetcdfFeatures = async (
  store: Store,
  artifacts: ArtifactStore,
  rawRecord: DatasetRecord,
  mode: NetcdfFeatureMode,
  opts: NetcdfExtractOptions = {},
): Promise<{ record: DatasetRecord; csv: string }> => {
  const now = opts.now ?? (() => new Date().toISOString());
  if (rawRecord.source.resolver !== 'local_netcdf') {
    throw new Error(`extractNetcdfFeatures requires a local_netcdf raw record (got ${rawRecord.source.resolver})`);
  }
  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  let csv: string;
  let nRows: number;
  try {
    // Engineering audit W5 (residual): sha256Expected written at acquisition is
    // now VERIFIED at consumption — bytes that changed between acquire and
    // extract must not produce a derived record whose lineage lies.
    // (FA-DAT-01: streaming hash, no full-buffer read of the raw file.)
    if (rawRecord.source.sha256Expected !== undefined) {
      const shaNow = await sha256FileHex(rawRecord.source.path);
      if (shaNow !== rawRecord.source.sha256Expected) {
        throw new Error(`raw netcdf changed since acquisition (expected sha256 ${rawRecord.source.sha256Expected.slice(0, 12)}, found ${shaNow.slice(0, 12)}) — refusing to derive features from unverified bytes`);
      }
    }
    const r = await sidecar.call<{ csv: string; nRows: number }>('netcdf_extract_features', {
      path: rawRecord.source.path,
      variable: rawRecord.source.variable,
      feature: mode,
      ...(opts.maxRows !== undefined ? { maxRows: opts.maxRows } : {}),
    }, opts.timeoutMs ?? 180_000);
    if (!r.ok || r.result === undefined) {
      throw new Error(`netcdf_extract_features failed: ${r.error?.message ?? 'no result'}`);
    }
    csv = r.result.csv;
    nRows = r.result.nRows;
  } finally {
    sidecar.close();
  }
  const ref = (await artifacts.put(csv)).ref;
  const recordId = newId('ds') as DatasetRecord['id'];
  let localPath = `${rawRecord.source.path}#${mode}`;
  if (opts.materializeDir !== undefined) {
    fs.mkdirSync(opts.materializeDir, { recursive: true });
    localPath = nodePath.join(opts.materializeDir, `${recordId}.csv`);
    fs.writeFileSync(localPath, csv, 'utf8');
  }
  const header = csv.split('\n')[0]?.trim() ?? '';
  const columns = header.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
  const record = DatasetRecord.parse({
    id: recordId,
    runId: rawRecord.runId,
    name: `${rawRecord.source.variable}:${mode}`,
    source: { resolver: 'local', path: localPath },
    license: rawRecord.license,
    format: 'csv',
    contentRef: ref,
    targetColumn: columns[columns.length - 1] ?? 'value',
    columns,
    nRows,
    lineage: [
      ...rawRecord.lineage,
      {
        kind: 'preprocess',
        detail: `feature extraction (${mode}) from raw netcdf ${rawRecord.id} (${rawRecord.contentRef}) via xarray sidecar — bounded aggregation, no spatial structure claimed beyond the named mode`,
        at: now(),
      },
    ],
    fetchedAt: now(),
  });
  store.putObjectEvented('dataset_record', record, {
    type: 'note',
    detail: { kind: 'netcdf_features_extracted', datasetRecordId: record.id, fromRaw: rawRecord.id, mode, nRows, ref },
  }, now());
  return { record, csv };
};


