/**
 * Re-mint a run's reproducibility bundle by executing the (deterministic, zero-LLM)
 * export stage directly against an existing workspace. Usage:
 *   FARLAB_DATA_DIR=<dir> node scripts/reexport-bundle.mjs <runId>
 */
import path from 'node:path';
import { openDb } from '../dist/persistence/db.js';
import { Store } from '../dist/persistence/store.js';
import { openArtifactStore } from '../dist/persistence/artifacts.js';
import { exportStage } from '../dist/pipeline/stages/export.js';
import { ProvenanceReceipt } from '../dist/domain/index.js';
import { newId } from '../dist/domain/index.js';

const runId = process.argv[2];
const dataDir = process.env.FARLAB_DATA_DIR ?? '.far-run';
const db = openDb(path.join(dataDir, 'far.db'));
const store = new Store(db);
const run = store.getRun(runId);
if (run === null) { console.error(`run ${runId} not found in ${dataDir}`); process.exit(3); }
const artifacts = openArtifactStore(path.join(dataDir, 'artifacts'));
const ctx = {
  run, store, artifacts,
  provider: { name: 'reexport-driver', liveReady: false, async structuredCall() { throw new Error('export performs no model call'); } },
  sourceFor: () => { throw new Error('no source adapter'); },
  recordReceipt: (partial) => { store.putObject('receipt', ProvenanceReceipt.parse({ ...partial, id: newId('rcp'), runId, at: partial.at ?? new Date().toISOString() })); },
  cancelled: () => false,
  disowned: () => false,
  log: () => {},
};
const out = await exportStage.execute(ctx);
console.log(out.kind, '|', out.kind === 'done' ? (out.summary ?? '').slice(0, 260) : out.reason);
