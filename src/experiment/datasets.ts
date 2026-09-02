import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { assertFetchDestination } from '../shared/destination-guard.js';
import type { DatasetRecord, DatasetSource, DatasetUse, RunId } from '../domain/index.js';
import { parseCsv, analyzeCsvFile, type CsvFileStats } from './csv.js';

/**
 * Dataset acquisition (E2). Resolvers fetch raw data, verify checksums and persist an
 * immutable DatasetRecord + raw-content artifact. Identity is source-derived (D-086-2):
 * acquiring the same OpenML dataset twice resolves to the same record — the second
 * fetch re-verifies the content hash and skips re-download work at the caller's option.
 *
 * FA-DAT-01 streaming: acquisition returns a COLUMN VIEW (header/nRows/split-relevant
 * values), never materialized rows — executor memory is bounded by the named columns,
 * not by file size. Local files are hashed and landed chunk-by-chunk (putStream), so
 * the acquisition path has no full-buffer size ceiling.
 */

const OPENML_API = 'https://www.openml.org/api/v1/json/data';
/** Network-path guard (ARFF text must be converted in memory); the LOCAL path is
 *  streaming and uncapped — this bound no longer limits capability. */
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Row-count guard for CSV ingestion (FA-DAT-01): memory is now bounded by the named
 * columns, so this is a data-quality guard rather than an OOM guard. The default
 * stays at the audited 500k; FARLAB_CSV_MAX_ROWS raises it for capacity runs
 * (the 1GB benchmark sets it) — clamped to a sane floor so a typo cannot disable it.
 */
const csvMaxRows = (): number => {
  const n = Number(process.env.FARLAB_CSV_MAX_ROWS ?? 500_000);
  return Number.isFinite(n) && n >= 1_000 ? Math.floor(n) : 500_000;
};

interface OpenmlMeta {
  name: string;
  version: string;
  licence: string;
  defaultTargetAttribute: string | null;
  format: string;
  /** Official data file (ARFF) — content-addressed lineage records this URL + hash. */
  url: string;
}

const fetchOpenmlMeta = async (openmlId: number): Promise<OpenmlMeta> => {
  const res = await fetch(`${OPENML_API}/${openmlId}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`openml metadata fetch failed: ${res.status} ${res.statusText} (${OPENML_API}/${openmlId})`);
  const body = (await res.json()) as { data_set_description?: Record<string, unknown> };
  const d = body.data_set_description;
  if (d === undefined || typeof d.name !== 'string' || typeof d.url !== 'string') {
    throw new Error(`openml metadata for ${openmlId} has no data_set_description/url`);
  }
  return {
    name: String(d.name),
    version: String(d.version ?? 'unknown'),
    licence: String(d.licence ?? 'unknown'),
    defaultTargetAttribute: typeof d.default_target_attribute === 'string' ? d.default_target_attribute : null,
    format: String(d.format ?? 'unknown'),
    url: String(d.url),
  };
};

/** Download the official ARFF file and convert to canonical CSV (TS owns data identity, sidecar eats CSV). */
const fetchOpenmlArff = async (meta: OpenmlMeta): Promise<string> => {
  // Egress guard (FA-SEC-04): the download URL is UPSTREAM-CONTROLLED (returned by
  // the OpenML API response) — the same destination-pivot class as a redirect.
  assertFetchDestination(meta.url);
  const res = await fetch(meta.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`openml arff fetch failed: ${res.status} ${res.statusText} (${meta.url})`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`openml dataset ${meta.name} exceeds ${MAX_BYTES} bytes`);
  const { parseArff } = await import('./arff.js');
  const { csvStringifyRow } = await import('./csv.js');
  const parsed = parseArff(text);
  return [csvStringifyRow(parsed.header), ...parsed.rows.map(csvStringifyRow)].join('\n') + '\n';
};

/** Deterministic dataset identity from the source descriptor (D-086-2). */
export const datasetIdFor = (source: DatasetSource): string =>
  `ds_${createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0, 26)}`;

export interface AcquiredDataset {
  record: DatasetRecord;
  /** Column view for split allocation + record bookkeeping (FA-DAT-01 streaming). */
  csv: CsvFileStats;
}

/**
 * Acquire a dataset for a run: resolve from store when already present (hash re-verified
 * against the stored ref), otherwise fetch/parse/persist. Fails visibly on checksum
 * mismatch, missing target column or malformed CSV — no silent fallbacks.
 */
export const acquireDataset = async (
  store: Store,
  artifacts: ArtifactStore,
  runId: RunId,
  use: DatasetUse,
): Promise<AcquiredDataset> => {
  const id = datasetIdFor(use.source) as DatasetRecord['id'];
  const existing = store.getObject('dataset_record', id);
  if (existing !== null) {
    if (use.targetColumn !== existing.targetColumn) {
      throw new Error(`dataset ${id} was acquired with target '${existing.targetColumn}' but the spec declares '${use.targetColumn}'`);
    }
    // Column view re-derivation (FA-DAT-01): prefer re-streaming the ORIGINAL SOURCE
    // when the resolver still has it (local file); fall back to the stored artifact.
    // A row-count disagreement with the record is a split-breaking inconsistency —
    // refused loudly, never guessed.
    if (use.source.resolver === 'local' && fs.existsSync(use.source.path)) {
      const stats = await analyzeCsvFile(use.source.path, {
        targetColumn: use.targetColumn,
        groupColumn: use.groupColumn,
        maxRows: csvMaxRows(),
      });
      if (stats.nRows !== existing.nRows) {
        throw new Error(`dataset ${id} source now has ${stats.nRows} rows but was acquired with ${existing.nRows} — refusing to split inconsistent bytes`);
      }
      return { record: existing, csv: stats };
    }
    const raw = await artifacts.get(existing.contentRef);
    if (raw === null) throw new Error(`dataset ${id} record exists but raw artifact ${existing.contentRef} is missing`);
    const parsed = parseCsv(raw);
    const targetIdx = parsed.header.indexOf(use.targetColumn);
    const groupIdx = use.groupColumn !== undefined ? parsed.header.indexOf(use.groupColumn) : -1;
    return {
      record: existing,
      csv: {
        header: parsed.header,
        nRows: parsed.rows.length,
        targetValues: parsed.rows.map((r) => String(r[targetIdx] ?? '')),
        groupValues: use.groupColumn !== undefined ? parsed.rows.map((r) => String(r[groupIdx] ?? '')) : null,
      },
    };
  }

  if (use.source.resolver === 'local') {
    // FA-DAT-01 streaming acquisition: chunked put with in-flight hash + one
    // readline pass for the column view — no size ceiling, O(chunk) memory. The
    // checksum gate hashes RAW BYTES (a decoded-string hash could differ from the
    // file on non-UTF8 input).
    if (artifacts.putStream === undefined) {
      throw new Error('artifact store does not support streaming put — local dataset acquisition cannot proceed without a full buffer');
    }
    const raw = await artifacts.putStream(fs.createReadStream(use.source.path));
    if (use.source.sha256Expected !== undefined && use.source.sha256Expected !== raw.hash) {
      throw new Error(`local dataset checksum mismatch: expected ${use.source.sha256Expected}, got ${raw.hash}`);
    }
    const stats = await analyzeCsvFile(use.source.path, {
      targetColumn: use.targetColumn,
      groupColumn: use.groupColumn,
      maxRows: csvMaxRows(),
    });
    const now = new Date().toISOString();
    const record: DatasetRecord = {
      id,
      runId,
      name: use.source.path.split(/[\\/]/).pop() ?? 'local-dataset',
      source: use.source,
      license: 'operator-provided',
      format: 'csv',
      contentRef: raw.ref,
      targetColumn: use.targetColumn,
      columns: stats.header,
      nRows: stats.nRows,
      lineage: [{ kind: 'acquired', detail: `resolver=local; sha256=${raw.hash}; bytes=${raw.size}; license=operator-provided`, at: now }],
      fetchedAt: now,
    };
    store.putObject('dataset_record', record);
    return { record, csv: stats };
  }

  if (use.source.resolver !== 'openml') {
    // local_netcdf sources are acquired by acquireNetcdfDataset (sidecar-profiled);
    // reaching here with one is a routing bug, not a CSV to guess at.
    throw new Error(`acquireDataset cannot resolve resolver '${use.source.resolver}' — netcdf sources go through acquireNetcdfDataset`);
  }

  const meta = await fetchOpenmlMeta(use.source.openmlId);
  const target = use.targetColumn;
  if (meta.defaultTargetAttribute !== null && meta.defaultTargetAttribute !== target) {
    // The spec's declared target must match the catalog's — a mismatch is a spec bug, not auto-corrected.
    throw new Error(`openml ${use.source.openmlId} default target is '${meta.defaultTargetAttribute}' but spec declares '${target}'`);
  }
  const csvText = await fetchOpenmlArff(meta);
  const contentHash = createHash('sha256').update(csvText, 'utf8').digest('hex');
  const parsed = parseCsv(csvText);
  if (!parsed.header.includes(use.targetColumn)) {
    throw new Error(`target column '${use.targetColumn}' not in dataset header [${parsed.header.join(', ')}]`);
  }

  const { ref } = await artifacts.put(csvText);
  const now = new Date().toISOString();
  const record: DatasetRecord = {
    id,
    runId,
    name: use.source.name ?? meta.name,
    source: use.source,
    license: meta.licence,
    format: 'csv',
    contentRef: ref,
    targetColumn: use.targetColumn,
    columns: parsed.header,
    nRows: parsed.rows.length,
    lineage: [{ kind: 'acquired', detail: `resolver=openml; sha256=${contentHash}; license=${meta.licence}`, at: now }],
    fetchedAt: now,
  };
  store.putObject('dataset_record', record);
  const targetIdx = parsed.header.indexOf(use.targetColumn);
  const groupIdx = use.groupColumn !== undefined ? parsed.header.indexOf(use.groupColumn) : -1;
  return {
    record,
    csv: {
      header: parsed.header,
      nRows: parsed.rows.length,
      targetValues: parsed.rows.map((r) => String(r[targetIdx] ?? '')),
      groupValues: use.groupColumn !== undefined ? parsed.rows.map((r) => String(r[groupIdx] ?? '')) : null,
    },
  };
};

/** Split artifact persistence helper — the assignment is data, stored content-addressed. */
export const persistSplitArtifact = async (
  artifacts: ArtifactStore,
  outcome: { specHash: string; trainIdx: number[]; valIdx: number[]; testIdx: number[] },
): Promise<string> => artifacts.put(JSON.stringify(outcome)).then((r) => r.ref);
