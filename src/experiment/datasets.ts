import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import type { DatasetRecord, DatasetSource, DatasetUse, RunId } from '../domain/index.js';
import { parseCsv, type ParsedCsv } from './csv.js';

/**
 * Dataset acquisition (E2). Resolvers fetch raw data, verify checksums and persist an
 * immutable DatasetRecord + raw-content artifact. Identity is source-derived (D-086-2):
 * acquiring the same OpenML dataset twice resolves to the same record — the second
 * fetch re-verifies the content hash and skips re-download work at the caller's option.
 */

const OPENML_API = 'https://www.openml.org/api/v1/json/data';
const MAX_BYTES = 100 * 1024 * 1024;

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
  const res = await fetch(meta.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`openml arff fetch failed: ${res.status} ${res.statusText} (${meta.url})`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`openml dataset ${meta.name} exceeds ${MAX_BYTES} bytes`);
  const { parseArff } = await import('./arff.js');
  const { csvStringifyRow } = await import('./csv.js');
  const parsed = parseArff(text);
  return [csvStringifyRow(parsed.header), ...parsed.rows.map(csvStringifyRow)].join('\n') + '\n';
};

const readLocalCsv = (path: string): string => {
  const buf = fs.readFileSync(path);
  if (buf.length > MAX_BYTES) throw new Error(`local dataset ${path} exceeds ${MAX_BYTES} bytes`);
  return buf.toString('utf8');
};

/** Deterministic dataset identity from the source descriptor (D-086-2). */
export const datasetIdFor = (source: DatasetSource): string =>
  `ds_${createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0, 26)}`;

export interface AcquiredDataset {
  record: DatasetRecord;
  parsed: ParsedCsv;
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
    const raw = await artifacts.get(existing.contentRef);
    if (raw === null) throw new Error(`dataset ${id} record exists but raw artifact ${existing.contentRef} is missing`);
    const parsed = parseCsv(raw);
    if (use.targetColumn !== existing.targetColumn) {
      throw new Error(`dataset ${id} was acquired with target '${existing.targetColumn}' but the spec declares '${use.targetColumn}'`);
    }
    return { record: existing, parsed };
  }

  let csvText: string;
  let name: string;
  let license: string;
  if (use.source.resolver === 'openml') {
    const meta = await fetchOpenmlMeta(use.source.openmlId);
    csvText = await fetchOpenmlArff(meta);
    name = use.source.name ?? meta.name;
    license = meta.licence;
    const target = use.targetColumn;
    if (meta.defaultTargetAttribute !== null && meta.defaultTargetAttribute !== target) {
      // The spec's declared target must match the catalog's — a mismatch is a spec bug, not auto-corrected.
      throw new Error(`openml ${use.source.openmlId} default target is '${meta.defaultTargetAttribute}' but spec declares '${target}'`);
    }
  } else {
    csvText = readLocalCsv(use.source.path);
    name = use.source.path.split(/[\\/]/).pop() ?? 'local-dataset';
    license = 'operator-provided';
  }

  const contentHash = createHash('sha256').update(csvText, 'utf8').digest('hex');
  if (use.source.resolver === 'local' && use.source.sha256Expected !== undefined && use.source.sha256Expected !== contentHash) {
    throw new Error(`local dataset checksum mismatch: expected ${use.source.sha256Expected}, got ${contentHash}`);
  }
  const parsed = parseCsv(csvText);
  if (!parsed.header.includes(use.targetColumn)) {
    throw new Error(`target column '${use.targetColumn}' not in dataset header [${parsed.header.join(', ')}]`);
  }

  const { ref } = await artifacts.put(csvText);
  const now = new Date().toISOString();
  const record: DatasetRecord = {
    id,
    runId,
    name,
    source: use.source,
    license,
    format: 'csv',
    contentRef: ref,
    targetColumn: use.targetColumn,
    columns: parsed.header,
    nRows: parsed.rows.length,
    lineage: [{ kind: 'acquired', detail: `resolver=${use.source.resolver}; sha256=${contentHash}; license=${license}`, at: now }],
    fetchedAt: now,
  };
  store.putObject('dataset_record', record);
  return { record, parsed };
};

/** Split artifact persistence helper — the assignment is data, stored content-addressed. */
export const persistSplitArtifact = async (
  artifacts: ArtifactStore,
  outcome: { specHash: string; trainIdx: number[]; valIdx: number[]; testIdx: number[] },
): Promise<string> => artifacts.put(JSON.stringify(outcome)).then((r) => r.ref);
